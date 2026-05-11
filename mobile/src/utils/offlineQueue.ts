import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';

interface PendingChunk {
  id: string;
  uri: string;
  timestamp: number;
  sessionId: string; // Recording session ID
  chunkIndex: number; // Order within session
  metadata: {
    type: 'polish' | 'translate';
    language?: string;
    tone?: string;
    outputType?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  };
}

const PENDING_CHUNKS_KEY = '@pending_chunks';
const OFFLINE_CHUNKS_DIR = `${FileSystem.documentDirectory}offline_chunks/`;

class OfflineQueueManager {
  private isProcessing = false;
  private listeners: Array<(status: QueueStatus) => void> = [];

  constructor() {
    this.initDirectory();
    this.setupNetworkListener();
  }

  private async initDirectory() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(OFFLINE_CHUNKS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_CHUNKS_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('[OfflineQueue] Failed to create directory:', error);
    }
  }

  private setupNetworkListener() {
    NetInfo.addEventListener(state => {
      console.log('[OfflineQueue] Network state changed:', state.isConnected, 'Reachable:', state.isInternetReachable);
      
      // DISABLED: Auto-processing removed - users must use Pending tab
      // This gives better control and visibility
      // if (state.isConnected) {
      //   this.processQueue();
      // }
    });
  }

  /**
   * Check if network is available
   */
  async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      console.log('[OfflineQueue] Network state:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
      
      // Must have both connection AND internet reachability
      // Note: isInternetReachable can be null during detection, treat as offline
      return state.isConnected === true && state.isInternetReachable === true;
    } catch (error) {
      console.error('[OfflineQueue] Network check failed:', error);
      return false;
    }
  }

  /**
   * Save chunks to offline queue
   */
  async saveToQueue(
    chunks: Array<{ id: string; uri: string; sessionId: string; chunkIndex: number; timestamp: number }>,
    metadata: PendingChunk['metadata']
  ): Promise<void> {
    try {
      console.log('[OfflineQueue] Saving', chunks.length, 'chunks to offline queue');
      console.log('[OfflineQueue] Session ID:', chunks[0]?.sessionId);
      console.log('[OfflineQueue] Metadata:', metadata);

      // Copy chunks to offline directory
      const pendingChunks: PendingChunk[] = [];
      
      for (const chunk of chunks) {
        console.log('[OfflineQueue] Processing chunk:', chunk.id, 'Index:', chunk.chunkIndex, 'URI:', chunk.uri);
        
        // Verify source file exists
        const sourceInfo = await FileSystem.getInfoAsync(chunk.uri);
        if (!sourceInfo.exists) {
          console.error('[OfflineQueue] Source chunk does not exist:', chunk.uri);
          continue;
        }
        console.log('[OfflineQueue] Source chunk size:', sourceInfo.size, 'bytes');
        
        const offlineUri = `${OFFLINE_CHUNKS_DIR}${chunk.id}.m4a`;
        
        // Copy file to offline directory
        await FileSystem.copyAsync({
          from: chunk.uri,
          to: offlineUri,
        });
        
        // Verify copy
        const copyInfo = await FileSystem.getInfoAsync(offlineUri);
        console.log('[OfflineQueue] Copied to:', offlineUri, 'Size:', copyInfo.size, 'bytes');

        pendingChunks.push({
          id: chunk.id,
          uri: offlineUri,
          timestamp: chunk.timestamp,
          sessionId: chunk.sessionId,
          chunkIndex: chunk.chunkIndex,
          metadata,
        });
      }

      if (pendingChunks.length === 0) {
        throw new Error('No valid chunks to save');
      }

      // Get existing queue
      const existingQueue = await this.getQueue();
      const updatedQueue = [...existingQueue, ...pendingChunks];

      // Save updated queue
      await AsyncStorage.setItem(PENDING_CHUNKS_KEY, JSON.stringify(updatedQueue));

      console.log('[OfflineQueue] Saved successfully. Queue size:', updatedQueue.length);
      console.log('[OfflineQueue] Queue:', updatedQueue.map(c => ({ 
        id: c.id, 
        sessionId: c.sessionId,
        chunkIndex: c.chunkIndex,
        type: c.metadata.type 
      })));
      this.notifyListeners();
    } catch (error) {
      console.error('[OfflineQueue] Failed to save to queue:', error);
      throw error;
    }
  }

  /**
   * Get current queue
   */
  async getQueue(): Promise<PendingChunk[]> {
    try {
      const queueJson = await AsyncStorage.getItem(PENDING_CHUNKS_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('[OfflineQueue] Failed to get queue:', error);
      return [];
    }
  }

  /**
   * Get pending chunks with details for display
   */
  async getPendingChunksWithDetails(): Promise<PendingChunkGroup[]> {
    try {
      const queue = await this.getQueue();
      
      // Group chunks by sessionId (exact match)
      const groups: Map<string, PendingChunk[]> = new Map();
      
      for (const chunk of queue) {
        const sessionId = chunk.sessionId;
        
        if (!groups.has(sessionId)) {
          groups.set(sessionId, []);
        }
        groups.get(sessionId)!.push(chunk);
      }
      
      // Convert to array format for UI
      const result: PendingChunkGroup[] = [];
      
      for (const [sessionId, chunks] of groups) {
        // Sort chunks by chunkIndex to maintain order
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        
        const firstChunk = chunks[0];
        const totalSize = chunks.length;
        
        result.push({
          id: sessionId, // Use sessionId as group ID
          chunks,
          type: firstChunk.metadata.type,
          timestamp: firstChunk.timestamp,
          chunkCount: totalSize,
          metadata: firstChunk.metadata,
        });
      }
      
      // Sort by timestamp (newest first)
      result.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('[OfflineQueue] Pending groups:', result.map(g => ({
        sessionId: g.id,
        chunkCount: g.chunkCount,
        type: g.type,
      })));
      
      return result;
    } catch (error) {
      console.error('[OfflineQueue] Failed to get pending chunks:', error);
      return [];
    }
  }

  /**
   * Process a specific chunk group
   */
  async processChunkGroup(
    groupId: string, // This is the sessionId
    processor: (chunk: PendingChunk) => Promise<any>
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const queue = await this.getQueue();
      
      // Filter chunks by sessionId (exact match)
      const groupChunks = queue.filter(c => c.sessionId === groupId);

      if (groupChunks.length === 0) {
        return { success: false, error: 'Group not found' };
      }

      // CRITICAL: Sort chunks by chunkIndex to maintain recording order
      groupChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      console.log('[OfflineQueue] Processing group (session)', groupId, 'with', groupChunks.length, 'chunks');
      console.log('[OfflineQueue] Chunk order:', groupChunks.map(c => ({ 
        id: c.id, 
        chunkIndex: c.chunkIndex,
        timestamp: c.timestamp 
      })));

      // Process all chunks in the group
      const results = [];
      for (const chunk of groupChunks) {
        const result = await processor(chunk);
        results.push(result);
      }

      // Remove processed chunks from queue
      const remainingQueue = queue.filter(c => c.sessionId !== groupId);
      await AsyncStorage.setItem(PENDING_CHUNKS_KEY, JSON.stringify(remainingQueue));

      // Delete chunk files
      for (const chunk of groupChunks) {
        try {
          await FileSystem.deleteAsync(chunk.uri, { idempotent: true });
        } catch (error) {
          console.error('[OfflineQueue] Failed to delete chunk file:', error);
        }
      }

      this.notifyListeners();
      
      return { success: true, result: results };
    } catch (error: any) {
      console.error('[OfflineQueue] Failed to process group:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a specific chunk group without processing
   */
  async deleteChunkGroup(groupId: string): Promise<void> {
    try {
      const queue = await this.getQueue();
      const groupChunks = queue.filter(c => c.sessionId === groupId);

      // Delete chunk files
      for (const chunk of groupChunks) {
        try {
          await FileSystem.deleteAsync(chunk.uri, { idempotent: true });
        } catch (error) {
          console.error('[OfflineQueue] Failed to delete chunk file:', error);
        }
      }

      // Remove from queue
      const remainingQueue = queue.filter(c => c.sessionId !== groupId);
      await AsyncStorage.setItem(PENDING_CHUNKS_KEY, JSON.stringify(remainingQueue));

      this.notifyListeners();
      
      console.log('[OfflineQueue] Deleted group (session):', groupId);
    } catch (error) {
      console.error('[OfflineQueue] Failed to delete group:', error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getStatus(): Promise<QueueStatus> {
    const queue = await this.getQueue();
    const isOnline = await this.isOnline();
    
    return {
      pendingCount: queue.length,
      isOnline,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Process pending chunks
   */
  async processQueue(
    processor?: (chunk: PendingChunk) => Promise<void>
  ): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      console.log('[OfflineQueue] Already processing queue');
      return { processed: 0, failed: 0 };
    }

    const isOnline = await this.isOnline();
    if (!isOnline) {
      console.log('[OfflineQueue] Cannot process queue - offline');
      return { processed: 0, failed: 0 };
    }

    this.isProcessing = true;
    this.notifyListeners();

    let processed = 0;
    let failed = 0;

    try {
      const queue = await this.getQueue();
      console.log('[OfflineQueue] Processing', queue.length, 'pending chunks');

      const remainingQueue: PendingChunk[] = [];

      for (const chunk of queue) {
        try {
          // Check if file still exists
          const fileInfo = await FileSystem.getInfoAsync(chunk.uri);
          if (!fileInfo.exists) {
            console.log('[OfflineQueue] Chunk file missing:', chunk.id);
            failed++;
            continue;
          }

          // Process chunk if processor provided
          if (processor) {
            await processor(chunk);
          }

          // Delete processed chunk file
          await FileSystem.deleteAsync(chunk.uri, { idempotent: true });
          processed++;
          
          console.log(`[OfflineQueue] Processed chunk ${chunk.id}`);
        } catch (error) {
          console.error(`[OfflineQueue] Failed to process chunk ${chunk.id}:`, error);
          remainingQueue.push(chunk);
          failed++;
        }
      }

      // Update queue with failed chunks
      await AsyncStorage.setItem(PENDING_CHUNKS_KEY, JSON.stringify(remainingQueue));

      console.log('[OfflineQueue] Processing complete. Processed:', processed, 'Failed:', failed);
    } catch (error) {
      console.error('[OfflineQueue] Queue processing error:', error);
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }

    return { processed, failed };
  }

  /**
   * Clear entire queue (use with caution)
   */
  async clearQueue(): Promise<void> {
    try {
      const queue = await this.getQueue();
      
      // Delete all chunk files
      for (const chunk of queue) {
        try {
          await FileSystem.deleteAsync(chunk.uri, { idempotent: true });
        } catch (error) {
          console.error('[OfflineQueue] Failed to delete chunk:', chunk.id, error);
        }
      }

      // Clear queue
      await AsyncStorage.removeItem(PENDING_CHUNKS_KEY);
      this.notifyListeners();
      
      console.log('[OfflineQueue] Queue cleared');
    } catch (error) {
      console.error('[OfflineQueue] Failed to clear queue:', error);
    }
  }

  /**
   * Subscribe to queue status changes
   */
  subscribe(listener: (status: QueueStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Send initial status
    this.getStatus().then(listener);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.getStatus().then(status => {
      this.listeners.forEach(listener => listener(status));
    });
  }
}

export interface QueueStatus {
  pendingCount: number;
  isOnline: boolean;
  isProcessing: boolean;
}

export interface PendingChunkGroup {
  id: string;
  chunks: PendingChunk[];
  type: 'polish' | 'translate';
  timestamp: number;
  chunkCount: number;
  metadata: PendingChunk['metadata'];
}

// Singleton instance
export const offlineQueue = new OfflineQueueManager();
