import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { batteryManager, BatteryProfile, BatteryProfileConfig, BatteryState } from '../utils/batteryManager';
import { secureLog } from '../utils/secureLogger';

interface BatteryContextType {
  profile: BatteryProfile;
  profileConfig: BatteryProfileConfig;
  batteryState: BatteryState;
  allProfiles: BatteryProfileConfig[];
  isRealtimeMode: boolean;
  isPowerSaverMode: boolean;
  showHighBatteryWarning: boolean;
  pollingInterval: number;
  backgroundSyncEnabled: boolean;
  animationsEnabled: boolean;
  setProfile: (profile: BatteryProfile) => Promise<void>;
  dismissWarning: () => void;
}

const BatteryContext = createContext<BatteryContextType | undefined>(undefined);

export function BatteryProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<BatteryProfile>('balanced');
  const [profileConfig, setProfileConfig] = useState<BatteryProfileConfig>(
    batteryManager.getProfileConfig('balanced')
  );
  const [batteryState, setBatteryState] = useState<BatteryState>(
    batteryManager.getBatteryState()
  );
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    const init = async () => {
      await batteryManager.initialize();
      const currentProfile = batteryManager.getProfile();
      setProfileState(currentProfile);
      setProfileConfig(batteryManager.getProfileConfig(currentProfile));
      setBatteryState(batteryManager.getBatteryState());
    };
    init();

    const removeProfileListener = batteryManager.addProfileChangeListener(
      (newProfile, newConfig) => {
        setProfileState(newProfile);
        setProfileConfig(newConfig);
        setBatteryState(batteryManager.getBatteryState());
        if (newProfile !== 'realtime') {
          setWarningDismissed(false);
        }
      }
    );

    const removeBatteryStateListener = batteryManager.addBatteryStateListener(
      (newState) => {
        setBatteryState(newState);
      }
    );

    return () => {
      removeProfileListener();
      removeBatteryStateListener();
    };
  }, []);

  const setProfile = useCallback(async (newProfile: BatteryProfile) => {
    await batteryManager.setProfile(newProfile);
    setProfileState(newProfile);
    setProfileConfig(batteryManager.getProfileConfig(newProfile));
    if (newProfile !== 'realtime') {
      setWarningDismissed(false);
    }
  }, []);

  const dismissWarning = useCallback(() => {
    setWarningDismissed(true);
  }, []);

  const value: BatteryContextType = {
    profile,
    profileConfig,
    batteryState,
    allProfiles: batteryManager.getAllProfiles(),
    isRealtimeMode: profile === 'realtime',
    isPowerSaverMode: profile === 'power_saver',
    showHighBatteryWarning: profile === 'realtime' && !warningDismissed,
    pollingInterval: profileConfig.pollingIntervalMs,
    backgroundSyncEnabled: profileConfig.backgroundSyncEnabled,
    animationsEnabled: profileConfig.animationsEnabled,
    setProfile,
    dismissWarning,
  };

  return (
    <BatteryContext.Provider value={value}>
      {children}
    </BatteryContext.Provider>
  );
}

export function useBattery() {
  const context = useContext(BatteryContext);
  if (!context) {
    throw new Error('useBattery must be used within BatteryProvider');
  }
  return context;
}
