/**
 * Recording State Manager
 * 
 * Prevents background recording and ensures recording only happens
 * from explicit user actions with proper state management.
 */

import { AppState, AppStateStatus } from 'react-native';
import { Audio, Recording } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECORDING_STATE_KEY = 'recordingState';

export enum RecordingState {
  IDLE = 'idle',
  REQUESTING_PERMISSION = 'requesting_permission',
  RECORDING = 'recording',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export enum RecordingTrigger {
  USER_BUTTON_PRESS = 'user_button_press',
  BACKGROUND = 'background', // Should NEVER happen
  AUTO_START = 'auto_start', // Should NEVER happen
}

interface RecordingSession {
  id: string;
  startTime: string;
  endTime?: string;
  duration: number;
  trigger: RecordingTrigger;
  appState: AppStateStatus;
  userInitiated: boolean;
}

interface RecordingStateData {
  currentState: RecordingState;
  isUserInitiated: boolean;
  sessionId: string | null;
  startedAt: string | null;
}

/**
 * Recording State Manager - Prevents unauthorized recording
 */
export class RecordingStateManager {
  private static state: RecordingState = RecordingState.IDLE;
  private static recording: Recording | null = null;
  private static sessionId: string | null = null;
  private static startedAt: string | null = null;
  private static isUserInitiated: boolean = false;
  private static appStateSubscription: any = null;
  private static listeners: Set<(state: RecordingState) => void> = new Set();
  private static sessions: RecordingSession[] = [];

  /**
   * Initialize the recording state manager
   */
  static async initialize(): Promise<void> {
    // Load previous state (should always be idle on app start)
    await this.loadState();
    
    // If there was a recording in progress, it means app crashed or was killed
    if (this.state === RecordingState.RECORDING) {
      console.warn('[SECURITY] App restarted with recording in progress - stopping');
      await this.forceStop();
    }

    // Set up app state monitoring
    this.setupAppStateMonitoring();

    // Load session history
    await this.loadSessions();
  }

