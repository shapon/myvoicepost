import { secureLog } from '../utils/secureLogger';
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { autoSaveManager, AutoSaveData, RecoveryData } from '../utils/autoSaveManager';
import { offlineManager } from '../utils/offlineManager';
import { backupManager } from '../utils/backupManager';
import { offlineApi } from '../utils/offlineApiWrapper';
import { batteryManager, BatteryProfile, BatteryProfileConfig } from '../utils/batteryManager';

interface ReliabilityContextType {
  // Auto-save status
  isAutoSaveEnabled: boolean;
  lastAutoSaveTime: number;
  autoSaveStatus: string;
  
  // Recovery
  recoveryData: RecoveryData | null;
  showRecoveryModal: boolean;
  
  // Offline status
  isOnline: boolean;
  pendingRequestsCount: number;
  
  // Sync status
  syncStatus: {
    pendingCount: number;
    unsyncedCount: number;
    isSyncing: boolean;
  };
  
  // Backup statistics
  backupStats: {
    total: number;
    synced: number;
    unsynced: number;
  };
  
  // Actions
  startTracking: (data: Partial<AutoSaveData>) => void;
  updateTrackedData: (updates: Partial<AutoSaveData['data']>) => void;
  saveNow: () => Promise<boolean>;
  clearAutoSave: () => Promise<void>;
  restoreSession: (data: AutoSaveData) => void;
  discardRecovery: () => void;
  retryFailedRequests: () => Promise<void>;
  syncPendingItems: () => Promise<void>;
}

const ReliabilityContext = createContext<ReliabilityContextType | undefined>(undefined);

