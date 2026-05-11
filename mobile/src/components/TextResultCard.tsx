import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Share,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import { Card } from './ui/Card';
import { imageApi } from '../lib/api';

interface TextResultCardProps {
  text: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  language?: string;

  editable?: boolean;
  onTextChange?: (text: string) => void;

  showPlay?: boolean;
  showCopy?: boolean;
  showShare?: boolean;
  showSave?: boolean;
  showImageGen?: boolean;

  onSave?: () => void;
  isSaving?: boolean;

  isAuthenticated?: boolean;
  highlight?: boolean;
}

const LANGUAGE_MAP: Record<string, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', nl: 'nl-NL',
  ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
  ar: 'ar-SA', hi: 'hi-IN', bn: 'bn-IN', pa: 'pa-IN',
  tr: 'tr-TR', vi: 'vi-VN', te: 'te-IN', ta: 'ta-IN',
  mr: 'mr-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
  th: 'th-TH', id: 'id-ID', ms: 'ms-MY', ur: 'ur-PK',
};

export function TextResultCard({
  text,
  label,
  icon = 'document-text-outline',
  accentColor,
  language,
  editable = false,
  onTextChange,
  showPlay = true,
  showCopy = true,
  showShare = true,
  showSave = false,
  showImageGen = false,
  onSave,
  isSaving = false,
  isAuthenticated = false,
  highlight = false,
}: TextResultCardProps) {
  const colors = useThemeColors();
  const effectiveAccent = accentColor || colors.primary;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlay = async () => {
    if (isPlaying) {
      Speech.stop();
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
    try {
      await Speech.speak(text, {
        language: LANGUAGE_MAP[language || 'en'] || 'en-US',
        onDone: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
        onStopped: () => setIsPlaying(false),
      });
    } catch {
      setIsPlaying(false);
    }
  };

  const handleShare = () => {
    if (generatedImage) {
      Alert.alert(
        'Share Content',
        'What would you like to share?',
        [
          { text: 'Text Only', onPress: shareTextOnly },
          { text: 'Image Only', onPress: shareImageOnly },
          { text: 'Both', onPress: shareBoth },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      shareTextOnly();
    }
  };

  const shareTextOnly = async () => {
    try {
      await Share.share({
        message: text,
        title: `MyVoicePost - ${label}`,
      });
    } catch (error) {
      console.error('[TextResultCard] Share text error:', error);
    }
  };

  const shareImageOnly = async () => {
    if (!generatedImage) return;
    try {
      const fileUri = `${FileSystem.cacheDirectory}myvoicepost_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, generatedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png', UTI: 'public.png' });
      }
    } catch (error) {
      console.error('[TextResultCard] Share image error:', error);
      Alert.alert('Error', 'Failed to share image');
    }
  };

  const shareBoth = async () => {
    if (!generatedImage) return;
    try {
      const fileUri = `${FileSystem.cacheDirectory}myvoicepost_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, generatedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png', UTI: 'public.png' });
      }
      setTimeout(async () => {
        try {
          await Share.share({
            message: text,
            title: `MyVoicePost - ${label}`,
          });
        } catch (e) {
          console.error('[TextResultCard] Share text after image error:', e);
        }
      }, 500);
    } catch (error) {
      console.error('[TextResultCard] Share both error:', error);
      Alert.alert('Error', 'Failed to share content');
    }
  };

  const handleEdit = () => {
    if (isEditing) {
      if (onTextChange) onTextChange(editText);
      setIsEditing(false);
    } else {
      setEditText(text);
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setEditText(text);
    setIsEditing(false);
  };

  const handleGenerateImage = async () => {
    if (!text.trim()) return;
    setIsGeneratingImage(true);
    try {
      const prompt = `Create a visually appealing image that represents the following text content. Make it suitable for sharing on social media:\n\n${text.substring(0, 500)}`;
      const result = await imageApi.generateImage(prompt, '1024x1024', 'standard');
      if (result.success && result.imageBase64) {
        setGeneratedImage(result.imageBase64);
      } else {
        Alert.alert('Error', 'Failed to generate image. Please try again.');
      }
    } catch (error: any) {
      console.error('[TextResultCard] Image generation error:', error);
      Alert.alert('Error', error.message || 'Failed to generate image');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!generatedImage) return;
    setIsSavingImage(true);
    try {
      const fileUri = `${FileSystem.cacheDirectory}myvoicepost_image_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, generatedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png', UTI: 'public.png' });
      } else {
        Alert.alert('Not Available', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('[TextResultCard] Image save error:', error);
      Alert.alert('Save Failed', 'Could not save the image.');
    } finally {
      setIsSavingImage(false);
    }
  };

  if (!text) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={18} color={effectiveAccent} />
          <Text style={[styles.label, { color: effectiveAccent }]}>{label}</Text>
        </View>
        {showSave && onSave && isAuthenticated && (
          <TouchableOpacity
            onPress={onSave}
            disabled={isSaving}
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.7}
            data-testid={`button-save-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="bookmark-outline" size={14} color="#fff" />
            )}
            <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.textContainer, { backgroundColor: colors.surfaceLight }, highlight && { backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: effectiveAccent + '30' }]}>
        {isEditing ? (
          <TextInput
            value={editText}
            onChangeText={setEditText}
            multiline
            style={[styles.textInput, { color: colors.text }]}
            data-testid={`input-edit-${label.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ) : (
          <ScrollView style={styles.textScrollView} nestedScrollEnabled>
            <Text style={[styles.text, { color: colors.text }, highlight && styles.textHighlight]} selectable>
              {text}
            </Text>
          </ScrollView>
        )}
      </View>

      <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
        {showPlay && (
          <TouchableOpacity
            onPress={handlePlay}
            style={[styles.actionButton, isPlaying && { backgroundColor: effectiveAccent + '15' }]}
            activeOpacity={0.7}
            data-testid={`button-play-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Ionicons
              name={isPlaying ? 'stop' : 'volume-high'}
              size={16}
              color={isPlaying ? effectiveAccent : colors.textSecondary}
            />
            <Text style={[styles.actionText, { color: colors.textSecondary }, isPlaying && { color: effectiveAccent }]}>
              {isPlaying ? 'Stop' : 'Play'}
            </Text>
          </TouchableOpacity>
        )}

        {showCopy && (
          <TouchableOpacity
            onPress={handleCopy}
            style={[styles.actionButton, copied && { backgroundColor: colors.success + '15' }]}
            activeOpacity={0.7}
            data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={16}
              color={copied ? colors.success : colors.textSecondary}
            />
            <Text style={[styles.actionText, { color: colors.textSecondary }, copied && { color: colors.success }]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        )}

        {editable && isAuthenticated && (
          <>
            <TouchableOpacity
              onPress={handleEdit}
              style={[styles.actionButton, isEditing && { backgroundColor: colors.success + '15' }]}
              activeOpacity={0.7}
              data-testid={`button-edit-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Ionicons
                name={isEditing ? 'checkmark-circle' : 'create-outline'}
                size={16}
                color={isEditing ? colors.success : colors.textSecondary}
              />
              <Text style={[styles.actionText, { color: colors.textSecondary }, isEditing && { color: colors.success }]}>
                {isEditing ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
            {isEditing && (
              <TouchableOpacity
                onPress={handleCancelEdit}
                style={styles.actionButton}
                activeOpacity={0.7}
                data-testid={`button-cancel-edit-${label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {showShare && (
          <TouchableOpacity
            onPress={handleShare}
            style={styles.actionButton}
            activeOpacity={0.7}
            data-testid={`button-share-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
        )}

        {showImageGen && isAuthenticated && (
          <TouchableOpacity
            onPress={handleGenerateImage}
            disabled={isGeneratingImage}
            style={styles.actionButton}
            activeOpacity={0.7}
            data-testid={`button-image-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {isGeneratingImage ? (
              <ActivityIndicator size="small" color={effectiveAccent} />
            ) : (
              <Ionicons name="image-outline" size={16} color={effectiveAccent} />
            )}
            <Text style={[styles.actionText, { color: effectiveAccent }]}>Image</Text>
          </TouchableOpacity>
        )}
      </View>

      {isGeneratingImage && !generatedImage && (
        <View style={styles.imageLoading}>
          <ActivityIndicator size="large" color={effectiveAccent} />
          <Text style={[styles.imageLoadingText, { color: colors.text }]}>Creating your image...</Text>
          <Text style={[styles.imageLoadingSubtext, { color: colors.textMuted }]}>This may take 15-30 seconds</Text>
        </View>
      )}

      {generatedImage && (
        <View style={[styles.imageSection, { borderTopColor: colors.border }]}>
          <Image
            source={{ uri: `data:image/png;base64,${generatedImage}` }}
            style={[styles.generatedImage, { backgroundColor: colors.surface }]}
            resizeMode="contain"
            data-testid={`img-generated-${label.toLowerCase().replace(/\s+/g, '-')}`}
          />
          <View style={styles.imageActions}>
            <TouchableOpacity
              style={[styles.imageActionButton, { backgroundColor: colors.success }]}
              onPress={handleDownloadImage}
              disabled={isSavingImage}
              activeOpacity={0.7}
              data-testid={`button-download-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {isSavingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download" size={14} color="#fff" />
              )}
              <Text style={styles.imageActionText}>
                {isSavingImage ? 'Saving...' : 'Download'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageActionButton, { backgroundColor: effectiveAccent }]}
              onPress={handleShare}
              activeOpacity={0.7}
              data-testid={`button-share-img-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Ionicons name="share-outline" size={14} color="#fff" />
              <Text style={styles.imageActionText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageActionButton, styles.imageActionOutline, { borderColor: effectiveAccent }]}
              onPress={handleGenerateImage}
              disabled={isGeneratingImage}
              activeOpacity={0.7}
              data-testid={`button-regen-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Ionicons name="refresh" size={14} color={effectiveAccent} />
              <Text style={[styles.imageActionText, { color: effectiveAccent }]}>Redo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  textContainer: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    maxHeight: 200,
  },
  textScrollView: {
    maxHeight: 176,
  },
  text: {
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
  },
  textHighlight: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  textInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  imageLoading: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  imageLoadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  imageLoadingSubtext: {
    fontSize: 12,
  },
  imageSection: {
    marginTop: 10,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  generatedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  imageActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  imageActionOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  imageActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
