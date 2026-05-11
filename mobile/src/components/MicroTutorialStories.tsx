import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { THEME_COLORS } from '../lib/constants';

export interface Tutorial {
  id: string;
  title: string;
  shortLabel: string;
  videoUrl: string;
  thumbnailColor: string;
  gradientStart: string;
  gradientEnd: string;
  duration: number;
  iconName: keyof typeof Ionicons.glyphMap;
  deepLink: string;
  description: string;
}

export const TUTORIALS: Tutorial[] = [
  {
    id: 'polish-voice',
    title: 'Polish Your Voice',
    shortLabel: 'Polish',
    videoUrl: '',
    thumbnailColor: '#6366f1',
    gradientStart: '#6366f1',
    gradientEnd: '#8b5cf6',
    duration: 10,
    iconName: 'sparkles-outline',
    deepLink: '/(tabs)',
    description: 'Record your voice and get a polished, professional version of your message instantly.',
  },
  {
    id: 'translate-speech',
    title: 'Translate Speech',
    shortLabel: 'Translate',
    videoUrl: '',
    thumbnailColor: '#22c55e',
    gradientStart: '#22c55e',
    gradientEnd: '#06b6d4',
    duration: 10,
    iconName: 'language-outline',
    deepLink: '/(tabs)/translate',
    description: 'Speak in one language and get your message translated to another language with the right tone.',
  },
  {
    id: 'save-texts',
    title: 'Save Your Texts',
    shortLabel: 'Save',
    videoUrl: '',
    thumbnailColor: '#f59e0b',
    gradientStart: '#f59e0b',
    gradientEnd: '#ef4444',
    duration: 10,
    iconName: 'bookmark-outline',
    deepLink: '/(tabs)/storage',
    description: 'Save polished or translated texts for later. Access them anytime from the Storage tab.',
  },
  {
    id: 'process-audio',
    title: 'Process Audio Files',
    shortLabel: 'Process',
    videoUrl: '',
    thumbnailColor: '#06b6d4',
    gradientStart: '#06b6d4',
    gradientEnd: '#3b82f6',
    duration: 10,
    iconName: 'cloud-upload-outline',
    deepLink: '/(tabs)/process',
    description: 'Upload audio files or paste URLs to transcribe and translate content from any source.',
  },
  {
    id: 'manage-subscription',
    title: 'Manage Plan',
    shortLabel: 'Plans',
    videoUrl: '',
    thumbnailColor: '#8b5cf6',
    gradientStart: '#8b5cf6',
    gradientEnd: '#ec4899',
    duration: 10,
    iconName: 'card-outline',
    deepLink: '/(tabs)/subscription',
    description: 'View your usage, upgrade your plan, or purchase additional transcription minutes.',
  },
  {
    id: 'app-settings',
    title: 'Custom Settings',
    shortLabel: 'Settings',
    videoUrl: '',
    thumbnailColor: '#ef4444',
    gradientStart: '#ef4444',
    gradientEnd: '#f59e0b',
    duration: 10,
    iconName: 'settings-outline',
    deepLink: '/settings',
    description: 'Set your default language, tone, and output type to speed up your workflow.',
  },
];

