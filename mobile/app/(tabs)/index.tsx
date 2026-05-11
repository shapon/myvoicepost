import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { ChunkedVoiceRecorder } from '../../src/components/ChunkedVoiceRecorder';
import { TextResultCard } from '../../src/components/TextResultCard';
import { Select } from '../../src/components/ui/Select';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { polishApi, savedItemsApi, transcribeApi } from '../../src/lib/api';
import { LANGUAGES, TONES, THEME_COLORS, OUTPUT_TYPES } from '../../src/lib/constants';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { useQueryClient } from '@tanstack/react-query';
import { useEditingSavedItem } from '../../src/contexts/EditingSavedItemContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { offlineQueue, QueueStatus } from '../../src/utils/offlineQueue';

export default function PolishScreen() {
  const { isAuthenticated } = useAuth();
  const { checkAccess, hasAccess, trial, subscription } = useSubscription();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const scrollViewRef = useRef<ScrollView>(null);
  const [language, setLanguage] = useState('none');
  const [tone, setTone] = useState('professional');
  const [outputType, setOutputType] = useState('message');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalText, setOriginalText] = useState('');
  const [polishedText, setPolishedText] = useState('');
  const [isAppendMode, setIsAppendMode] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ 
    pendingCount: 0, 
    isOnline: true, 
    isProcessing: false 
  });

  useEffect(() => {
    if (originalText || polishedText) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [originalText, polishedText]);

  // Subscribe to offline queue status
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe(setQueueStatus);
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (editingItem && editingItem.type === 'polish') {
        setLanguage(editingItem.language || 'none');
        setTone(editingItem.outputFormat || 'professional');
        setOutputType(editingItem.outputType || 'message');
        setOriginalText(editingItem.originalText || '');
        setPolishedText(editingItem.polishedText || '');
        setIsAppendMode(true);
        clearEditingItem();
      }
    }, [editingItem, clearEditingItem])
  );

  const handleRecordingComplete = async (base64Audio: string, duration: number) => {
    console.log('[Polish] ===== RECORDING COMPLETE =====');
    console.log('[Polish] Audio type: base64 string');
    console.log('[Polish] Audio length:', base64Audio.length);
    console.log('[Polish] Duration:', duration, 'seconds');

    setIsProcessing(true);

    try {
      // ========================================
      // STEP 1: CHECK NETWORK STATUS
      // ========================================
      console.log('[Polish] STEP 1: Checking network status...');
      const isOnline = await offlineQueue.isOnline();
      console.log('[Polish] Network status:', isOnline ? 'ONLINE' : 'OFFLINE');

      if (!isOnline) {
        // ========================================
        // OFFLINE - ONLY SAVE TO PENDING QUEUE IF AUTHENTICATED
        // ========================================
        if (isAuthenticated) {
          console.log('[Polish] OFFLINE - Saving to pending queue (authenticated user)...');

          // Save audio as file first
          const timestamp = Date.now();
          const permanentFilename = `polish_${timestamp}.m4a`;
          const permanentUri = `${FileSystem.documentDirectory}${permanentFilename}`;

          await FileSystem.writeAsStringAsync(permanentUri, base64Audio, {
            encoding: FileSystem.EncodingType.Base64,
          });

          await offlineQueue.saveToQueue(
            [{
              id: permanentFilename,
              uri: permanentUri,
              sessionId: `session_${timestamp}`,
              chunkIndex: 0,
              timestamp: timestamp,
            }],
            {
              type: 'polish',
              language,
              tone,
              outputType,
            }
          );

          console.log('[Polish] ✅ Saved to offline queue');

          Alert.alert(
            'Saved for Later',
            'No network available. Your recording has been saved locally and will be processed automatically when network is restored.\n\nYou can also manually process it from Saved → Pending tab.',
            [{ text: 'OK' }]
          );
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[Polish] OFFLINE - Guest user, not saving to pending queue');
          Alert.alert(
            'No Network',
            'No network available. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }

      // ========================================
      // STEP 2: ONLINE - PROCESS WITH RETRY
      // ========================================
      console.log('[Polish] STEP 2: ONLINE - Processing with retry...');

      const previousOriginalText = originalText;
      const previousPolishedText = polishedText;

      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 3000;
      let lastError: any = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
          console.log(`[Polish] ===== API ATTEMPT ${attempt}/${MAX_RETRIES + 1} =====`);
          console.log('[Polish] Language:', language);
          console.log('[Polish] Tone:', tone);
          console.log('[Polish] Output Type:', outputType);
          console.log('[Polish] Base64 length:', base64Audio.length);

          if (isAppendMode && previousOriginalText.trim()) {
            console.log('[Polish] Append mode - transcribe new audio and append to existing text');

            const transcribeResult = await transcribeApi.transcribe(base64Audio, language, 'audio/mp4', Math.round(duration));
            const newText = transcribeResult.originalText;
            console.log('[Polish] New transcribed text:', newText);

            const combinedText = previousOriginalText.trim() + ' ' + newText.trim();
            console.log('[Polish] Combined text:', combinedText);

            const polishResult = await polishApi.polishText(combinedText, language, tone, outputType);

            setOriginalText(combinedText);
            setPolishedText(polishResult.polishedText);

            console.log('[Polish] Append mode complete - Updated with appended text');
          } else {
            const response = await polishApi.polishBase64(
              base64Audio,
              language,
              tone,
              outputType,
              'audio/mp4',
              Math.round(duration)
            );

            console.log('[Polish] ===== API RESPONSE RECEIVED =====');
            console.log('[Polish] Original text length:', response.originalText?.length || 0);
            console.log('[Polish] Polished text length:', response.polishedText?.length || 0);

            setOriginalText(response.originalText || '');
            setPolishedText(response.polishedText || '');

            if (!response.originalText) {
              Alert.alert(
                'No Transcription',
                'No text was extracted from the audio. Please try recording again with clearer speech.',
                [{ text: 'OK' }]
              );
            }
          }

          succeeded = true;
          break;
        } catch (apiError: any) {
          lastError = apiError;
          console.error(`[Polish] Attempt ${attempt} failed:`, apiError.message);

          if (attempt <= MAX_RETRIES) {
            console.log(`[Polish] Retrying in ${RETRY_DELAY_MS / 1000}s... (${MAX_RETRIES - attempt + 1} retries left)`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      if (!succeeded) {
        console.error('[Polish] All attempts failed. Last error:', lastError?.message);

        if (isAuthenticated) {
          console.log('[Polish] Saving to pending queue for later retry...');

          try {
            const timestamp = Date.now();
            const permanentFilename = `polish_${timestamp}.m4a`;
            const permanentUri = `${FileSystem.documentDirectory}${permanentFilename}`;

            await FileSystem.writeAsStringAsync(permanentUri, base64Audio, {
              encoding: FileSystem.EncodingType.Base64,
            });

            await offlineQueue.saveToQueue(
              [{
                id: permanentFilename,
                uri: permanentUri,
                sessionId: `session_${timestamp}`,
                chunkIndex: 0,
                timestamp: timestamp,
              }],
              {
                type: 'polish',
                language,
                tone,
                outputType,
              }
            );

            console.log('[Polish] Saved to offline queue for retry');

            Alert.alert(
              'Saved for Later',
              'Processing failed after multiple attempts. Your recording has been saved locally and will be processed once the network issue is resolved.\n\nYou can also manually retry from Saved > Pending tab.',
              [{ text: 'OK' }]
            );
          } catch (queueError) {
            console.error('[Polish] Failed to save to queue:', queueError);
            Alert.alert(
              'Error',
              `Processing failed and could not save for retry: ${lastError?.message || 'Unknown error'}\n\nPlease try again.`,
              [{ text: 'OK' }]
            );
          }
        } else {
          Alert.alert(
            'Processing Failed',
            `Failed to process after multiple attempts: ${lastError?.message || 'Unknown error'}\n\nPlease try again.`,
            [{ text: 'OK' }]
          );
        }
      }

    } catch (error: any) {
      console.error('[Polish] ===== CRITICAL ERROR =====');
      console.error('[Polish] Error details:', error);
      console.error('[Polish] Error message:', error.message);
      console.error('[Polish] Error stack:', error.stack);
      
      Alert.alert(
        'Error',
        `Failed to save or process audio: ${error.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
      console.log('[Polish] ===== RECORDING HANDLING COMPLETE =====');
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save your work');
      return;
    }

    setIsSaving(true);
    try {
      // Check if we're editing an existing item
      if (editingItem && editingItem.id) {
        // Update existing item
        await savedItemsApi.update(editingItem.id, {
          type: 'polish',
          originalText,
          polishedText,
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });
        console.log('[Polish] Updated existing item:', editingItem.id);
        Alert.alert('Updated', 'Your polished text has been updated');
        
        // Clear editing state after successful update
        clearEditingItem();
      } else {
        // Create new item
        await savedItemsApi.save({
          type: 'polish',
          originalText,
          polishedText,
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });
        console.log('[Polish] Created new saved item');
        Alert.alert('Saved', 'Your polished text has been saved');
      }
      
      queryClient.invalidateQueries({ queryKey: ['savedItems'] });
    } catch (error: any) {
      console.error('[Polish] Save error:', error);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRePolish = async () => {
    if (!originalText) {
      Alert.alert('No Text', 'Please enter or record some text first');
      return;
    }

    Alert.alert(
      'Re-polish Text',
      'This will send your edited original text to be polished again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-polish',
          onPress: async () => {
            setIsProcessing(true);
            try {
              console.log('[Polish] Re-polishing edited text...');
              console.log('[Polish] Original text:', originalText);
              
              // Check network first for text-only operations
              const isOnline = await offlineQueue.isOnline();
              if (!isOnline) {
                setIsProcessing(false);
                Alert.alert(
                  'Network Required',
                  'Text-only re-polishing requires an active internet connection. Please connect to the internet and try again.',
                  [{ text: 'OK' }]
                );
                return;
              }
              
              // Call API to polish the text (without audio)
              const response = await polishApi.polishText(
                originalText,
                language,
                tone,
                outputType
              );

              console.log('[Polish] Re-polish response:', response);
              
              if (response.polishedText) {
                setPolishedText(response.polishedText);
                Alert.alert('Success', 'Text has been re-polished');
              } else {
                Alert.alert('No Result', 'Could not polish the text. Please try again.');
              }
            } catch (error: any) {
              console.error('[Polish] Re-polish error:', error);
              
              // Provide helpful error messages
              let errorMessage = 'Failed to re-polish text. ';
              if (error.message?.includes('Network') || error.message?.includes('network')) {
                errorMessage += 'Please check your internet connection and try again.';
              } else if (error.message?.includes('404')) {
                errorMessage += 'The server endpoint is not available. Please contact support.';
              } else {
                errorMessage += `Error: ${error.message || 'Unknown error'}. Please try again.`;
              }
              
              Alert.alert('Re-polish Failed', errorMessage, [{ text: 'OK' }]);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleClear = () => {
    setOriginalText('');
    setPolishedText('');
    setIsAppendMode(false);
  };

  // Handle before recording - check if there's existing content and prompt user
  const handleBeforeRecord = async (): Promise<'continue' | 'new' | 'cancel'> => {
    // ========================================
    // STEP 1: CHECK ACCESS (FOR AUTHENTICATED USERS)
    // ========================================
    if (isAuthenticated) {
      console.log('[Polish] Checking access before recording...');
      try {
        const hasRecordingAccess = await checkAccess();

        if (!hasRecordingAccess) {
          console.log('[Polish] Access denied - no active trial or subscription');

          // Show appropriate alert based on status
          if (trial?.status === 'expired') {
            Alert.alert(
              'Trial Expired',
              'Your 7-day trial has ended. Please subscribe to continue recording.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'View Plans',
                  onPress: () => router.push('/(tabs)/subscription')
                }
              ]
            );
          } else if (subscription?.status === 'pending_payment') {
            Alert.alert(
              'Payment Required',
              'Please complete payment to continue recording.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Subscribe',
                  onPress: () => router.push('/(tabs)/subscription')
                }
              ]
            );
          } else {
            Alert.alert(
              'Subscription Required',
              'Please subscribe to start recording.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'View Plans',
                  onPress: () => router.push('/(tabs)/subscription')
                }
              ]
            );
          }

          return 'cancel';
        }

        console.log('[Polish] Access granted - proceeding with recording');
      } catch (error) {
        console.error('[Polish] Error checking access:', error);
        Alert.alert('Error', 'Unable to verify access. Please try again.');
        return 'cancel';
      }
    }

    // ========================================
    // STEP 2: CHECK FOR EXISTING CONTENT
    // ========================================
    return new Promise((resolve) => {
      // Check if there's an existing record (either from editing or previous recording)
      const hasExistingContent = originalText.trim() !== '' || polishedText.trim() !== '';

      if (!hasExistingContent) {
        // No existing content, proceed with new recording immediately
        setIsAppendMode(false);
        resolve('new');
        return;
      }

      // There's existing content, prompt user
      Alert.alert(
        'Existing Content Detected',
        'Should I append this new recording to the current one or start a fresh session?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve('cancel'),
          },
          {
            text: 'New',
            style: 'destructive',
            onPress: () => {
              // Clear existing content for fresh session
              setOriginalText('');
              setPolishedText('');
              setIsAppendMode(false);
              resolve('new');
            },
          },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              setIsAppendMode(true);
              resolve('continue');
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') }
      );
    });
  };

  // Chunked recording handlers for background processing
  const handleChunkedRecordingComplete = async (finalOriginalText: string, finalPolishedText: string) => {
    console.log('[Polish] Chunked recording complete');
    console.log('[Polish] Final original text:', finalOriginalText?.substring(0, 100));
    console.log('[Polish] Final polished text:', finalPolishedText?.substring(0, 100));

    // If in append mode, combine with existing text
    if (isAppendMode && originalText.trim()) {
      const combinedOriginal = originalText.trim() + ' ' + finalOriginalText.trim();

      // Re-polish the combined text
      setIsProcessing(true);
      try {
        const isOnline = await offlineQueue.isOnline();
        if (!isOnline) {
          // Offline: just append without re-polishing
          setOriginalText(combinedOriginal);
          setPolishedText(polishedText.trim() + ' ' + finalPolishedText.trim());
        } else {
          // Online: re-polish combined text
          const result = await polishApi.polishText(combinedOriginal, language, tone, outputType);
          setOriginalText(combinedOriginal);
          setPolishedText(result.polishedText);
        }
      } catch (error) {
        console.error('[Polish] Failed to polish combined text:', error);
        // Still show what we have
        setOriginalText(combinedOriginal);
        setPolishedText(polishedText.trim() + ' ' + finalPolishedText.trim());
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Not in append mode: check we actually have content before displaying
      if (!finalOriginalText && !finalPolishedText) {
        Alert.alert(
          'No Text Detected',
          'Could not transcribe the recording. Please speak more clearly and try again.',
          [{ text: 'OK' }]
        );
        return;
      }
      setOriginalText(finalOriginalText);
      setPolishedText(finalPolishedText);
    }
  };

  const handlePartialResult = (partialOriginal: string, partialResult: string) => {
    console.log('[Polish] Partial result received during background processing');

    // In append mode, show combined preview
    if (isAppendMode && originalText.trim()) {
      const combinedPreview = originalText.trim() + ' [NEW] ' + partialOriginal.trim();
      setOriginalText(combinedPreview);
    } else {
      setOriginalText(partialOriginal);
    }
    setPolishedText(partialResult);
  };

  const languageOptions = [
    { value: 'none', label: 'Auto-detect' },
    ...LANGUAGES.map((lang) => ({
      value: lang.code,
      label: lang.name,
    })),
  ];

  const toneOptions = TONES.map((t) => ({
    value: t.value,
    label: t.label,
    icon: t.icon,
  }));

  const outputTypeOptions = [
    { value: 'message', label: 'Message', icon: 'chatbubble-outline' as const },
    { value: 'email', label: 'Email', icon: 'mail-outline' as const },
    { value: 'post', label: 'Post', icon: 'document-text-outline' as const },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scrollViewRef} style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={24} color={THEME_COLORS.primary} />
          </View>
          <Text style={styles.title}>Polish</Text>
          <Text style={styles.subtitle}>Transform your speech into polished, professional text</Text>
          {(originalText || polishedText) && (
            <TouchableOpacity
              style={styles.clearHeaderButton}
              onPress={handleClear}
              data-testid="button-clear-polish"
            >
              <Ionicons name="refresh" size={16} color={THEME_COLORS.primary} />
              <Text style={styles.clearHeaderButtonText}>New Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {queueStatus.pendingCount > 0 && (
          <Card style={styles.offlineCard}>
            <View style={styles.offlineContent}>
              <Ionicons 
                name={queueStatus.isOnline ? "cloud-upload-outline" : "cloud-offline-outline"} 
                size={24} 
                color={queueStatus.isOnline ? THEME_COLORS.warning : THEME_COLORS.textMuted} 
              />
              <View style={styles.offlineText}>
                <Text style={styles.offlineTitle}>
                  {queueStatus.pendingCount} recording{queueStatus.pendingCount > 1 ? 's' : ''} pending
                </Text>
                <Text style={styles.offlineSubtitle}>
                  {queueStatus.isOnline 
                    ? 'Will auto-process when ready. Go to Saved → Pending to process now' 
                    : 'Saved offline - will process when online'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        <Card style={styles.settingsCard}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <Select
            label="Language"
            value={language}
            options={languageOptions}
            onChange={setLanguage}
          />

          <Select
            label="Tone"
            value={tone}
            options={toneOptions}
            onChange={setTone}
          />

          <Select
            label="Output Type"
            value={outputType}
            options={outputTypeOptions}
            onChange={setOutputType}
          />
        </Card>

        {isProcessing && (
          <Card style={styles.processingCard}>
            <View style={styles.processingContent}>
              <ActivityIndicator size="large" color={THEME_COLORS.primary} />
              <Text style={styles.processingText}>
                Processing your audio...
              </Text>
            </View>
          </Card>
        )}

        <ChunkedVoiceRecorder
          type="polish"
          language={language}
          outputFormat={tone}
          outputType={outputType}
          onRecordingComplete={handleRecordingComplete}
          onChunkedRecordingComplete={handleChunkedRecordingComplete}
          onPartialResult={handlePartialResult}
          onBeforeRecord={handleBeforeRecord}
          existingText={isAppendMode ? originalText : ''}
          isProcessing={isProcessing}
          enableChunkedProcessing={true}
          maxDuration={600} // 10 minutes max for authenticated users
        />

        {originalText ? (
          <TextResultCard
            text={originalText}
            label="Original"
            icon="document-text-outline"
            accentColor={THEME_COLORS.textSecondary}
            language={language}
            editable={isAuthenticated}
            onTextChange={setOriginalText}
            showPlay
            showCopy
            showShare
            showSave={false}
            showImageGen={false}
            isAuthenticated={isAuthenticated}
          />
        ) : null}

        {originalText && polishedText ? (
          <View style={styles.rePolishContainer}>
            <Button
              title={isProcessing ? 'Re-polishing...' : 'Re-polish'}
              onPress={handleRePolish}
              variant="secondary"
              size="sm"
              loading={isProcessing}
              disabled={isProcessing || !originalText}
              icon={<Ionicons name="sparkles" size={16} color={THEME_COLORS.primary} />}
            />
            <Text style={styles.rePolishHint}>
              Edit the text above and tap to polish it again
            </Text>
          </View>
        ) : null}

        {polishedText ? (
          <TextResultCard
            text={polishedText}
            label="Polished"
            icon="sparkles"
            accentColor={THEME_COLORS.primary}
            language={language}
            editable={isAuthenticated}
            onTextChange={setPolishedText}
            showPlay
            showCopy
            showShare
            showSave={isAuthenticated}
            showImageGen={isAuthenticated}
            onSave={handleSave}
            isSaving={isSaving}
            isAuthenticated={isAuthenticated}
            highlight
          />
        ) : null}

        {(originalText || polishedText) && (
          <View style={styles.bottomClearContainer}>
            <TouchableOpacity
              style={styles.clearHeaderButton}
              onPress={handleClear}
              data-testid="button-clear-polish-bottom"
            >
              <Ionicons name="refresh" size={16} color={THEME_COLORS.primary} />
              <Text style={styles.clearHeaderButtonText}>New Recording</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: THEME_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
  },
  clearHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME_COLORS.primary,
    backgroundColor: 'transparent',
  },
  clearHeaderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },
  bottomClearContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  settingsCard: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 16,
  },
  processingCard: {
    marginBottom: 24,
  },
  processingContent: {
    alignItems: 'center',
    padding: 16,
  },
  processingText: {
    marginTop: 12,
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  offlineCard: {
    marginBottom: 16,
    backgroundColor: THEME_COLORS.surface,
    borderLeftWidth: 4,
    borderLeftColor: THEME_COLORS.warning,
  },
  offlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offlineText: {
    flex: 1,
  },
  offlineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  offlineSubtitle: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
  },
  rePolishContainer: {
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  rePolishHint: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 6,
  },
});
