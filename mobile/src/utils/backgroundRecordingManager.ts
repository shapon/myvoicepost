/**
 * Background Recording Manager
 *
 * Manages background recording capabilities based on user settings.
 * Handles permission requests and audio mode configuration for background recording.
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { settingsApi } from '../lib/api';

export interface BackgroundRecordingConfig {
  enabled: boolean;
  hasPermissions: boolean;
}

class BackgroundRecordingManager {
  private static instance: BackgroundRecordingManager;
  private offlineRecordingEnabled: boolean = false;
  private hasNotificationPermission: boolean = false;
  private appStateSubscription: any = null;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): BackgroundRecordingManager {
    if (!BackgroundRecordingManager.instance) {
      BackgroundRecordingManager.instance = new BackgroundRecordingManager();
    }
    return BackgroundRecordingManager.instance;
  }

  /**
   * Load offline recording setting from server
   */
  public async loadSettings(): Promise<void> {
    try {
      const settings = await settingsApi.getSettings();
      const offlineRecordingSetting = settings.find(s => s.setting_key === 'offline_recording');
      this.offlineRecordingEnabled = offlineRecordingSetting?.setting_value === 'true';

      console.log('[BackgroundRecording] Offline recording enabled:', this.offlineRecordingEnabled);
    } catch (error) {
      console.error('[BackgroundRecording] Failed to load settings:', error);
      // Default to false if settings can't be loaded
      this.offlineRecordingEnabled = false;
    }
  }

  /**
   * Check if offline recording is enabled in settings
   */
  public isOfflineRecordingEnabled(): boolean {
    return this.offlineRecordingEnabled;
  }

  /**
   * Request notification permissions for background recording
   * On Android, foreground services require notification permission
   */
  public async requestNotificationPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        this.hasNotificationPermission = finalStatus === 'granted';
        console.log('[BackgroundRecording] Notification permission:', this.hasNotificationPermission);
        return this.hasNotificationPermission;
      }

      // iOS doesn't require notification permission for background audio
      this.hasNotificationPermission = true;
      return true;
    } catch (error) {
      console.error('[BackgroundRecording] Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Configure audio mode for recording with background support
   */
  public async configureAudioMode(enableBackground: boolean): Promise<void> {
    try {
      const shouldEnableBackground = enableBackground && this.offlineRecordingEnabled;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: shouldEnableBackground,
        interruptionModeIOS: 1, // Do not mix
        interruptionModeAndroid: 1, // Do not mix
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      console.log('[BackgroundRecording] Audio mode configured:', {
        staysActiveInBackground: shouldEnableBackground,
      });
    } catch (error) {
      console.error('[BackgroundRecording] Failed to configure audio mode:', error);
      throw error;
    }
  }

  /**
   * Check and request all required permissions for background recording
   */
  public async checkAndRequestPermissions(): Promise<BackgroundRecordingConfig> {
    const config: BackgroundRecordingConfig = {
      enabled: this.offlineRecordingEnabled,
      hasPermissions: false,
    };

    if (!this.offlineRecordingEnabled) {
      // Background recording not enabled, return current config
      return config;
    }

    try {
      // Check audio permission
      const { status: audioStatus } = await Audio.getPermissionsAsync();
      const hasAudioPermission = audioStatus === 'granted';

      if (!hasAudioPermission) {
        console.log('[BackgroundRecording] Audio permission not granted');
        config.hasPermissions = false;
        return config;
      }

      // Request notification permission for Android foreground service
      const hasNotificationPermission = await this.requestNotificationPermission();

      config.hasPermissions = hasAudioPermission && hasNotificationPermission;

      console.log('[BackgroundRecording] Permissions check:', config);
      return config;
    } catch (error) {
      console.error('[BackgroundRecording] Permission check failed:', error);
      config.hasPermissions = false;
      return config;
    }
  }

  /**
   * Monitor app state changes during recording
   * This can be used to show notifications when app is backgrounded during recording
   */
  public startAppStateMonitoring(onStateChange?: (state: AppStateStatus) => void): void {
    if (this.appStateSubscription) {
      return; // Already monitoring
    }

    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('[BackgroundRecording] App state changed to:', nextAppState);
      onStateChange?.(nextAppState);
    });
  }

  /**
   * Stop monitoring app state changes
   */
  public stopAppStateMonitoring(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Show a notification during background recording
   */
  public async showRecordingNotification(): Promise<void> {
    if (!this.hasNotificationPermission) {
      return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Recording in Progress',
          body: 'MyVoicePost is recording audio in the background',
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('[BackgroundRecording] Failed to show notification:', error);
    }
  }

  /**
   * Dismiss recording notification
   */
  public async dismissRecordingNotification(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('[BackgroundRecording] Failed to dismiss notification:', error);
    }
  }

  /**
   * Reset all settings and listeners
   */
  public reset(): void {
    this.stopAppStateMonitoring();
    this.offlineRecordingEnabled = false;
    this.hasNotificationPermission = false;
  }
}

export const backgroundRecordingManager = BackgroundRecordingManager.getInstance();
