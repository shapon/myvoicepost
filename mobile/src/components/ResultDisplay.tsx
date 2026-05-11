import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { EditableText } from './EditableText';

interface ResultDisplayProps {
  originalText: string;
  processedText: string;
  title: string;
  onSave?: () => void;
  onClear?: () => void;
  isSaving?: boolean;
  showTranslation?: boolean;
  translatedText?: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  onOriginalTextChange?: (text: string) => void;
  onProcessedTextChange?: (text: string) => void;
  onTranslatedTextChange?: (text: string) => void;
  onReProcess?: () => void;
  isProcessing?: boolean;
  reProcessButtonText?: string;  // Custom button text
  editable?: boolean;  // Whether text can be edited (requires login)
}

export function ResultDisplay({
  originalText,
  processedText,
  title,
  onSave,
  onClear,
  isSaving = false,
  showTranslation = false,
  translatedText,
  targetLanguage,
  sourceLanguage,
  onOriginalTextChange,
  onProcessedTextChange,
  onTranslatedTextChange,
  onReProcess,
  isProcessing = false,
  reProcessButtonText,
  editable = true,  // Default to true for backward compatibility
}: ResultDisplayProps) {
  const [copied, setCopied] = useState<'original' | 'processed' | 'translated' | null>(null);
  const [isPlaying, setIsPlaying] = useState<'original' | 'processed' | 'translated' | null>(null);

  const shareText = async (text: string, label: string) => {
    try {
      await Share.share({
        message: text,
        title: `MyVoicePost - ${label}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const copyToClipboard = async (text: string, type: 'original' | 'processed' | 'translated') => {
    await Clipboard.setStringAsync(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const getLanguageCode = (lang: string | undefined): string => {
    const languageMap: Record<string, string> = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'pl': 'pl-PL',
      'nl': 'nl-NL',
      'ru': 'ru-RU',
      'zh': 'zh-CN',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'ar': 'ar-SA',
      'hi': 'hi-IN',
    };
    return languageMap[lang || 'en'] || 'en-US';
  };

  const playText = async (text: string, type: 'original' | 'processed' | 'translated', language?: string) => {
    if (isPlaying === type) {
      Speech.stop();
      setIsPlaying(null);
      return;
    }

    if (isPlaying) {
      Speech.stop();
    }

    setIsPlaying(type);
    
    try {
      await Speech.speak(text, {
        language: getLanguageCode(language),
        onDone: () => setIsPlaying(null),
        onError: () => setIsPlaying(null),
        onStopped: () => setIsPlaying(null),
      });
    } catch (error) {
      console.error('Speech error:', error);
      setIsPlaying(null);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerActions}>
            {onSave && (
              <Button
                title={isSaving ? 'Saving...' : 'Save'}
                onPress={onSave}
                variant="primary"
                size="sm"
                loading={isSaving}
                icon={<Ionicons name="bookmark-outline" size={16} color="#ffffff" />}
              />
            )}
            {onClear && (
              <TouchableOpacity onPress={onClear} style={styles.clearButton}>
                <Ionicons name="close-circle" size={24} color={THEME_COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View>
          <View style={styles.section}>
            <EditableText
              value={originalText}
              onChange={onOriginalTextChange || (() => {})}
              label="Original"
              style="normal"
              editable={editable}
            />
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={() => playText(originalText, 'original', sourceLanguage)}
                style={styles.actionButton}
                data-testid="button-play-original"
              >
                <Ionicons
                  name={isPlaying === 'original' ? 'stop' : 'volume-high'}
                  size={18}
                  color={isPlaying === 'original' ? THEME_COLORS.primary : THEME_COLORS.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => copyToClipboard(originalText, 'original')}
                style={styles.actionButton}
              >
                <Ionicons
                  name={copied === 'original' ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied === 'original' ? THEME_COLORS.success : THEME_COLORS.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => shareText(originalText, 'Original Text')}
                style={styles.actionButton}
                data-testid="button-share-original"
              >
                <Ionicons name="share-outline" size={18} color={THEME_COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {onReProcess && editable && (
            <View style={styles.reProcessContainer}>
              <Button
                title={isProcessing 
                  ? (reProcessButtonText ? `${reProcessButtonText.split(' ')[0]}ing...` : 'Processing...') 
                  : (reProcessButtonText || 'Re-polish Edited Text')
                }
                onPress={onReProcess}
                variant="secondary"
                size="sm"
                loading={isProcessing}
                disabled={isProcessing || !originalText}
                icon={<Ionicons name={showTranslation ? "language" : "sparkles"} size={16} color={THEME_COLORS.primary} />}
                style={styles.reProcessButton}
              />
              <Text style={styles.reProcessHint}>
                {showTranslation 
                  ? 'Edit the text above and tap to translate it again'
                  : 'Edit the text above and tap to polish it again'
                }
              </Text>
            </View>
          )}

          {showTranslation && translatedText && (
            <View style={styles.section}>
              <EditableText
                value={translatedText}
                onChange={onTranslatedTextChange || (() => {})}
                label="Translation"
                style="normal"
                editable={editable}
              />
              <View style={styles.sectionActions}>
                <TouchableOpacity
                  onPress={() => playText(translatedText, 'translated', targetLanguage)}
                  style={styles.actionButton}
                  data-testid="button-play-translated"
                >
                  <Ionicons
                    name={isPlaying === 'translated' ? 'stop' : 'volume-high'}
                    size={18}
                    color={isPlaying === 'translated' ? THEME_COLORS.primary : THEME_COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => copyToClipboard(translatedText, 'translated')}
                  style={styles.actionButton}
                >
                  <Ionicons
                    name={copied === 'translated' ? 'checkmark' : 'copy-outline'}
                    size={18}
                    color={copied === 'translated' ? THEME_COLORS.success : THEME_COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shareText(translatedText, 'Translated Text')}
                  style={styles.actionButton}
                  data-testid="button-share-translated"
                >
                  <Ionicons name="share-outline" size={18} color={THEME_COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <EditableText
              value={processedText}
              onChange={onProcessedTextChange || (() => {})}
              label="Polished"
              style="highlight"
              editable={editable}
            />
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={() => playText(processedText, 'processed', showTranslation ? targetLanguage : sourceLanguage)}
                style={styles.actionButton}
                data-testid="button-play-polished"
              >
                <Ionicons
                  name={isPlaying === 'processed' ? 'stop' : 'volume-high'}
                  size={18}
                  color={isPlaying === 'processed' ? THEME_COLORS.primary : THEME_COLORS.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => copyToClipboard(processedText, 'processed')}
                style={styles.actionButton}
              >
                <Ionicons
                  name={copied === 'processed' ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied === 'processed' ? THEME_COLORS.success : THEME_COLORS.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => shareText(processedText, 'Polished Text')}
                style={styles.actionButton}
                data-testid="button-share-polished"
              >
                <Ionicons name="share-outline" size={18} color={THEME_COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 16,
  },
  card: {
    minHeight: 200,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: THEME_COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    padding: 4,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: THEME_COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionTitleHighlight: {
    color: THEME_COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    padding: 4,
  },
  actionButtonDisabled: {
    opacity: 0.3,
  },
  reProcessContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
    alignItems: 'center',
  },
  reProcessButton: {
    marginBottom: 8,
  },
  reProcessHint: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  text: {
    color: THEME_COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  textHighlight: {
    color: THEME_COLORS.text,
    fontSize: 16,
    lineHeight: 24,
  },
  textInput: {
    color: THEME_COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 2,
    borderColor: THEME_COLORS.primary,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textInputHighlight: {
    color: THEME_COLORS.text,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 2,
    borderColor: THEME_COLORS.primary,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#E0E7FF',
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
