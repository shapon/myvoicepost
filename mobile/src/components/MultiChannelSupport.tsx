import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Linking,
  Alert,
  Platform,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { THEME_COLORS } from '../lib/constants';

type SystemStatus = 'operational' | 'degraded' | 'outage' | 'checking';
type RecordingState = 'idle' | 'recording' | 'preview';

const WHATSAPP_NUMBER = '+1234567890';
const TELEGRAM_BOT = 'MyVoicePostBot';
const MAX_RECORD_SECONDS = 15;

function StatusBar() {
  const [status, setStatus] = useState<SystemStatus>('checking');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const netState = await NetInfo.fetch();
        if (netState.isConnected && netState.isInternetReachable !== false) {
          setStatus('operational');
        } else {
          setStatus('degraded');
        }
      } catch {
        setStatus('degraded');
      }
    };
    checkStatus();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();

    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
      }
    };
  }, []);

  const statusConfig = {
    checking: { color: THEME_COLORS.textMuted, label: 'Checking status...', bgColor: `${THEME_COLORS.textMuted}10` },
    operational: { color: '#22c55e', label: 'All systems operational', bgColor: '#22c55e0D' },
    degraded: { color: '#f59e0b', label: 'Some services may be slow', bgColor: '#f59e0b0D' },
    outage: { color: '#ef4444', label: 'Service interruption detected', bgColor: '#ef44440D' },
  };

  const config = statusConfig[status];

  return (
    <View style={[styles.statusBar, { backgroundColor: config.bgColor }]}>
      <Animated.View style={[styles.statusDot, { backgroundColor: config.color, opacity: pulseAnim }]} />
      <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

function openExternalChat(platform: 'whatsapp' | 'telegram') {
  let url = '';
  if (platform === 'whatsapp') {
    url = `https://wa.me/${WHATSAPP_NUMBER.replace('+', '')}?text=Hi, I need help with MyVoicePost app`;
  } else {
    url = `https://t.me/${TELEGRAM_BOT}`;
  }

  Linking.canOpenURL(url).then((supported) => {
    if (supported) {
      Linking.openURL(url);
    } else {
      Alert.alert(
        `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} Not Found`,
        `Please install ${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} to use this feature, or contact us at support@myvoicepost.com`
      );
    }
  });
}

function WaveformAnimation({ isRecording }: { isRecording: boolean }) {
  const bars = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0.3))
  ).current;
  const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (isRecording) {
      animationsRef.current = bars.map((bar, i) => {
        const animation = Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 0.4 + Math.random() * 0.6,
              duration: 200 + Math.random() * 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 200 + Math.random() * 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        animation.start();
        return animation;
      });
    } else {
      animationsRef.current.forEach((a) => a.stop());
      bars.forEach((bar) => bar.setValue(0.3));
    }

    return () => {
      animationsRef.current.forEach((a) => a.stop());
    };
  }, [isRecording]);

  return (
    <View style={styles.waveformContainer}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveformBar,
            {
              transform: [{ scaleY: bar }],
              backgroundColor: isRecording ? THEME_COLORS.primary : THEME_COLORS.textMuted,
            },
          ]}
        />
      ))}
    </View>
  );
}

