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

export function TranslateScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const { loadTranslateSettings, updateTranslateSettings, favoriteLanguages, loadFavoriteLanguages } = useScreenSettings();
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [tone, setTone] = useState('professional');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReProcessing, setIsReProcessing] = useState(false); // For re-translate functionality
  const [isSaving, setIsSaving] = useState(false);
  const [originalText, setOriginalTextState] = useState('');
  const [translatedText, setTranslatedTextState] = useState('');
  const [polishedText, setPolishedTextState] = useState('');
  const [appendMode, setAppendMode] = useState<'continue' | 'new'>('new'); // Track recording mode

  // Load settings from profile on first screen open
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const settings = await loadTranslateSettings();
        setSourceLanguage(settings.sourceLanguage);
        setTargetLanguage(settings.targetLanguage);
        setTone(settings.tone);
        console.log('[TranslateScreen] Loaded initial settings from profile:', settings);
      } catch (error) {
        console.error('[TranslateScreen] Failed to load initial settings:', error);
      }
    };

    loadInitialSettings();
  }, [loadTranslateSettings]);

  // Update context when user changes settings
  useEffect(() => {
    updateTranslateSettings(sourceLanguage, targetLanguage, tone);
  }, [sourceLanguage, targetLanguage, tone, updateTranslateSettings]);

  // Load editing item if present
  useEffect(() => {
    if (editingItem && editingItem.type === 'translate') {
      console.log('[TranslateScreen] Loading editing item:', editingItem);
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
    console.log('[TranslateScreen] Setting originalText to:', text);
    setOriginalTextState(text);
  };

  const setTranslatedText = (text: string) => {
    console.log('[TranslateScreen] Setting translatedText to:', text);
    setTranslatedTextState(text);
  };

  const setPolishedText = (text: string) => {
    console.log('[TranslateScreen] Setting polishedText to:', text);
    setPolishedTextState(text);
  };

  // Handle before recording - check if there's existing content and prompt user
  const handleBeforeRecord = (): Promise<'continue' | 'new' | 'cancel'> => {
    return new Promise((resolve) => {
      // Check if there's an existing record (either from editing or previous recording)
      const hasExistingContent = originalText.trim() !== '' || polishedText.trim() !== '' || translatedText.trim() !== '' || editingItem;

      if (!hasExistingContent) {
        // No existing content, proceed with new recording immediately
        setAppendMode('new');
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

  const handleRecordingComplete = async (base64Audio: string, duration: number) => {
    setIsProcessing(true);

    try {
      // Check if online first
      const isOnline = await pendingProcessor.isOnline();
      
      if (!isOnline) {
        // Only queue for later if user is authenticated
        if (isAuthenticated) {
          // OFFLINE: Queue recording for later processing
          console.log('[TranslateScreen] OFFLINE - Queueing recording for later (authenticated user)');

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
            'Your recording has been saved. It will be translated when you\'re back online. Check the Pending tab to process it.',
            [{ text: 'OK' }]
          );
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[TranslateScreen] OFFLINE - Guest user, not saving to pending');
          Alert.alert(
            'No Connection',
            'Unable to process your recording. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }
      
      // ONLINE: Process immediately
      console.log(`[DEBUG TranslateScreen] INPUT: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, duration=${duration}s, audioBase64Length=${base64Audio?.length}, appendMode=${appendMode}, isAuthenticated=${isAuthenticated}`);

      // CASE 1: Continue mode - append new audio text to existing original
      if (appendMode === 'continue' && originalText.trim()) {
        console.log('[TranslateScreen] CASE 1: Continue mode - will append new audio to existing text');
        console.log('[TranslateScreen] Existing originalText:', originalText);
        
        // Step 1: Transcribe new audio only (in source language)
        console.log(`[DEBUG TranslateScreen] CALLING transcribe: language=${sourceLanguage}, mimeType=audio/mp4, duration=${duration}`);
        const transcribeResult = await transcribeApi.transcribe(base64Audio, sourceLanguage, 'audio/mp4', duration);
        const newText = transcribeResult.originalText;
        console.log('[TranslateScreen] New transcribed text:', newText);
        
        // Step 2: Append new text to existing original
        const combinedText = originalText.trim() + ' ' + newText.trim();
        console.log('[TranslateScreen] Combined text:', combinedText);
        
        // Step 3: Translate the combined text
        console.log(`[DEBUG TranslateScreen] CALLING translateText: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, combinedTextLength=${combinedText.length}`);
        const translateResult = await translateApi.translateText(combinedText, sourceLanguage, targetLanguage, tone);
        
        setOriginalText(combinedText);
        setTranslatedText(translateResult.translatedText);
        setPolishedText(translateResult.polishedText);
        checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
        
        console.log('[TranslateScreen] CASE 1 COMPLETE - Updated with appended text');
      } else {
        // CASE: Fresh recording - start new (already cleared by handleBeforeRecord if needed)
        console.log(`[DEBUG TranslateScreen] CALLING translateBase64: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, tone=${tone}, mimeType=audio/mp4, duration=${duration}`);

        const response = await translateApi.translateBase64(
          base64Audio,
          sourceLanguage,
          targetLanguage,
          tone,
          'audio/mp4',
          duration
        );
        console.log(`[DEBUG TranslateScreen] translateBase64 RESULT: originalTextLength=${response.originalText?.length}, translatedTextLength=${response.translatedText?.length}, polishedTextLength=${response.polishedText?.length}`);
        setOriginalText(response.originalText);
        setTranslatedText(response.translatedText);
        setPolishedText(response.polishedText);
        checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      }
    } catch (error: any) {
      // If network error, queue for later (only for authenticated users)
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        if (isAuthenticated) {
          console.log('[TranslateScreen] Network error - Queueing for later (authenticated user)');
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
            console.error('[TranslateScreen] Failed to queue:', queueError);
          }
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[TranslateScreen] Network error - Guest user, not saving to pending');
          Alert.alert(
            'Connection Issue',
            'Unable to process your recording due to a network issue. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      
      console.error('Processing error:', error);
      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Error', message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-translate Handler - Re-processes edited text without new audio
  const handleReTranslate = async () => {
    if (!originalText || !originalText.trim()) {
      Alert.alert('No Text', 'Please add some text to translate');
      return;
    }

    console.log('='.repeat(60));
    console.log('[TranslateScreen] RE-TRANSLATE REQUESTED');
    console.log('[TranslateScreen] Original text to re-translate:', originalText);
    console.log('[TranslateScreen] Current settings:', {
      sourceLanguage,
      targetLanguage,
      tone,
    });

    setIsReProcessing(true);

    try {
      // Check if online first
      const isOnline = await pendingProcessor.isOnline();
      
      if (!isOnline) {
        // Only queue for later if user is authenticated
        if (isAuthenticated) {
          // OFFLINE: Queue text for later processing
          console.log('[TranslateScreen] OFFLINE - Queueing text for later (authenticated user)');

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
            'Your text has been saved. It will be translated when you\'re back online. Check the Pending tab to process it.',
            [{ text: 'OK' }]
          );
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[TranslateScreen] OFFLINE - Guest user, not saving to pending');
          Alert.alert(
            'No Connection',
            'Unable to process your text. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }
      
      const response = await translateApi.translateText(
        originalText,
        sourceLanguage,
        targetLanguage,
        tone
      );

      console.log('[TranslateScreen] Re-translate successful!');
      console.log('[TranslateScreen] New translated text:', response.translatedText);
      console.log('[TranslateScreen] New polished text:', response.polishedText);

      setTranslatedText(response.translatedText);
      setPolishedText(response.polishedText);

    } catch (error: any) {
      // If network error, queue for later (only for authenticated users)
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        if (isAuthenticated) {
          console.log('[TranslateScreen] Network error - Queueing text for later (authenticated user)');
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
            console.error('[TranslateScreen] Failed to queue:', queueError);
          }
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[TranslateScreen] Network error - Guest user, not saving to pending');
          Alert.alert(
            'Connection Issue',
            'Unable to process your text due to a network issue. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      
      console.error('[TranslateScreen] Re-translate error:', error);
      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Re-translate Error', message);
    } finally {
      setIsReProcessing(false);
      console.log('='.repeat(60));
      console.log('[TranslateScreen] RE-TRANSLATE COMPLETED');
      console.log('='.repeat(60));
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save your work');
      return;
    }

    setIsSaving(true);
    try {
      console.log('[TranslateScreen] editingItem:', editingItem ? editingItem.id : 'null');
      console.log('[TranslateScreen] originalText:', originalText);
      console.log('[TranslateScreen] translatedText:', translatedText);
      console.log('[TranslateScreen] polishedText:', polishedText);
      
      if (editingItem && editingItem.type === 'translate') {
        // UPDATE existing record (same ID)
        console.log('[TranslateScreen] 🔄 UPDATING existing record with ID:', editingItem.id);
        
        await savedItemsApi.update(editingItem.id, {
          type: 'translate',
          originalText,
          polishedText,
          translatedText,
          sourceLanguage,
          targetLanguage,
          outputFormat: tone,
        });
        
        Alert.alert('✓ Updated', 'Your changes have been saved to the same record');
        clearEditingItem();
      } else {
        // CREATE new record
        console.log('[TranslateScreen] ➕ CREATING new record');
        
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

  const handleClear = () => {
    setOriginalText('');
    setTranslatedText('');
    setPolishedText('');
    clearEditingItem(); // Clear editing state
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="language" size={24} color={THEME_COLORS.secondary} />
        </View>
        <Text style={styles.title}>Translate</Text>
        <Text style={styles.subtitle}>Speak in one language, get polished text in another</Text>
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

      <ChunkedVoiceRecorder
        type="translate"
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        outputFormat={tone}
        onBeforeRecord={handleBeforeRecord}
        onPartialResult={(originalText, resultText) => {
          console.log('[TranslateScreen] 📊 Partial result received (chunked processing)');
          console.log('[TranslateScreen] Updating UI with partial results');
          // For chunked translate: resultText is the polishedText (polished translation)
          // We don't have access to raw translatedText in chunked mode, so set both to the same
          setOriginalText(originalText);
          setPolishedText(resultText);
          setTranslatedText(resultText); // Use polished as translated for chunked mode
        }}
        onChunkedRecordingComplete={async (originalText, resultText) => {
          console.log('[TranslateScreen] ✅ Chunked recording complete');
          setOriginalText(originalText);
          setPolishedText(resultText);
          setTranslatedText(resultText); // Use polished as translated for chunked mode
          setIsProcessing(false);
        }}
        onRecordingComplete={handleRecordingComplete}
        isProcessing={isProcessing}
        enableChunkedProcessing={true}
        existingText={originalText}
      />

      {(originalText || polishedText) && (
        <ResultDisplay
          originalText={originalText}
          processedText={polishedText}
          title="Translation Result"
          onSave={isAuthenticated ? handleSave : undefined}
          onClear={handleClear}
          isSaving={isSaving}
          showTranslation
          translatedText={translatedText}
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          onOriginalTextChange={setOriginalText}
          onProcessedTextChange={setPolishedText}
          onTranslatedTextChange={setTranslatedText}
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
});
