import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LANGUAGES, TONES } from '../lib/constants';
import { useThemeColors, useTheme, COLOR_THEMES } from '../contexts/ThemeContext';
import { settingsApi, UserSetting } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { backgroundRecordingManager } from '../utils/backgroundRecordingManager';
import { useBattery } from '../contexts/BatteryContext';
import { useScreenSettings } from '../contexts/ScreenSettingsContext';
import { HighBatteryUsageWarning } from '../components/HighBatteryUsageWarning';
import type { BatteryProfile, BatteryProfileConfig } from '../utils/batteryManager';

interface SettingsScreenProps {
  onBack?: () => void;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { themeId, setThemeId } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const {
    profile: batteryProfile,
    allProfiles,
    showHighBatteryWarning,
    setProfile: setBatteryProfile,
    dismissWarning,
  } = useBattery();

  const handleBatteryProfileChange = useCallback(async (profileId: BatteryProfile) => {
    if (profileId === 'realtime') {
      Alert.alert(
        'Enable Real-time Mode?',
        'This mode uses significantly more battery. Your device may drain faster.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              await setBatteryProfile(profileId);
            },
          },
        ]
      );
    } else {
      await setBatteryProfile(profileId);
    }
  }, [setBatteryProfile]);

  const handleSwitchToBalanced = useCallback(async () => {
    await setBatteryProfile('balanced');
  }, [setBatteryProfile]);

  const { updateFavoriteLanguages } = useScreenSettings();

  const [offlineRecording, setOfflineRecording] = useState(false);
  const [defaultLanguagePolish, setDefaultLanguagePolish] = useState('en');
  const [defaultSourceLanguage, setDefaultSourceLanguage] = useState('en');
  const [defaultTargetLanguage, setDefaultTargetLanguage] = useState('es');
  const [defaultTone, setDefaultTone] = useState('professional');
  const [favoriteLanguages, setFavoriteLanguages] = useState<string[]>(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [languageSearch, setLanguageSearch] = useState('');

  const allLanguageOptions = React.useMemo(
    () => LANGUAGES.map((lang) => ({ value: lang.code, label: `${lang.flag} ${lang.name}` })),
    []
  );

  const favoriteLanguageOptions = React.useMemo(
    () => LANGUAGES.filter(l => favoriteLanguages.includes(l.code))
      .map((lang) => ({ value: lang.code, label: `${lang.flag} ${lang.name}` })),
    [favoriteLanguages]
  );

  const filteredLanguagesForPicker = React.useMemo(() => {
    if (!languageSearch.trim()) return LANGUAGES;
    const q = languageSearch.toLowerCase().trim();
    return LANGUAGES.filter(l => l.name.toLowerCase().includes(q));
  }, [languageSearch]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await settingsApi.getSettings();

      settings.forEach((setting: UserSetting) => {
        switch (setting.setting_key) {
          case 'offline_recording':
            setOfflineRecording(setting.setting_value === 'true');
            break;
          case 'default_language_polish':
            setDefaultLanguagePolish(setting.setting_value);
            break;
          case 'default_source_language':
            setDefaultSourceLanguage(setting.setting_value);
            break;
          case 'default_target_language':
            setDefaultTargetLanguage(setting.setting_value);
            break;
          case 'default_tone':
            setDefaultTone(setting.setting_value);
            break;
          case 'favorite_languages':
            if (setting.setting_value) {
              const langs = setting.setting_value.split(',').filter(Boolean);
              if (langs.length > 0) {
                setFavoriteLanguages(langs);
              }
            }
            break;
        }
      });
    } catch (error: any) {
      console.error('Failed to load settings:', error);
      Alert.alert('Error', 'Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      const settingsToSave = [
        { setting_key: 'offline_recording', setting_value: offlineRecording.toString() },
        { setting_key: 'default_language_polish', setting_value: defaultLanguagePolish },
        { setting_key: 'default_source_language', setting_value: defaultSourceLanguage },
        { setting_key: 'default_target_language', setting_value: defaultTargetLanguage },
        { setting_key: 'default_tone', setting_value: defaultTone },
        { setting_key: 'favorite_languages', setting_value: favoriteLanguages.join(',') },
      ];

      await settingsApi.updateSettings(settingsToSave);
      updateFavoriteLanguages(favoriteLanguages);

      Alert.alert('Success', 'Settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleOfflineRecordingToggle = async (value: boolean) => {
    if (value) {
      Alert.alert(
        'Enable Background Recording',
        'To record in the background, we need notification permission (for Android). This allows recording to continue when the app is minimized.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Enable',
            onPress: async () => {
              try {
                await backgroundRecordingManager.loadSettings();
                const config = await backgroundRecordingManager.checkAndRequestPermissions();
                if (config.hasPermissions) {
                  setOfflineRecording(true);
                  Alert.alert(
                    'Enabled',
                    'Background recording is now enabled. You can continue recording when the app is minimized.',
                    [{ text: 'OK' }]
                  );
                } else {
                  Alert.alert(
                    'Permission Required',
                    'Please grant notification permission to enable background recording. You can enable it later in your device settings.',
                    [{ text: 'OK' }]
                  );
                }
              } catch (error) {
                console.error('Failed to request permissions:', error);
                Alert.alert('Error', 'Failed to enable background recording. Please try again.');
              }
            },
          },
        ]
      );
    } else {
      setOfflineRecording(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>App Settings</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>App Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <HighBatteryUsageWarning
          visible={showHighBatteryWarning}
          onDismiss={dismissWarning}
          onSwitchProfile={handleSwitchToBalanced}
        />

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Color Theme</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Choose your preferred color scheme
          </Text>

          <View style={styles.themeGrid}>
            {COLOR_THEMES.map((theme) => {
              const isSelected = themeId === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.themeOption,
                    { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                    isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
                  ]}
                  onPress={() => setThemeId(theme.id)}
                  activeOpacity={0.7}
                  data-testid={`button-theme-${theme.id}`}
                >
                  <View style={styles.themePreview}>
                    <View style={[styles.themePreviewBg, { backgroundColor: theme.preview[1] }]}>
                      <View style={[styles.themePreviewDot, { backgroundColor: theme.preview[0] }]} />
                      <View style={[styles.themePreviewBar, { backgroundColor: theme.preview[2] }]} />
                      <View style={[styles.themePreviewBarSmall, { backgroundColor: theme.preview[0] + '40' }]} />
                    </View>
                  </View>
                  <Text style={[
                    styles.themeName,
                    { color: colors.textSecondary },
                    isSelected && { color: theme.colors.primary, fontWeight: '700' },
                  ]}>
                    {theme.name}
                  </Text>
                  {isSelected && (
                    <View style={[styles.themeCheck, { backgroundColor: theme.colors.primary }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="battery-charging-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Battery Profile</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Choose how the app manages battery and performance
          </Text>

          {allProfiles.map((profileConfig: BatteryProfileConfig) => {
            const isSelected = batteryProfile === profileConfig.id;
            return (
              <TouchableOpacity
                key={profileConfig.id}
                style={[
                  styles.profileOption,
                  { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                  isSelected && { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
                ]}
                onPress={() => handleBatteryProfileChange(profileConfig.id)}
                activeOpacity={0.7}
                data-testid={`button-profile-${profileConfig.id}`}
              >
                <View style={styles.profileHeader}>
                  <View style={[
                    styles.profileIconContainer,
                    { backgroundColor: colors.surface },
                    isSelected && { backgroundColor: colors.primaryMuted },
                  ]}>
                    <Ionicons
                      name={profileConfig.icon as any}
                      size={20}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <View style={styles.profileTextContainer}>
                    <View style={styles.profileLabelRow}>
                      <Text style={[
                        styles.profileLabel,
                        { color: colors.text },
                        isSelected && { color: colors.primary },
                      ]}>
                        {profileConfig.label}
                      </Text>
                      <Text style={[
                        styles.profileDrain,
                        { color: colors.textMuted },
                        profileConfig.id === 'realtime' && { color: colors.warning },
                      ]} data-testid={`text-drain-${profileConfig.id}`}>
                        {profileConfig.targetDrainPerHour}/hr
                      </Text>
                    </View>
                    <Text style={[styles.profileDescription, { color: colors.textSecondary }]}>
                      {profileConfig.description}
                    </Text>
                  </View>
                  <View style={[
                    styles.radioOuter,
                    { borderColor: colors.textMuted },
                    isSelected && { borderColor: colors.primary },
                  ]}>
                    {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mic-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recording</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Offline Recording</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Continue recording when app is minimized
              </Text>
            </View>
            <Switch
              value={offlineRecording}
              onValueChange={handleOfflineRecordingToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={offlineRecording ? '#fff' : colors.textMuted}
            />
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="globe-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>My Languages</Text>
          </View>
          <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
            Select up to 10 frequently used languages. These will appear in Polish, Translate, and Process screens.
          </Text>

          <View style={styles.favoriteChipsWrap}>
            {LANGUAGES.filter(l => favoriteLanguages.includes(l.code)).map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.favoriteChip, { backgroundColor: colors.primaryMuted, borderColor: colors.primary }]}
                onPress={() => {
                  if (favoriteLanguages.length > 1) {
                    setFavoriteLanguages(prev => prev.filter(c => c !== lang.code));
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.favoriteChipText, { color: colors.primary }]}>{lang.flag} {lang.name}</Text>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.addLanguageButton}
            onPress={() => setShowLanguagePicker(true)}
            activeOpacity={0.7}
            data-testid="button-add-language"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.addLanguageText, { color: colors.primary }]}>
              {favoriteLanguages.length >= 10 ? 'Manage Languages' : 'Add Language'}
            </Text>
          </TouchableOpacity>
        </Card>

        <Modal
          visible={showLanguagePicker}
          transparent
          animationType="fade"
          onRequestClose={() => { setShowLanguagePicker(false); setLanguageSearch(''); }}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setShowLanguagePicker(false); setLanguageSearch(''); }}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Languages ({favoriteLanguages.length}/10)</Text>

              <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search languages..."
                  placeholderTextColor={colors.textMuted}
                  value={languageSearch}
                  onChangeText={setLanguageSearch}
                  autoCorrect={false}
                  data-testid="input-search-language"
                />
                {languageSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setLanguageSearch('')}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredLanguagesForPicker}
                keyExtractor={(item) => item.code}
                style={styles.languageList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: lang }) => {
                  const isSelected = favoriteLanguages.includes(lang.code);
                  return (
                    <TouchableOpacity
                      style={[styles.languageRow, isSelected && { backgroundColor: colors.surfaceLight }]}
                      onPress={() => {
                        if (isSelected) {
                          if (favoriteLanguages.length > 1) {
                            setFavoriteLanguages(prev => prev.filter(c => c !== lang.code));
                          }
                        } else if (favoriteLanguages.length < 10) {
                          setFavoriteLanguages(prev => [...prev, lang.code]);
                        } else {
                          Alert.alert('Limit Reached', 'You can select up to 10 languages. Remove one to add another.');
                        }
                      }}
                    >
                      <Text style={[styles.languageRowText, { color: colors.text }]}>{lang.flag} {lang.name}</Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptySearch}>
                    <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>No languages found</Text>
                  </View>
                }
              />

              <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: colors.primary }]}
                onPress={() => { setShowLanguagePicker(false); setLanguageSearch(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Polish Defaults</Text>
          </View>
          <Select
            label="Default Language"
            value={defaultLanguagePolish}
            options={favoriteLanguageOptions}
            onChange={setDefaultLanguagePolish}
            searchable={false}
          />
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="language-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Translate Defaults</Text>
          </View>
          <Select
            label="Source Language"
            value={defaultSourceLanguage}
            options={favoriteLanguageOptions}
            onChange={setDefaultSourceLanguage}
            searchable={false}
          />
          <Select
            label="Target Language"
            value={defaultTargetLanguage}
            options={favoriteLanguageOptions}
            onChange={setDefaultTargetLanguage}
            searchable={false}
          />
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="musical-notes-outline" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tone Defaults</Text>
          </View>
          <Select
            label="Default Tone"
            value={defaultTone}
            options={TONES.map(t => ({ value: t.value, label: t.label }))}
            onChange={setDefaultTone}
            searchable={false}
          />
        </Card>

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.saveButtonDisabled]}
          onPress={saveSettings}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  placeholder: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    marginTop: 4,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  themeOption: {
    width: '22%',
    minWidth: 72,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    position: 'relative',
  },
  themePreview: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  themePreviewBg: {
    flex: 1,
    padding: 6,
    justifyContent: 'space-between',
  },
  themePreviewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  themePreviewBar: {
    height: 6,
    borderRadius: 3,
    width: '100%',
  },
  themePreviewBarSmall: {
    height: 4,
    borderRadius: 2,
    width: '60%',
  },
  themeName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  themeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileOption: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextContainer: {
    flex: 1,
  },
  profileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  profileLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  profileDrain: {
    fontSize: 12,
    fontWeight: '500',
  },
  profileDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
  },
  favoriteChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  favoriteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 1,
  },
  favoriteChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  addLanguageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  addLanguageText: {
    fontSize: 15,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 18,
    width: '100%',
    maxHeight: '75%',
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  languageList: {
    maxHeight: 350,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  languageRowText: {
    fontSize: 16,
  },
  emptySearch: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: 15,
  },
  doneButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 8,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  bottomSpacing: {
    height: 24,
  },
});
