import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

// Storage keys
const AUTOSAVE_PREFIX = 'autosave_';
const RECOVERY_DATA_KEY = 'recovery_data';
const LAST_AUTOSAVE_KEY = 'last_autosave_timestamp';

// Types
export interface AutoSaveData {
  id: string;
  type: 'polish' | 'translate';
  timestamp: number;
  data: {
    originalText?: string;
    polishedText?: string;
    translatedText?: string;
    audioUri?: string;
    audioBase64?: string;
    language?: string;
    targetLanguage?: string;
    tone?: string;
    outputType?: string;
  };
  status: 'draft' | 'processing' | 'completed' | 'error';
}

export interface RecoveryData {
  hasUnsavedData: boolean;
  lastSession: AutoSaveData | null;
  crashDetected: boolean;
  lastSaveTime: number;
}

/**
 * AutoSaveManager - Handles automatic saving every 20 seconds
 * Ensures no data loss and provides crash recovery
 */
export class AutoSaveManager {
  private static instance: AutoSaveManager;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private currentData: AutoSaveData | null = null;
  private isAutoSaveEnabled = true;
  private saveInterval = 20000; // 20 seconds
  private lastSaveTime = 0;
  private isDirty = false; // Track if data has changed since last save

  private constructor() {}

  static getInstance(): AutoSaveManager {
    if (!AutoSaveManager.instance) {
      AutoSaveManager.instance = new AutoSaveManager();
    }
    return AutoSaveManager.instance;
  }

  /**
   * Initialize auto-save and check for recovery data
   */
  async initialize(): Promise<RecoveryData> {
    console.log('[AutoSave] Initializing...');
    
    // Check if app crashed (unsaved data exists)
    const recoveryData = await this.checkForRecoveryData();
    
    // Mark that we've successfully started
    await this.markSuccessfulStart();
    
    return recoveryData;
  }

  /**
   * Start tracking data for auto-save
   */
  startTracking(data: Partial<AutoSaveData>): void {
    console.log('[AutoSave] Started tracking:', data.type);
    
    this.currentData = {
      id: data.id || `autosave_${Date.now()}`,
      type: data.type || 'polish',
      timestamp: Date.now(),
      data: data.data || {},
      status: data.status || 'draft',
    };
    
    this.isDirty = true;
    this.startAutoSave();
  }

  /**
   * Update tracked data (marks as dirty for next auto-save)
   */
  updateData(updates: Partial<AutoSaveData['data']>): void {
    if (!this.currentData) {
      console.warn('[AutoSave] No data being tracked');
      return;
    }

    console.log('[AutoSave] Data updated');
    this.currentData.data = {
      ...this.currentData.data,
      ...updates,
    };
    this.currentData.timestamp = Date.now();
    this.isDirty = true;
  }

  /**
   * Start auto-save timer (saves every 20 seconds if data changed)
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      return; // Already running
    }

    console.log('[AutoSave] Timer started (20s interval)');
    
    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty && this.currentData) {
        await this.saveNow();
      }
    }, this.saveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('[AutoSave] Timer stopped');
    }
  }

  /**
   * Save immediately (manual save or auto-save trigger)
   */
  async saveNow(): Promise<boolean> {
    if (!this.currentData) {
      console.warn('[AutoSave] No data to save');
      return false;
    }

    try {
      console.log('[AutoSave] Saving data...');
      
      const saveKey = `${AUTOSAVE_PREFIX}${this.currentData.id}`;
      const saveData = JSON.stringify(this.currentData);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(saveKey, saveData);
      
      // Update last save timestamp
      await AsyncStorage.setItem(LAST_AUTOSAVE_KEY, Date.now().toString());
      
      // Backup audio file if exists
      if (this.currentData.data.audioUri) {
        await this.backupAudioFile(this.currentData.data.audioUri, this.currentData.id);
      }
      
      this.lastSaveTime = Date.now();
      this.isDirty = false;
      
      console.log('[AutoSave] ✓ Saved successfully at', new Date().toISOString());
      return true;
    } catch (error) {
      console.error('[AutoSave] ✗ Save failed:', error);
      return false;
    }
  }

