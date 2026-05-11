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


export function PolishScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const { loadPolishSettings, updatePolishSettings, favoriteLanguages, loadFavoriteLanguages } = useScreenSettings();
  const [language, setLanguage] = useState('en');
  const [outputType, setOutputType] = useState('message');
  const [tone, setTone] = useState('professional');
  const [template, setTemplate] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReProcessing, setIsReProcessing] = useState(false); // For re-polish functionality
  const [isSaving, setIsSaving] = useState(false);
  const [originalText, setOriginalTextState] = useState('');
  const [polishedText, setPolishedTextState] = useState('');
  const [appendMode, setAppendMode] = useState<'continue' | 'new'>('new'); // Track recording mode

  // Load settings from profile on first screen open
  useEffect(() => {
    const loadInitialSettings = async () => {
      try {
        const settings = await loadPolishSettings();
        setLanguage(settings.language);
        setTone(settings.tone);
        setOutputType(settings.outputType);
        console.log('[PolishScreen] Loaded initial settings from profile:', settings);
      } catch (error) {
        console.error('[PolishScreen] Failed to load initial settings:', error);
      }
    };

    loadInitialSettings();
  }, [loadPolishSettings]);

  // Update context when user changes settings
  useEffect(() => {
    updatePolishSettings(language, tone, outputType);
  }, [language, tone, outputType, updatePolishSettings]);

  // Load editing item if present
  useEffect(() => {
    if (editingItem && editingItem.type === 'polish') {
      console.log('[PolishScreen] Loading editing item:', editingItem);
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
    console.log('[PolishScreen] Setting originalText to:', text);
    setOriginalTextState(text);
  };

  const setPolishedText = (text: string) => {
    console.log('[PolishScreen] Setting polishedText to:', text);
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

  // Handle before recording - check if there's existing content and prompt user
  const handleBeforeRecord = (): Promise<'continue' | 'new' | 'cancel'> => {
    return new Promise((resolve) => {
      // Check if there's an existing record (either from editing or previous recording)
      const hasExistingContent = originalText.trim() !== '' || polishedText.trim() !== '' || editingItem;

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
          console.log('[PolishScreen] OFFLINE - Queueing recording for later (authenticated user)');

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
            'Your recording has been saved. It will be processed when you\'re back online. Check the Pending tab to process it.',
            [{ text: 'OK' }]
          );
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[PolishScreen] OFFLINE - Guest user, not saving to pending');
          Alert.alert(
            'No Connection',
            'Unable to process your recording. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }
      
      // ONLINE: Process immediately
      console.log(`[DEBUG PolishScreen] INPUT: language=${language}, tone=${tone}, outputType=${outputType}, duration=${duration}s, audioBase64Length=${base64Audio?.length}, appendMode=${appendMode}, isAuthenticated=${isAuthenticated}`);

      // CASE 1: Continue mode - append new audio text to existing original
      if (appendMode === 'continue' && originalText.trim()) {
        console.log('[PolishScreen] CASE 1: Continue mode - will append new audio to existing text');
        console.log('[PolishScreen] Existing originalText:', originalText);
        
        // Step 1: Transcribe new audio only
        console.log(`[DEBUG PolishScreen] CALLING transcribe: language=${language}, mimeType=audio/mp4, duration=${duration}`);
        const transcribeResult = await transcribeApi.transcribe(base64Audio, language, 'audio/mp4', duration);
        const newText = transcribeResult.originalText;
        console.log('[PolishScreen] New transcribed text:', newText);
        
        // Step 2: Append new text to existing original
        const combinedText = originalText.trim() + ' ' + newText.trim();
        console.log('[PolishScreen] Combined text:', combinedText);
        
        // Step 3: Polish the combined text
        console.log(`[DEBUG PolishScreen] CALLING polishText: language=${language}, tone=${tone}, outputType=${outputType}, combinedTextLength=${combinedText.length}`);
        const polishResult = await polishApi.polishText(combinedText, language, tone, outputType);
        
        setOriginalText(combinedText);
        setPolishedText(polishResult.polishedText);
        checkTrialLimitAndWarn(transcribeResult, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
        
        console.log('[PolishScreen] CASE 1 COMPLETE - Updated with appended text');
      } else {
        // CASE: Fresh recording - start new (already cleared by handleBeforeRecord if needed)
        console.log(`[DEBUG PolishScreen] CALLING polishBase64: language=${language}, tone=${tone}, outputType=${outputType}, mimeType=audio/mp4, duration=${duration}`);

        const response = await polishApi.polishBase64(
          base64Audio,
          language,
          tone,
          outputType,
          'audio/mp4',
          duration
        );
        console.log(`[DEBUG PolishScreen] polishBase64 RESULT: originalTextLength=${response.originalText?.length}, polishedTextLength=${response.polishedText?.length}`);
        setOriginalText(response.originalText);
        setPolishedText(response.polishedText);
        checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));
      }
    } catch (error: any) {
      // If network error, queue for later (only for authenticated users)
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        if (isAuthenticated) {
          console.log('[PolishScreen] Network error - Queueing for later (authenticated user)');
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
            console.error('[PolishScreen] Failed to queue:', queueError);
          }
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[PolishScreen] Network error - Guest user, not saving to pending');
          Alert.alert(
            'Connection Issue',
            'Unable to process your recording due to a network issue. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      
      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Error', message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-polish Handler - Re-processes edited text without new audio
  const handleRePolish = async () => {
    if (!originalText || !originalText.trim()) {
      Alert.alert('No Text', 'Please add some text to polish');
      return;
    }

    console.log('='.repeat(60));
    console.log('[PolishScreen] RE-POLISH REQUESTED');
    console.log('[PolishScreen] Original text to re-polish:', originalText);
    console.log('[PolishScreen] Current settings:', {
      language,
      tone,
      outputType,
    });

    setIsReProcessing(true);

    try {
      // Check if online first
      const isOnline = await pendingProcessor.isOnline();
      
      if (!isOnline) {
        // Only queue for later if user is authenticated
        if (isAuthenticated) {
          // OFFLINE: Queue text for later processing
          console.log('[PolishScreen] OFFLINE - Queueing text for later (authenticated user)');

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
            'Your text has been saved. It will be polished when you\'re back online. Check the Pending tab to process it.',
            [{ text: 'OK' }]
          );
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[PolishScreen] OFFLINE - Guest user, not saving to pending');
          Alert.alert(
            'No Connection',
            'Unable to process your text. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }
      
      const response = await polishApi.polishText(
        originalText,
        language,
        tone,
        outputType
      );

      console.log('[PolishScreen] Re-polish successful!');
      console.log('[PolishScreen] New polished text:', response.polishedText);

      setPolishedText(response.polishedText);

    } catch (error: any) {
      // If network error, queue for later (only for authenticated users)
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        if (isAuthenticated) {
          console.log('[PolishScreen] Network error - Queueing text for later (authenticated user)');
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
            console.error('[PolishScreen] Failed to queue:', queueError);
          }
        } else {
          // Guest user: Don't save to pending, just show error
          console.log('[PolishScreen] Network error - Guest user, not saving to pending');
          Alert.alert(
            'Connection Issue',
            'Unable to process your text due to a network issue. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      
      console.error('[PolishScreen] Re-polish error:', error);
      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Re-polish Error', message);
    } finally {
      setIsReProcessing(false);
      console.log('='.repeat(60));
      console.log('[PolishScreen] RE-POLISH COMPLETED');
      console.log('='.repeat(60));
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save your work');
      return;
    }

    // CRITICAL DEBUG: Log state values RIGHT BEFORE SAVE
    console.log('='.repeat(60));
    console.log('[PolishScreen] ?? SAVE BUTTON CLICKED - STATE VALUES:');
    console.log('[PolishScreen] editingItem:', editingItem ? editingItem.id : 'null');
    console.log('[PolishScreen] originalText state:', originalText);
    console.log('[PolishScreen] polishedText state:', polishedText);
    console.log('[PolishScreen] language:', language);
    console.log('[PolishScreen] tone:', tone);
    console.log('[PolishScreen] outputType:', outputType);
    console.log('='.repeat(60));

    setIsSaving(true);
    try {
      if (editingItem && editingItem.type === 'polish') {
        // UPDATE existing record (same ID)
        console.log('[PolishScreen] ?? UPDATING existing record with ID:', editingItem.id);
        
        await savedItemsApi.update(editingItem.id, {
          type: 'polish',
          originalText,  // Current edited value
          polishedText,  // Current edited value
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });
        
        Alert.alert('? Updated', 'Your changes have been saved to the same record');
        clearEditingItem();
      } else {
        // CREATE new record
        console.log('[PolishScreen] ? CREATING new record');
        
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

  const handleClear = () => {
    setOriginalText('');
    setPolishedText('');
    clearEditingItem(); // Clear editing state
  };

  // DEBUG: Function to check current state
  const debugState = () => {
    Alert.alert(
      'Current State Values',
      `Original: "${originalText}"\n\nPolished: "${polishedText}"`,
      [{ text: 'OK' }]
    );
    console.log('[DEBUG] Current state:');
    console.log('[DEBUG] originalText:', originalText);
    console.log('[DEBUG] polishedText:', polishedText);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={24} color={THEME_COLORS.primary} />
        </View>
        <Text style={styles.title}>Polish</Text>
        <Text style={styles.subtitle}>Transform your speech into polished text</Text>
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

      <ChunkedVoiceRecorder
        type="polish"
        language={language}
        outputFormat={tone}
        outputType={outputType}
        onBeforeRecord={handleBeforeRecord}
        onPartialResult={(originalText, resultText) => {
          console.log('[PolishScreen] 📊 Partial result received');
          console.log('[PolishScreen] Updating UI with partial results');
          setOriginalText(originalText);
          setPolishedText(resultText);
        }}
        onChunkedRecordingComplete={async (originalText, resultText) => {
          console.log('[PolishScreen] ✅ Chunked recording complete');
          setOriginalText(originalText);
          setPolishedText(resultText);
          setIsProcessing(false);
        }}
        onRecordingComplete={handleRecordingComplete}
        isProcessing={isProcessing}
        enableChunkedProcessing={true}
        existingText={originalText}
      />

      {(originalText || polishedText) && (
        <>
          <TouchableOpacity onPress={debugState} style={styles.debugButton}>
            <Text style={styles.debugButtonText}>?? Debug: Check State Values</Text>
          </TouchableOpacity>
          
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
        </>
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
  debugButton: {
    backgroundColor: '#FFA500',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    alignItems: 'center',
  },
  debugButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