export function ReliabilityProvider({ children }: { children: ReactNode }) {
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(true);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState({
    pendingCount: 0,
    unsyncedCount: 0,
    isSyncing: false,
  });
  const [backupStats, setBackupStats] = useState({
    total: 0,
    synced: 0,
    unsynced: 0,
  });

  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPollingWithInterval = (intervalMs: number) => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }
    statusIntervalRef.current = setInterval(updateStatus, intervalMs);
    secureLog.debug('[Reliability] Polling interval set to', intervalMs, 'ms');
  };

  // Initialize reliability managers
  useEffect(() => {
    const removeProfileListener = batteryManager.addProfileChangeListener(
      (_profile: BatteryProfile, config: BatteryProfileConfig) => {
        startPollingWithInterval(config.pollingIntervalMs);

        if (!config.backgroundSyncEnabled) {
          secureLog.debug('[Reliability] Background sync disabled by battery profile');
        }
      }
    );

    const setup = async () => {
      await batteryManager.initialize();
      const pollingInterval = batteryManager.getPollingInterval();
      startPollingWithInterval(pollingInterval);
      await initializeReliability();
    };
    setup();
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      removeProfileListener();
      autoSaveManager.stopAutoSave();
      offlineManager.cleanup();
    };
  }, []);

  /**
   * Initialize all reliability managers
   */
  const initializeReliability = async () => {
    try {
      secureLog.debug('[Reliability] Initializing...');
      
      // Initialize auto-save and check for recovery data
      const recovery = await autoSaveManager.initialize();
      setRecoveryData(recovery);
      
      // Show recovery modal if data found
      if (recovery.hasUnsavedData && recovery.lastSession) {
        setShowRecoveryModal(true);
      }
      
      // Initialize offline manager
      await offlineManager.initialize();
      setIsOnline(offlineManager.isDeviceOnline());
      
      // Initialize backup manager
      await backupManager.initialize();
      
      // Update initial status
      await updateStatus();
      
      secureLog.debug('[Reliability] ✓ Initialized');
    } catch (error) {
      secureLog.error('[Reliability] Initialization failed:', error);
    }
  };

  /**
   * Handle app state changes (background/foreground)
   */
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    secureLog.debug('[Reliability] App state changed:', nextAppState);
    
    if (nextAppState === 'active') {
      await updateStatus();
      
      if (isOnline && batteryManager.isBackgroundSyncEnabled()) {
        await syncPendingItems();
      }
    } else if (nextAppState === 'background') {
      // App going to background - save immediately
      const saved = await autoSaveManager.saveNow();
      if (saved) {
        secureLog.debug('[Reliability] ✓ Data saved before backgrounding');
      }
    }
  };

  /**
   * Update status from all managers
   */
  const updateStatus = async () => {
    try {
      // Auto-save status
      const autoSaveStatus = autoSaveManager.getStatus();
      setIsAutoSaveEnabled(autoSaveStatus.isAutoSaveEnabled);
      setLastAutoSaveTime(autoSaveStatus.lastSaveTime);
      setAutoSaveStatus(
        autoSaveStatus.isTracking
          ? autoSaveStatus.isDirty
            ? 'unsaved'
            : 'saved'
          : 'idle'
      );
      
      // Offline status
      const queueStatus = offlineManager.getQueueStatus();
      setIsOnline(queueStatus.isOnline);
      setPendingRequestsCount(queueStatus.queueLength);
      
      // Sync status
      const syncStat = await offlineApi.getSyncStatus();
      setSyncStatus(prev => ({
        pendingCount: syncStat.pendingCount,
        unsyncedCount: syncStat.unsyncedCount,
        isSyncing: prev.isSyncing,
      }));
      
      // Backup statistics
      const stats = await backupManager.getStatistics();
      setBackupStats({
        total: stats.total,
        synced: stats.synced,
        unsynced: stats.unsynced,
      });
    } catch (error) {
      secureLog.error('[Reliability] Status update failed:', error);
    }
  };

  /**
   * Start tracking data for auto-save
   */
  const startTracking = (data: Partial<AutoSaveData>) => {
    secureLog.debug('[Reliability] Start tracking');
    autoSaveManager.startTracking(data);
    setAutoSaveStatus('tracking');
  };

  /**
   * Update tracked data
   */
  const updateTrackedData = (updates: Partial<AutoSaveData['data']>) => {
    autoSaveManager.updateData(updates);
    setAutoSaveStatus('unsaved');
  };

  /**
   * Save immediately
   */
  const saveNow = async (): Promise<boolean> => {
    secureLog.debug('[Reliability] Manual save triggered');
    const saved = await autoSaveManager.saveNow();
    if (saved) {
      setLastAutoSaveTime(Date.now());
      setAutoSaveStatus('saved');
    }
    return saved;
  };

  /**
   * Clear auto-save (after successful completion)
   */
  const clearAutoSave = async () => {
    secureLog.debug('[Reliability] Clearing auto-save');
    await autoSaveManager.clearAutoSave();
    setAutoSaveStatus('idle');
  };

  /**
   * Restore session from recovery
   */
  const restoreSession = (data: AutoSaveData) => {
    secureLog.debug('[Reliability] Session restored');
    setShowRecoveryModal(false);
    setRecoveryData(null);
    
    // Start tracking the restored data
    startTracking(data);
  };

  /**
   * Discard recovery data
   */
  const discardRecovery = () => {
    secureLog.debug('[Reliability] Recovery discarded');
    setShowRecoveryModal(false);
    setRecoveryData(null);
  };

  /**
   * Retry failed requests
   */
  const retryFailedRequests = async () => {
    secureLog.debug('[Reliability] Retrying failed requests');
    await offlineManager.retryFailedRequests();
    await updateStatus();
  };

  /**
   * Sync pending saved items
   */
  const syncPendingItems = async () => {
    if (syncStatus.isSyncing || !isOnline) {
      return;
    }

    try {
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
      secureLog.debug('[Reliability] Syncing pending items...');
      
      const result = await offlineApi.syncPendingItems();
      secureLog.debug('[Reliability] Sync result:', result);
      
      await updateStatus();
    } catch (error) {
      secureLog.error('[Reliability] Sync failed:', error);
    } finally {
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
    }
  };

  const value: ReliabilityContextType = {
    isAutoSaveEnabled,
    lastAutoSaveTime,
    autoSaveStatus,
    recoveryData,
    showRecoveryModal,
    isOnline,
    pendingRequestsCount,
    syncStatus,
    backupStats,
    startTracking,
    updateTrackedData,
    saveNow,
    clearAutoSave,
    restoreSession,
    discardRecovery,
    retryFailedRequests,
    syncPendingItems,
  };

  return (
    <ReliabilityContext.Provider value={value}>
      {children}
    </ReliabilityContext.Provider>
  );
}

export function useReliability() {
  const context = useContext(ReliabilityContext);
  if (!context) {
    throw new Error('useReliability must be used within ReliabilityProvider');
  }
  return context;
}
