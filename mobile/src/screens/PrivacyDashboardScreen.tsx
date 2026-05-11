/**
 * Privacy Dashboard
 * 
 * Shows users exactly what data exists, provides export/delete capabilities,
 * and displays all privacy controls in one place.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { THEME_COLORS } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { PermissionManager, PermissionType } from '../utils/permissionManager';
import { RecordingStateManager } from '../utils/recordingStateManager';
import { DataStorageManager, StorageLocation } from '../utils/dataStorageManager';
import { PrivacyCompliance } from '../utils/privacyProtection';

export function PrivacyDashboardScreen() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [storageSettings, setStorageSettings] = useState<any>(null);
  const [recordingSessions, setRecordingSessions] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load storage stats
      const stats = await DataStorageManager.getStorageStats();
      setStorageStats(stats);

      // Load storage settings
      const settings = DataStorageManager.getSettings();
      setStorageSettings(settings);

      // Load recording sessions
      const sessions = RecordingStateManager.getSessions();
      setRecordingSessions(sessions);

      // Load permissions
      const perms = PermissionManager.getAllConsents();
      setPermissions(perms);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      Alert.alert('Error', 'Failed to load privacy data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAllData = async () => {
    Alert.alert(
      'Export All Data',
      'This will create a complete export of all your data stored in the app. This may take a moment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            try {
              // Export everything
              const data = await DataStorageManager.exportAllData();
              const permissionLogs = await PermissionManager.exportPermissionLogs();
              const securityLogs = await RecordingStateManager.exportSecurityLogs();

              const fullExport = {
                exportDate: new Date().toISOString(),
                user: user ? { id: user.id, username: user.username, email: user.email } : null,
                storage: data,
                permissions: permissionLogs,
                security: securityLogs,
              };

              // Convert to JSON and share
              const jsonString = JSON.stringify(fullExport, null, 2);
              
              await Share.share({
                message: jsonString,
                title: 'MyVoicePost Data Export',
              });

              Alert.alert('Success', 'Your data has been exported');
            } catch (error) {
              console.error('Export error:', error);
              Alert.alert('Error', 'Failed to export data');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllData = async () => {
    Alert.alert(
      'Delete ALL Data',
      'This will permanently delete:\n\n' +
      '• All saved transcriptions and translations\n' +
      '• All recording history\n' +
      '• All permission consents\n' +
      '• All security logs\n' +
      '• All app settings\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Type DELETE to confirm:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Show confirmation input
            Alert.prompt(
              'Confirm Deletion',
              'Type DELETE to confirm:',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async (text) => {
                    if (text?.toUpperCase() === 'DELETE') {
                      try {
                        await DataStorageManager.clearAllData();
                        await PermissionManager.clearAllPermissions();
                        await RecordingStateManager.clearAllData();
                        
                        Alert.alert('Deleted', 'All data has been permanently deleted');
                        loadDashboardData();
                      } catch (error) {
                        Alert.alert('Error', 'Failed to delete some data');
                      }
                    } else {
                      Alert.alert('Cancelled', 'Deletion cancelled - incorrect confirmation');
                    }
                  },
                },
              ],
              'plain-text'
            );
          },
        },
      ]
    );
  };

  const toggleCloudSync = async (enabled: boolean) => {
    if (enabled) {
      Alert.alert(
        'Enable Cloud Sync',
        'This will backup your data to the cloud. Your data will be encrypted before upload.\n\n' +
        'You can disable this at any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              try {
                await DataStorageManager.enableCloudSync();
                loadDashboardData();
                Alert.alert('Enabled', 'Cloud sync has been enabled');
              } catch (error) {
                Alert.alert('Error', 'Failed to enable cloud sync');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Disable Cloud Sync',
        'Do you want to also delete your data from the cloud?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Keep in Cloud',
            onPress: async () => {
              await DataStorageManager.disableCloudSync(false);
              loadDashboardData();
            },
          },
          {
            text: 'Delete from Cloud',
            style: 'destructive',
            onPress: async () => {
              await DataStorageManager.disableCloudSync(true);
              loadDashboardData();
            },
          },
        ]
      );
    }
  };

  const toggleEncryption = async (enabled: boolean) => {
    try {
      await DataStorageManager.updateSettings({ encryptLocal: enabled });
      loadDashboardData();
      Alert.alert(
        enabled ? 'Encryption Enabled' : 'Encryption Disabled',
        enabled 
          ? 'New data will be encrypted before storage' 
          : 'New data will be stored without encryption'
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update encryption setting');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading privacy data...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={48} color={THEME_COLORS.primary} />
        <Text style={styles.title}>Privacy Dashboard</Text>
        <Text style={styles.subtitle}>Complete control over your data</Text>
      </View>

      {/* Data Summary */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Your Data</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Total Items:</Text>
          <Text style={styles.statValue}>{storageStats?.totalItems || 0}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Storage Used:</Text>
          <Text style={styles.statValue}>{formatBytes(storageStats?.totalSizeBytes || 0)}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Local Only:</Text>
          <Text style={styles.statValue}>{storageStats?.localOnly || 0}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Synced to Cloud:</Text>
          <Text style={styles.statValue}>{storageStats?.syncedToCloud || 0}</Text>
        </View>
        
        {storageStats?.itemsByType && Object.keys(storageStats.itemsByType).length > 0 && (
          <View style={styles.itemTypes}>
            <Text style={styles.itemTypesTitle}>By Type:</Text>
            {Object.entries(storageStats.itemsByType).map(([type, count]: [string, any]) => (
              <View key={type} style={styles.itemTypeRow}>
                <Text style={styles.itemTypeLabel}>{type}:</Text>
                <Text style={styles.itemTypeValue}>{count}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Storage Settings */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>💾 Storage Settings</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Local Encryption</Text>
            <Text style={styles.settingDescription}>
              Encrypt data before storing on device
            </Text>
          </View>
          <Switch
            value={storageSettings?.encryptLocal}
            onValueChange={toggleEncryption}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Cloud Backup</Text>
            <Text style={styles.settingDescription}>
              {storageSettings?.cloudSyncEnabled 
                ? 'Data is backed up to cloud (encrypted)' 
                : 'All data stays on your device only'}
            </Text>
          </View>
          <Switch
            value={storageSettings?.cloudSyncEnabled}
            onValueChange={toggleCloudSync}
            trackColor={{ false: THEME_COLORS.surfaceLight, true: THEME_COLORS.primary }}
          />
        </View>

        {storageSettings?.lastSyncTime && (
          <View style={styles.syncInfo}>
            <Text style={styles.syncText}>
              Last synced: {new Date(storageSettings.lastSyncTime).toLocaleString()}
            </Text>
          </View>
        )}
      </Card>

      {/* Recording Activity */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>🎤 Recording Activity</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Total Sessions:</Text>
          <Text style={styles.statValue}>{recordingSessions.length}</Text>
        </View>
        
        {recordingSessions.length > 0 && (
          <View style={styles.recentSessions}>
            <Text style={styles.recentSessionsTitle}>Recent Sessions (Last 5):</Text>
            {recordingSessions.slice(0, 5).map((session) => (
              <View key={session.id} style={styles.sessionRow}>
                <Text style={styles.sessionTime}>
                  {new Date(session.startTime).toLocaleString()}
                </Text>
                <Text style={styles.sessionDuration}>
                  {Math.round(session.duration / 1000)}s
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color={THEME_COLORS.primary} />
          <Text style={styles.infoText}>
            We NEVER record in background. Recording stops automatically if app goes to background.
          </Text>
        </View>
      </Card>

      {/* Permissions */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Permissions</Text>
        {permissions.length > 0 ? (
          permissions.map((perm) => (
            <View key={perm.type} style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionType}>{perm.type}</Text>
                <Text style={styles.permissionStatus}>
                  Status: {perm.status}
                </Text>
                <Text style={styles.permissionDate}>
                  {new Date(perm.timestamp).toLocaleDateString()}
                </Text>
              </View>
              <View style={[
                styles.permissionBadge,
                perm.status === 'granted' ? styles.permissionGranted : styles.permissionDenied
              ]}>
                <Text style={styles.permissionBadgeText}>
                  {perm.status === 'granted' ? 'GRANTED' : 'DENIED'}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noDataText}>No permissions requested yet</Text>
        )}
      </Card>

      {/* Data Rights */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>⚖️ Your Rights (GDPR/CCPA)</Text>
        
        <Text style={styles.rightsDescription}>
          You have the following rights over your data:
        </Text>

        <View style={styles.rightsList}>
          <Text style={styles.rightItem}>✓ Right to access your data</Text>
          <Text style={styles.rightItem}>✓ Right to export your data</Text>
          <Text style={styles.rightItem}>✓ Right to delete your data</Text>
          <Text style={styles.rightItem}>✓ Right to data portability</Text>
          <Text style={styles.rightItem}>✓ Right to rectification</Text>
        </View>

        <Button
          title="📤 Export All My Data"
          onPress={handleExportAllData}
          variant="outline"
          style={styles.button}
        />

        <Button
          title="🗑️ Delete All My Data"
          onPress={handleDeleteAllData}
          variant="outline"
          style={[styles.button, styles.dangerButton]}
        />
      </Card>

      {/* Privacy Commitment */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>🛡️ Our Privacy Commitment</Text>
        
        <View style={styles.commitmentList}>
          <View style={styles.commitmentItem}>
            <Ionicons name="close-circle" size={20} color={THEME_COLORS.error} />
            <Text style={styles.commitmentText}>
              We NEVER record without your explicit action
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="close-circle" size={20} color={THEME_COLORS.error} />
            <Text style={styles.commitmentText}>
              We NEVER record in background
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="close-circle" size={20} color={THEME_COLORS.error} />
            <Text style={styles.commitmentText}>
              We NEVER sell your data
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="close-circle" size={20} color={THEME_COLORS.error} />
            <Text style={styles.commitmentText}>
              We NEVER access other apps' data
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
            <Text style={styles.commitmentText}>
              We store locally by default
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
            <Text style={styles.commitmentText}>
              We encrypt sensitive data
            </Text>
          </View>
          <View style={styles.commitmentItem}>
            <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
            <Text style={styles.commitmentText}>
              We let you delete everything
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.footer}>
        <TouchableOpacity onPress={loadDashboardData}>
          <Text style={styles.refreshText}>🔄 Refresh Data</Text>
        </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: THEME_COLORS.text,
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  statLabel: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  itemTypes: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME_COLORS.border,
  },
  itemTypesTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.text,
    marginBottom: 8,
  },
  itemTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemTypeLabel: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
  },
  itemTypeValue: {
    fontSize: 13,
    color: THEME_COLORS.text,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  },
  syncInfo: {
    marginTop: 12,
  },
  syncText: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    fontStyle: 'italic',
  },
  recentSessions: {
    marginTop: 12,
  },
  recentSessionsTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.text,
    marginBottom: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sessionTime: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  sessionDuration: {
    fontSize: 13,
    color: THEME_COLORS.text,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: THEME_COLORS.primaryLight,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: THEME_COLORS.text,
    lineHeight: 18,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionType: {
    fontSize: 16,
    fontWeight: '500',
    color: THEME_COLORS.text,
    textTransform: 'capitalize',
  },
  permissionStatus: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginTop: 2,
  },
  permissionDate: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 2,
  },
  permissionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  permissionGranted: {
    backgroundColor: THEME_COLORS.success + '20',
  },
  permissionDenied: {
    backgroundColor: THEME_COLORS.error + '20',
  },
  permissionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: 14,
    color: THEME_COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  rightsDescription: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 12,
  },
  rightsList: {
    marginBottom: 16,
  },
  rightItem: {
    fontSize: 14,
    color: THEME_COLORS.text,
    paddingVertical: 4,
  },
  button: {
    marginTop: 8,
  },
  dangerButton: {
    borderColor: THEME_COLORS.error,
  },
  commitmentList: {
    marginTop: 8,
  },
  commitmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  commitmentText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: THEME_COLORS.text,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  refreshText: {
    fontSize: 16,
    color: THEME_COLORS.primary,
    fontWeight: '500',
  },
});
