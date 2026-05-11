import { secureLog } from '../utils/secureLogger';
import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { THEME_COLORS } from '../lib/constants';
import { usageApi, type UsageStats, type AudioLog } from '../lib/api';

type TabType = 'profile' | 'statistics';

export function ProfileScreen() {
  const { user, isAuthenticated, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person-outline" size={48} color={THEME_COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Not Signed In</Text>
          <Text style={styles.emptyText}>
            Sign in to access your profile and saved items
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <TouchableOpacity
          style={styles.headerSignOutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
          data-testid="button-signout"
        >
          <Ionicons name="log-out-outline" size={16} color={THEME_COLORS.error || '#e74c3c'} />
          <Text style={styles.headerSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
          data-testid="tab-profile"
        >
          <Ionicons
            name="settings-outline"
            size={18}
            color={activeTab === 'profile' ? THEME_COLORS.primary : THEME_COLORS.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'profile' && styles.activeTabText]}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'statistics' && styles.activeTab]}
          onPress={() => setActiveTab('statistics')}
          activeOpacity={0.7}
          data-testid="tab-statistics"
        >
          <Ionicons
            name="stats-chart-outline"
            size={18}
            color={activeTab === 'statistics' ? THEME_COLORS.primary : THEME_COLORS.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'statistics' && styles.activeTabText]}>Statistics</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'profile' ? (
        <ProfileTab />
      ) : (
        <StatisticsTab />
      )}
    </View>
  );
}

function ProfileTab() {
  return (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      <Card style={styles.menuCard}>
        <MenuItem
          icon="person-outline"
          title="Account Settings"
          subtitle="Manage your account details"
          onPress={() => Alert.alert('Coming Soon', 'This feature is coming soon!')}
        />
        <View style={styles.divider} />
        <MenuItem
          icon="notifications-outline"
          title="Notifications"
          subtitle="Configure push notifications"
          onPress={() => Alert.alert('Coming Soon', 'This feature is coming soon!')}
        />
        <View style={styles.divider} />
        <MenuItem
          icon="help-circle-outline"
          title="Help & Support"
          subtitle="Get help with the app"
          onPress={() => Alert.alert('Coming Soon', 'This feature is coming soon!')}
        />
        <View style={styles.divider} />
        <MenuItem
          icon="information-circle-outline"
          title="About"
          subtitle="App version 1.0.0"
          onPress={() => Alert.alert('MyVoicePost', 'Version 1.0.0\n\nTransform your voice into polished text.')}
        />
      </Card>

      <Text style={styles.version}>MyVoicePost v1.0.0</Text>
    </ScrollView>
  );
}

const statsFormatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
};

const statsFormatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const statsLanguageNames: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', ru: 'Russian',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish',
};
const statsGetLanguageName = (code: string): string => statsLanguageNames[code] || code.toUpperCase();

const statsKeyExtractor = (item: AudioLog) => String(item.id);