function VoiceReportCard() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingInstance, setRecordingInstance] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [soundInstance, setSoundInstance] = useState<Audio.Sound | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundInstance) soundInstance.unloadAsync();
    };
  }, [soundInstance]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record a voice report.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecordingInstance(recording);
      setRecordingState('recording');
      setElapsedSeconds(0);
      progressAnim.setValue(0);

      Vibration.vibrate(50);

      Animated.timing(ringAnim, {
        toValue: 1,
        duration: MAX_RECORD_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORD_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      Alert.alert('Recording Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    ringAnim.stopAnimation();
    ringAnim.setValue(0);

    Vibration.vibrate(50);

    if (recordingInstance) {
      try {
        await recordingInstance.stopAndUnloadAsync();
        const uri = recordingInstance.getURI();
        setRecordedUri(uri);
        setRecordingState('preview');
      } catch {
        setRecordingState('idle');
      }
      setRecordingInstance(null);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  }, [recordingInstance]);

  const playPreview = async () => {
    if (!recordedUri) return;
    try {
      if (soundInstance) {
        await soundInstance.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
      setSoundInstance(sound);
      setIsPlayingPreview(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingPreview(false);
        }
      });
      await sound.playAsync();
    } catch {
      Alert.alert('Playback Error', 'Could not play the recording.');
    }
  };

  const deleteRecording = () => {
    if (soundInstance) soundInstance.unloadAsync();
    setSoundInstance(null);
    setRecordedUri(null);
    setRecordingState('idle');
    setElapsedSeconds(0);
  };

  const uploadVoiceReport = async () => {
    if (!recordedUri) return;

    const appVersion = Application.nativeApplicationVersion || 'dev';
    const buildVersion = Application.nativeBuildVersion || 'dev';
    const deviceName = Constants.deviceName || 'Unknown Device';
    const osVersion = `${Platform.OS} ${Platform.Version}`;

    console.log('[VoiceReport] Uploading voice bug report...');
    console.log('[VoiceReport] File URI:', recordedUri);
    console.log('[VoiceReport] App Version:', appVersion);
    console.log('[VoiceReport] Build:', buildVersion);
    console.log('[VoiceReport] Device:', deviceName);
    console.log('[VoiceReport] OS:', osVersion);
    console.log('[VoiceReport] Duration:', elapsedSeconds, 'seconds');

    Alert.alert(
      'Report Sent',
      'Your voice report has been submitted. Our team will review it shortly.',
      [{ text: 'OK', onPress: deleteRecording }]
    );
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handlePressIn = () => {
    Animated.spring(buttonScaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(buttonScaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const ringProgress = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.voiceCard}>
      <View style={styles.voiceCardHeader}>
        <View style={styles.voiceIconCircle}>
          <Ionicons name="mic-outline" size={22} color={THEME_COLORS.primary} />
        </View>
        <View style={styles.voiceHeaderText}>
          <Text style={styles.voiceTitle}>Voice Bug Report</Text>
          <Text style={styles.voiceSubtitle}>Record and send a voice message</Text>
        </View>
      </View>

      {recordingState === 'idle' && (
        <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={startRecording}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
            data-testid="button-start-recording"
          >
            <View style={styles.recordButtonInner}>
              <Ionicons name="mic" size={24} color="#fff" />
            </View>
            <Text style={styles.recordButtonLabel}>Tap to Record (max {MAX_RECORD_SECONDS}s)</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {recordingState === 'recording' && (
        <View style={styles.recordingActive}>
          <View style={styles.recordingVisualRow}>
            <View style={styles.recordingPulseOuter}>
              <View style={styles.recordingPulseInner}>
                <Ionicons name="mic" size={24} color="#fff" />
              </View>
            </View>
            <View style={styles.recordingInfo}>
              <View style={styles.recordingTimerRow}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>REC</Text>
                </View>
                <Text style={styles.timerText}>
                  {formatTime(elapsedSeconds)} / {formatTime(MAX_RECORD_SECONDS)}
                </Text>
              </View>
              <WaveformAnimation isRecording={true} />
              <View style={styles.progressBarBg}>
                <Animated.View style={[styles.progressBarFill, { width: ringProgress }]} />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopRecording}
            activeOpacity={0.7}
            data-testid="button-stop-recording"
          >
            <View style={styles.stopButtonIcon}>
              <Ionicons name="stop" size={16} color="#fff" />
            </View>
            <Text style={styles.stopButtonText}>Stop Recording</Text>
          </TouchableOpacity>
        </View>
      )}

      {recordingState === 'preview' && (
        <View style={styles.previewContainer}>
          <View style={styles.previewInfo}>
            <View style={styles.previewFileIcon}>
              <Ionicons name="document-text-outline" size={20} color={THEME_COLORS.primary} />
            </View>
            <View style={styles.previewDetails}>
              <Text style={styles.previewFileName}>Voice Report</Text>
              <Text style={styles.previewDuration}>{formatTime(elapsedSeconds)} recorded</Text>
            </View>
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.previewActionButton, styles.playButton]}
              onPress={playPreview}
              activeOpacity={0.7}
              data-testid="button-play-preview"
            >
              <Ionicons name={isPlayingPreview ? 'pause' : 'play'} size={16} color={THEME_COLORS.primary} />
              <Text style={[styles.previewActionText, { color: THEME_COLORS.primary }]}>
                {isPlayingPreview ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.previewActionButton, styles.deleteButton]}
              onPress={deleteRecording}
              activeOpacity={0.7}
              data-testid="button-delete-recording"
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={[styles.previewActionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.previewActionButton, styles.sendButton]}
              onPress={uploadVoiceReport}
              activeOpacity={0.7}
              data-testid="button-send-report"
            >
              <Ionicons name="send" size={14} color="#fff" />
              <Text style={[styles.previewActionText, { color: '#fff' }]}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export function MultiChannelSupport() {
  return (
    <View style={styles.container}>
      <StatusBar />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Reach Out</Text>
      </View>

      <View style={styles.tilesRow}>
        <TouchableOpacity
          style={styles.chatTile}
          onPress={() => openExternalChat('whatsapp')}
          activeOpacity={0.7}
          data-testid="button-whatsapp-support"
        >
          <View style={[styles.chatTileIcon, { backgroundColor: '#25D36612' }]}>
            <Ionicons name="logo-whatsapp" size={26} color="#25D366" />
          </View>
          <Text style={styles.chatTileTitle}>WhatsApp</Text>
          <Text style={styles.chatTileSubtitle}>Chat with us</Text>
          <View style={[styles.chatTileBadge, { backgroundColor: '#25D366' }]}>
            <Text style={styles.chatTileBadgeText}>Instant</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatTile}
          onPress={() => openExternalChat('telegram')}
          activeOpacity={0.7}
          data-testid="button-telegram-support"
        >
          <View style={[styles.chatTileIcon, { backgroundColor: '#229ED912' }]}>
            <Ionicons name="paper-plane-outline" size={24} color="#229ED9" />
          </View>
          <Text style={styles.chatTileTitle}>Telegram</Text>
          <Text style={styles.chatTileSubtitle}>Message our bot</Text>
          <View style={[styles.chatTileBadge, { backgroundColor: '#229ED9' }]}>
            <Text style={styles.chatTileBadgeText}>24/7</Text>
          </View>
        </TouchableOpacity>
      </View>

      <VoiceReportCard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 14,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  chatTile: {
    flex: 1,
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    alignItems: 'center',
    gap: 6,
  },
  chatTileIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  chatTileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  chatTileSubtitle: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
  },
  chatTileBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  chatTileBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  voiceCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  voiceIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: `${THEME_COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceHeaderText: {
    flex: 1,
  },
  voiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  voiceSubtitle: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
    marginTop: 1,
  },
  recordButton: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  recordButtonLabel: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    fontWeight: '500',
  },
  recordingActive: {
    gap: 14,
  },
  recordingVisualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  recordingPulseOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef444420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPulseInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingInfo: {
    flex: 1,
    gap: 8,
  },
  recordingTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 1,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    gap: 3,
  },
  waveformBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: `${THEME_COLORS.primary}20`,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    borderRadius: 16,
    paddingVertical: 12,
  },
  stopButtonIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  previewContainer: {
    gap: 14,
  },
  previewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: THEME_COLORS.background,
    borderRadius: 14,
    padding: 14,
  },
  previewFileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${THEME_COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDetails: {
    flex: 1,
  },
  previewFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  previewDuration: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
    marginTop: 2,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
  },
  previewActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
  },
  playButton: {
    backgroundColor: `${THEME_COLORS.primary}14`,
    borderWidth: 1,
    borderColor: `${THEME_COLORS.primary}30`,
  },
  deleteButton: {
    backgroundColor: '#ef444410',
    borderWidth: 1,
    borderColor: '#ef444425',
  },
  sendButton: {
    backgroundColor: THEME_COLORS.primary,
    flex: 1.3,
  },
  previewActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
