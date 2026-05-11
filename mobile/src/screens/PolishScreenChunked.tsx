/**
 * PolishScreenChunked
 *
 * Enhanced Polish Screen with chunked background audio processing support.
 * Automatically handles long recordings (> 60s) by processing audio in chunks
 * while recording continues.
 */

import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChunkedVoiceRecorder } from '../components/ChunkedVoiceRecorder';
import { ResultDisplay } from '../components/ResultDisplay';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { polishApi, savedItemsApi, transcribeApi } from '../lib/api';
import { offlineApi, showSaveResultAlert } from '../utils/offlineApiWrapper';
import { pendingProcessor } from '../utils/pendingProcessor';
import { LANGUAGES, OUTPUT_TYPES, TONES, TEMPLATES, THEME_COLORS } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useEditingSavedItem } from '../contexts/EditingSavedItemContext';
import { useScreenSettings } from '../contexts/ScreenSettingsContext';
import { handleApiError, getUserFriendlyMessage } from '../utils/errorHandler';
import { checkTrialLimitAndWarn } from '../utils/trialLimitChecker';
import { useNavigation } from '@react-navigation/native';

export function PolishScreenChunked() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const { favoriteLanguages, loadFavoriteLanguages } = useScreenSettings();

  // Settings
  const [language, setLanguage] = useState('en');
  const [outputType, setOutputType] = useState('message');
  const [tone, setTone] = useState('professional');
  const [template, setTemplate] = useState('none');

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReProcessing, setIsReProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Text states
  const [originalText, setOriginalTextState] = useState('');
  const [polishedText, setPolishedTextState] = useState('');
  const [appendMode, setAppendMode] = useState<'continue' | 'new'>('new');

  // Chunked recording progress
  const [isChunkedRecording, setIsChunkedRecording] = useState(false);
  const [chunkedProgress, setChunkedProgress] = useState({ chunks: 0, processed: 0 });

  // Load editing item if present
  useEffect(() => {
    if (editingItem && editingItem.type === 'polish') {
      console.log('[PolishScreenChunked] Loading editing item:', editingItem);
      setOriginalText(editingItem.originalText);
      setPolishedText(editingItem.polishedText);
      setLanguage(editingItem.sourceLanguage);
      setTone(editingItem.outputFormat);
      if (editingItem.outputType) {
        setOutputType(editingItem.outputType);
      }
    }
  }, [editingItem]);

  // Wrapped setters with logging
  const setOriginalText = (text: string) => {
    console.log('[PolishScreenChunked] Setting originalText to:', text?.substring(0, 50));
    setOriginalTextState(text);
  };

  const setPolishedText = (text: string) => {
    console.log('[PolishScreenChunked] Setting polishedText to:', text?.substring(0, 50));
    setPolishedTextState(text);
  };

  useEffect(() => {
    loadFavoriteLanguages();
  }, []);

  const languageOptions = useMemo(
    () => LANGUAGES.filter(l => favoriteLanguages.includes(l.code)).map((lang) => ({
      value: lang.code,
      label: `${lang.flag} ${lang.name}`,
    })),
    [favoriteLanguages]
  );

  const outputTypeOptions = useMemo(
    () => OUTPUT_TYPES.map((type) => ({
      value: type.value,
      label: type.label,
      icon: type.icon,
    })),
    []
  );

  const toneOptions = useMemo(
    () => TONES.map((t) => ({
      value: t.value,
      label: t.label,
      icon: t.icon,
    })),
    []
  );

  const templateOptions = useMemo(
    () => TEMPLATES.map((t) => ({
      value: t.value,
      label: t.label,
    })),
    []
  );

  /**
   * Handle before recording - check if there's existing content
   */
  const handleBeforeRecord = (): Promise<'continue' | 'new' | 'cancel'> => {
    return new Promise((resolve) => {
      const hasExistingContent = originalText.trim() !== '' || polishedText.trim() !== '' || editingItem;

      if (!hasExistingContent) {
        setAppendMode('new');
        resolve('new');
        return;
      }

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
              setOriginalText('');
              setPolishedText('');
              clearEditingItem();
              setAppendMode('new');
              resolve('new');
            },
          },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              setAppendMode('continue');
              resolve('continue');
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') }
      );
    });
  };

  /**
   * Handle chunked recording completion
   */
  const handleChunkedRecordingComplete = async (finalOriginalText: string, finalPolishedText: string) => {
    console.log('[PolishScreenChunked] Chunked recording complete');
    console.log('[PolishScreenChunked] Original:', finalOriginalText?.substring(0, 100));
    console.log('[PolishScreenChunked] Polished:', finalPolishedText?.substring(0, 100));

    // If in continue mode, append to existing text
    if (appendMode === 'continue' && originalText.trim()) {
      const combinedOriginal = originalText.trim() + ' ' + finalOriginalText.trim();

      // Re-polish the combined text
      setIsProcessing(true);
      try {
        const result = await polishApi.polishText(combinedOriginal, language, tone, outputType);
        setOriginalText(combinedOriginal);
        setPolishedText(result.polishedText);
      } catch (error) {
        console.error('[PolishScreenChunked] Failed to polish combined text:', error);
        // Still show what we have
        setOriginalText(combinedOriginal);
        setPolishedText(finalPolishedText);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setOriginalText(finalOriginalText);
      setPolishedText(finalPolishedText);
    }

    setIsChunkedRecording(false);
  };

  /**
   * Handle partial results during chunked recording
   */
  const handlePartialResult = (partialOriginal: string, partialResult: string) => {
    console.log('[PolishScreenChunked] Partial result received');

    // In continue mode, show combined preview
    if (appendMode === 'continue' && originalText.trim()) {
      const combinedPreview = originalText.trim() + ' [NEW] ' + partialOriginal.trim();
      setOriginalText(combinedPreview);
    } else {
      setOriginalText(partialOriginal);
    }
    setPolishedText(partialResult);
    setIsChunkedRecording(true);
  };

  /**
   * Handle traditional short recording completion (fallback)
   */
  const handleRecordingComplete = async (base64Audio: string, duration: number) => {
    setIsProcessing(true);

    try {
      const isOnline = await pendingProcessor.isOnline();

      if (!isOnline) {
        console.log('[PolishScreenChunked] OFFLINE - Queueing recording');

        await pendingProcessor.addAudioItem({
          type: 'polish',
          base64Audio,
          language,
          outputFormat: tone,
          outputType,
          autoSave: isAuthenticated,
        });

        Alert.alert(
          'Saved for Later',
          'Your recording has been saved. It will be processed when you\'re back online.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Handle continue mode
      console.log(`[DEBUG PolishScreenChunked] INPUT: language=${language}, tone=${tone}, outputType=${outputType}, duration=${duration}s, audioBase64Length=${base64Audio?.length}, appendMode=${appendMode}, isAuthenticated=${isAuthenticated}`);

      if (appendMode === 'continue' && originalText.trim()) {
        console.log(`[DEBUG PolishScreenChunked] CALLING transcribe (continue): language=${language}, duration=${duration}`);
        const transcribeResult = await transcribeApi.transcribe(base64Audio, language, 'audio/mp4', duration);
        const newText = transcribeResult.originalText;
        const combinedText = originalText.trim() + ' ' + newText.trim();

        console.log(`[DEBUG PolishScreenChunked] CALLING polishText: language=${language}, tone=${tone}, outputType=${outputType}, combinedTextLength=${combinedText.length}`);
        const polishResult = await polishApi.polishText(combinedText, language, tone, outputType);

        setOriginalText(combinedText);
        setPolishedText(polishResult.polishedText);
        checkTrialLimitAndWarn(transcribeResult, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      } else {
        console.log(`[DEBUG PolishScreenChunked] CALLING polishBase64: language=${language}, tone=${tone}, outputType=${outputType}, duration=${duration}`);
        const response = await polishApi.polishBase64(
          base64Audio,
          language,
          tone,
          outputType,
          'audio/mp4',
          duration
        );
        console.log(`[DEBUG PolishScreenChunked] polishBase64 RESULT: originalTextLength=${response.originalText?.length}, polishedTextLength=${response.polishedText?.length}`);
        setOriginalText(response.originalText);
        setPolishedText(response.polishedText);
        checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      }
    } catch (error: any) {
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        try {
          await pendingProcessor.addAudioItem({
            type: 'polish',
            base64Audio,
            language,
            outputFormat: tone,
            outputType,
            autoSave: isAuthenticated,
          });
          Alert.alert(
            'Connection Issue',
            'Your recording has been saved and will be processed when connection is restored.',
            [{ text: 'OK' }]
          );
          return;
        } catch (queueError) {
          console.error('[PolishScreenChunked] Failed to queue:', queueError);
        }
      }

      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Error', message);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Re-polish edited text
   */
  const handleRePolish = async () => {
    if (!originalText || !originalText.trim()) {
      Alert.alert('No Text', 'Please add some text to polish');
      return;
    }

    setIsReProcessing(true);

    try {
      const isOnline = await pendingProcessor.isOnline();

      if (!isOnline) {
        await pendingProcessor.addTextItem({
          type: 'polish',
          originalText,
          language,
          outputFormat: tone,
          outputType,
          autoSave: isAuthenticated,
        });

        Alert.alert(
          'Saved for Later',
          'Your text has been saved. It will be polished when you\'re back online.',
          [{ text: 'OK' }]
        );
        return;
      }

      const response = await polishApi.polishText(
        originalText,
        language,
        tone,
        outputType
      );

      setPolishedText(response.polishedText);

    } catch (error: any) {
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        try {
          await pendingProcessor.addTextItem({
            type: 'polish',
            originalText,
            language,
            outputFormat: tone,
            outputType,
            autoSave: isAuthenticated,
          });
          Alert.alert(
            'Connection Issue',
            'Your text has been saved and will be polished when connection is restored.',
            [{ text: 'OK' }]
          );
          return;
        } catch (queueError) {
          console.error('[PolishScreenChunked] Failed to queue:', queueError);
        }
      }

      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Re-polish Error', message);
    } finally {
      setIsReProcessing(false);
    }
  };

  /**
   * Save the result
   */
  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save your work');
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem && editingItem.type === 'polish') {
        await savedItemsApi.update(editingItem.id, {
          type: 'polish',
          originalText,
          polishedText,
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });

        Alert.alert('✓ Updated', 'Your changes have been saved');
        clearEditingItem();
      } else {
        const result = await offlineApi.saveItem({
          type: 'polish',
          originalText,
          polishedText,
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });

        showSaveResultAlert(result);
      }
    } catch (error) {
      const apiError = handleApiError(error);
      Alert.alert('Error', getUserFriendlyMessage(apiError));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Clear all content
   */
  const handleClear = () => {
    setOriginalText('');
    setPolishedText('');
    clearEditingItem();
    setAppendMode('new');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={24} color={THEME_COLORS.primary} />
        </View>
        <Text style={styles.title}>Polish</Text>
        <Text style={styles.subtitle}>Transform your speech into polished text</Text>
        {isChunkedRecording && (
          <View style={styles.chunkedBadge}>
            <Text style={styles.chunkedBadgeText}>📊 Processing chunks in background...</Text>
          </View>
        )}
      </View>

      <Card style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <Select
          label="Language"
          value={language}
          options={languageOptions}
          onChange={setLanguage}
        />

        <Select
          label="Output Type"
          value={outputType}
          options={outputTypeOptions}
          onChange={setOutputType}
        />

        <Select
          label="Tone"
          value={tone}
          options={toneOptions}
          onChange={setTone}
        />

        <Select
          label="Template"
          value={template}
          options={templateOptions}
          onChange={setTemplate}
        />
      </Card>

      {/* Chunked Voice Recorder with background processing */}
      <ChunkedVoiceRecorder
        type="polish"
        language={language}
        outputFormat={tone}
        outputType={outputType}
        onRecordingComplete={handleRecordingComplete}
        onChunkedRecordingComplete={handleChunkedRecordingComplete}
        onPartialResult={handlePartialResult}
        onBeforeRecord={handleBeforeRecord}
        existingText={appendMode === 'continue' ? originalText : ''}
        isProcessing={isProcessing}
        enableChunkedProcessing={true}
        maxDuration={600} // 10 minutes max
      />

      {(originalText || polishedText) && (
        <ResultDisplay
          originalText={originalText}
          processedText={polishedText}
          title="Polished Result"
          onSave={isAuthenticated ? handleSave : undefined}
          onClear={handleClear}
          isSaving={isSaving}
          onOriginalTextChange={setOriginalText}
          onProcessedTextChange={setPolishedText}
          onReProcess={handleRePolish}
          isProcessing={isReProcessing}
          reProcessButtonText="Re-polish Edited Text"
          editable={isAuthenticated}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
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
  settingsCard: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 16,
  },
  chunkedBadge: {
    marginTop: 8,
    backgroundColor: THEME_COLORS.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chunkedBadgeText: {
    color: THEME_COLORS.primary,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default PolishScreenChunked;
