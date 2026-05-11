/**
 * TranslateScreenChunked
 *
 * Enhanced Translate Screen with chunked background audio processing support.
 * Automatically handles long recordings (> 60s) by processing audio in chunks
 * while recording continues.
 */

import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChunkedVoiceRecorder } from '../components/ChunkedVoiceRecorder';
import { ResultDisplay } from '../components/ResultDisplay';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { translateApi, savedItemsApi, transcribeApi } from '../lib/api';
import { offlineApi, showSaveResultAlert } from '../utils/offlineApiWrapper';
import { pendingProcessor } from '../utils/pendingProcessor';
import { LANGUAGES, TONES, THEME_COLORS } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useEditingSavedItem } from '../contexts/EditingSavedItemContext';
import { useScreenSettings } from '../contexts/ScreenSettingsContext';
import { handleApiError, getUserFriendlyMessage } from '../utils/errorHandler';
import { checkTrialLimitAndWarn } from '../utils/trialLimitChecker';
import { useNavigation } from '@react-navigation/native';

export function TranslateScreenChunked() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const { favoriteLanguages, loadFavoriteLanguages } = useScreenSettings();

  // Settings
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [tone, setTone] = useState('professional');

  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReProcessing, setIsReProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Text states
  const [originalText, setOriginalTextState] = useState('');
  const [translatedText, setTranslatedTextState] = useState('');
  const [polishedText, setPolishedTextState] = useState('');
  const [appendMode, setAppendMode] = useState<'continue' | 'new'>('new');

  // Chunked recording progress
  const [isChunkedRecording, setIsChunkedRecording] = useState(false);

  // Load editing item if present
  useEffect(() => {
    if (editingItem && editingItem.type === 'translate') {
      console.log('[TranslateScreenChunked] Loading editing item:', editingItem);
      setOriginalText(editingItem.originalText);
      setPolishedText(editingItem.polishedText);
      setTranslatedText(editingItem.translatedText || '');
      setSourceLanguage(editingItem.sourceLanguage);
      if (editingItem.targetLanguage) {
        setTargetLanguage(editingItem.targetLanguage);
      }
      setTone(editingItem.outputFormat);
    }
  }, [editingItem]);

  // Wrapped setters with logging
  const setOriginalText = (text: string) => {
    console.log('[TranslateScreenChunked] Setting originalText to:', text?.substring(0, 50));
    setOriginalTextState(text);
  };

  const setTranslatedText = (text: string) => {
    console.log('[TranslateScreenChunked] Setting translatedText to:', text?.substring(0, 50));
    setTranslatedTextState(text);
  };

  const setPolishedText = (text: string) => {
    console.log('[TranslateScreenChunked] Setting polishedText to:', text?.substring(0, 50));
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

  const toneOptions = TONES.map((t) => ({
    value: t.value,
    label: t.label,
    icon: t.icon,
  }));

  /**
   * Handle before recording - check if there's existing content
   */
  const handleBeforeRecord = (): Promise<'continue' | 'new' | 'cancel'> => {
    return new Promise((resolve) => {
      const hasExistingContent = originalText.trim() !== '' || polishedText.trim() !== '' || translatedText.trim() !== '' || editingItem;

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
              setTranslatedText('');
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
  const handleChunkedRecordingComplete = async (finalOriginalText: string, finalTranslatedText: string) => {
    console.log('[TranslateScreenChunked] Chunked recording complete');
    console.log('[TranslateScreenChunked] Original:', finalOriginalText?.substring(0, 100));
    console.log('[TranslateScreenChunked] Translated:', finalTranslatedText?.substring(0, 100));

    // If in continue mode, append to existing text
    if (appendMode === 'continue' && originalText.trim()) {
      const combinedOriginal = originalText.trim() + ' ' + finalOriginalText.trim();

      // Re-translate the combined text
      setIsProcessing(true);
      try {
        const result = await translateApi.translateText(combinedOriginal, sourceLanguage, targetLanguage, tone);
        setOriginalText(combinedOriginal);
        setTranslatedText(result.translatedText);
        setPolishedText(result.polishedText);
      } catch (error) {
        console.error('[TranslateScreenChunked] Failed to translate combined text:', error);
        // Still show what we have
        setOriginalText(combinedOriginal);
        setTranslatedText(finalTranslatedText);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setOriginalText(finalOriginalText);
      setTranslatedText(finalTranslatedText);
    }

    setIsChunkedRecording(false);
  };

  /**
   * Handle partial results during chunked recording
   */
  const handlePartialResult = (partialOriginal: string, partialResult: string) => {
    console.log('[TranslateScreenChunked] Partial result received');

    // In continue mode, show combined preview
    if (appendMode === 'continue' && originalText.trim()) {
      const combinedPreview = originalText.trim() + ' [NEW] ' + partialOriginal.trim();
      setOriginalText(combinedPreview);
    } else {
      setOriginalText(partialOriginal);
    }
    setTranslatedText(partialResult);
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
        console.log('[TranslateScreenChunked] OFFLINE - Queueing recording');

        await pendingProcessor.addAudioItem({
          type: 'translate',
          base64Audio,
          sourceLanguage,
          targetLanguage,
          outputFormat: tone,
          autoSave: isAuthenticated,
        });

        Alert.alert(
          'Saved for Later',
          'Your recording has been saved. It will be translated when you\'re back online.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Handle continue mode
      console.log(`[DEBUG TranslateScreenChunked] INPUT: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, duration=${duration}s, audioBase64Length=${base64Audio?.length}, appendMode=${appendMode}, isAuthenticated=${isAuthenticated}`);

      if (appendMode === 'continue' && originalText.trim()) {
        console.log(`[DEBUG TranslateScreenChunked] CALLING transcribe (continue): language=${sourceLanguage}, duration=${duration}`);
        const transcribeResult = await transcribeApi.transcribe(base64Audio, sourceLanguage, 'audio/mp4', duration);
        const newText = transcribeResult.originalText;
        const combinedText = originalText.trim() + ' ' + newText.trim();

        console.log(`[DEBUG TranslateScreenChunked] CALLING translateText: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, combinedTextLength=${combinedText.length}`);
        const translateResult = await translateApi.translateText(combinedText, sourceLanguage, targetLanguage, tone);

        setOriginalText(combinedText);
        setTranslatedText(translateResult.translatedText);
        setPolishedText(translateResult.polishedText);
        checkTrialLimitAndWarn(transcribeResult, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      } else {
        console.log(`[DEBUG TranslateScreenChunked] CALLING translateBase64: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, duration=${duration}`);
        const response = await translateApi.translateBase64(
          base64Audio,
          sourceLanguage,
          targetLanguage,
          tone,
          'audio/mp4',
          duration
        );
        console.log(`[DEBUG TranslateScreenChunked] translateBase64 RESULT: originalTextLength=${response.originalText?.length}, translatedTextLength=${response.translatedText?.length}, polishedTextLength=${response.polishedText?.length}`);
        setOriginalText(response.originalText);
        setTranslatedText(response.translatedText);
        setPolishedText(response.polishedText);
        checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      }
    } catch (error: any) {
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        try {
          await pendingProcessor.addAudioItem({
            type: 'translate',
            base64Audio,
            sourceLanguage,
            targetLanguage,
            outputFormat: tone,
            autoSave: isAuthenticated,
          });
          Alert.alert(
            'Connection Issue',
            'Your recording has been saved and will be translated when connection is restored.',
            [{ text: 'OK' }]
          );
          return;
        } catch (queueError) {
          console.error('[TranslateScreenChunked] Failed to queue:', queueError);
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
   * Re-translate edited text
   */
  const handleReTranslate = async () => {
    if (!originalText || !originalText.trim()) {
      Alert.alert('No Text', 'Please add some text to translate');
      return;
    }

    setIsReProcessing(true);

    try {
      const isOnline = await pendingProcessor.isOnline();

      if (!isOnline) {
        await pendingProcessor.addTextItem({
          type: 'translate',
          originalText,
          sourceLanguage,
          targetLanguage,
          outputFormat: tone,
          autoSave: isAuthenticated,
        });

        Alert.alert(
          'Saved for Later',
          'Your text has been saved. It will be translated when you\'re back online.',
          [{ text: 'OK' }]
        );
        return;
      }

      const response = await translateApi.translateText(
        originalText,
        sourceLanguage,
        targetLanguage,
        tone
      );

      setTranslatedText(response.translatedText);
      setPolishedText(response.polishedText);

    } catch (error: any) {
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        try {
          await pendingProcessor.addTextItem({
            type: 'translate',
            originalText,
            sourceLanguage,
            targetLanguage,
            outputFormat: tone,
            autoSave: isAuthenticated,
          });
          Alert.alert(
            'Connection Issue',
            'Your text has been saved and will be translated when connection is restored.',
            [{ text: 'OK' }]
          );
          return;
        } catch (queueError) {
          console.error('[TranslateScreenChunked] Failed to queue:', queueError);
        }
      }

      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Re-translate Error', message);
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
      if (editingItem && editingItem.type === 'translate') {
        await savedItemsApi.update(editingItem.id, {
          type: 'translate',
          originalText,
          polishedText,
          translatedText,
          sourceLanguage,
          targetLanguage,
          outputFormat: tone,
        });

        Alert.alert('✓ Updated', 'Your changes have been saved');
        clearEditingItem();
      } else {
        const result = await offlineApi.saveItem({
          type: 'translate',
          originalText,
          polishedText,
          translatedText,
          sourceLanguage,
          targetLanguage,
          outputFormat: tone,
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
    setTranslatedText('');
    setPolishedText('');
    clearEditingItem();
    setAppendMode('new');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="language" size={24} color={THEME_COLORS.secondary} />
        </View>
        <Text style={styles.title}>Translate</Text>
        <Text style={styles.subtitle}>Speak in one language, get polished text in another</Text>
        {isChunkedRecording && (
          <View style={styles.chunkedBadge}>
            <Text style={styles.chunkedBadgeText}>📊 Processing chunks in background...</Text>
          </View>
        )}
      </View>

      <Card style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <Select
          label="Source Language"
          value={sourceLanguage}
          options={languageOptions}
          onChange={setSourceLanguage}
        />

        <Select
          label="Target Language"
          value={targetLanguage}
          options={languageOptions}
          onChange={setTargetLanguage}
        />

        <Select
          label="Tone"
          value={tone}
          options={toneOptions}
          onChange={setTone}
        />
      </Card>

      {/* Chunked Voice Recorder with background processing */}
      <ChunkedVoiceRecorder
        type="translate"
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        outputFormat={tone}
        onRecordingComplete={handleRecordingComplete}
        onChunkedRecordingComplete={handleChunkedRecordingComplete}
        onPartialResult={handlePartialResult}
        onBeforeRecord={handleBeforeRecord}
        existingText={appendMode === 'continue' ? originalText : ''}
        isProcessing={isProcessing}
        enableChunkedProcessing={true}
        maxDuration={600} // 10 minutes max
      />

      {(originalText || translatedText) && (
        <ResultDisplay
          originalText={originalText}
          processedText={translatedText}
          title="Translated Result"
          onSave={isAuthenticated ? handleSave : undefined}
          onClear={handleClear}
          isSaving={isSaving}
          onOriginalTextChange={setOriginalText}
          onProcessedTextChange={setTranslatedText}
          onReProcess={handleReTranslate}
          isProcessing={isReProcessing}
          reProcessButtonText="Re-translate Edited Text"
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
    backgroundColor: THEME_COLORS.secondaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chunkedBadgeText: {
    color: THEME_COLORS.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default TranslateScreenChunked;