function StoryCircle({
  tutorial,
  onPress,
}: {
  tutorial: Tutorial;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[styles.storyWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        data-testid={`story-${tutorial.id}`}
      >
        <View style={[styles.gradientBorder, { borderColor: tutorial.gradientStart }]}>
          <View style={[styles.storyThumbnail, { backgroundColor: `${tutorial.thumbnailColor}20` }]}>
            <Ionicons name={tutorial.iconName} size={28} color={tutorial.thumbnailColor} />
            <View style={styles.playOverlay}>
              <Ionicons name="play" size={14} color="#fff" />
            </View>
          </View>
        </View>
        <Text style={styles.storyLabel} numberOfLines={1}>{tutorial.shortLabel}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TutorialModal({
  tutorial,
  visible,
  onClose,
}: {
  tutorial: Tutorial | null;
  visible: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<Video>(null);
  const modalAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const hasVideo = tutorial?.videoUrl && tutorial.videoUrl.length > 0;

  useEffect(() => {
    if (visible) {
      Animated.spring(modalAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }).start();

      if (!hasVideo && tutorial) {
        progressAnim.setValue(0);
        Animated.loop(
          Animated.timing(progressAnim, {
            toValue: 1,
            duration: tutorial.duration * 1000,
            easing: Easing.linear,
            useNativeDriver: false,
          })
        ).start();
      }
    } else {
      modalAnim.setValue(0);
      progressAnim.setValue(0);
    }
  }, [visible, tutorial]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.durationMillis && status.durationMillis > 0) {
      const progress = status.positionMillis / status.durationMillis;
      progressAnim.setValue(progress);
    }
    setIsPlaying(status.isPlaying);
  };

  const handleTryItNow = () => {
    onClose();
    if (tutorial?.deepLink) {
      setTimeout(() => {
        router.push(tutorial.deepLink as any);
      }, 300);
    }
  };

  if (!tutorial) return null;

  const modalScale = modalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const modalOpacity = modalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]}>
        <StatusBar barStyle="light-content" />

        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: modalScale }],
              opacity: modalOpacity,
            },
          ]}
        >
          <View style={styles.modalProgressBar}>
            <Animated.View
              style={[
                styles.modalProgressFill,
                { width: progressWidth, backgroundColor: tutorial.gradientStart },
              ]}
            />
          </View>

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={onClose}
            data-testid="button-close-tutorial"
          >
            <View style={styles.closeIconCircle}>
              <Ionicons name="close" size={20} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.modalContent}>
            {hasVideo ? (
              <Video
                ref={videoRef}
                source={{ uri: tutorial.videoUrl }}
                style={styles.videoPlayer}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              />
            ) : (
              <View style={[styles.placeholderVideo, { backgroundColor: `${tutorial.thumbnailColor}15` }]}>
                <View style={[styles.placeholderIconCircle, { backgroundColor: `${tutorial.thumbnailColor}25` }]}>
                  <Ionicons name={tutorial.iconName} size={56} color={tutorial.thumbnailColor} />
                </View>
                <Text style={styles.placeholderTitle}>{tutorial.title}</Text>
                <Text style={styles.placeholderDescription}>{tutorial.description}</Text>

                <View style={styles.stepsContainer}>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: tutorial.gradientStart }]}>
                      <Text style={styles.stepNumberText}>1</Text>
                    </View>
                    <Text style={styles.stepText}>Open the feature tab</Text>
                  </View>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: tutorial.gradientStart }]}>
                      <Text style={styles.stepNumberText}>2</Text>
                    </View>
                    <Text style={styles.stepText}>Follow the on-screen instructions</Text>
                  </View>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepNumber, { backgroundColor: tutorial.gradientStart }]}>
                      <Text style={styles.stepNumberText}>3</Text>
                    </View>
                    <Text style={styles.stepText}>Get your result instantly</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.tryItButton, { backgroundColor: tutorial.gradientStart }]}
            onPress={handleTryItNow}
            activeOpacity={0.8}
            data-testid="button-try-it-now"
          >
            <Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" />
            <Text style={styles.tryItButtonText}>Try it Now</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function MicroTutorialStories() {
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleStoryPress = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setModalVisible(true);
  };

  const handleClose = () => {
    setModalVisible(false);
    setTimeout(() => setSelectedTutorial(null), 300);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Quick Tutorials</Text>
        <Text style={styles.seeAll}>Tap to learn</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storiesRow}
      >
        {TUTORIALS.map((tutorial) => (
          <StoryCircle
            key={tutorial.id}
            tutorial={tutorial}
            onPress={() => handleStoryPress(tutorial)}
          />
        ))}
      </ScrollView>

      <TutorialModal
        tutorial={selectedTutorial}
        visible={modalVisible}
        onClose={handleClose}
      />
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  seeAll: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
  },
  storiesRow: {
    paddingHorizontal: 16,
    gap: 14,
  },
  storyWrapper: {
    alignItems: 'center',
    width: 80,
  },
  gradientBorder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginTop: 6,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: SCREEN_WIDTH - 32,
    maxHeight: SCREEN_HEIGHT * 0.82,
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalProgressBar: {
    height: 4,
    backgroundColor: `${THEME_COLORS.border}`,
  },
  modalProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  closeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
  },
  videoPlayer: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.55,
    borderRadius: 0,
  },
  placeholderVideo: {
    width: '100%',
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  placeholderIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderDescription: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  stepsContainer: {
    width: '100%',
    gap: 14,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    fontSize: 14,
    color: THEME_COLORS.text,
    fontWeight: '500',
  },
  tryItButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 20,
  },
  tryItButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
