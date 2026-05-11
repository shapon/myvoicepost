import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

// Storage keys
const OFFLINE_QUEUE_KEY = 'offline_queue';
const NETWORK_STATE_KEY = 'network_state';

// Types
export interface OfflineRequest {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
}

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  lastOnlineTime: number;
}

/**
 * OfflineManager - Handles offline recording and queue management
 * Ensures no data loss when network fails
 */
export class OfflineManager {
  private static instance: OfflineManager;
  private isOnline = true;
  private requestQueue: OfflineRequest[] = [];
  private isProcessingQueue = false;
  private networkUnsubscribe: (() => void) | null = null;
  private appStateSubscription: any = null;

  private constructor() {}

  static getInstance(): OfflineManager {
    if (!OfflineManager.instance) {
      OfflineManager.instance = new OfflineManager();
    }
    return OfflineManager.instance;
  }

  /**
   * Initialize offline manager
   */
  async initialize(): Promise<void> {
    console.log('[Offline] Initializing...');
    
    // Load pending requests from storage
    await this.loadQueue();
    
    // Start monitoring network
    this.startNetworkMonitoring();
    
    // Monitor app state for background/foreground
    this.startAppStateMonitoring();
    
    console.log('[Offline] Initialized with', this.requestQueue.length, 'pending requests');
  }

  /**
   * Start monitoring network connectivity
   */
  private startNetworkMonitoring(): void {
    this.networkUnsubscribe = NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      console.log('[Offline] Network state:', {
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable,
      });

      // Save network state
      this.saveNetworkState({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        lastOnlineTime: state.isConnected ? Date.now() : 0,
      });

      // Process queue when coming back online
      if (!wasOnline && this.isOnline) {
        console.log('[Offline] ✓ Back online! Processing queue...');
        this.processQueue();
      }

      // Notify about offline mode
      if (wasOnline && !this.isOnline) {
        console.log('[Offline] ⚠ Gone offline! Requests will be queued');
      }
    });
  }

  /**
   * Start monitoring app state (background/foreground)
   */
  private startAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          // App came to foreground, process queue
          console.log('[Offline] App active, processing queue');
          this.processQueue();
        }
      }
    );
  }

  /**
   * Check if device is online
   */
  isDeviceOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Get current network state
   */
  async getNetworkState(): Promise<NetworkState> {
    try {
      const state = await NetInfo.fetch();
      return {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        lastOnlineTime: state.isConnected ? Date.now() : 0,
      };
    } catch (error) {
      console.error('[Offline] Failed to get network state:', error);
      return {
        isConnected: false,
        isInternetReachable: null,
        type: null,
        lastOnlineTime: 0,
      };
    }
  }

  /**
   * Add request to offline queue
   */
  async addToQueue(request: Omit<OfflineRequest, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
    const queueItem: OfflineRequest = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      ...request,
    };

    console.log('[Offline] Adding to queue:', queueItem.url);
    
    this.requestQueue.push(queueItem);
    await this.saveQueue();
    
    // Try to process immediately if online
    if (this.isOnline) {
      this.processQueue();
    }

    return queueItem.id;
  }

  /**
   * Process offline queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0 || !this.isOnline) {
      return;
    }

    this.isProcessingQueue = true;
    console.log('[Offline] Processing queue:', this.requestQueue.length, 'items');

    // Sort by priority (high -> medium -> low)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedQueue = [...this.requestQueue].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    for (const request of sortedQueue) {
      if (!this.isOnline) {
        console.log('[Offline] Gone offline during processing');
        break;
      }

      try {
        console.log('[Offline] Processing request:', request.id);
        
        // Execute request (you'll need to integrate with your API client)
        await this.executeRequest(request);
        
        // Remove from queue on success
        this.requestQueue = this.requestQueue.filter(r => r.id !== request.id);
        console.log('[Offline] ✓ Request completed:', request.id);
        
      } catch (error) {
        console.error('[Offline] ✗ Request failed:', request.id, error);
        
        // Increment retry count
        request.retryCount++;
        
        // Remove if max retries exceeded
        if (request.retryCount >= request.maxRetries) {
          console.log('[Offline] Max retries exceeded, removing:', request.id);
          this.requestQueue = this.requestQueue.filter(r => r.id !== request.id);
        }
      }
    }

    await this.saveQueue();
    this.isProcessingQueue = false;
    
    console.log('[Offline] Queue processed. Remaining:', this.requestQueue.length);
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(request: OfflineRequest): Promise<any> {
    // This should integrate with your API client
    // For now, it's a placeholder
    
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: request.data ? JSON.stringify(request.data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Save queue to storage
   */
  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.requestQueue));
    } catch (error) {
      console.error('[Offline] Failed to save queue:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (data) {
        this.requestQueue = JSON.parse(data);
        console.log('[Offline] Loaded', this.requestQueue.length, 'pending requests');
      }
    } catch (error) {
      console.error('[Offline] Failed to load queue:', error);
      this.requestQueue = [];
    }
  }

  /**
   * Save network state to storage
   */
  private async saveNetworkState(state: NetworkState): Promise<void> {
    try {
      await AsyncStorage.setItem(NETWORK_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[Offline] Failed to save network state:', error);
    }
  }

  /**
   * Get saved network state
   */
  async getSavedNetworkState(): Promise<NetworkState | null> {
    try {
      const data = await AsyncStorage.getItem(NETWORK_STATE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Offline] Failed to get network state:', error);
      return null;
    }
  }

  /**
   * Clear all queued requests
   */
  async clearQueue(): Promise<void> {
    console.log('[Offline] Clearing queue');
    this.requestQueue = [];
    await this.saveQueue();
  }

  /**
   * Remove specific request from queue
   */
  async removeFromQueue(requestId: string): Promise<void> {
    console.log('[Offline] Removing from queue:', requestId);
    this.requestQueue = this.requestQueue.filter(r => r.id !== requestId);
    await this.saveQueue();
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      isOnline: this.isOnline,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      pendingRequests: this.requestQueue.map(r => ({
        id: r.id,
        url: r.url,
        method: r.method,
        retryCount: r.retryCount,
        priority: r.priority,
      })),
    };
  }

  /**
   * Retry failed requests manually
   */
  async retryFailedRequests(): Promise<void> {
    console.log('[Offline] Manually retrying failed requests');
    await this.processQueue();
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
  }
}

// Export singleton instance
export const offlineManager = OfflineManager.getInstance();
