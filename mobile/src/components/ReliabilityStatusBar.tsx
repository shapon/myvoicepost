import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import { useReliability } from '../contexts/ReliabilityContext';

interface ReliabilityStatusBarProps {
  onPress?: () => void;
}

export function ReliabilityStatusBar({ onPress }: ReliabilityStatusBarProps) {
  const colors = useThemeColors();
  const {
    autoSaveStatus,
    lastAutoSaveTime,
    isOnline,
    pendingRequestsCount,
  } = useReliability();

  const formatLastSaveTime = (timestamp: number): string => {
    if (timestamp === 0) return 'Never';

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return 'Over an hour ago';
  };

  const getStatusColor = () => {
    if (!isOnline) return colors.warning;
    if (autoSaveStatus === 'unsaved') return colors.warning;
    if (autoSaveStatus === 'saved') return colors.success;
    return colors.textSecondary;
  };

  const getStatusIcon = () => {
    if (!isOnline) return 'cloud-offline';
    if (autoSaveStatus === 'unsaved') return 'save-outline';
    if (autoSaveStatus === 'saved') return 'checkmark-circle';
    return 'ellipse';
  };

  const getStatusText = () => {
    if (!isOnline) {
      return pendingRequestsCount > 0
        ? `Offline (${pendingRequestsCount} pending)`
        : 'Offline mode';
    }

    if (autoSaveStatus === 'unsaved') {
      return 'Unsaved changes';
    }

    if (autoSaveStatus === 'saved') {
      return `Saved ${formatLastSaveTime(lastAutoSaveTime)}`;
    }

    return 'Ready';
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface, borderLeftColor: getStatusColor() }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Ionicons
          name={getStatusIcon()}
          size={16}
          color={getStatusColor()}
        />
        <Text style={[styles.text, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
      </View>

      {autoSaveStatus === 'tracking' && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>Auto-save</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
