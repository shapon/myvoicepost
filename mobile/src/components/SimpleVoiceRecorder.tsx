import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';

// Guest user restrictions
const GUEST_MAX_DURATION = 55; // seconds

interface SimpleVoiceRecorderProps {
  onRecordingComplete: (audioUri: string, duration: number) => void;
  isProcessing?: boolean;
  maxDuration?: number;
  onBeforeRecord?: () => Promise<'continue' | 'new' | 'cancel'>;
}

export const SimpleVoiceRecorder: React.FC<SimpleVoiceRecorderProps> = ({
  onRecordingComplete,
  isProcessing = false,
  maxDuration = 60,
  onBeforeRecord,
}) => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const effectiveMaxDuration = maxDuration;
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    requestPermissions();
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      
      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please grant microphone permission to record audio.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[SimpleRecorder] Permission error:', error);
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

    try {
      if (!permissionGranted) {
        await requestPermissions();
        return;
      }

      console.log('[SimpleRecorder] ===== STARTING RECORDING =====');
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Create recording with high quality settings
      const { recording: newRecording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          if (status.isRecording) {
            const currentDuration = Math.floor(status.durationMillis / 1000);
            setDuration(currentDuration);
          }
        },
        100 // Update every 100ms
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);
      
      console.log('[SimpleRecorder] Recording started successfully');
    } catch (error) {
      console.error('[SimpleRecorder] Failed to start recording:', error);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      console.log('[SimpleRecorder] ===== STOPPING RECORDING =====');
      
      setIsRecording(false);
      
      // Stop recording
      await recording.stopAndUnloadAsync();
      
      // Get recording URI
      const uri = recording.getURI();
      
      if (!uri) {
        throw new Error('No recording URI found');
      }

      console.log('[SimpleRecorder] Recording stopped. URI:', uri);
      console.log('[SimpleRecorder] Duration:', duration, 'seconds');
      
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log('[SimpleRecorder] File size:', fileInfo.size, 'bytes');
      console.log('[SimpleRecorder] File exists:', fileInfo.exists);

      // Save to permanent location
      const timestamp = Date.now();
      const filename = `recording_${timestamp}.m4a`;
      const permanentUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.copyAsync({
        from: uri,
        to: permanentUri,
      });
      
      console.log('[SimpleRecorder] Saved to:', permanentUri);
      
      // Verify saved file
      const savedFileInfo = await FileSystem.getInfoAsync(permanentUri);
      console.log('[SimpleRecorder] Saved file size:', savedFileInfo.size, 'bytes');
      
      if (!savedFileInfo.exists || savedFileInfo.size === 0) {
        throw new Error('Saved file is invalid');
      }

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Clear recording state
      setRecording(null);
      
      // Call completion handler
      console.log('[SimpleRecorder] ✅ Recording complete, calling handler');
      onRecordingComplete(permanentUri, duration);
      
    } catch (error) {
      console.error('[SimpleRecorder] Failed to stop recording:', error);
      Alert.alert('Recording Error', 'Failed to save recording. Please try again.');
      setRecording(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="mic-off" size={48} color="#666" />
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
      <View style={styles.recordingContainer}>
        {/* Duration Display */}
        {isRecording && (
          <View style={styles.durationContainer}>
            <View style={styles.recordingIndicator} />
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
        )}

        {/* Record Button */}
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
            isProcessing && styles.recordButtonDisabled,
          ]}
          onPress={async () => {
            if (isRecording) {
              stopRecording();
            } else {
              // Check with parent if we should proceed with recording
              if (onBeforeRecord) {
                const action = await onBeforeRecord();
                if (action === 'cancel') {
                  return; // User cancelled, don't start recording
                }
                // For 'continue' or 'new', the parent will handle clearing state if needed
              }
              startRecording();
            }
          }}
          disabled={isProcessing}
        >
          <Ionicons
            name={isRecording ? 'stop' : 'mic'}
            size={48}
            color="#fff"
          />
        </TouchableOpacity>

        {/* Instruction Text */}
        <Text style={styles.instructionText}>
          {isProcessing
            ? 'Processing...'
            : isRecording
            ? 'Tap to stop recording'
            : 'Tap to start recording'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  permissionContainer: {
    alignItems: 'center',
    padding: 40,
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingContainer: {
    alignItems: 'center',
    width: '100%',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
    marginRight: 8,
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recordButtonActive: {
    backgroundColor: '#ff3b30',
  },
  recordButtonDisabled: {
    backgroundColor: '#999',
    opacity: 0.6,
  },
  instructionText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
