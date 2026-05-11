import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineManager } from './offlineManager';
import { backupManager } from './backupManager';
import { Alert } from 'react-native';

// Storage keys for local saved items
const LOCAL_SAVED_ITEMS_KEY = 'local_saved_items';
const PENDING_SYNC_KEY = 'pending_sync';

export interface LocalSavedItem {
  id: string;
  type: 'polish' | 'translate';
  originalText: string;
  polishedText: string;
  translatedText?: string;
  sourceLanguage: string;
  targetLanguage?: string;
  outputFormat: string;
  outputType?: string;
  createdAt: string;
  synced: boolean;
  localOnly: boolean;
  backupId?: string;
}

export interface PendingSyncItem {
  id: string;
  data: LocalSavedItem;
  attempts: number;
  lastAttempt: number;
}

/**
 * OfflineApiWrapper - Wraps API calls with offline support
 * Automatically saves to local storage when network fails
 * Syncs to server when network is available
 */
export class OfflineApiWrapper {
  private static instance: OfflineApiWrapper;

  private constructor() {}

  static getInstance(): OfflineApiWrapper {
    if (!OfflineApiWrapper.instance) {
      OfflineApiWrapper.instance = new OfflineApiWrapper();
    }
    return OfflineApiWrapper.instance;
  }

  /**
   * Save item with offline support
   * Always saves locally first, then tries cloud sync
   */
  async saveItem(item: Omit<LocalSavedItem, 'id' | 'createdAt' | 'synced' | 'localOnly'>): Promise<{
    success: boolean;
    item: LocalSavedItem;
    savedLocally: boolean;
    savedToServer: boolean;
    message: string;
  }> {
    const localItem: LocalSavedItem = {
      ...item,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      synced: false,
      localOnly: true,
    };

    try {
      console.log('[OfflineAPI] Saving item...');
      
      // 1. ALWAYS save locally first (bulletproof)
      await this.saveToLocalStorage(localItem);
      console.log('[OfflineAPI] ✓ Saved to local storage');

      // 2. Create backup
      const backupId = await backupManager.createBackup(localItem, item.type);
      localItem.backupId = backupId;
      console.log('[OfflineAPI] ✓ Backup created:', backupId);

      // 3. Check if online
      const isOnline = offlineManager.isDeviceOnline();
      
      if (!isOnline) {
        // Offline - queue for later sync
        await this.addToPendingSync(localItem);
        console.log('[OfflineAPI] ⚠ Offline - queued for sync');
        
        return {
          success: true,
          item: localItem,
          savedLocally: true,
          savedToServer: false,
          message: 'Saved locally. Will sync when online.',
        };
      }

      // 4. Try to sync to server
      try {
        const { savedItemsApi } = await import('../lib/api');
        const serverResponse = await savedItemsApi.save({
          type: item.type,
          originalText: item.originalText,
          polishedText: item.polishedText,
          translatedText: item.translatedText,
          sourceLanguage: item.sourceLanguage,
          targetLanguage: item.targetLanguage,
          outputFormat: item.outputFormat,
          outputType: item.outputType,
        });

        // Success! Update local item with server ID
        localItem.id = serverResponse.id;
        localItem.synced = true;
        localItem.localOnly = false;
        
        await this.updateLocalItem(localItem);
        await backupManager.markAsSynced(backupId);
        
        console.log('[OfflineAPI] ✓ Synced to server');
        
        return {
          success: true,
          item: localItem,
          savedLocally: true,
          savedToServer: true,
          message: 'Saved successfully!',
        };
      } catch (syncError: any) {
        console.error('[OfflineAPI] ✗ Server sync failed:', syncError);
        
        // Server sync failed - but data is safe locally
        await this.addToPendingSync(localItem);
        
        return {
          success: true,
          item: localItem,
          savedLocally: true,
          savedToServer: false,
          message: 'Saved locally. Will retry sync later.',
        };
      }
    } catch (error) {
      console.error('[OfflineAPI] ✗ Save failed completely:', error);
      
      return {
        success: false,
        item: localItem,
        savedLocally: false,
        savedToServer: false,
        message: 'Failed to save. Please try again.',
      };
    }
  }

