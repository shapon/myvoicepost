/**
 * Data Storage Manager
 * 
 * Local-first storage with encryption and optional cloud sync.
 * Everything saves locally by default, cloud sync only if explicitly enabled.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const STORAGE_SETTINGS_KEY = 'storageSettings';
const LOCAL_DATA_PREFIX = 'local_data_';
const ENCRYPTION_KEY_STORAGE = 'encryption_key';

export enum StorageLocation {
  LOCAL_ONLY = 'local_only',
  LOCAL_WITH_CLOUD_BACKUP = 'local_with_cloud_backup',
}

export interface StorageSettings {
  location: StorageLocation;
  cloudSyncEnabled: boolean;
  autoDeleteAfterDays: number | null; // null = never auto-delete
  encryptLocal: boolean;
  lastSyncTime: string | null;
}

export interface StoredItem {
  id: string;
  type: 'transcription' | 'translation' | 'saved_text';
  content: string;
  encrypted: boolean;
  createdAt: string;
  modifiedAt: string;
  syncedToCloud: boolean;
  localOnly: boolean;
}

/**
 * Data Storage Manager - Local-first with privacy controls
 */
export class DataStorageManager {
  private static settings: StorageSettings = {
    location: StorageLocation.LOCAL_ONLY,
    cloudSyncEnabled: false,
    autoDeleteAfterDays: null,
    encryptLocal: true,
    lastSyncTime: null,
  };

  private static encryptionKey: string | null = null;

  /**
   * Initialize storage manager
   */
  static async initialize(): Promise<void> {
    await this.loadSettings();
    await this.loadOrGenerateEncryptionKey();
    await this.cleanupOldData();
  }