function StatisticsTab() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [logs, setLogs] = useState<AudioLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchData = useCallback(async (reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);
      const [statsData, logsData] = await Promise.all([
        usageApi.getStats(),
        usageApi.getAudioLogs(1, 20),
      ]);
      setStats(statsData);
      setLogs(logsData.logs);
      setTotalLogs(logsData.total);
      setLogsPage(1);
    } catch (err: any) {
      secureLog.error('[STATS] Error fetching data:', err.message);
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(false);
  }, [fetchData]);

  const loadMoreLogs = useCallback(async () => {
    if (loadingMore || logs.length >= totalLogs) return;
    setLoadingMore(true);
    try {
      const nextPage = logsPage + 1;
      const data = await usageApi.getAudioLogs(nextPage, 20);
      setLogs(prev => [...prev, ...data.logs]);
      setLogsPage(nextPage);
    } catch (error: any) {
      secureLog.error('[STATS] Error loading more logs:', error.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, logs.length, totalLogs, logsPage]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        <Text style={styles.loadingText}>Loading statistics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={THEME_COLORS.textMuted} />
        <Text style={styles.emptyLogsTitle}>Failed to load statistics</Text>
        <Text style={styles.emptyLogsText}>{error}</Text>
        <Button
          title="Retry"
          onPress={() => fetchData()}
          variant="primary"
          style={{ marginTop: 16 }}
          icon={<Ionicons name="refresh-outline" size={18} color="#fff" />}
        />
      </View>
    );
  }

  const trialMinutesRemaining = useMemo(() => stats
    ? Math.max(0, (stats.trialMinutesTotal || 90) - (stats.trialMinutesUsed || 0))
    : 0, [stats]);

  const trialProgress = useMemo(() => stats
    ? Math.min(1, (stats.trialMinutesUsed || 0) / (stats.trialMinutesTotal || 90))
    : 0, [stats]);

  const renderLogItem = useCallback(({ item }: { item: AudioLog }) => (
    <View style={styles.logItem} data-testid={`log-item-${item.id}`}>
      <View style={styles.logItemLeft}>
        <View style={styles.logItemIconContainer}>
          <Ionicons name="mic-outline" size={16} color={THEME_COLORS.primary} />
        </View>
        <View style={styles.logItemDetails}>
          <Text style={styles.logItemLanguage}>{statsGetLanguageName(item.sourceLanguage)}</Text>
          <Text style={styles.logItemDate}>{statsFormatDate(item.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.logItemDuration}>{statsFormatDuration(item.usageSeconds)}</Text>
    </View>
  ), []);

  return (
    <FlatList
      data={logs}
      keyExtractor={statsKeyExtractor}
      renderItem={renderLogItem}
      removeClippedSubviews={true}
      maxToRenderPerBatch={15}
      windowSize={5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME_COLORS.primary} />
      }
      onEndReached={loadMoreLogs}
      onEndReachedThreshold={0.3}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.statsContent}
      ListHeaderComponent={
        <View>
          <View style={styles.statsGrid}>
            <Card style={styles.statCard}>
              <View style={styles.statIconRow}>
                <Ionicons name="mic" size={20} color={THEME_COLORS.primary} />
              </View>
              <Text style={styles.statValue} data-testid="text-total-transcriptions">
                {stats?.totalTranscriptions || 0}
              </Text>
              <Text style={styles.statLabel}>Transcriptions</Text>
            </Card>
            <Card style={styles.statCard}>
              <View style={styles.statIconRow}>
                <Ionicons name="time" size={20} color={THEME_COLORS.primary} />
              </View>
              <Text style={styles.statValue} data-testid="text-total-usage">
                {statsFormatDuration(stats?.totalUsageSeconds || 0)}
              </Text>
              <Text style={styles.statLabel}>Total Usage</Text>
            </Card>
          </View>

          {!stats?.trialUsed && (
            <Card style={styles.trialCard}>
              <View style={styles.trialHeader}>
                <Text style={styles.trialTitle}>Trial Usage</Text>
                <Text style={styles.trialRemaining} data-testid="text-trial-remaining">
                  {trialMinutesRemaining.toFixed(1)} min left
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${trialProgress * 100}%` }]} />
              </View>
              <View style={styles.trialFooter}>
                <Text style={styles.trialFooterText}>
                  {(stats?.trialMinutesUsed || 0).toFixed(1)} / {stats?.trialMinutesTotal || 90} minutes used
                </Text>
                {stats?.trialEndsAt && (
                  <Text style={styles.trialFooterText}>
                    Expires {new Date(stats.trialEndsAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </Card>
          )}

          {logs.length > 0 && (
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyLogs}>
          <Ionicons name="document-text-outline" size={40} color={THEME_COLORS.textMuted} />
          <Text style={styles.emptyLogsTitle}>No activity yet</Text>
          <Text style={styles.emptyLogsText}>Your transcription history will appear here</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loadingMoreContainer}>
            <ActivityIndicator size="small" color={THEME_COLORS.primary} />
          </View>
        ) : null
      }
    />
  );
}

interface MenuItemProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

const MenuItem = memo(function MenuItem({ icon, title, subtitle, onPress }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuItemIcon}>
        <Ionicons name={icon as any} size={22} color={THEME_COLORS.primary} />
      </View>
      <View style={styles.menuItemText}>
        <Text style={styles.menuItemTitle}>{title}</Text>
        <Text style={styles.menuItemSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={THEME_COLORS.textMuted} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  headerSignOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.error || '#e74c3c',
  },
  headerSignOutText: {
    fontSize: 13,
    fontWeight: '500',
    color: THEME_COLORS.error || '#e74c3c',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
    backgroundColor: THEME_COLORS.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: THEME_COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.textMuted,
  },
  activeTabText: {
    color: THEME_COLORS.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsContent: {
    padding: 16,
    paddingBottom: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statIconRow: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
  },
  trialCard: {
    marginBottom: 16,
    padding: 16,
  },
  trialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  trialTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  trialRemaining: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: THEME_COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 3,
  },
  trialFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  trialFooterText: {
    fontSize: 11,
    color: THEME_COLORS.textMuted,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 10,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  logItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logItemIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logItemDetails: {
    flex: 1,
  },
  logItemLanguage: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.text,
  },
  logItemDate: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 1,
  },
  logItemDuration: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.primary,
    marginLeft: 8,
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyLogsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyLogsText: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: THEME_COLORS.textMuted,
  },
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  menuCard: {
    padding: 0,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: THEME_COLORS.border,
    marginLeft: 68,
  },
  version: {
    textAlign: 'center',
    color: THEME_COLORS.textMuted,
    fontSize: 13,
    marginTop: 24,
    marginBottom: 32,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: THEME_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
  },
});
