import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

// Storage keys
const BACKUP_PREFIX = 'backup_';
const BACKUP_INDEX_KEY = 'backup_index';
const BACKUP_SETTINGS_KEY = 'backup_settings';

// Types
export interface BackupData {
  id: string;
  type: 'polish' | 'translate' | 'recording';
  timestamp: number;
  dataHash: string;
  data: any;
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt: number;
  size: number;
}

export interface BackupIndex {
  backups: string[]; // Array of backup IDs
  totalSize: number;
  lastCleanup: number;
}

export interface BackupSettings {
  enabled: boolean;
  maxBackups: number;
  maxAge: number; // days
  autoCleanup: boolean;
}

/**
 * BackupManager - Local backup before cloud sync
 * Ensures no data loss even if cloud sync fails
 */
export class BackupManager {
  private static instance: BackupManager;
  private settings: BackupSettings = {
    enabled: true,
    maxBackups: 50,
    maxAge: 30, // 30 days
    autoCleanup: true,
  };

  private constructor() {}

  static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager();
    }
    return BackupManager.instance;
  }

  /**
   * Initialize backup manager
   */
  async initialize(): Promise<void> {
    console.log('[Backup] Initializing...');
    
    // Load settings
    await this.loadSettings();
    
    // Create backup directory
    await this.ensureBackupDirectory();
    
    // Cleanup old backups if needed
    if (this.settings.autoCleanup) {
      await this.cleanupOldBackups();
    }
    
    console.log('[Backup] Initialized');
  }

  /**
   * Create a backup before attempting cloud sync
   */
  async createBackup(data: any, type: 'polish' | 'translate' | 'recording'): Promise<string> {
    if (!this.settings.enabled) {
      console.log('[Backup] Backups disabled, skipping');
      return '';
    }

    try {
      console.log('[Backup] Creating backup for', type);
      
      // Generate unique ID
      const id = `${BACKUP_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate data hash
      const dataString = JSON.stringify(data);
      const dataHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        dataString
      );
      
      // Create backup object
      const backup: BackupData = {
        id,
        type,
        timestamp: Date.now(),
        dataHash,
        data,
        synced: false,
        syncAttempts: 0,
        lastSyncAttempt: 0,
        size: dataString.length,
      };
      
      // Save backup
      await AsyncStorage.setItem(id, JSON.stringify(backup));
      
      // Update index
      await this.addToIndex(id, backup.size);
      
      console.log('[Backup] ✓ Backup created:', id);
      return id;
    } catch (error) {
      console.error('[Backup] ✗ Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Mark backup as synced
   */
  async markAsSynced(backupId: string): Promise<void> {
    try {
      console.log('[Backup] Marking as synced:', backupId);
      
      const data = await AsyncStorage.getItem(backupId);
      if (!data) {
        console.warn('[Backup] Backup not found:', backupId);
        return;
      }

      const backup: BackupData = JSON.parse(data);
      backup.synced = true;
      backup.lastSyncAttempt = Date.now();
      
      await AsyncStorage.setItem(backupId, JSON.stringify(backup));
      
      console.log('[Backup] ✓ Marked as synced');
    } catch (error) {
      console.error('[Backup] Failed to mark as synced:', error);
    }
  }

  /**
   * Record sync attempt (success or failure)
   */
  async recordSyncAttempt(backupId: string, success: boolean): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(backupId);
      if (!data) {
        return;
      }

      const backup: BackupData = JSON.parse(data);
      backup.syncAttempts++;
      backup.lastSyncAttempt = Date.now();
      
      if (success) {
        backup.synced = true;
      }
      
      await AsyncStorage.setItem(backupId, JSON.stringify(backup));
      
      console.log('[Backup] Sync attempt recorded:', { backupId, success });
    } catch (error) {
      console.error('[Backup] Failed to record sync attempt:', error);
    }
  }

  /**
   * Get all unsynced backups
   */
  async getUnsyncedBackups(): Promise<BackupData[]> {
    try {
      const index = await this.getIndex();
      const backups: BackupData[] = [];
      
      for (const id of index.backups) {
        const data = await AsyncStorage.getItem(id);
        if (data) {
          const backup: BackupData = JSON.parse(data);
          if (!backup.synced) {
            backups.push(backup);
          }
        }
      }
      
      console.log('[Backup] Found', backups.length, 'unsynced backups');
      return backups;
    } catch (error) {
      console.error('[Backup] Failed to get unsynced backups:', error);
      return [];
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupId: string): Promise<any> {
    try {
      console.log('[Backup] Restoring backup:', backupId);
      
      const data = await AsyncStorage.getItem(backupId);
      if (!data) {
        throw new Error('Backup not found');
      }

      const backup: BackupData = JSON.parse(data);
      
      // Verify data integrity
      const dataHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(backup.data)
      );
      
      if (dataHash !== backup.dataHash) {
        throw new Error('Backup data corrupted');
      }
      
      console.log('[Backup] ✓ Backup restored and verified');
      return backup.data;
    } catch (error) {
      console.error('[Backup] ✗ Failed to restore backup:', error);
      throw error;
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      console.log('[Backup] Deleting backup:', backupId);
      
      // Get size before deleting
      const data = await AsyncStorage.getItem(backupId);
      let size = 0;
      if (data) {
        const backup: BackupData = JSON.parse(data);
        size = backup.size;
      }
      
      // Delete backup
      await AsyncStorage.removeItem(backupId);
      
      // Update index
      await this.removeFromIndex(backupId, size);
      
      console.log('[Backup] ✓ Backup deleted');
    } catch (error) {
      console.error('[Backup] Failed to delete backup:', error);
    }
  }

  /**
   * Cleanup old backups
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      console.log('[Backup] Running cleanup...');
      
      const index = await this.getIndex();
      const now = Date.now();
      const maxAge = this.settings.maxAge * 24 * 60 * 60 * 1000; // Convert days to ms
      
      let deletedCount = 0;
      
      for (const id of index.backups) {
        const data = await AsyncStorage.getItem(id);
        if (data) {
          const backup: BackupData = JSON.parse(data);
          
          // Delete if old and synced, or exceeds max age
          const age = now - backup.timestamp;
          if ((backup.synced && age > maxAge) || age > maxAge * 2) {
            await this.deleteBackup(id);
            deletedCount++;
          }
        }
      }
      
      // Keep only max backups (delete oldest if exceeds)
      const updatedIndex = await this.getIndex();
      if (updatedIndex.backups.length > this.settings.maxBackups) {
        const backupsToDelete = updatedIndex.backups.length - this.settings.maxBackups;
        
        // Get all backups with timestamps
        const backupsWithTime: Array<{ id: string; timestamp: number; synced: boolean }> = [];
        for (const id of updatedIndex.backups) {
          const data = await AsyncStorage.getItem(id);
          if (data) {
            const backup: BackupData = JSON.parse(data);
            backupsWithTime.push({
              id: backup.id,
              timestamp: backup.timestamp,
              synced: backup.synced,
            });
          }
        }
        
        // Sort by timestamp (oldest first)
        backupsWithTime.sort((a, b) => a.timestamp - b.timestamp);
        
        // Delete oldest backups (prioritize synced ones)
        const syncedOldest = backupsWithTime.filter(b => b.synced);
        const toDelete = syncedOldest.slice(0, backupsToDelete);
        
        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
          deletedCount++;
        }
      }
      
      console.log('[Backup] ✓ Cleanup complete. Deleted:', deletedCount);
    } catch (error) {
      console.error('[Backup] Cleanup failed:', error);
    }
  }

  /**
   * Get backup statistics
   */
  async getStatistics() {
    try {
      const index = await this.getIndex();
      const backups: BackupData[] = [];
      
      for (const id of index.backups) {
        const data = await AsyncStorage.getItem(id);
        if (data) {
          backups.push(JSON.parse(data));
        }
      }
      
      const synced = backups.filter(b => b.synced).length;
      const unsynced = backups.length - synced;
      
      return {
        total: backups.length,
        synced,
        unsynced,
        totalSize: index.totalSize,
        oldestBackup: backups.length > 0 ? Math.min(...backups.map(b => b.timestamp)) : 0,
        newestBackup: backups.length > 0 ? Math.max(...backups.map(b => b.timestamp)) : 0,
      };
    } catch (error) {
      console.error('[Backup] Failed to get statistics:', error);
      return {
        total: 0,
        synced: 0,
        unsynced: 0,
        totalSize: 0,
        oldestBackup: 0,
        newestBackup: 0,
      };
    }
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<BackupSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await AsyncStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(this.settings));
    console.log('[Backup] Settings updated:', this.settings);
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(BACKUP_SETTINGS_KEY);
      if (data) {
        this.settings = JSON.parse(data);
      }
    } catch (error) {
      console.error('[Backup] Failed to load settings:', error);
    }
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      const backupDir = `${FileSystem.documentDirectory}backups/`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
        console.log('[Backup] Backup directory created');
      }
    } catch (error) {
      console.error('[Backup] Failed to create backup directory:', error);
    }
  }

  /**
   * Get backup index
   */
  private async getIndex(): Promise<BackupIndex> {
    try {
      const data = await AsyncStorage.getItem(BACKUP_INDEX_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[Backup] Failed to get index:', error);
    }
    
    return {
      backups: [],
      totalSize: 0,
      lastCleanup: Date.now(),
    };
  }

  /**
   * Add backup to index
   */
  private async addToIndex(backupId: string, size: number): Promise<void> {
    try {
      const index = await this.getIndex();
      index.backups.push(backupId);
      index.totalSize += size;
      await AsyncStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('[Backup] Failed to add to index:', error);
    }
  }

  /**
   * Remove backup from index
   */
  private async removeFromIndex(backupId: string, size: number): Promise<void> {
    try {
      const index = await this.getIndex();
      index.backups = index.backups.filter(id => id !== backupId);
      index.totalSize -= size;
      await AsyncStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('[Backup] Failed to remove from index:', error);
    }
  }
}

// Export singleton instance
export const backupManager = BackupManager.getInstance();
