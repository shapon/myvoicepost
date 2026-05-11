import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { ContinuousVoiceRecorder } from '../components/ContinuousVoiceRecorder';
import { ResultDisplay } from '../components/ResultDisplay';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { polishApi, savedItemsApi } from '../lib/api';
import { offlineApi, showSaveResultAlert } from '../utils/offlineApiWrapper';
import { LANGUAGES, OUTPUT_TYPES, TONES, TEMPLATES, THEME_COLORS } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useEditingSavedItem } from '../contexts/EditingSavedItemContext';
import { useScreenSettings } from '../contexts/ScreenSettingsContext';
import { handleApiError, getUserFriendlyMessage } from '../utils/errorHandler';
import { checkTrialLimitAndWarn } from '../utils/trialLimitChecker';
import { useNavigation } from '@react-navigation/native';

interface AudioChunk {
  id: string;
  uri: string;
  duration: number;
  timestamp: number;
}

export function PolishScreen() {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { editingItem, clearEditingItem } = useEditingSavedItem();
  const { favoriteLanguages, loadFavoriteLanguages } = useScreenSettings();
  const [language, setLanguage] = useState('en');
  const [outputType, setOutputType] = useState('message');
  const [tone, setTone] = useState('professional');
  const [template, setTemplate] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalText, setOriginalTextState] = useState('');
  const [polishedText, setPolishedTextState] = useState('');
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });

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
      icon: t.icon,
    })),
    []
  );

  /**
   * Process all audio chunks when user clicks stop/save
   * Merges chunks and sends to server for processing
   */
  const handleRecordingComplete = async (chunks: AudioChunk[], totalDuration: number) => {
    if (chunks.length === 0) {
      Alert.alert('No Recording', 'No audio was recorded.');
      return;
    }

    setIsProcessing(true);
    setOriginalText('');
    setPolishedText('');
    setProcessingProgress({ current: 0, total: chunks.length });

    try {
      console.log('[PolishScreen] Processing', chunks.length, 'chunks, total duration:', totalDuration);

      let combinedOriginalText = '';
      let combinedPolishedText = '';

      // Process each chunk
      console.log(`[DEBUG PolishScreenContinuous] INPUT: language=${language}, tone=${tone}, outputType=${outputType}, totalChunks=${chunks.length}, isAuthenticated=${isAuthenticated}`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setProcessingProgress({ current: i + 1, total: chunks.length });
        
        console.log(`[PolishScreen] Processing chunk ${i + 1}/${chunks.length}:`, chunk.id);

        try {
          // Read chunk as base64
          const base64Audio = await FileSystem.readAsStringAsync(chunk.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Send chunk to server for processing
          console.log(`[DEBUG PolishScreenContinuous] CALLING polishBase64 chunk ${i+1}/${chunks.length}: language=${language}, tone=${tone}, outputType=${outputType}, chunkDuration=${chunk.duration}, audioBase64Length=${base64Audio?.length}`);
          const response = await polishApi.polishBase64(
            base64Audio,
            language,
            tone,
            outputType,
            'audio/mp4',
            chunk.duration
          );

          // Append results
          if (i > 0) {
            combinedOriginalText += '\n\n';
            combinedPolishedText += '\n\n';
          }
          combinedOriginalText += response.originalText;
          combinedPolishedText += response.polishedText;
          checkTrialLimitAndWarn(response, () => navigation.navigate("Subscription"), () => navigation.navigate("Subscription"));

          console.log(`[DEBUG PolishScreenContinuous] Chunk ${i + 1} RESULT: originalTextLength=${response.originalText?.length}, polishedTextLength=${response.polishedText?.length}`);

        } catch (chunkError) {
          console.error(`[PolishScreen] Error processing chunk ${i + 1}:`, chunkError);
          // Continue with other chunks
        }

        // Clean up chunk file
        try {
          await FileSystem.deleteAsync(chunk.uri, { idempotent: true });
        } catch (deleteError) {
          console.error('[PolishScreen] Error deleting chunk:', deleteError);
        }
      }

      // Set combined results
      setOriginalText(combinedOriginalText);
      setPolishedText(combinedPolishedText);

      console.log('[PolishScreen] All chunks processed successfully');

    } catch (error) {
      const apiError = handleApiError(error);
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Processing Error', message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0 });
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save your work');
      return;
    }

    // CRITICAL DEBUG: Log state values RIGHT BEFORE SAVE
    console.log('='.repeat(60));
    console.log('[PolishScreen] ⚠️ SAVE BUTTON CLICKED - STATE VALUES:');
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
        console.log('[PolishScreen] 🔄 UPDATING existing record with ID:', editingItem.id);
        
        await savedItemsApi.update(editingItem.id, {
          type: 'polish',
          originalText,  // Current edited value
          polishedText,  // Current edited value
          sourceLanguage: language,
          outputFormat: tone,
          outputType,
        });
        
        Alert.alert('✓ Updated', 'Your changes have been saved to the same record');
        clearEditingItem();
      } else {
        // CREATE new record
        console.log('[PolishScreen] ➕ CREATING new record');
        
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
      const message = getUserFriendlyMessage(apiError);
      Alert.alert('Save Failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={24} color={THEME_COLORS.primary} />
          <Text style={styles.cardTitle}>Polish Your Text</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Language</Text>
          <Select
            value={language}
            onValueChange={setLanguage}
            options={languageOptions}
            placeholder="Select language"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Output Type</Text>
          <Select
            value={outputType}
            onValueChange={setOutputType}
            options={outputTypeOptions}
            placeholder="Select output type"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tone</Text>
          <Select
            value={tone}
            onValueChange={setTone}
            options={toneOptions}
            placeholder="Select tone"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Template</Text>
          <Select
            value={template}
            onValueChange={setTemplate}
            options={templateOptions}
            placeholder="Select template"
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="mic" size={24} color={THEME_COLORS.primary} />
          <Text style={styles.cardTitle}>Record Your Voice</Text>
        </View>
        <Text style={styles.instructionText}>
          Keep recording as long as you need. Audio is automatically saved every 60 seconds. 
          Tap stop when finished, and all chunks will be processed together.
        </Text>
        <ContinuousVoiceRecorder 
          onSaveComplete={handleRecordingComplete} 
          isProcessing={isProcessing}
          chunkDuration={60}
        />
        {isProcessing && processingProgress.total > 0 && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Processing chunk {processingProgress.current} of {processingProgress.total}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(processingProgress.current / processingProgress.total) * 100}%` }
                ]} 
              />
            </View>
          </View>
        )}
      </Card>

      {(originalText || polishedText) && (
        <ResultDisplay
          originalText={originalText}
          setOriginalText={setOriginalText}
          polishedText={polishedText}
          setPolishedText={setPolishedText}
          translatedText=""
          onSave={handleSave}
          isSaving={isSaving}
          mode="polish"
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
  contentContainer: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginLeft: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  progressContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME_COLORS.border,
  },
  progressText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: THEME_COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.primary,
  },
});
