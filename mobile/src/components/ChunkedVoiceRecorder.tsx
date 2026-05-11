import { secureLog } from '../utils/secureLogger';
/**
 * ChunkedVoiceRecorder Component
 *
 * Voice recorder with chunked background processing for long recordings.
 * Automatically processes audio in 60-second chunks while recording continues.
 *
 * Features:
 * - Visual indicators for chunk processing
 * - Progress display for background transcription
 * - Partial results display
 * - Seamless integration with existing VoiceRecorder patterns
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Alert, AppState, AppStateStatus } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { THEME_COLORS } from '../lib/constants';
import { ErrorReporter } from '../utils/errorHandler';
import { useChunkedRecording, ChunkInfo, ChunkedRecordingOptions } from '../hooks/useChunkedRecording';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { transcribeApi, polishApi, translateApi } from '../lib/api';
import { backgroundRecordingManager } from '../utils/backgroundRecordingManager';
import { recordingPersistenceManager } from '../utils/recordingPersistenceManager';
import { batteryManager } from '../utils/batteryManager';

// Guest user restrictions
const GUEST_MAX_DURATION = 55; // seconds

interface ChunkedVoiceRecorderProps {
  // For short recordings (< 60s), use traditional flow
  onRecordingComplete?: (base64Audio: string, duration: number) => Promise<void>;

  // For chunked recordings, use these callbacks
  onChunkedRecordingComplete?: (originalText: string, resultText: string) => Promise<void>;
  onPartialResult?: (originalText: string, resultText: string) => void;

  // Configuration
  isProcessing?: boolean;
  maxDuration?: number; // Maximum total recording duration
  chunkDuration?: number; // Duration per chunk (default: 60s)
  enableChunkedProcessing?: boolean; // Enable/disable chunked mode

  // Processing options
  type: 'polish' | 'translate';
  language?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  outputFormat?: string;
  outputType?: string;

  // Continue mode support
  onBeforeRecord?: () => Promise<'continue' | 'new' | 'cancel'>;
  existingText?: string; // Text to append to when continuing
}

export function ChunkedVoiceRecorder({
  onRecordingComplete,
  onChunkedRecordingComplete,
  onPartialResult,
  isProcessing: externalProcessing = false,
  maxDuration = 600, // 10 minutes max
  chunkDuration = 60,
  enableChunkedProcessing = true,
  type,
  language = 'en',
  sourceLanguage = 'en',
  targetLanguage = 'es',
  outputFormat = 'professional',
  outputType = 'general',
  onBeforeRecord,
  existingText = '',
}: ChunkedVoiceRecorderProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { checkAccess, trial, subscription } = useSubscription();

  // For guest users: enforce 55 second limit and disable chunked processing
  const effectiveMaxDuration = isAuthenticated ? maxDuration : GUEST_MAX_DURATION;
  const effectiveEnableChunkedProcessing = isAuthenticated ? enableChunkedProcessing : false;

  // Local state for simple recording mode
  const [isSimpleRecording, setIsSimpleRecording] = useState(false);
  const [simpleDuration, setSimpleDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [offlineRecordingEnabled, setOfflineRecordingEnabled] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  // Refs for stale-closure-safe AppState handler
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isRecordingRef = useRef(false);
  const isSimpleRecordingRef = useRef(false);
  const offlineRecordingRef = useRef(false);

  // Refs for simple recording
  const simpleRecordingRef = useRef<Audio.Recording | null>(null);
  const simpleDurationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const simpleDurationRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Persistence segment refs for simple recording
  const simpleSegmentIndexRef = useRef<number>(0);
  const simpleSegmentStartTimeRef = useRef<number>(0);
  const isSimpleRotatingRef = useRef<boolean>(false);

  // Chunked recording hook
  const chunkedRecordingOptions: ChunkedRecordingOptions = {
    type,
    language,
    sourceLanguage,
    targetLanguage,
    outputFormat,
    outputType,
    enableBackgroundProcessing: true,
    onChunkProcessed: (chunk, accumulatedText) => {
      secureLog.debug(`[ChunkedVoiceRecorder] Chunk ${chunk.index} processed`);
    },
    onResultUpdated: (originalText, resultText) => {
      onPartialResult?.(originalText, resultText);
    },
    onError: (error, chunk) => {
      secureLog.error('[ChunkedVoiceRecorder] Chunk error:', error, chunk?.index);
    },
  };

  const {
    state: chunkedState,
    startRecording: startChunkedRecording,
    stopRecording: stopChunkedRecording,
    cancelRecording,
    appendToAccumulatedText,
    clearState: clearChunkedState,
    permissionGranted: chunkedPermissionGranted,
    isOnline,
  } = useChunkedRecording(chunkedRecordingOptions);

  // Combined state
  const isRecording = isSimpleRecording || chunkedState.isRecording;
  const currentDuration = isSimpleRecording ? simpleDuration : chunkedState.currentDuration;
  const isProcessing = externalProcessing || chunkedState.isProcessingChunk;

  // Keep refs in sync to avoid stale closures in AppState handler
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isSimpleRecordingRef.current = isSimpleRecording; }, [isSimpleRecording]);
  useEffect(() => { offlineRecordingRef.current = offlineRecordingEnabled; }, [offlineRecordingEnabled]);

  // Initialize permissions
  useEffect(() => {
    requestPermissions();
    loadOfflineRecordingSetting();
    return () => {
      cleanupSimpleRecording();
    };
  }, []);

  // Setup AppState listener (stable - uses refs, no dependency on state)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      backgroundRecordingManager.stopAppStateMonitoring();
    };
  }, []);

  // Emergency battery-low callback: stop recording at 5% to preserve data
  useEffect(() => {
    const unsubscribe = batteryManager.addEmergencyBatteryCallback(async () => {
      secureLog.warn('[ChunkedVoiceRecorder] Emergency battery-low triggered during recording');

      if (isSimpleRecordingRef.current && simpleRecordingRef.current) {
        secureLog.warn('[ChunkedVoiceRecorder] Emergency stopping simple recording');
        try {
          await simpleRecordingRef.current.stopAndUnloadAsync();
          const uri = simpleRecordingRef.current.getURI();
          if (uri && recordingPersistenceManager.isSessionActive()) {
            const segmentDurationMs = Date.now() - simpleSegmentStartTimeRef.current;
            await recordingPersistenceManager.registerSegment(
              uri,
              simpleSegmentIndexRef.current,
              simpleSegmentStartTimeRef.current,
              segmentDurationMs
            );
          }
          await recordingPersistenceManager.finalize();
          cleanupSimpleRecording();
          setIsSimpleRecording(false);
        } catch (error) {
          secureLog.error('[ChunkedVoiceRecorder] Emergency simple stop failed:', error);
        }
      }

      if (isRecordingRef.current && chunkedRecording.emergencyStopAndFinalize) {
        secureLog.warn('[ChunkedVoiceRecorder] Emergency stopping chunked recording');
        try {
          await chunkedRecording.emergencyStopAndFinalize();
          setIsRecording(false);
        } catch (error) {
          secureLog.error('[ChunkedVoiceRecorder] Emergency chunked stop failed:', error);
        }
      }
    });

    return unsubscribe;
  }, []);

  const loadOfflineRecordingSetting = async () => {
    try {
      await backgroundRecordingManager.loadSettings();
      const enabled = backgroundRecordingManager.isOfflineRecordingEnabled();
      setOfflineRecordingEnabled(enabled);
    } catch (error) {
      setOfflineRecordingEnabled(false);
    }
  };

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    const prevState = appStateRef.current;
    const recording = isRecordingRef.current;
    const offlineEnabled = offlineRecordingRef.current;

    // App is going to background
    if (prevState.match(/active/) && nextAppState.match(/inactive|background/)) {
      if (recording) {
        if (offlineEnabled) {
          await backgroundRecordingManager.showRecordingNotification();
        } else {
          if (isSimpleRecordingRef.current) {
            await stopSimpleRecording();
          } else {
            const result = await stopChunkedRecording();
            if (result && onChunkedRecordingComplete) {
              await onChunkedRecordingComplete(result.originalText, result.resultText);
            }
          }

          Alert.alert(
            'Recording Stopped',
            'Recording was automatically stopped because the app was minimized. Enable "Offline Recording" in Settings to record in the background.',
            [{ text: 'OK' }]
          );
        }
      }
    }

    // App is coming to foreground
    if (prevState.match(/inactive|background/) && nextAppState === 'active') {
      if (recording && offlineEnabled) {
        await backgroundRecordingManager.dismissRecordingNotification();
      }
      await loadOfflineRecordingSetting();
    }

    appStateRef.current = nextAppState;
    setAppState(nextAppState);
  }, []);

  // Pulse animation
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
      ErrorReporter.report(error as Error, 'ChunkedVoiceRecorder.requestPermissions');
    }
  };

  const cleanupSimpleRecording = async () => {
    if (simpleDurationIntervalRef.current) {
      clearInterval(simpleDurationIntervalRef.current);
      simpleDurationIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (simpleRecordingRef.current) {
      try {
        const status = await simpleRecordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await simpleRecordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      simpleRecordingRef.current = null;
    }
  };

  const rotateSimplePersistenceSegment = async () => {
    if (!simpleRecordingRef.current || isSimpleRotatingRef.current) return;

    isSimpleRotatingRef.current = true;
    try {
      const currentRecording = simpleRecordingRef.current;
      const segmentIndex = simpleSegmentIndexRef.current;
      const segmentDurationMs = Date.now() - simpleSegmentStartTimeRef.current;

      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (uri && recordingPersistenceManager.isSessionActive()) {
        await recordingPersistenceManager.registerSegment(
          uri,
          segmentIndex,
          simpleSegmentStartTimeRef.current,
          segmentDurationMs
        );
      }

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      simpleRecordingRef.current = newRecording;
      simpleSegmentIndexRef.current = segmentIndex + 1;
      simpleSegmentStartTimeRef.current = Date.now();
    } catch (error) {
      secureLog.error('[ChunkedVoiceRecorder] Simple persistence segment rotation failed:', error);
    } finally {
      isSimpleRotatingRef.current = false;
    }
  };

  /**
   * Start simple recording (for short recordings < 60s) with crash-resilient persistence
   */
  const startSimpleRecording = async () => {
    try {
      const offlineRecordingEnabled = backgroundRecordingManager.isOfflineRecordingEnabled();
      await backgroundRecordingManager.configureAudioMode(offlineRecordingEnabled);

      secureLog.debug('[ChunkedVoiceRecorder] Audio mode configured with background support:', offlineRecordingEnabled);

      await recordingPersistenceManager.startSession('simple', {});
      simpleSegmentIndexRef.current = 0;
      simpleSegmentStartTimeRef.current = Date.now();

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      simpleRecordingRef.current = recording;
      setIsSimpleRecording(true);
      setSimpleDuration(0);
      simpleDurationRef.current = 0;

      simpleDurationIntervalRef.current = setInterval(() => {
        simpleDurationRef.current += 1;
        setSimpleDuration(simpleDurationRef.current);

      }, 1000);

      if (!isAuthenticated) {
        maxDurationTimeoutRef.current = setTimeout(() => {
          secureLog.debug('[ChunkedVoiceRecorder] Guest max duration reached, stopping recording');
          stopSimpleRecording();
        }, effectiveMaxDuration * 1000);
      }

    } catch (error) {
      ErrorReporter.report(error as Error, 'ChunkedVoiceRecorder.startSimpleRecording');
      throw error;
    }
  };

  /**
   * Stop simple recording
   */
  const stopSimpleRecording = async () => {
    if (!simpleRecordingRef.current) {
      secureLog.debug('[ChunkedVoiceRecorder] No recording to stop');
      return;
    }

    try {
      secureLog.debug('[ChunkedVoiceRecorder] Stopping simple recording...');

      // Clear intervals/timeouts first
      if (simpleDurationIntervalRef.current) {
        clearInterval(simpleDurationIntervalRef.current);
        simpleDurationIntervalRef.current = null;
      }

      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }

      const currentDur = simpleDurationRef.current;
      secureLog.debug(`[DEBUG ChunkedVoiceRecorder] stopRecording: durationRef=${simpleDurationRef.current}, stateValue=${simpleDuration}`);
      const recording = simpleRecordingRef.current;

      // Check recording status before stopping
      const status = await recording.getStatusAsync();
      secureLog.debug('[ChunkedVoiceRecorder] Recording status:', status);

      let uri: string | null = null;

      if (status.isRecording) {
        await recording.stopAndUnloadAsync();
        uri = recording.getURI();
      } else {
        secureLog.debug('[ChunkedVoiceRecorder] Recording already stopped, getting URI directly');
        uri = recording.getURI();
      }

      if (uri && recordingPersistenceManager.isSessionActive()) {
        const segmentDurationMs = Date.now() - simpleSegmentStartTimeRef.current;
        await recordingPersistenceManager.registerSegment(
          uri,
          simpleSegmentIndexRef.current,
          simpleSegmentStartTimeRef.current,
          segmentDurationMs
        );
      }

      await recordingPersistenceManager.finalize();

      secureLog.debug('[ChunkedVoiceRecorder] Recording URI:', uri);
      secureLog.debug('[ChunkedVoiceRecorder] Recording duration:', currentDur);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        secureLog.error('[ChunkedVoiceRecorder] No URI returned from recording');
        setIsSimpleRecording(false);
        simpleRecordingRef.current = null;
        Alert.alert(
          'Error',
          'Failed to save recording. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Small delay to ensure file system has written the file
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if file exists with retry logic
      let fileInfo = await FileSystem.getInfoAsync(uri);
      let retryCount = 0;
      const maxRetries = 3;

      while (!fileInfo.exists && retryCount < maxRetries) {
        secureLog.debug(`[ChunkedVoiceRecorder] File not found, retry ${retryCount + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        fileInfo = await FileSystem.getInfoAsync(uri);
        retryCount++;
      }

      if (!fileInfo.exists) {
        secureLog.error('[ChunkedVoiceRecorder] Recording file does not exist at URI after retries:', uri);
        setIsSimpleRecording(false);
        simpleRecordingRef.current = null;
        Alert.alert(
          'Error',
          'Failed to save recording. The audio file could not be found. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      secureLog.debug('[ChunkedVoiceRecorder] File exists, size:', fileInfo.size);

      // Clear state and ref after successful validation
      setIsSimpleRecording(false);
      simpleRecordingRef.current = null;

      if (onRecordingComplete) {
        secureLog.debug('[ChunkedVoiceRecorder] Reading audio file...');
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        secureLog.debug('[ChunkedVoiceRecorder] Audio file read successfully, length:', base64.length);
        await onRecordingComplete(base64, currentDur);
      } else {
        secureLog.debug('[ChunkedVoiceRecorder] No onRecordingComplete handler');
      }

    } catch (error) {
      secureLog.error('[ChunkedVoiceRecorder] Error stopping recording:', error);
      ErrorReporter.report(error as Error, 'ChunkedVoiceRecorder.stopSimpleRecording');
      setIsSimpleRecording(false);
      simpleRecordingRef.current = null;

      // Clean up audio mode
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });
      } catch (e) {
        // Ignore
      }

      Alert.alert(
        'Error',
        'Failed to save or process audio: ' + (error as Error).message,
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Handle record button press
   */
  const handlePress = async () => {
    if (isProcessing) return;

    if (isRecording) {
      // Stop recording
      if (isSimpleRecording) {
        await stopSimpleRecording();
      } else if (chunkedState.isRecording) {
        const result = await stopChunkedRecording();
        if (result && onChunkedRecordingComplete) {
          await onChunkedRecordingComplete(result.originalText, result.resultText);
        }
      }
    } else {
      // Check access before starting recording (for authenticated users)
      if (isAuthenticated) {
        try {
          const accessGranted = await checkAccess();

          if (!accessGranted) {
            let message = 'Unable to start recording. ';

            if (trial?.status === 'expired') {
              message += 'Your 7-day trial has ended. Please subscribe to continue recording.';
            } else if (subscription?.status === 'pending_payment') {
              message += 'Please complete your payment to start recording.';
            } else {
              message += 'Please subscribe or start your free trial.';
            }

            Alert.alert(
              'Subscription Required',
              message,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'View Plans', onPress: () => {
                  router.push('/(tabs)/subscription');
                }},
              ]
            );
            return;
          }

          const mins = trial?.minutes_remaining ?? subscription?.minutes_remaining;
          if (mins !== undefined && mins < 5) {
            secureLog.debug(`[ChunkedVoiceRecorder] Low minutes remaining: ${mins}`);
            Alert.alert(
              'Low Recording Time',
              `You have ${Math.round(mins)} minute${Math.round(mins) !== 1 ? 's' : ''} of recording time remaining.`,
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          secureLog.error('[ChunkedVoiceRecorder] Access check failed:', error);
          Alert.alert(
            'Error',
            'Failed to verify recording access. Please try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }

      // Block guest users from recording - require registration
      if (!isAuthenticated) {
        secureLog.debug('[ChunkedVoiceRecorder] Guest user - blocking recording, registration required');
        Alert.alert(
          'Registration Required',
          'Please register to use 7 days trial',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Register', onPress: () => {
              router.push('/register');
            }},
          ]
        );
        return;
      }

      // For authenticated users: check for continue/new/cancel
      if (onBeforeRecord) {
        const action = await onBeforeRecord();
        if (action === 'cancel') {
          return;
        }
        if (action === 'continue' && existingText) {
          // Pre-populate accumulated text for continue mode
          appendToAccumulatedText(existingText);
        }
      }

      // For authenticated users with chunked processing enabled: start chunked recording
      if (effectiveEnableChunkedProcessing) {
        secureLog.debug('[ChunkedVoiceRecorder] Authenticated user - starting chunked recording');
        await startChunkedRecording();
      } else {
        // For authenticated users without chunked processing: use simple recording
        secureLog.debug('[ChunkedVoiceRecorder] Authenticated user - starting simple recording (chunked disabled)');
        await startSimpleRecording();
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get chunk processing status
  const getChunkStatus = () => {
    const { chunks, isProcessingChunk } = chunkedState;
    const completedChunks = chunks.filter(c => c.status === 'completed').length;
    const failedChunks = chunks.filter(c => c.status === 'failed').length;
    const totalChunks = chunks.length;

    if (totalChunks === 0) return null;

    return {
      completedChunks,
      failedChunks,
      totalChunks,
      isProcessing: isProcessingChunk,
    };
  };

  const chunkStatus = getChunkStatus();

  if (!permissionGranted && !chunkedPermissionGranted) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
          <Ionicons name="mic-off" size={32} color={THEME_COLORS.textSecondary} />
          <Text style={styles.permissionText}>Tap to enable microphone</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main record button */}
      <Animated.View style={[styles.recordButtonOuter, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
            isProcessing && styles.recordButtonDisabled,
          ]}
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.8}
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

      {/* Duration display */}
      <Text style={styles.durationText}>
        {isProcessing ? 'Processing...' : isRecording ? formatDuration(currentDuration) : 'Tap to record'}
      </Text>

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>
            {chunkedState.isRecording ? 'Chunked Recording' : 'Recording'}
          </Text>
        </View>
      )}

      {/* Chunk processing status */}
      {chunkStatus && (
        <View style={styles.chunkStatusContainer}>
          <View style={styles.chunkProgressBar}>
            <View
              style={[
                styles.chunkProgressFill,
                { width: `${(chunkStatus.completedChunks / chunkStatus.totalChunks) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.chunkStatusText}>
            {chunkStatus.isProcessing && '⏳ '}
            Chunks: {chunkStatus.completedChunks}/{chunkStatus.totalChunks}
            {chunkStatus.failedChunks > 0 && ` (${chunkStatus.failedChunks} failed)`}
          </Text>
        </View>
      )}

      {/* Partial transcription preview */}
      {chunkedState.accumulatedOriginalText && (
        <View style={styles.partialResultContainer}>
          <Text style={styles.partialResultLabel}>Transcribed so far:</Text>
          <Text style={styles.partialResultText} numberOfLines={2}>
            {chunkedState.accumulatedOriginalText.substring(0, 100)}
            {chunkedState.accumulatedOriginalText.length > 100 ? '...' : ''}
          </Text>
        </View>
      )}

      {/* Network status indicator */}
      {!isOnline && isRecording && (
        <View style={styles.offlineIndicator}>
          <Ionicons name="cloud-offline" size={16} color={THEME_COLORS.warning} />
          <Text style={styles.offlineText}>Offline - chunks will be queued</Text>
        </View>
      )}

      {/* Max duration hint */}
      <Text style={styles.maxDurationHint}>
        {!isAuthenticated
          ? `Max: ${effectiveMaxDuration}s (Guest)`
          : `Max: ${Math.floor(effectiveMaxDuration / 60)}min${enableChunkedProcessing ? ' (chunked)' : ''}`
        }
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
    color: THEME_COLORS.textSecondary,
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
    backgroundColor: THEME_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: THEME_COLORS.error,
    shadowColor: THEME_COLORS.error,
  },
  recordButtonDisabled: {
    backgroundColor: THEME_COLORS.textMuted,
    shadowOpacity: 0,
  },
  durationText: {
    color: THEME_COLORS.text,
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
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
    backgroundColor: THEME_COLORS.error,
  },
  recordingText: {
    color: THEME_COLORS.error,
    fontSize: 14,
    fontWeight: '500',
  },
  maxDurationHint: {
    color: THEME_COLORS.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  chunkStatusContainer: {
    marginTop: 16,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  chunkProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: THEME_COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  chunkProgressFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.success,
  },
  chunkStatusText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  partialResultContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: THEME_COLORS.cardBackground,
    borderRadius: 8,
    width: '100%',
    maxWidth: 300,
  },
  partialResultLabel: {
    color: THEME_COLORS.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  partialResultText: {
    color: THEME_COLORS.text,
    fontSize: 13,
    fontStyle: 'italic',
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  offlineText: {
    color: THEME_COLORS.warning,
    fontSize: 12,
  },
});

export default ChunkedVoiceRecorder;