  /**
   * Get all items (local + synced)
   */
  async getAllItems(): Promise<LocalSavedItem[]> {
    try {
      console.log('[OfflineAPI] Getting all items...');
      
      // Get local items
      const localItems = await this.getLocalItems();
      console.log('[OfflineAPI] Local items:', localItems.length);

      // Try to get server items if online
      const isOnline = offlineManager.isDeviceOnline();
      
      if (isOnline) {
        try {
          const { savedItemsApi } = await import('../lib/api');
          const serverItems = await savedItemsApi.getAll();
          
          // Convert server items to local format
          const serverItemsConverted: LocalSavedItem[] = serverItems.map(item => ({
            id: item.id,
            type: item.type as 'polish' | 'translate',
            originalText: item.originalText,
            polishedText: item.polishedText,
            translatedText: item.translatedText || undefined,
            sourceLanguage: item.sourceLanguage,
            targetLanguage: item.targetLanguage || undefined,
            outputFormat: item.outputFormat,
            outputType: item.outputType || undefined,
            createdAt: item.createdAt,
            synced: true,
            localOnly: false,
          }));

          // Merge with local unsynced items
          const unsyncedLocal = localItems.filter(item => !item.synced);
          const merged = [...serverItemsConverted, ...unsyncedLocal];
          
          // Sort by date (newest first)
          merged.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          console.log('[OfflineAPI] ✓ Merged items:', merged.length);
          return merged;
        } catch (error) {
          console.error('[OfflineAPI] Server fetch failed, using local only:', error);
        }
      } else {
        console.log('[OfflineAPI] ⚠ Offline - using local items only');
      }

      // Return local items only
      return localItems.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('[OfflineAPI] Failed to get items:', error);
      return [];
    }
  }

  /**
   * Delete item (local and server)
   */
  async deleteItem(id: string): Promise<boolean> {
    try {
      console.log('[OfflineAPI] Deleting item:', id);
      
      // Delete from local storage
      await this.deleteFromLocalStorage(id);
      console.log('[OfflineAPI] ✓ Deleted from local storage');

      // Try to delete from server if online and synced
      const isOnline = offlineManager.isDeviceOnline();
      
      if (isOnline && !id.startsWith('local_')) {
        try {
          const { savedItemsApi } = await import('../lib/api');
          await savedItemsApi.delete(id);
          console.log('[OfflineAPI] ✓ Deleted from server');
        } catch (error) {
          console.error('[OfflineAPI] Server delete failed (item still deleted locally):', error);
        }
      }

      return true;
    } catch (error) {
      console.error('[OfflineAPI] Delete failed:', error);
      return false;
    }
  }

  /**
   * Sync pending items to server
   */
  async syncPendingItems(): Promise<{
    success: number;
    failed: number;
    total: number;
  }> {
    console.log('[OfflineAPI] Starting sync...');
    
    if (!offlineManager.isDeviceOnline()) {
      console.log('[OfflineAPI] ⚠ Offline - cannot sync');
      return { success: 0, failed: 0, total: 0 };
    }

    const pending = await this.getPendingSync();
    console.log('[OfflineAPI] Pending items:', pending.length);

    let success = 0;
    let failed = 0;

    for (const pendingItem of pending) {
      try {
        const { savedItemsApi } = await import('../lib/api');
        const serverResponse = await savedItemsApi.save({
          type: pendingItem.data.type,
          originalText: pendingItem.data.originalText,
          polishedText: pendingItem.data.polishedText,
          translatedText: pendingItem.data.translatedText,
          sourceLanguage: pendingItem.data.sourceLanguage,
          targetLanguage: pendingItem.data.targetLanguage,
          outputFormat: pendingItem.data.outputFormat,
          outputType: pendingItem.data.outputType,
        });

        // Update local item
        const updatedItem: LocalSavedItem = {
          ...pendingItem.data,
          id: serverResponse.id,
          synced: true,
          localOnly: false,
        };
        
        await this.updateLocalItem(updatedItem);
        
        // Mark backup as synced
        if (pendingItem.data.backupId) {
          await backupManager.markAsSynced(pendingItem.data.backupId);
        }
        
        // Remove from pending
        await this.removeFromPendingSync(pendingItem.id);
        
        success++;
        console.log('[OfflineAPI] ✓ Synced:', pendingItem.id);
      } catch (error) {
        console.error('[OfflineAPI] ✗ Sync failed:', pendingItem.id, error);
        
        // Update attempt count
        pendingItem.attempts++;
        pendingItem.lastAttempt = Date.now();
        
        // Remove if too many attempts (keep locally though)
        if (pendingItem.attempts >= 5) {
          await this.removeFromPendingSync(pendingItem.id);
          console.log('[OfflineAPI] Max attempts reached, giving up on sync');
        } else {
          await this.updatePendingSync(pendingItem);
        }
        
        failed++;
      }
    }

    console.log('[OfflineAPI] Sync complete:', { success, failed, total: pending.length });
    
    return { success, failed, total: pending.length };
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    pendingCount: number;
    unsyncedCount: number;
    isOnline: boolean;
  }> {
    const pending = await this.getPendingSync();
    const localItems = await this.getLocalItems();
    const unsynced = localItems.filter(item => !item.synced);
    
    return {
      pendingCount: pending.length,
      unsyncedCount: unsynced.length,
      isOnline: offlineManager.isDeviceOnline(),
    };
  }