  /**
   * Set up monitoring for app state changes
   */
  private static setupAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (this.state === RecordingState.RECORDING) {
          console.log('[PRIVACY] App going to background - stopping recording');
          await this.stopRecording(true);
          
          // Log privacy violation if this ever happens unexpectedly
          await this.logSecurityEvent('background_recording_prevented', {
            appState: nextAppState,
            recordingDuration: this.getRecordingDuration(),
          });
        }
      }
    });
  }

  /**
   * Start recording (only from explicit user action)
   */
  static async startRecording(trigger: RecordingTrigger): Promise<{ success: boolean; error?: string }> {
    // CRITICAL: Only allow recording from user button press
    if (trigger !== RecordingTrigger.USER_BUTTON_PRESS) {
      await this.logSecurityEvent('unauthorized_recording_attempt', {
        trigger,
        blocked: true,
      });
      return { success: false, error: 'Recording can only be started by user action' };
    }

    // Check if already recording
    if (this.state === RecordingState.RECORDING) {
      return { success: false, error: 'Already recording' };
    }

    // Check app state
    if (AppState.currentState !== 'active') {
      return { success: false, error: 'App must be active to record' };
    }

    try {
      // Update state
      this.setState(RecordingState.REQUESTING_PERMISSION);
      this.isUserInitiated = true;
      this.sessionId = this.generateSessionId();
      this.startedAt = new Date().toISOString();

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false, // CRITICAL: Don't record in background
      });

      // Create recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.setState(RecordingState.RECORDING);

      // Start session tracking
      const session: RecordingSession = {
        id: this.sessionId,
        startTime: this.startedAt,
        duration: 0,
        trigger,
        appState: AppState.currentState,
        userInitiated: true,
      };
      this.sessions.push(session);
      await this.saveSessions();

      await this.saveState();

      return { success: true };
    } catch (error: any) {
      this.setState(RecordingState.ERROR);
      await this.logSecurityEvent('recording_start_error', {
        error: error.message,
        trigger,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop recording
   */
  static async stopRecording(forcedBySystem: boolean = false): Promise<{ success: boolean; uri?: string; error?: string }> {
    if (this.state !== RecordingState.RECORDING || !this.recording) {
      return { success: false, error: 'Not recording' };
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();

      // Update session
      const currentSession = this.sessions.find(s => s.id === this.sessionId);
      if (currentSession) {
        currentSession.endTime = new Date().toISOString();
        currentSession.duration = this.getRecordingDuration();
        await this.saveSessions();
      }

      // Log if forced by system
      if (forcedBySystem) {
        await this.logSecurityEvent('recording_stopped_by_system', {
          sessionId: this.sessionId,
          duration: this.getRecordingDuration(),
          reason: 'app_backgrounded',
        });
      }

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      // Clean up
      this.recording = null;
      const recordingUri = uri;
      this.sessionId = null;
      this.startedAt = null;
      this.isUserInitiated = false;
      this.setState(RecordingState.STOPPED);

      await this.saveState();

      return { success: true, uri: recordingUri || undefined };
    } catch (error: any) {
      this.setState(RecordingState.ERROR);
      return { success: false, error: error.message };
    }
  }

  /**
   * Force stop (for emergency situations)
   */
  private static async forceStop(): Promise<void> {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (error) {
      console.error('Error in force stop:', error);
    }
    
    this.sessionId = null;
    this.startedAt = null;
    this.isUserInitiated = false;
    this.setState(RecordingState.IDLE);
    await this.saveState();
  }

  /**
   * Get current state
   */
  static getState(): RecordingState {
    return this.state;
  }

  /**
   * Check if recording
   */
  static isRecording(): boolean {
    return this.state === RecordingState.RECORDING;
  }

  /**
   * Check if user initiated
   */
  static getIsUserInitiated(): boolean {
    return this.isUserInitiated;
  }

  /**
   * Get recording duration
   */
  static getRecordingDuration(): number {
    if (!this.startedAt) return 0;
    return Date.now() - new Date(this.startedAt).getTime();
  }

  /**
   * Set state and notify listeners
   */
  private static setState(newState: RecordingState): void {
    this.state = newState;
    this.notifyListeners();
  }

  /**
   * Add state listener
   */
  static addListener(callback: (state: RecordingState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private static notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.state));
  }

  /**
   * Save state to storage
   */
  private static async saveState(): Promise<void> {
    try {
      const stateData: RecordingStateData = {
        currentState: this.state,
        isUserInitiated: this.isUserInitiated,
        sessionId: this.sessionId,
        startedAt: this.startedAt,
      };
      await AsyncStorage.setItem(RECORDING_STATE_KEY, JSON.stringify(stateData));
    } catch (error) {
      console.error('Failed to save recording state:', error);
    }
  }

  /**
   * Load state from storage
   */
  private static async loadState(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(RECORDING_STATE_KEY);
      if (stored) {
        const stateData: RecordingStateData = JSON.parse(stored);
        // Always reset to idle on app start for security
        this.state = RecordingState.IDLE;
        this.isUserInitiated = false;
        this.sessionId = null;
        this.startedAt = null;
      }
    } catch (error) {
      console.error('Failed to load recording state:', error);
    }
  }

  /**
   * Save sessions
   */
  private static async saveSessions(): Promise<void> {
    try {
      // Keep only last 50 sessions
      const recentSessions = this.sessions.slice(-50);
      await AsyncStorage.setItem('recording_sessions', JSON.stringify(recentSessions));
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  /**
   * Load sessions
   */
  private static async loadSessions(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('recording_sessions');
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  /**
   * Get session history
   */
  static getSessions(): RecordingSession[] {
    return this.sessions;
  }

  /**
   * Log security event
   */
  private static async logSecurityEvent(event: string, data: any): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      data,
      appState: AppState.currentState,
    };

    // Log to console in development
    if (__DEV__) {
      console.log('[SECURITY EVENT]', logEntry);
    }

    // Store security logs
    try {
      const logs = await AsyncStorage.getItem('security_logs');
      const logArray = logs ? JSON.parse(logs) : [];
      logArray.push(logEntry);
      
      // Keep last 100 security logs
      if (logArray.length > 100) {
        logArray.shift();
      }
      
      await AsyncStorage.setItem('security_logs', JSON.stringify(logArray));
    } catch (error) {
      console.error('Failed to log security event:', error);
    }

    // In production, send critical security events to your backend
    if (!__DEV__ && event.includes('unauthorized')) {
      // TODO: Send to security monitoring service
    }
  }

  /**
   * Generate unique session ID
   */
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export security logs (for auditing)
   */
  static async exportSecurityLogs(): Promise<any[]> {
    try {
      const logs = await AsyncStorage.getItem('security_logs');
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.error('Failed to export security logs:', error);
      return [];
    }
  }

  /**
   * Clear all data
   */
  static async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(RECORDING_STATE_KEY);
      await AsyncStorage.removeItem('recording_sessions');
      await AsyncStorage.removeItem('security_logs');
      this.sessions = [];
    } catch (error) {
      console.error('Failed to clear recording data:', error);
    }
  }

  /**
   * Cleanup on app shutdown
   */
  static cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    this.listeners.clear();
  }
}
