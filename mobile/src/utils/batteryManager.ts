import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import { secureLog } from './secureLogger';

export type BatteryProfile = 'power_saver' | 'balanced' | 'realtime';

export interface BatteryProfileConfig {
  id: BatteryProfile;
  label: string;
  description: string;
  icon: string;
  pollingIntervalMs: number;
  backgroundSyncEnabled: boolean;
  animationsEnabled: boolean;
  targetDrainPerHour: string;
  workManagerConstraints: WorkManagerConstraints;
}

export interface WorkManagerConstraints {
  requiresCharging: boolean;
  requiresBatteryNotLow: boolean;
  requiresDeviceIdle: boolean;
  networkType: 'connected' | 'unmetered' | 'none';
  periodicIntervalMinutes: number;
}

export interface BatteryState {
  level: number;
  isCharging: boolean;
  isPowerSaveMode: boolean;
}

const STORAGE_KEY = '@battery_profile';
const BATTERY_STATE_KEY = '@battery_state_cache';
const BATTERY_EMERGENCY_THRESHOLD = 0.05;

type EmergencyBatteryCallback = () => void;

const PROFILE_CONFIGS: Record<BatteryProfile, BatteryProfileConfig> = {
  power_saver: {
    id: 'power_saver',
    label: 'Power Saver',
    description: 'Minimizes battery drain. Disables background sync, reduces animations, and sets polling to 15+ minute intervals.',
    icon: 'battery-half-outline',
    pollingIntervalMs: 15 * 60 * 1000,
    backgroundSyncEnabled: false,
    animationsEnabled: false,
    targetDrainPerHour: '<20%',
    workManagerConstraints: {
      requiresCharging: false,
      requiresBatteryNotLow: true,
      requiresDeviceIdle: true,
      networkType: 'unmetered',
      periodicIntervalMinutes: 60,
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Standard performance with optimized background work. Good balance of features and battery life.',
    icon: 'speedometer-outline',
    pollingIntervalMs: 30 * 1000,
    backgroundSyncEnabled: true,
    animationsEnabled: true,
    targetDrainPerHour: '<40%',
    workManagerConstraints: {
      requiresCharging: false,
      requiresBatteryNotLow: false,
      requiresDeviceIdle: false,
      networkType: 'connected',
      periodicIntervalMinutes: 15,
    },
  },
  realtime: {
    id: 'realtime',
    label: 'Real-time',
    description: 'Maximum performance for real-time features. Warning: Higher battery usage expected.',
    icon: 'flash-outline',
    pollingIntervalMs: 5 * 1000,
    backgroundSyncEnabled: true,
    animationsEnabled: true,
    targetDrainPerHour: 'High',
    workManagerConstraints: {
      requiresCharging: false,
      requiresBatteryNotLow: false,
      requiresDeviceIdle: false,
      networkType: 'connected',
      periodicIntervalMinutes: 5,
    },
  },
};

type ProfileChangeListener = (profile: BatteryProfile, config: BatteryProfileConfig) => void;
type BatteryStateChangeListener = (state: BatteryState) => void;

class BatteryManager {
  private static instance: BatteryManager;
  private currentProfile: BatteryProfile = 'balanced';
  private batteryState: BatteryState = {
    level: 100,
    isCharging: false,
    isPowerSaveMode: false,
  };
  private listeners: Set<ProfileChangeListener> = new Set();
  private batteryStateListeners: Set<BatteryStateChangeListener> = new Set();
  private emergencyCallbacks: Set<EmergencyBatteryCallback> = new Set();
  private emergencyTriggered = false;
  private initialized = false;
  private appStateSubscription: any = null;

  private constructor() {}

  static getInstance(): BatteryManager {
    if (!BatteryManager.instance) {
      BatteryManager.instance = new BatteryManager();
    }
    return BatteryManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const defaultProfile = this.currentProfile;
      await this.loadPersistedProfile();
      await this.detectSystemPowerSaveMode();
      this.startAppStateMonitoring();
      this.initialized = true;
      secureLog.debug('[BatteryManager] Initialized with profile:', this.currentProfile);

      if (this.currentProfile !== defaultProfile) {
        const config = this.getProfileConfig();
        this.listeners.forEach(listener => {
          try {
            listener(this.currentProfile, config);
          } catch (error) {
            secureLog.error('[BatteryManager] Init listener error:', error);
          }
        });
      }
    } catch (error) {
      secureLog.error('[BatteryManager] Initialization failed:', error);
      this.currentProfile = 'balanced';
      this.initialized = true;
    }
  }

  private async loadPersistedProfile(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && (stored === 'power_saver' || stored === 'balanced' || stored === 'realtime')) {
        this.currentProfile = stored as BatteryProfile;
      }

      const cachedState = await AsyncStorage.getItem(BATTERY_STATE_KEY);
      if (cachedState) {
        const parsed = JSON.parse(cachedState);
        this.batteryState = { ...this.batteryState, ...parsed };
      }
    } catch (error) {
      secureLog.error('[BatteryManager] Failed to load persisted profile:', error);
    }
  }

  async detectSystemPowerSaveMode(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const PowerManager = NativeModules.PowerManager;
        if (PowerManager && typeof PowerManager.isPowerSaveMode === 'function') {
          const isPowerSave = await PowerManager.isPowerSaveMode();
          this.batteryState.isPowerSaveMode = isPowerSave;
          await this.cacheBatteryState();
          return isPowerSave;
        }
      }

      this.batteryState.isPowerSaveMode = false;
      return false;
    } catch (error) {
      secureLog.debug('[BatteryManager] Power save mode detection not available:', error);
      this.batteryState.isPowerSaveMode = false;
      return false;
    }
  }

  private async cacheBatteryState(): Promise<void> {
    try {
      await AsyncStorage.setItem(BATTERY_STATE_KEY, JSON.stringify(this.batteryState));
    } catch (error) {
      secureLog.error('[BatteryManager] Failed to cache battery state:', error);
    }
  }

  private startAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      await this.detectSystemPowerSaveMode();
      this.notifyBatteryStateListeners();
    }
  };

  private notifyBatteryStateListeners(): void {
    const state = this.getBatteryState();
    this.batteryStateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        secureLog.error('[BatteryManager] Battery state listener error:', error);
      }
    });
  }

  async setProfile(profile: BatteryProfile): Promise<void> {
    const previousProfile = this.currentProfile;
    this.currentProfile = profile;

    try {
      await AsyncStorage.setItem(STORAGE_KEY, profile);
    } catch (error) {
      secureLog.error('[BatteryManager] Failed to persist profile:', error);
    }

    if (previousProfile !== profile) {
      secureLog.debug('[BatteryManager] Profile changed:', previousProfile, '->', profile);
      const config = this.getProfileConfig();
      this.listeners.forEach(listener => {
        try {
          listener(profile, config);
        } catch (error) {
          secureLog.error('[BatteryManager] Listener error:', error);
        }
      });
    }
  }

  getProfile(): BatteryProfile {
    return this.currentProfile;
  }

  getProfileConfig(profile?: BatteryProfile): BatteryProfileConfig {
    return PROFILE_CONFIGS[profile || this.currentProfile];
  }

  getAllProfiles(): BatteryProfileConfig[] {
    return Object.values(PROFILE_CONFIGS);
  }

  getBatteryState(): BatteryState {
    return { ...this.batteryState };
  }

  getPollingInterval(): number {
    return PROFILE_CONFIGS[this.currentProfile].pollingIntervalMs;
  }

  isBackgroundSyncEnabled(): boolean {
    return PROFILE_CONFIGS[this.currentProfile].backgroundSyncEnabled;
  }

  areAnimationsEnabled(): boolean {
    return PROFILE_CONFIGS[this.currentProfile].animationsEnabled;
  }

  getWorkManagerConstraints(): WorkManagerConstraints {
    return { ...PROFILE_CONFIGS[this.currentProfile].workManagerConstraints };
  }

  isRealtimeMode(): boolean {
    return this.currentProfile === 'realtime';
  }

  isPowerSaverMode(): boolean {
    return this.currentProfile === 'power_saver';
  }

  shouldShowHighBatteryWarning(): boolean {
    return this.currentProfile === 'realtime';
  }

  addProfileChangeListener(listener: ProfileChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  addBatteryStateListener(listener: BatteryStateChangeListener): () => void {
    this.batteryStateListeners.add(listener);
    return () => {
      this.batteryStateListeners.delete(listener);
    };
  }

  addEmergencyBatteryCallback(callback: EmergencyBatteryCallback): () => void {
    this.emergencyCallbacks.add(callback);
    return () => {
      this.emergencyCallbacks.delete(callback);
    };
  }

  updateBatteryLevel(level: number, isCharging?: boolean): void {
    const previousLevel = this.batteryState.level;
    this.batteryState.level = level;
    if (isCharging !== undefined) {
      this.batteryState.isCharging = isCharging;
    }

    this.cacheBatteryState();
    this.notifyBatteryStateListeners();

    if (
      level <= BATTERY_EMERGENCY_THRESHOLD &&
      previousLevel > BATTERY_EMERGENCY_THRESHOLD &&
      !this.batteryState.isCharging &&
      !this.emergencyTriggered
    ) {
      this.emergencyTriggered = true;
      secureLog.warn('[BatteryManager] EMERGENCY: Battery at', Math.round(level * 100) + '%, triggering emergency callbacks');
      this.emergencyCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          secureLog.error('[BatteryManager] Emergency callback error:', error);
        }
      });
    }

    if (level > BATTERY_EMERGENCY_THRESHOLD) {
      this.emergencyTriggered = false;
    }
  }

  isBatteryCriticallyLow(): boolean {
    return this.batteryState.level <= BATTERY_EMERGENCY_THRESHOLD && !this.batteryState.isCharging;
  }

  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.listeners.clear();
    this.batteryStateListeners.clear();
    this.emergencyCallbacks.clear();
    this.emergencyTriggered = false;
  }
}

export const batteryManager = BatteryManager.getInstance();