  /**
   * Backup audio file to persistent storage
   */
  private async backupAudioFile(uri: string, id: string): Promise<void> {
    try {
      const backupDir = `${FileSystem.documentDirectory}autosave/`;
      
      // Create backup directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(backupDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
      }
      
      const backupUri = `${backupDir}${id}.m4a`;
      
      // Copy audio file to backup location
      await FileSystem.copyAsync({
        from: uri,
        to: backupUri,
      });
      
      console.log('[AutoSave] Audio backed up:', backupUri);
    } catch (error) {
      console.error('[AutoSave] Audio backup failed:', error);
      // Don't throw - audio backup is optional
    }
  }

  /**
   * Clear current auto-save (call after successful completion)
   */
  async clearAutoSave(): Promise<void> {
    if (!this.currentData) {
      return;
    }

    try {
      console.log('[AutoSave] Clearing auto-save data');
      
      const saveKey = `${AUTOSAVE_PREFIX}${this.currentData.id}`;
      await AsyncStorage.removeItem(saveKey);
      
      // Delete backup audio file
      if (this.currentData.data.audioUri) {
        const backupUri = `${FileSystem.documentDirectory}autosave/${this.currentData.id}.m4a`;
        const fileInfo = await FileSystem.getInfoAsync(backupUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(backupUri);
        }
      }
      
      this.currentData = null;
      this.isDirty = false;
      this.stopAutoSave();
      
      console.log('[AutoSave] ✓ Auto-save cleared');
    } catch (error) {
      console.error('[AutoSave] Clear failed:', error);
    }
  }

  /**
   * Check for recovery data (unsaved work from previous session)
   */
  async checkForRecoveryData(): Promise<RecoveryData> {
    try {
      console.log('[AutoSave] Checking for recovery data...');
      
      // Get all auto-save keys
      const allKeys = await AsyncStorage.getAllKeys();
      const autoSaveKeys = allKeys.filter(key => key.startsWith(AUTOSAVE_PREFIX));
      
      if (autoSaveKeys.length === 0) {
        console.log('[AutoSave] No recovery data found');
        return {
          hasUnsavedData: false,
          lastSession: null,
          crashDetected: false,
          lastSaveTime: 0,
        };
      }

      // Get the most recent auto-save
      const saves = await AsyncStorage.multiGet(autoSaveKeys);
      const parsedSaves: AutoSaveData[] = saves
        .map(([key, value]) => (value ? JSON.parse(value) : null))
        .filter(Boolean)
        .sort((a, b) => b.timestamp - a.timestamp);

      const lastSession = parsedSaves[0];
      const lastSaveTime = parseInt(await AsyncStorage.getItem(LAST_AUTOSAVE_KEY) || '0', 10);
      
      // Consider it a crash if last save was incomplete (status = 'processing')
      const crashDetected = lastSession.status === 'processing';
      
      console.log('[AutoSave] Recovery data found:', {
        count: parsedSaves.length,
        lastSaveTime: new Date(lastSaveTime).toISOString(),
        crashDetected,
      });

      return {
        hasUnsavedData: true,
        lastSession,
        crashDetected,
        lastSaveTime,
      };
    } catch (error) {
      console.error('[AutoSave] Recovery check failed:', error);
      return {
        hasUnsavedData: false,
        lastSession: null,
        crashDetected: false,
        lastSaveTime: 0,
      };
    }
  }

  /**
   * Restore data from recovery
   */
  async restoreFromRecovery(sessionId: string): Promise<AutoSaveData | null> {
    try {
      console.log('[AutoSave] Restoring session:', sessionId);
      
      const saveKey = `${AUTOSAVE_PREFIX}${sessionId}`;
      const data = await AsyncStorage.getItem(saveKey);
      
      if (!data) {
        console.warn('[AutoSave] Session not found');
        return null;
      }

      const restored: AutoSaveData = JSON.parse(data);
      
      // Check if audio backup exists
      if (restored.data.audioUri) {
        const backupUri = `${FileSystem.documentDirectory}autosave/${restored.id}.m4a`;
        const fileInfo = await FileSystem.getInfoAsync(backupUri);
        if (fileInfo.exists) {
          restored.data.audioUri = backupUri;
          console.log('[AutoSave] Audio file restored');
        }
      }
      
      console.log('[AutoSave] ✓ Session restored');
      return restored;
    } catch (error) {
      console.error('[AutoSave] Restore failed:', error);
      return null;
    }
  }

  /**
   * Discard recovery data
   */
  async discardRecovery(sessionId: string): Promise<void> {
    try {
      console.log('[AutoSave] Discarding recovery session:', sessionId);
      
      const saveKey = `${AUTOSAVE_PREFIX}${sessionId}`;
      await AsyncStorage.removeItem(saveKey);
      
      // Delete audio backup
      const backupUri = `${FileSystem.documentDirectory}autosave/${sessionId}.m4a`;
      const fileInfo = await FileSystem.getInfoAsync(backupUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(backupUri);
      }
      
      console.log('[AutoSave] ✓ Recovery discarded');
    } catch (error) {
      console.error('[AutoSave] Discard failed:', error);
    }
  }

  /**
   * Mark successful app start (no crash)
   */
  private async markSuccessfulStart(): Promise<void> {
    try {
      await AsyncStorage.setItem('app_last_start', Date.now().toString());
    } catch (error) {
      console.error('[AutoSave] Failed to mark start:', error);
    }
  }

  /**
   * Get auto-save status
   */
  getStatus() {
    return {
      isTracking: !!this.currentData,
      isDirty: this.isDirty,
      lastSaveTime: this.lastSaveTime,
      isAutoSaveEnabled: this.isAutoSaveEnabled,
      currentSessionId: this.currentData?.id,
    };
  }

  /**
   * Enable/disable auto-save
   */
  setAutoSaveEnabled(enabled: boolean): void {
    this.isAutoSaveEnabled = enabled;
    if (enabled && this.currentData) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
    }
    console.log('[AutoSave] Auto-save', enabled ? 'enabled' : 'disabled');
  }

  /**
   * Clean up old auto-saves (keep last 5)
   */
  async cleanupOldSaves(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const autoSaveKeys = allKeys.filter(key => key.startsWith(AUTOSAVE_PREFIX));
      
      if (autoSaveKeys.length <= 5) {
        return; // Keep recent saves
      }

      // Get all saves and sort by timestamp
      const saves = await AsyncStorage.multiGet(autoSaveKeys);
      const parsedSaves = saves
        .map(([key, value]) => ({
          key,
          data: value ? JSON.parse(value) : null,
        }))
        .filter(item => item.data)
        .sort((a, b) => b.data.timestamp - a.data.timestamp);

      // Remove old saves (keep last 5)
      const toRemove = parsedSaves.slice(5);
      for (const item of toRemove) {
        await AsyncStorage.removeItem(item.key);
        
        // Delete audio backup if exists
        if (item.data.data.audioUri) {
          const backupUri = `${FileSystem.documentDirectory}autosave/${item.data.id}.m4a`;
          const fileInfo = await FileSystem.getInfoAsync(backupUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(backupUri);
          }
        }
      }
      
      console.log('[AutoSave] Cleaned up', toRemove.length, 'old saves');
    } catch (error) {
      console.error('[AutoSave] Cleanup failed:', error);
    }
  }
}

// Export singleton instance
export const autoSaveManager = AutoSaveManager.getInstance();
