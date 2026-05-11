import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { THEME_COLORS } from '../lib/constants';

type DiagnosticStatus = 'idle' | 'scanning' | 'done';
type CheckResult = 'pass' | 'fail' | 'pending';

interface DiagnosticItem {
  id: string;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  result: CheckResult;
}

const INITIAL_ITEMS: DiagnosticItem[] = [
  { id: 'internet', label: 'Internet Connection', iconName: 'wifi-outline', result: 'pending' },
  { id: 'microphone', label: 'Microphone Permission', iconName: 'mic-outline', result: 'pending' },
  { id: 'notifications', label: 'Notification Access', iconName: 'notifications-outline', result: 'pending' },
];

export function DiagnosticWidget() {
  const [status, setStatus] = useState<DiagnosticStatus>('idle');
  const [items, setItems] = useState<DiagnosticItem[]>(INITIAL_ITEMS);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const allPassed = items.every((item) => item.result === 'pass');
  const hasFailure = items.some((item) => item.result === 'fail');

  useEffect(() => {
    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
      }
    };
  }, []);

  const runDiagnostic = async () => {
    setStatus('scanning');
    setItems(INITIAL_ITEMS.map((i) => ({ ...i, result: 'pending' })));
    progressAnim.setValue(0);
    fadeAnim.setValue(0);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    const results: DiagnosticItem[] = [...INITIAL_ITEMS];

    try {
      const netState = await NetInfo.fetch();
      results[0] = {
        ...results[0],
        result: netState.isConnected && netState.isInternetReachable !== false ? 'pass' : 'fail',
      };
    } catch {
      results[0] = { ...results[0], result: 'fail' };
    }

    try {
      const { status: micStatus } = await Audio.getPermissionsAsync();
      results[1] = {
        ...results[1],
        result: micStatus === 'granted' ? 'pass' : 'fail',
      };
    } catch {
      results[1] = { ...results[1], result: 'fail' };
    }

    try {
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      results[2] = {
        ...results[2],
        result: notifStatus === 'granted' ? 'pass' : 'fail',
      };
    } catch {
      results[2] = { ...results[2], result: 'fail' };
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }
    pulseAnim.setValue(1);

    setItems(results);
    setStatus('done');

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handleFixNow = (itemId: string) => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setItems(INITIAL_ITEMS);
    progressAnim.setValue(0);
    fadeAnim.setValue(0);
  };

  const handleButtonPressIn = () => {
    Animated.spring(buttonScaleAnim, {
      toValue: 1.03,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handleButtonPressOut = () => {
    Animated.spring(buttonScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.diagnosticIcon}>
              <Ionicons name="pulse-outline" size={20} color={THEME_COLORS.primary} />
            </View>
            <View>
              <Text style={styles.cardTitle}>Quick Diagnostic</Text>
              <Text style={styles.cardSubtitle}>Check your app setup</Text>
            </View>
          </View>
          {status === 'done' && (
            <TouchableOpacity onPress={handleReset} data-testid="button-rescan">
              <Ionicons name="refresh-outline" size={20} color={THEME_COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {status === 'idle' && (
          <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={runDiagnostic}
              onPressIn={handleButtonPressIn}
              onPressOut={handleButtonPressOut}
              activeOpacity={1}
              data-testid="button-check-setup"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
              <Text style={styles.scanButtonText}>Check My Setup</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {status === 'scanning' && (
          <Animated.View style={[styles.scanningContainer, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.scanningHeader}>
              <Ionicons name="scan-outline" size={22} color={THEME_COLORS.primary} />
              <Text style={styles.scanningText}>Scanning...</Text>
            </View>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.scanningSubtext}>Checking permissions and connectivity</Text>
          </Animated.View>
        )}

        {status === 'done' && (
          <Animated.View style={[styles.resultsContainer, { opacity: fadeAnim }]}>
            {allPassed && (
              <View style={styles.successBanner}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark" size={24} color="#fff" />
                </View>
                <Text style={styles.successText}>All Systems Go!</Text>
                <Text style={styles.successSubtext}>Everything is working perfectly</Text>
              </View>
            )}

            {hasFailure && (
              <View style={styles.failureBanner}>
                <Ionicons name="warning-outline" size={20} color="#f59e0b" />
                <Text style={styles.failureText}>Some items need attention</Text>
              </View>
            )}

            <View style={styles.resultsList}>
              {items.map((item, index) => (
                <View key={item.id}>
                  <View style={styles.resultItem}>
                    <View style={styles.resultLeft}>
                      <View
                        style={[
                          styles.resultIconCircle,
                          item.result === 'pass' ? styles.resultIconPass : styles.resultIconFail,
                        ]}
                      >
                        <Ionicons
                          name={item.result === 'pass' ? 'checkmark' : 'close'}
                          size={14}
                          color="#fff"
                        />
                      </View>
                      <View style={styles.resultTextContainer}>
                        <Text style={styles.resultLabel}>{item.label}</Text>
                        <Text
                          style={[
                            styles.resultStatus,
                            item.result === 'pass' ? styles.statusPass : styles.statusFail,
                          ]}
                        >
                          {item.result === 'pass' ? 'Connected' : 'Not Available'}
                        </Text>
                      </View>
                    </View>
                    {item.result === 'fail' && (
                      <TouchableOpacity
                        style={styles.fixButton}
                        onPress={() => handleFixNow(item.id)}
                        activeOpacity={0.7}
                        data-testid={`button-fix-${item.id}`}
                      >
                        <Text style={styles.fixButtonText}>Fix Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {index < items.length - 1 && <View style={styles.resultDivider} />}
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  card: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  diagnosticIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${THEME_COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 1,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 20,
    paddingVertical: 14,
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  scanningContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  scanningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  scanningText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: `${THEME_COLORS.primary}20`,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 3,
  },
  scanningSubtext: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 10,
  },
  resultsContainer: {
    gap: 12,
  },
  successBanner: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#22c55e14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  successIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#22c55e',
  },
  successSubtext: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginTop: 3,
  },
  failureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f59e0b14',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  failureText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
  },
  resultsList: {
    backgroundColor: THEME_COLORS.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    gap: 10,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  resultIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultIconPass: {
    backgroundColor: '#22c55e',
  },
  resultIconFail: {
    backgroundColor: '#ef4444',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  resultStatus: {
    fontSize: 12,
    marginTop: 1,
  },
  statusPass: {
    color: '#22c55e',
  },
  statusFail: {
    color: '#ef4444',
  },
  resultDivider: {
    height: 1,
    backgroundColor: THEME_COLORS.border,
    marginHorizontal: 14,
  },
  fixButton: {
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fixButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
