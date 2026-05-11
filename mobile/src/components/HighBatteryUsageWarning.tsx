import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';

interface HighBatteryUsageWarningProps {
  visible: boolean;
  onDismiss: () => void;
  onSwitchProfile?: () => void;
}

function HighBatteryUsageWarningComponent({
  visible,
  onDismiss,
  onSwitchProfile,
}: HighBatteryUsageWarningProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} data-testid="warning-high-battery">
      <View style={styles.content}>
        <View style={styles.iconRow}>
          <View style={styles.iconContainer}>
            <Ionicons name="flash" size={20} color={THEME_COLORS.warning} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} data-testid="text-battery-warning-title">
              High Battery Usage
            </Text>
            <Text style={styles.description} data-testid="text-battery-warning-desc">
              Real-time mode uses more battery. Switch to Balanced mode for longer battery life.
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismissButton}
            data-testid="button-dismiss-battery-warning"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={THEME_COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {onSwitchProfile && (
          <TouchableOpacity
            onPress={onSwitchProfile}
            style={styles.switchButton}
            data-testid="button-switch-balanced"
          >
            <Ionicons name="speedometer-outline" size={16} color={THEME_COLORS.primary} />
            <Text style={styles.switchButtonText}>Switch to Balanced</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export const HighBatteryUsageWarning = React.memo(HighBatteryUsageWarningComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: {
    backgroundColor: '#2d1f00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4d3500',
    padding: 12,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#3d2a00',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.warning,
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    lineHeight: 18,
  },
  dismissButton: {
    padding: 4,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 42,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: THEME_COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  switchButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: THEME_COLORS.primary,
  },
});
