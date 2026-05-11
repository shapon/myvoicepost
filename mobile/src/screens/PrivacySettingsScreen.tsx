/**
 * Privacy Settings Screen
 * 
 * Allows users to control their privacy preferences and data sharing.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { THEME_COLORS } from '../lib/constants';
import { PrivacyConsent, PrivacyCompliance } from '../utils/privacyProtection';
import { useAuth } from '../contexts/AuthContext';

const PRIVACY_STORAGE_KEY = 'privacyConsents';

export function PrivacySettingsScreen() {
  const { user } = useAuth();
  const [consents, setConsents] = useState<PrivacyConsent>({
    analytics: false,
    crashReporting: true, // Default enabled for app stability
    personalization: false,
    marketing: false,
    timestamp: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
      if (stored) {
        setConsents(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePrivacySettings = async (newConsents: PrivacyConsent) => {
    try {
      await AsyncStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(newConsents));
      setConsents(newConsents);
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      Alert.alert('Error', 'Failed to save privacy settings');
    }
  };

  const updateConsent = (key: keyof Omit<PrivacyConsent, 'timestamp'>, value: boolean) => {
    const newConsents = {
      ...consents,
      [key]: value,
      timestamp: new Date().toISOString(),
    };
    savePrivacySettings(newConsents);
  };

  const handleExportData = async () => {
    if (!user) {
      Alert.alert('Error', 'Please sign in to export your data');
      return;
    }

    Alert.alert(
      'Export Your Data',
      'This will prepare all your data for download. This may take a few moments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            try {
              await PrivacyCompliance.exportUserData(user.id);
              Alert.alert(
                'Export Requested',
                'Your data export has been requested. You will receive an email with a download link within 48 hours.'
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to request data export');
            }
          },
        },
      ]
    );
  };

  const handleDeleteData = async () => {
    if (!user) {
      Alert.alert('Error', 'Please sign in to delete your data');
      return;
    }

    Alert.alert(
      'Delete All Data',
      'This will permanently delete all your data from our servers. This action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await PrivacyCompliance.deleteUserData(user.id);
              Alert.alert(
                'Data Deletion Requested',
                'Your data deletion has been requested. All your data will be permanently deleted within 30 days.'
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to request data deletion');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading privacy settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Settings</Text>
      <Text style={styles.subtitle}>
        Control how your data is collected and used
      </Text>

      {/* Data Collection */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Data Collection</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Analytics</Text>
            <Text style={styles.settingDescription}>
              Help us improve the app by sharing anonymous usage data
            </Text>
          </View>
          <Switch
            value={consents.analytics}
            onValueChange={(value) => updateConsent('analytics', value)}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
            thumbColor={THEME_COLORS.text}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Crash Reporting</Text>
            <Text style={styles.settingDescription}>
              Automatically send crash reports to help fix bugs
            </Text>
          </View>
          <Switch
            value={consents.crashReporting}
            onValueChange={(value) => updateConsent('crashReporting', value)}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
            thumbColor={THEME_COLORS.text}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Personalization</Text>
            <Text style={styles.settingDescription}>
              Personalize your experience based on your usage
            </Text>
          </View>
          <Switch
            value={consents.personalization}
            onValueChange={(value) => updateConsent('personalization', value)}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
            thumbColor={THEME_COLORS.text}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Marketing</Text>
            <Text style={styles.settingDescription}>
              Receive promotional emails and notifications
            </Text>
          </View>
          <Switch
            value={consents.marketing}
            onValueChange={(value) => updateConsent('marketing', value)}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
            thumbColor={THEME_COLORS.text}
          />
        </View>
      </Card>

      {/* Data Rights */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Your Data Rights</Text>
        <Text style={styles.sectionDescription}>
          You have rights over your personal data. You can request a copy of your data or
          request that it be deleted.
        </Text>

        <Button
          title="Export My Data"
          onPress={handleExportData}
          variant="outline"
          style={styles.button}
        />

        <Button
          title="Delete All My Data"
          onPress={handleDeleteData}
          variant="outline"
          style={[styles.button, styles.dangerButton]}
        />
      </Card>

      {/* Privacy Information */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>What We Collect</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>• Account information (email, username)</Text>
          <Text style={styles.infoItem}>• Voice recordings (only when you use the app)</Text>
          <Text style={styles.infoItem}>• Saved texts and translations</Text>
          <Text style={styles.infoItem}>• Usage statistics (if analytics enabled)</Text>
        </View>

        <Text style={styles.sectionTitle}>What We Don't Collect</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>• We don't sell your data to third parties</Text>
          <Text style={styles.infoItem}>• We don't store audio after processing</Text>
          <Text style={styles.infoItem}>• We don't track your location</Text>
          <Text style={styles.infoItem}>• We don't access your contacts</Text>
        </View>

        <Text style={styles.sectionTitle}>Data Security</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>• All data is encrypted in transit (HTTPS)</Text>
          <Text style={styles.infoItem}>• Passwords are never stored in plain text</Text>
          <Text style={styles.infoItem}>• Auth tokens are stored securely</Text>
          <Text style={styles.infoItem}>• Audio is processed server-side and not stored</Text>
        </View>
      </Card>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Last updated: {new Date(consents.timestamp).toLocaleDateString()}
        </Text>
        <Text style={styles.footerText}>
          Read our full Privacy Policy and Terms of Service
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingText: {
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginTop: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: THEME_COLORS.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    lineHeight: 18,
  },
  button: {
    marginTop: 12,
  },
  dangerButton: {
    borderColor: THEME_COLORS.error,
  },
  infoList: {
    marginBottom: 16,
  },
  infoItem: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
});