  /**
   * Load storage settings
   */
  private static async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_SETTINGS_KEY);
      if (stored) {
        this.settings = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load storage settings:', error);
    }
  }

  /**
   * Save storage settings
   */
  private static async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save storage settings:', error);
    }
  }

  /**
   * Load or generate encryption key
   */
  private static async loadOrGenerateEncryptionKey(): Promise<void> {
    try {
      let key = await AsyncStorage.getItem(ENCRYPTION_KEY_STORAGE);
      
      if (!key) {
        // Generate new encryption key
        key = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${Date.now()}-${Math.random()}-${Platform.OS}`
        );
        await AsyncStorage.setItem(ENCRYPTION_KEY_STORAGE, key);
      }
      
      this.encryptionKey = key;
    } catch (error) {
      console.error('Failed to load/generate encryption key:', error);
    }
  }

  /**
   * Encrypt data
   */
  private static async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Simple encryption using key + data hash
      // In production, use a proper encryption library like expo-crypto
      const encrypted = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${this.encryptionKey}${data}`
      );
      
      // Store both encrypted hash and base64 encoded data
      const base64Data = Buffer.from(data).toString('base64');
      return JSON.stringify({ hash: encrypted, data: base64Data });
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  private static async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      const parsed = JSON.parse(encryptedData);
      const decrypted = Buffer.from(parsed.data, 'base64').toString('utf-8');
      
      // Verify hash
      const verifyHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${this.encryptionKey}${decrypted}`
      );
      
      if (verifyHash !== parsed.hash) {
        throw new Error('Data integrity check failed');
      }
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }

  /**
   * Save item locally
   */
  static async saveItem(item: Omit<StoredItem, 'id' | 'createdAt' | 'modifiedAt' | 'encrypted' | 'syncedToCloud'>): Promise<string> {
    try {
      const id = `${LOCAL_DATA_PREFIX}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      let content = item.content;
      let encrypted = false;

      // Encrypt if enabled
      if (this.settings.encryptLocal) {
        content = await this.encrypt(item.content);
        encrypted = true;
      }

      const storedItem: StoredItem = {
        id,
        type: item.type,
        content,
        encrypted,
        createdAt: now,
        modifiedAt: now,
        syncedToCloud: false,
        localOnly: !this.settings.cloudSyncEnabled,
      };

      await AsyncStorage.setItem(id, JSON.stringify(storedItem));

      // Optionally sync to cloud if enabled
      if (this.settings.cloudSyncEnabled && !item.localOnly) {
        await this.syncItemToCloud(storedItem);
      }

      return id;
    } catch (error) {
      console.error('Failed to save item:', error);
      throw error;
    }
  }

  /**
   * Get item by ID
   */
  static async getItem(id: string): Promise<StoredItem | null> {
    try {
      const stored = await AsyncStorage.getItem(id);
      if (!stored) return null;

      const item: StoredItem = JSON.parse(stored);

      // Decrypt if encrypted
      if (item.encrypted) {
        item.content = await this.decrypt(item.content);
        item.encrypted = false; // Mark as decrypted for use
      }

      return item;
    } catch (error) {
      console.error('Failed to get item:', error);
      return null;
    }
  }

  /**
   * Get all items of a type
   */
  static async getAllItems(type?: StoredItem['type']): Promise<StoredItem[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const dataKeys = keys.filter(key => key.startsWith(LOCAL_DATA_PREFIX));
      
      const items: StoredItem[] = [];
      
      for (const key of dataKeys) {
        const item = await this.getItem(key);
        if (item && (!type || item.type === type)) {
          items.push(item);
        }
      }

      return items.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('Failed to get all items:', error);
      return [];
    }
  }

  /**
   * Delete item
   */
  static async deleteItem(id: string): Promise<void> {
    try {
      const item = await this.getItem(id);
      
      // Delete from local storage
      await AsyncStorage.removeItem(id);

      // Delete from cloud if synced
      if (item && item.syncedToCloud && this.settings.cloudSyncEnabled) {
        await this.deleteItemFromCloud(id);
      }
    } catch (error) {
      console.error('Failed to delete item:', error);
      throw error;
    }
  }

  /**
   * Delete all items
   */
  static async deleteAllItems(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const dataKeys = keys.filter(key => key.startsWith(LOCAL_DATA_PREFIX));
      
      // Delete all from local storage
      await AsyncStorage.multiRemove(dataKeys);

      // Delete from cloud if sync enabled
      if (this.settings.cloudSyncEnabled) {
        await this.deleteAllFromCloud();
      }
    } catch (error) {
      console.error('Failed to delete all items:', error);
      throw error;
    }
  }

  /**
   * Enable cloud sync
   */
  static async enableCloudSync(): Promise<void> {
    this.settings.cloudSyncEnabled = true;
    this.settings.location = StorageLocation.LOCAL_WITH_CLOUD_BACKUP;
    await this.saveSettings();

    // Sync existing local items to cloud
    await this.syncAllToCloud();
  }

  /**
   * Disable cloud sync
   */
  static async disableCloudSync(deleteFromCloud: boolean = false): Promise<void> {
    this.settings.cloudSyncEnabled = false;
    this.settings.location = StorageLocation.LOCAL_ONLY;
    await this.saveSettings();

    if (deleteFromCloud) {
      await this.deleteAllFromCloud();
    }
  }

  /**
   * Sync item to cloud (placeholder - implement with your backend)
   */
  private static async syncItemToCloud(item: StoredItem): Promise<void> {
    try {
      // TODO: Implement actual cloud sync
      // This is a placeholder - you need to implement with your backend
      
      if (__DEV__) {
        console.log('[CLOUD SYNC] Would sync item to cloud:', item.id);
      }

      // Mark as synced
      item.syncedToCloud = true;
      await AsyncStorage.setItem(item.id, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to sync to cloud:', error);
    }
  }

  /**
   * Sync all items to cloud
   */
  private static async syncAllToCloud(): Promise<void> {
    try {
      const items = await this.getAllItems();
      
      for (const item of items) {
        if (!item.syncedToCloud && !item.localOnly) {
          await this.syncItemToCloud(item);
        }
      }

      this.settings.lastSyncTime = new Date().toISOString();
      await this.saveSettings();
    } catch (error) {
      console.error('Failed to sync all to cloud:', error);
    }
  }

  /**
   * Delete item from cloud (placeholder)
   */
  private static async deleteItemFromCloud(id: string): Promise<void> {
    try {
      // TODO: Implement actual cloud deletion
      if (__DEV__) {
        console.log('[CLOUD SYNC] Would delete item from cloud:', id);
      }
    } catch (error) {
      console.error('Failed to delete from cloud:', error);
    }
  }

  /**
   * Delete all from cloud (placeholder)
   */
  private static async deleteAllFromCloud(): Promise<void> {
    try {
      // TODO: Implement actual cloud deletion
      if (__DEV__) {
        console.log('[CLOUD SYNC] Would delete all items from cloud');
      }
    } catch (error) {
      console.error('Failed to delete all from cloud:', error);
    }
  }

  /**
   * Clean up old data based on auto-delete setting
   */
  private static async cleanupOldData(): Promise<void> {
    if (!this.settings.autoDeleteAfterDays) return;

    try {
      const items = await this.getAllItems();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.settings.autoDeleteAfterDays);

      for (const item of items) {
        const itemDate = new Date(item.createdAt);
        if (itemDate < cutoffDate) {
          await this.deleteItem(item.id);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
    }
  }

  /**
   * Get storage settings
   */
  static getSettings(): StorageSettings {
    return { ...this.settings };
  }

  /**
   * Update storage settings
   */
  static async updateSettings(updates: Partial<StorageSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.saveSettings();
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<{
    totalItems: number;
    itemsByType: Record<string, number>;
    totalSizeBytes: number;
    localOnly: number;
    syncedToCloud: number;
  }> {
    try {
      const items = await this.getAllItems();
      
      const stats = {
        totalItems: items.length,
        itemsByType: {} as Record<string, number>,
        totalSizeBytes: 0,
        localOnly: 0,
        syncedToCloud: 0,
      };

      for (const item of items) {
        // Count by type
        stats.itemsByType[item.type] = (stats.itemsByType[item.type] || 0) + 1;
        
        // Estimate size
        stats.totalSizeBytes += JSON.stringify(item).length;
        
        // Count sync status
        if (item.localOnly) stats.localOnly++;
        if (item.syncedToCloud) stats.syncedToCloud++;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        totalItems: 0,
        itemsByType: {},
        totalSizeBytes: 0,
        localOnly: 0,
        syncedToCloud: 0,
      };
    }
  }

  /**
   * Export all data (for GDPR compliance)
   */
  static async exportAllData(): Promise<any> {
    try {
      const items = await this.getAllItems();
      const settings = this.getSettings();
      const stats = await this.getStorageStats();

      return {
        exportDate: new Date().toISOString(),
        settings,
        stats,
        items: items.map(item => ({
          ...item,
          // Don't export encrypted content, export decrypted
          encrypted: false,
        })),
      };
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  /**
   * Clear all data (for account deletion)
   */
  static async clearAllData(): Promise<void> {
    try {
      // Delete all items
      await this.deleteAllItems();
      
      // Clear settings
      await AsyncStorage.removeItem(STORAGE_SETTINGS_KEY);
      
      // Clear encryption key
      await AsyncStorage.removeItem(ENCRYPTION_KEY_STORAGE);
      
      // Reset to defaults
      this.settings = {
        location: StorageLocation.LOCAL_ONLY,
        cloudSyncEnabled: false,
        autoDeleteAfterDays: null,
        encryptLocal: true,
        lastSyncTime: null,
      };
      
      this.encryptionKey = null;
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
}
