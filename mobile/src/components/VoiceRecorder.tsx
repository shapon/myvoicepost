import { secureLog } from '../utils/secureLogger';
import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import { ErrorReporter } from '../utils/errorHandler';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';

const GUEST_MAX_DURATION = 55;

interface VoiceRecorderProps {
  onRecordingComplete: (base64Audio: string, duration: number) => Promise<void>;
  isProcessing?: boolean;
  maxDuration?: number;
  onBeforeRecord?: () => Promise<'continue' | 'new' | 'cancel'>;
}

export function VoiceRecorder({ onRecordingComplete, isProcessing = false, maxDuration = 60, onBeforeRecord }: VoiceRecorderProps) {
  const { isAuthenticated } = useAuth();
  const colors = useThemeColors();
  const router = useRouter();

  const effectiveMaxDuration = maxDuration;
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    requestPermissions();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        ErrorReporter.report(e as Error, 'VoiceRecorder.cleanup');
      }
      recordingRef.current = null;
    }
    pulseAnim.stopAnimation();
  };

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setPermissionGranted(status === 'granted');
    } catch (error) {
      ErrorReporter.report(error as Error, 'VoiceRecorder.requestPermissions');
    }
  };

  const startRecording = async () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Registration Required',
        'Please register to use 7 days trial',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Register', onPress: () => router.push('/register') },
        ]
      );
      return;
    }

    if (!permissionGranted) {
      await requestPermissions();
      if (!permissionGranted) return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);
      durationRef.current = 0;

      durationIntervalRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);

      maxDurationTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, effectiveMaxDuration * 1000);
    } catch (error) {
      ErrorReporter.report(error as Error, 'VoiceRecorder.startRecording');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }

      const currentDuration = durationRef.current;
      secureLog.debug(`[DEBUG VoiceRecorder] stopRecording: durationRef=${durationRef.current}, stateValue=${duration}`);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        try {
          await onRecordingComplete(base64, currentDuration);
        } catch (callbackError) {
          ErrorReporter.report(callbackError as Error, 'VoiceRecorder.onRecordingComplete');
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (error) {
      ErrorReporter.report(error as Error, 'VoiceRecorder.stopRecording');
      setIsRecording(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePress = async () => {
    if (isProcessing) return;
    if (isRecording) {
      stopRecording();
    } else {
      if (!isAuthenticated) {
        startRecording();
        return;
      }

      if (onBeforeRecord) {
        const action = await onBeforeRecord();
        if (action === 'cancel') {
          return;
        }
      }
      startRecording();
    }
  };

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
          <Ionicons name="mic-off" size={32} color={colors.textSecondary} />
          <Text style={[styles.permissionText, { color: colors.textSecondary }]}>Tap to enable microphone</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.recordButtonOuter, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            { backgroundColor: colors.primary, shadowColor: colors.primary },
            isRecording && { backgroundColor: colors.error, shadowColor: colors.error },
            isProcessing && { backgroundColor: colors.textMuted, shadowOpacity: 0 },
          ]}
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <Ionicons name="hourglass" size={48} color="#ffffff" />
          ) : isRecording ? (
            <Ionicons name="stop" size={48} color="#ffffff" />
          ) : (
            <Ionicons name="mic" size={48} color="#ffffff" />
          )}
        </TouchableOpacity>
      </Animated.View>

      <Text style={[styles.durationText, { color: colors.text }]}>
        {isProcessing ? 'Processing...' : isRecording ? formatDuration(duration) : 'Tap to record'}
      </Text>

      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
          <Text style={[styles.recordingText, { color: colors.error }]}>Recording</Text>
        </View>
      )}

      <Text style={[styles.maxDurationHint, { color: colors.textMuted }]}>
        Max: {effectiveMaxDuration}s{!isAuthenticated && ' (Login for longer)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    marginTop: 12,
  },
  recordButtonOuter: {
    borderRadius: 100,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  maxDurationHint: {
    fontSize: 12,
    marginTop: 8,
  },
});
