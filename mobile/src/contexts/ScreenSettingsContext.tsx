/**
 * Screen Settings Context
 *
 * Manages loading and applying user settings from profile on first screen open per session.
 * Subsequent opens in the same session retain the previously used settings.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { settingsApi, UserSetting } from '../lib/api';
import { useAuth } from './AuthContext';

const DEFAULT_FAVORITE_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];

interface ScreenSettings {
  polishLanguage: string;
  polishTone: string;
  polishOutputType: string;
  polishInitialized: boolean;

  translateSourceLanguage: string;
  translateTargetLanguage: string;
  translateTone: string;
  translateInitialized: boolean;

  favoriteLanguages: string[];
  favoriteLanguagesInitialized: boolean;
}

interface ScreenSettingsContextType {
  settings: ScreenSettings;
  favoriteLanguages: string[];
  loadPolishSettings: () => Promise<{
    language: string;
    tone: string;
    outputType: string;
  }>;
  loadTranslateSettings: () => Promise<{
    sourceLanguage: string;
    targetLanguage: string;
    tone: string;
  }>;
  loadFavoriteLanguages: () => Promise<string[]>;
  updatePolishSettings: (language: string, tone: string, outputType: string) => void;
  updateTranslateSettings: (sourceLanguage: string, targetLanguage: string, tone: string) => void;
  updateFavoriteLanguages: (languages: string[]) => void;
  resetSession: () => void;
}

const defaultSettings: ScreenSettings = {
  polishLanguage: 'en',
  polishTone: 'professional',
  polishOutputType: 'general',
  polishInitialized: false,
  translateSourceLanguage: 'en',
  translateTargetLanguage: 'es',
  translateTone: 'professional',
  translateInitialized: false,
  favoriteLanguages: DEFAULT_FAVORITE_LANGUAGES,
  favoriteLanguagesInitialized: false,
};

const ScreenSettingsContext = createContext<ScreenSettingsContextType | undefined>(undefined);

export function ScreenSettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<ScreenSettings>(defaultSettings);

  // Reset settings when auth status changes
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out, reset all settings
      setSettings(defaultSettings);
    }
  }, [isAuthenticated]);

  /**
   * Load polish settings from server (only on first open in session)
   */
  const loadPolishSettings = useCallback(async () => {
    try {
      // If already initialized in this session, return cached settings
      if (settings.polishInitialized) {
        console.log('[ScreenSettings] Polish settings already loaded in this session, using cached values');
        return {
          language: settings.polishLanguage,
          tone: settings.polishTone,
          outputType: settings.polishOutputType,
        };
      }

      // First time in session, load from server
      console.log('[ScreenSettings] Loading polish settings from server...');

      if (!isAuthenticated) {
        // Guest user, use defaults
        console.log('[ScreenSettings] Guest user, using default polish settings');
        setSettings(prev => ({ ...prev, polishInitialized: true }));
        return {
          language: defaultSettings.polishLanguage,
          tone: defaultSettings.polishTone,
          outputType: defaultSettings.polishOutputType,
        };
      }

      const userSettings = await settingsApi.getSettings();

      const languageSetting = userSettings.find(s => s.setting_key === 'default_language_polish');
      const toneSetting = userSettings.find(s => s.setting_key === 'default_tone');

      const language = languageSetting?.setting_value || defaultSettings.polishLanguage;
      const tone = toneSetting?.setting_value || defaultSettings.polishTone;
      const outputType = defaultSettings.polishOutputType; // No server setting for this yet

      // Update state with loaded settings
      setSettings(prev => ({
        ...prev,
        polishLanguage: language,
        polishTone: tone,
        polishOutputType: outputType,
        polishInitialized: true,
      }));

      console.log('[ScreenSettings] Polish settings loaded:', { language, tone, outputType });

      return { language, tone, outputType };
    } catch (error) {
      console.error('[ScreenSettings] Failed to load polish settings:', error);

      // Mark as initialized even on error to avoid repeated failures
      setSettings(prev => ({ ...prev, polishInitialized: true }));

      // Return defaults on error
      return {
        language: settings.polishLanguage || defaultSettings.polishLanguage,
        tone: settings.polishTone || defaultSettings.polishTone,
        outputType: settings.polishOutputType || defaultSettings.polishOutputType,
      };
    }
  }, [settings, isAuthenticated]);

  /**
   * Load translate settings from server (only on first open in session)
   */
  const loadTranslateSettings = useCallback(async () => {
    try {
      // If already initialized in this session, return cached settings
      if (settings.translateInitialized) {
        console.log('[ScreenSettings] Translate settings already loaded in this session, using cached values');
        return {
          sourceLanguage: settings.translateSourceLanguage,
          targetLanguage: settings.translateTargetLanguage,
          tone: settings.translateTone,
        };
      }

      // First time in session, load from server
      console.log('[ScreenSettings] Loading translate settings from server...');

      if (!isAuthenticated) {
        // Guest user, use defaults
        console.log('[ScreenSettings] Guest user, using default translate settings');
        setSettings(prev => ({ ...prev, translateInitialized: true }));
        return {
          sourceLanguage: defaultSettings.translateSourceLanguage,
          targetLanguage: defaultSettings.translateTargetLanguage,
          tone: defaultSettings.translateTone,
        };
      }

      const userSettings = await settingsApi.getSettings();

      const sourceLangSetting = userSettings.find(s => s.setting_key === 'default_source_language');
      const targetLangSetting = userSettings.find(s => s.setting_key === 'default_target_language');
      const toneSetting = userSettings.find(s => s.setting_key === 'default_tone');

      const sourceLanguage = sourceLangSetting?.setting_value || defaultSettings.translateSourceLanguage;
      const targetLanguage = targetLangSetting?.setting_value || defaultSettings.translateTargetLanguage;
      const tone = toneSetting?.setting_value || defaultSettings.translateTone;

      // Update state with loaded settings
      setSettings(prev => ({
        ...prev,
        translateSourceLanguage: sourceLanguage,
        translateTargetLanguage: targetLanguage,
        translateTone: tone,
        translateInitialized: true,
      }));

      console.log('[ScreenSettings] Translate settings loaded:', { sourceLanguage, targetLanguage, tone });

      return { sourceLanguage, targetLanguage, tone };
    } catch (error) {
      console.error('[ScreenSettings] Failed to load translate settings:', error);

      // Mark as initialized even on error to avoid repeated failures
      setSettings(prev => ({ ...prev, translateInitialized: true }));

      // Return defaults on error
      return {
        sourceLanguage: settings.translateSourceLanguage || defaultSettings.translateSourceLanguage,
        targetLanguage: settings.translateTargetLanguage || defaultSettings.translateTargetLanguage,
        tone: settings.translateTone || defaultSettings.translateTone,
      };
    }
  }, [settings, isAuthenticated]);

  /**
   * Update polish settings in memory (for subsequent opens in same session)
   */
  const updatePolishSettings = useCallback((language: string, tone: string, outputType: string) => {
    setSettings(prev => ({
      ...prev,
      polishLanguage: language,
      polishTone: tone,
      polishOutputType: outputType,
    }));
  }, []);

  /**
   * Update translate settings in memory (for subsequent opens in same session)
   */
  const updateTranslateSettings = useCallback((sourceLanguage: string, targetLanguage: string, tone: string) => {
    setSettings(prev => ({
      ...prev,
      translateSourceLanguage: sourceLanguage,
      translateTargetLanguage: targetLanguage,
      translateTone: tone,
    }));
  }, []);

  const loadFavoriteLanguages = useCallback(async () => {
    try {
      if (settings.favoriteLanguagesInitialized) {
        return settings.favoriteLanguages;
      }

      if (!isAuthenticated) {
        setSettings(prev => ({ ...prev, favoriteLanguagesInitialized: true }));
        return DEFAULT_FAVORITE_LANGUAGES;
      }

      const userSettings = await settingsApi.getSettings();
      const favSetting = userSettings.find(s => s.setting_key === 'favorite_languages');

      const favoriteLanguages = favSetting?.setting_value
        ? favSetting.setting_value.split(',').filter(Boolean)
        : DEFAULT_FAVORITE_LANGUAGES;

      setSettings(prev => ({
        ...prev,
        favoriteLanguages,
        favoriteLanguagesInitialized: true,
      }));

      return favoriteLanguages;
    } catch (error) {
      console.error('[ScreenSettings] Failed to load favorite languages:', error);
      setSettings(prev => ({ ...prev, favoriteLanguagesInitialized: true }));
      return settings.favoriteLanguages || DEFAULT_FAVORITE_LANGUAGES;
    }
  }, [settings, isAuthenticated]);

  const updateFavoriteLanguages = useCallback((languages: string[]) => {
    setSettings(prev => ({
      ...prev,
      favoriteLanguages: languages,
    }));
  }, []);

  /**
   * Reset session state (called when app restarts or user logs out)
   */
  const resetSession = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  return (
    <ScreenSettingsContext.Provider
      value={{
        settings,
        favoriteLanguages: settings.favoriteLanguages,
        loadPolishSettings,
        loadTranslateSettings,
        loadFavoriteLanguages,
        updatePolishSettings,
        updateTranslateSettings,
        updateFavoriteLanguages,
        resetSession,
      }}
    >
      {children}
    </ScreenSettingsContext.Provider>
  );
}

export function useScreenSettings() {
  const context = useContext(ScreenSettingsContext);
  if (!context) {
    throw new Error('useScreenSettings must be used within ScreenSettingsProvider');
  }
  return context;
}