  // Private helper methods

  private async saveToLocalStorage(item: LocalSavedItem): Promise<void> {
    const items = await this.getLocalItems();
    items.push(item);
    await AsyncStorage.setItem(LOCAL_SAVED_ITEMS_KEY, JSON.stringify(items));
  }

  private async updateLocalItem(item: LocalSavedItem): Promise<void> {
    const items = await this.getLocalItems();
    const index = items.findIndex(i => i.id === item.id);
    
    if (index !== -1) {
      items[index] = item;
    } else {
      items.push(item);
    }
    
    await AsyncStorage.setItem(LOCAL_SAVED_ITEMS_KEY, JSON.stringify(items));
  }

  private async deleteFromLocalStorage(id: string): Promise<void> {
    const items = await this.getLocalItems();
    const filtered = items.filter(item => item.id !== id);
    await AsyncStorage.setItem(LOCAL_SAVED_ITEMS_KEY, JSON.stringify(filtered));
  }

  private async getLocalItems(): Promise<LocalSavedItem[]> {
    try {
      const data = await AsyncStorage.getItem(LOCAL_SAVED_ITEMS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[OfflineAPI] Failed to get local items:', error);
      return [];
    }
  }

  private async addToPendingSync(item: LocalSavedItem): Promise<void> {
    const pending = await this.getPendingSync();
    
    pending.push({
      id: item.id,
      data: item,
      attempts: 0,
      lastAttempt: 0,
    });
    
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
  }

  private async removeFromPendingSync(id: string): Promise<void> {
    const pending = await this.getPendingSync();
    const filtered = pending.filter(item => item.id !== id);
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(filtered));
  }

  private async updatePendingSync(item: PendingSyncItem): Promise<void> {
    const pending = await this.getPendingSync();
    const index = pending.findIndex(p => p.id === item.id);
    
    if (index !== -1) {
      pending[index] = item;
      await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
    }
  }

  private async getPendingSync(): Promise<PendingSyncItem[]> {
    try {
      const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[OfflineAPI] Failed to get pending sync:', error);
      return [];
    }
  }
}

// Export singleton instance
export const offlineApi = OfflineApiWrapper.getInstance();

/**
 * User-friendly alert for save results
 */
export function showSaveResultAlert(result: {
  success: boolean;
  savedLocally: boolean;
  savedToServer: boolean;
  message: string;
}): void {
  if (result.success) {
    if (result.savedToServer) {
      Alert.alert('✓ Saved Successfully', result.message);
    } else if (result.savedLocally) {
      Alert.alert(
        '✓ Saved Locally',
        'Your work is safe! It will sync to the server when you\'re back online.',
        [{ text: 'OK' }]
      );
    }
  } else {
    Alert.alert(
      '✗ Save Failed',
      'Unable to save at this time. Please try again.',
      [{ text: 'OK' }]
    );
  }
}
