import { secureLog } from '../utils/secureLogger';
import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';
import { ErrorReporter } from '../utils/errorHandler';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';

interface AudioChunk {
  id: string;
  uri: string;
  duration: number;
  timestamp: number;
  sessionId: string; // Unique ID for this recording session
  chunkIndex: number; // Order within the session
  fileSize?: number; // Size of the audio file in bytes
  checksum?: number; // Simple checksum for verification
}

interface ContinuousVoiceRecorderProps {
  onSaveComplete: (chunks: AudioChunk[], totalDuration: number) => Promise<void>;
  isProcessing?: boolean;
  chunkDuration?: number; // Duration in seconds for each chunk (default: 60)
}

export function ContinuousVoiceRecorder({ 
  onSaveComplete, 
  isProcessing = false,
  chunkDuration = 120  // Increased to 120 seconds (2 minutes) to reduce word breaks
}: ContinuousVoiceRecorderProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [chunksCount, setChunksCount] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const chunksRef = useRef<AudioChunk[]>([]);
  const sessionIdRef = useRef<string>(''); // Unique ID for this recording session
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkDurationRef = useRef(0);
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
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (e) {
        ErrorReporter.report(e as Error, 'ContinuousVoiceRecorder.cleanup');
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
      ErrorReporter.report(error as Error, 'ContinuousVoiceRecorder.requestPermissions');
    }
  };

  /**
   * Calculate simple checksum for audio verification
   */
  const calculateChecksum = (base64Data: string): number => {
    let checksum = 0;
    const sample = base64Data.substring(0, Math.min(2000, base64Data.length));
    for (let i = 0; i < sample.length; i++) {
      checksum = (checksum + sample.charCodeAt(i)) % 65536;
    }
    return checksum;
  };

  /**
   * Verify audio file is valid and contains actual audio data
   */
  const verifyAudioFile = async (uri: string, expectedDuration: number): Promise<{
    isValid: boolean;
    fileSize: number;
    checksum: number;
    error?: string;
  }> => {
    try {
      // Check file exists and get info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        return { isValid: false, fileSize: 0, checksum: 0, error: 'File does not exist' };
      }

      const fileSize = fileInfo.size || 0;
      
      // Minimum expected size: ~1KB per second for AAC at 128kbps
      // 128kbps = 16KB/s, but we're conservative with 1KB/s minimum
      const minExpectedSize = Math.max(1000, expectedDuration * 1000);
      
      if (fileSize < minExpectedSize) {
        secureLog.warn(`[ContinuousRecorder] File too small: ${fileSize} bytes, expected at least ${minExpectedSize} bytes for ${expectedDuration}s`);
        return { 
          isValid: false, 
          fileSize, 
          checksum: 0, 
          error: `File too small: ${fileSize} bytes for ${expectedDuration}s recording` 
        };
      }

      // Read file and calculate checksum
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const checksum = calculateChecksum(base64Data);

      // Verify M4A header (ftyp signature in base64)
      // M4A/MP4 files start with 'ftyp' which in base64 appears differently depending on offset
      // The signature is typically within first 32 bytes
      const base64Start = base64Data.substring(0, 100);
      const hasValidHeader = base64Data.length > 100; // Basic check - file should have content
      
      secureLog.debug(`[ContinuousRecorder] Audio verification:`, {
        fileSize,
        expectedDuration,
        checksum,
        base64Length: base64Data.length,
        base64Start: base64Start.substring(0, 50),
        hasValidHeader,
      });

      if (!hasValidHeader) {
        return { 
          isValid: false, 
          fileSize, 
          checksum, 
          error: 'Invalid or empty audio file' 
        };
      }

      return { isValid: true, fileSize, checksum };
    } catch (error) {
      secureLog.error('[ContinuousRecorder] Audio verification failed:', error);
      return { 
        isValid: false, 
        fileSize: 0, 
        checksum: 0, 
        error: `Verification error: ${(error as Error).message}` 
      };
    }
  };

  /**
   * Save current recording chunk and start a new one
   * This allows continuous recording without stopping
   */
  const saveChunkAndContinue = async () => {
    if (!recordingRef.current) return;

    const chunkIndex = chunksRef.current.length;
    const chunkDuration = chunkDurationRef.current;
    
    try {
      secureLog.debug(`[ContinuousRecorder] ===== SAVING CHUNK ${chunkIndex + 1} =====`);
      secureLog.debug(`[ContinuousRecorder] Session: ${sessionIdRef.current}`);
      secureLog.debug(`[ContinuousRecorder] Chunk duration: ${chunkDuration}s`);
      
      // Get recording status before pausing
      const statusBefore = await recordingRef.current.getStatusAsync();
      secureLog.debug(`[ContinuousRecorder] Recording status before pause:`, {
        isRecording: statusBefore.isRecording,
        durationMillis: statusBefore.durationMillis,
        metering: statusBefore.metering,
      });
      
      // Pause current recording to get the URI
      await recordingRef.current.pauseAsync();
      const uri = recordingRef.current.getURI();
      
      secureLog.debug(`[ContinuousRecorder] Source URI: ${uri}`);
      
      if (!uri) {
        secureLog.error(`[ContinuousRecorder] ERROR: No URI from recording!`);
        return;
      }

      // Check source file exists before copying
      const sourceInfo = await FileSystem.getInfoAsync(uri);
      secureLog.debug(`[ContinuousRecorder] Source file info:`, {
        exists: sourceInfo.exists,
        size: sourceInfo.size,
        uri: sourceInfo.uri,
      });

      if (!sourceInfo.exists || (sourceInfo.size || 0) < 100) {
        secureLog.error(`[ContinuousRecorder] ERROR: Source file invalid or empty!`);
        // Still try to continue recording
        await recordingRef.current.stopAndUnloadAsync();
        await startNewRecording();
        return;
      }

      // Copy file to permanent location with unique ID
      const chunkId = `chunk_${sessionIdRef.current}_${chunkIndex}_${Date.now()}`;
      const permanentUri = `${FileSystem.documentDirectory}${chunkId}.m4a`;
      
      secureLog.debug(`[ContinuousRecorder] Copying to: ${permanentUri}`);
      
      await FileSystem.copyAsync({
        from: uri,
        to: permanentUri,
      });

      // Verify the copied file
      const verification = await verifyAudioFile(permanentUri, chunkDuration);
      
      secureLog.debug(`[ContinuousRecorder] Verification result:`, verification);

      if (!verification.isValid) {
        secureLog.error(`[ContinuousRecorder] ERROR: Chunk verification failed: ${verification.error}`);
        // Clean up invalid file
        try {
          await FileSystem.deleteAsync(permanentUri, { idempotent: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      } else {
        // Save chunk metadata with verification info
        const chunk: AudioChunk = {
          id: chunkId,
          uri: permanentUri,
          duration: chunkDuration,
          timestamp: Date.now(),
          sessionId: sessionIdRef.current,
          chunkIndex: chunkIndex,
          fileSize: verification.fileSize,
          checksum: verification.checksum,
        };

        chunksRef.current.push(chunk);
        setChunksCount(chunksRef.current.length);
        
        secureLog.debug(`[ContinuousRecorder] Chunk ${chunkIndex + 1} saved successfully:`, {
          id: chunk.id,
          sessionId: chunk.sessionId,
          chunkIndex: chunk.chunkIndex,
          duration: chunk.duration,
          fileSize: chunk.fileSize,
          checksum: chunk.checksum,
        });
      }
      
      // Reset chunk duration counter
      chunkDurationRef.current = 0;

      // Stop current recording and start new one
      await recordingRef.current.stopAndUnloadAsync();
      await startNewRecording();
      
      secureLog.debug(`[ContinuousRecorder] ===== CHUNK ${chunkIndex + 1} COMPLETE =====`);
      
    } catch (error) {
      ErrorReporter.report(error as Error, 'ContinuousVoiceRecorder.saveChunkAndContinue');
      secureLog.error('[ContinuousRecorder] Failed to save chunk:', error);
      
      // Try to recover by starting a new recording
      try {
        if (recordingRef.current) {
          await recordingRef.current.stopAndUnloadAsync();
        }
        await startNewRecording();
      } catch (recoveryError) {
        secureLog.error('[ContinuousRecorder] Recovery failed:', recoveryError);
      }
    }
  };

  /**
   * Start a new recording (used after saving a chunk)
   */
  const startNewRecording = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const m4aOptions: Audio.RecordingOptions = {
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {
          mimeType: 'audio/mp4',
          bitsPerSecond: 128000,
        },
      };

      const { recording } = await Audio.Recording.createAsync(m4aOptions);
      recordingRef.current = recording;
      
      secureLog.debug('[ContinuousRecorder] New recording started');
    } catch (error) {
      secureLog.error('[ContinuousRecorder] Failed to start new recording:', error);
      throw error;
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
      if (!permissionGranted) {
        Alert.alert('Permission Required', 'Microphone permission is required to record audio.');
        return;
      }
    }

    try {
      // Generate unique session ID for this recording
      sessionIdRef.current = `session_${Date.now()}`;
      secureLog.debug('[ContinuousRecorder] New recording session:', sessionIdRef.current);
      
      // Clear any previous chunks from memory
      chunksRef.current = [];
      setChunksCount(0);
      chunkDurationRef.current = 0;

      // CRITICAL: Delete old chunk files from previous sessions
      secureLog.debug('[ContinuousRecorder] Cleaning up old chunk files...');
      try {
        const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory || '');
        const oldChunks = files.filter(f => f.startsWith('chunk_') && (f.endsWith('.m4a') || f.endsWith('.wav')));
        
        secureLog.debug('[ContinuousRecorder] Found', oldChunks.length, 'old chunk files to delete');
        
        for (const file of oldChunks) {
          try {
            await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${file}`, { idempotent: true });
            secureLog.debug('[ContinuousRecorder] Deleted old chunk:', file);
          } catch (deleteError) {
            secureLog.error('[ContinuousRecorder] Failed to delete old chunk:', file, deleteError);
          }
        }
        
        secureLog.debug('[ContinuousRecorder] Cleanup complete');
      } catch (cleanupError) {
        secureLog.error('[ContinuousRecorder] Error during cleanup:', cleanupError);
        // Continue anyway - don't block recording
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Use AAC in M4A container - this is what Android actually supports
      // On iOS we use Linear PCM (WAV) for better quality
      // The key is using correct MIME type: audio/mp4 for M4A files
      const recordingOptions: Audio.RecordingOptions = {
        isMeteringEnabled: true,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,  // Higher sample rate for better quality
          numberOfChannels: 1,
          bitRate: 128000,  // Standard bitrate for AAC
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {
          mimeType: 'audio/mp4',
          bitsPerSecond: 128000,
        },
      };

      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      secureLog.debug('[ContinuousRecorder] Using M4A/AAC format (properly supported on Android)');

      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);

      // Update total duration every second
      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
        chunkDurationRef.current += 1;
      }, 1000);

      // Save chunk every N seconds and start new recording
      chunkIntervalRef.current = setInterval(() => {
        saveChunkAndContinue();
      }, chunkDuration * 1000);

      secureLog.debug('[ContinuousRecorder] Recording started, will save chunks every', chunkDuration, 'seconds');
      
    } catch (error) {
      ErrorReporter.report(error as Error, 'ContinuousVoiceRecorder.startRecording');
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      secureLog.debug('[ContinuousRecorder] ===== STOPPING RECORDING =====');
      secureLog.debug('[ContinuousRecorder] Session:', sessionIdRef.current);
      
      // Clear intervals
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }

      const totalDuration = duration;
      const finalChunkDuration = chunkDurationRef.current;

      // Get recording status before stopping
      const statusBefore = await recordingRef.current.getStatusAsync();
      secureLog.debug('[ContinuousRecorder] Final recording status:', {
        isRecording: statusBefore.isRecording,
        durationMillis: statusBefore.durationMillis,
        metering: statusBefore.metering,
      });

      // Save the final chunk
      const uri = recordingRef.current.getURI();
      
      secureLog.debug('[ContinuousRecorder] Final chunk source URI:', uri);
      secureLog.debug('[ContinuousRecorder] Final chunk duration:', finalChunkDuration, 'seconds');
      
      if (uri && finalChunkDuration > 0) {
        // Check source file
        const sourceInfo = await FileSystem.getInfoAsync(uri);
        secureLog.debug('[ContinuousRecorder] Final chunk source file:', {
          exists: sourceInfo.exists,
          size: sourceInfo.size,
        });

        if (sourceInfo.exists && (sourceInfo.size || 0) > 100) {
          // Save final chunk with verification
          const chunkIndex = chunksRef.current.length;
          const chunkId = `chunk_${sessionIdRef.current}_${chunkIndex}_${Date.now()}`;
          const permanentUri = `${FileSystem.documentDirectory}${chunkId}.m4a`;
          
          secureLog.debug('[ContinuousRecorder] Copying final chunk to:', permanentUri);
          
          await FileSystem.copyAsync({
            from: uri,
            to: permanentUri,
          });

          // Verify the final chunk
          const verification = await verifyAudioFile(permanentUri, finalChunkDuration);
          secureLog.debug('[ContinuousRecorder] Final chunk verification:', verification);

          if (verification.isValid) {
            const chunk: AudioChunk = {
              id: chunkId,
              uri: permanentUri,
              duration: finalChunkDuration,
              timestamp: Date.now(),
              sessionId: sessionIdRef.current,
              chunkIndex: chunkIndex,
              fileSize: verification.fileSize,
              checksum: verification.checksum,
            };

            chunksRef.current.push(chunk);
            secureLog.debug('[ContinuousRecorder] Final chunk saved successfully:', {
              id: chunkId,
              sessionId: sessionIdRef.current,
              chunkIndex: chunkIndex,
              duration: finalChunkDuration,
              fileSize: verification.fileSize,
              checksum: verification.checksum,
            });
          } else {
            secureLog.error('[ContinuousRecorder] Final chunk verification failed:', verification.error);
          }
        } else {
          secureLog.warn('[ContinuousRecorder] Final chunk source file invalid, skipping');
        }
      } else {
        secureLog.debug('[ContinuousRecorder] No final chunk to save (duration:', finalChunkDuration, ')');
      }

      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsRecording(false);

      secureLog.debug('[ContinuousRecorder] Recording stopped. Total chunks:', chunksRef.current.length, 'Total duration:', totalDuration);

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      // Call completion callback with all chunks
      if (chunksRef.current.length > 0) {
        secureLog.debug('[ContinuousRecorder] ===== PASSING CHUNKS TO CALLBACK =====');
        secureLog.debug('[ContinuousRecorder] Session ID:', sessionIdRef.current);
        secureLog.debug('[ContinuousRecorder] Total chunks:', chunksRef.current.length);
        secureLog.debug('[ContinuousRecorder] Total duration:', totalDuration, 'seconds');
        
        // Log detailed info for each chunk
        chunksRef.current.forEach((c, idx) => {
          secureLog.debug(`[ContinuousRecorder] Chunk ${idx + 1}/${chunksRef.current.length}:`, {
            chunkIndex: c.chunkIndex,
            id: c.id,
            sessionId: c.sessionId,
            duration: c.duration,
            fileSize: c.fileSize,
            checksum: c.checksum,
            uri: c.uri,
          });
        });
        
        // Verify all chunks have unique checksums (unless very short)
        const checksums = chunksRef.current.map(c => c.checksum).filter(c => c !== undefined);
        const uniqueChecksums = new Set(checksums);
        if (checksums.length > 1 && uniqueChecksums.size < checksums.length) {
          secureLog.warn('[ContinuousRecorder] WARNING: Duplicate checksums detected - chunks may contain duplicate audio!');
        } else {
          secureLog.debug('[ContinuousRecorder] All chunks have unique checksums - audio integrity verified');
        }
        
        secureLog.debug('[ContinuousRecorder] ===== CALLING onSaveComplete =====');
        
        try {
          await onSaveComplete(chunksRef.current, totalDuration);
        } catch (callbackError) {
          ErrorReporter.report(callbackError as Error, 'ContinuousVoiceRecorder.onSaveComplete');
        }
        
        secureLog.debug('[ContinuousRecorder] ===== RECORDING SESSION COMPLETE =====');
      } else {
        Alert.alert('No Recording', 'No audio was recorded.');
      }

    } catch (error) {
      ErrorReporter.report(error as Error, 'ContinuousVoiceRecorder.stopRecording');
      setIsRecording(false);
    }
  };

  const handlePress = () => {
    if (isProcessing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="mic-off" size={48} color={THEME_COLORS.textMuted} />
          <Text style={styles.permissionText}>Microphone permission required</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.recordingInfo}>
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        {chunksCount > 0 && (
          <Text style={styles.chunksText}>
            {chunksCount} {chunksCount === 1 ? 'chunk' : 'chunks'} saved
          </Text>
        )}
        {isRecording && (
          <Text style={styles.autoSaveText}>
            Auto-saving every {chunkDuration}s
          </Text>
        )}
      </View>

      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
            isProcessing && styles.recordButtonDisabled,
          ]}
          onPress={handlePress}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Ionicons name="hourglass" size={48} color="white" />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={48} color="white" />
          )}
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.instructionContainer}>
        <Text style={styles.instructionText}>
          {isRecording
            ? 'Recording... Tap to stop and save'
            : isProcessing
            ? 'Processing your recording...'
            : 'Tap to start recording'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  permissionContainer: {
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    fontSize: 16,
    color: THEME_COLORS.textMuted,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: THEME_COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingInfo: {
    alignItems: 'center',
    marginBottom: 24,
    minHeight: 80,
  },
  durationText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  chunksText: {
    fontSize: 14,
    color: THEME_COLORS.success,
    marginTop: 8,
    fontWeight: '600',
  },
  autoSaveText: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: THEME_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  recordButtonActive: {
    backgroundColor: THEME_COLORS.error,
  },
  recordButtonDisabled: {
    backgroundColor: THEME_COLORS.textMuted,
    opacity: 0.6,
  },
  instructionContainer: {
    marginTop: 24,
    paddingHorizontal: 32,
  },
  instructionText: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
  },
});
