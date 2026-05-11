import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';

export interface FAQQuestion {
  id: string;
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  isTroubleshooting?: boolean;
  questions: FAQQuestion[];
}

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    iconName: 'rocket-outline',
    iconColor: '#6366f1',
    iconBg: '#6366f118',
    questions: [
      {
        id: 'gs-1',
        question: 'How do I set up the app?',
        answer: 'Download MyVoicePost, create an account or sign in with Google, and you\'re ready to go. Choose your preferred language in App Settings.',
      },
      {
        id: 'gs-2',
        question: 'How do I link my Google account?',
        answer: 'On the login screen, tap "Continue with Google" to sign in with your Google account. Your account will be linked automatically.',
      },
      {
        id: 'gs-3',
        question: 'What languages are supported?',
        answer: 'MyVoicePost supports 18+ languages including English, Spanish, French, German, Hindi, Chinese, Japanese, Korean, Arabic, Bengali, and more.',
      },
      {
        id: 'gs-4',
        question: 'How do I record my first voice note?',
        answer: 'Go to the Polish or Translate tab, select your language, tap the microphone icon, speak clearly, and tap again to stop recording.',
      },
    ],
  },
  {
    id: 'voice-management',
    title: 'Voice Management',
    iconName: 'mic-outline',
    iconColor: '#22c55e',
    iconBg: '#22c55e18',
    questions: [
      {
        id: 'vm-1',
        question: 'How do I save my recordings?',
        answer: 'After processing, tap the "Save" button on the result screen. Your saved texts are accessible from the Storage tab.',
      },
      {
        id: 'vm-2',
        question: 'Can I download my transcriptions?',
        answer: 'Yes, use the share icon on any result to copy, share, or export your transcribed and polished text.',
      },
      {
        id: 'vm-3',
        question: 'What is the difference between Polish and Translate?',
        answer: 'Polish improves your text in the same language (grammar, tone, clarity). Translate converts your speech from one language to another.',
      },
      {
        id: 'vm-4',
        question: 'Why is my transcription inaccurate?',
        answer: 'Speak clearly in a quiet environment, hold your phone 6-8 inches from your mouth, and ensure the correct input language is selected.',
      },
    ],
  },
  {
    id: 'personalization',
    title: 'Personalization',
    iconName: 'color-palette-outline',
    iconColor: '#f59e0b',
    iconBg: '#f59e0b18',
    questions: [
      {
        id: 'ps-1',
        question: 'How do I change the output tone?',
        answer: 'In App Settings, set your default tone (Professional, Casual, Formal, Friendly). You can also change it per recording before processing.',
      },
      {
        id: 'ps-2',
        question: 'Can I customize the output type?',
        answer: 'Yes, choose between Message, Note, Email, Social Post, or Journal formats to match your content needs.',
      },
      {
        id: 'ps-3',
        question: 'How do I set my default language?',
        answer: 'Go to Profile > App Settings and select your preferred source and target languages. These will be pre-selected on Polish and Translate tabs.',
      },
      {
        id: 'ps-4',
        question: 'Can I re-polish or re-translate text?',
        answer: 'Yes, tap "Re-polish Edited Text" or "Re-translate" on any result to process it again with different settings.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    iconName: 'build-outline',
    iconColor: '#ef4444',
    iconBg: '#ef444418',
    isTroubleshooting: true,
    questions: [
      {
        id: 'ts-1',
        question: 'Why am I not receiving notifications?',
        answer: 'Check that notifications are enabled in your phone\'s Settings for MyVoicePost. Also verify notification preferences in Profile > Notifications.',
      },
      {
        id: 'ts-2',
        question: 'The app keeps crashing. What should I do?',
        answer: 'Try force-closing and reopening the app. If the issue persists, clear the app cache, update to the latest version, or reinstall the app.',
      },
      {
        id: 'ts-3',
        question: 'My recording failed to process.',
        answer: 'Check your internet connection and try again. If the issue continues, the recording may have been too short or the audio quality too low.',
      },
      {
        id: 'ts-4',
        question: 'I can\'t sign in to my account.',
        answer: 'Use "Forgot Password" to reset your password. For Google sign-in issues, ensure you\'re using the same Google account you registered with.',
      },
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription',
    iconName: 'card-outline',
    iconColor: '#8b5cf6',
    iconBg: '#8b5cf618',
    questions: [
      {
        id: 'sb-1',
        question: 'How do I manage my subscription?',
        answer: 'Go to Profile > Plans & Subscription to view your plan, upgrade, or manage billing through Stripe.',
      },
      {
        id: 'sb-2',
        question: 'What happens when my free trial ends?',
        answer: 'You get 90 free minutes of transcription. After that, subscribe or purchase top-up minutes to continue.',
      },
      {
        id: 'sb-3',
        question: 'How do I check my usage?',
        answer: 'Go to Profile > Statistics to see your total usage, remaining minutes, and detailed audio logs.',
      },
      {
        id: 'sb-4',
        question: 'Can I cancel my subscription?',
        answer: 'Yes, go to Profile > Plans & Subscription and tap "Manage Subscription" to cancel or modify through the Stripe portal.',
      },
    ],
  },
  {
    id: 'storage',
    title: 'Storage & Data',
    iconName: 'cloud-outline',
    iconColor: '#06b6d4',
    iconBg: '#06b6d418',
    questions: [
      {
        id: 'st-1',
        question: 'Where are my saved texts stored?',
        answer: 'Saved texts are stored securely on our servers and accessible from the Storage tab when you\'re signed in.',
      },
      {
        id: 'st-2',
        question: 'How do I delete saved texts?',
        answer: 'In the Storage tab, swipe left on any saved item or use the delete button to remove it permanently.',
      },
      {
        id: 'st-3',
        question: 'Can I export my data?',
        answer: 'Use the share/copy buttons on any saved text to export it to other apps, email, or clipboard.',
      },
      {
        id: 'st-4',
        question: 'Is my data secure?',
        answer: 'Yes, all data is transmitted over HTTPS and stored securely. We never share your personal recordings or transcriptions.',
      },
    ],
  },
];

interface SmartFAQCategoriesProps {
  searchQuery?: string;
  onCategorySelect?: (category: FAQCategory) => void;
}

function TroubleshootingBadge() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={[styles.fixItBadge, { transform: [{ scale: pulseAnim }] }]}>
      <Ionicons name="flash" size={10} color="#fff" />
      <Text style={styles.fixItText}>Fix It</Text>
    </Animated.View>
  );
}

function CategoryCard({
  category,
  onPress,
}: {
  category: FAQCategory;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 1.04,
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
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[
          styles.categoryCard,
          category.isTroubleshooting && styles.troubleshootingCard,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        data-testid={`card-faq-${category.id}`}
      >
        {category.isTroubleshooting && <TroubleshootingBadge />}
        <View style={[styles.iconCircle, { backgroundColor: category.iconBg }]}>
          <Ionicons name={category.iconName} size={24} color={category.iconColor} />
        </View>
        <Text style={styles.categoryTitle}>{category.title}</Text>
        <Text style={styles.questionCount}>
          {category.questions.length} articles
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ExpandedCategory({
  category,
  onClose,
}: {
  category: FAQCategory;
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.expandedContainer}>
      <TouchableOpacity
        style={styles.expandedHeader}
        onPress={onClose}
        activeOpacity={0.7}
        data-testid="button-close-category"
      >
        <View style={styles.expandedHeaderLeft}>
          <View style={[styles.iconCircleSmall, { backgroundColor: category.iconBg }]}>
            <Ionicons name={category.iconName} size={18} color={category.iconColor} />
          </View>
          <Text style={styles.expandedTitle}>{category.title}</Text>
        </View>
        <Ionicons name="close" size={20} color={THEME_COLORS.textMuted} />
      </TouchableOpacity>

      {category.questions.map((q, index) => (
        <View key={q.id}>
          <TouchableOpacity
            style={styles.expandedQuestion}
            onPress={() => setExpandedId(expandedId === q.id ? null : q.id)}
            activeOpacity={0.7}
            data-testid={`faq-question-${q.id}`}
          >
            <View style={styles.questionRow}>
              <Text style={styles.questionText}>{q.question}</Text>
              <Ionicons
                name={expandedId === q.id ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={THEME_COLORS.textMuted}
              />
            </View>
            {expandedId === q.id && (
              <Text style={styles.answerText}>{q.answer}</Text>
            )}
          </TouchableOpacity>
          {index < category.questions.length - 1 && <View style={styles.questionDivider} />}
        </View>
      ))}
    </View>
  );
}

export function SmartFAQCategories({ searchQuery, onCategorySelect }: SmartFAQCategoriesProps) {
  const [selectedCategory, setSelectedCategory] = useState<FAQCategory | null>(null);

  const filteredCategories = searchQuery?.trim()
    ? FAQ_CATEGORIES.filter((cat) => {
        const query = searchQuery.toLowerCase();
        return (
          cat.title.toLowerCase().includes(query) ||
          cat.questions.some(
            (q) =>
              q.question.toLowerCase().includes(query) ||
              q.answer.toLowerCase().includes(query)
          )
        );
      })
    : FAQ_CATEGORIES;

  const handleCategoryPress = (category: FAQCategory) => {
    setSelectedCategory(category);
    if (onCategorySelect) {
      onCategorySelect(category);
    }
  };

  if (selectedCategory) {
    return (
      <ExpandedCategory
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
      />
    );
  }

  if (filteredCategories.length === 0) {
    return (
      <View style={styles.noResults}>
        <Ionicons name="search-outline" size={32} color={THEME_COLORS.textMuted} />
        <Text style={styles.noResultsText}>No matching categories</Text>
        <Text style={styles.noResultsSubtext}>Try a different search term</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {filteredCategories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          onPress={() => handleCategoryPress(category)}
        />
      ))}
    </View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  categoryCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  troubleshootingCard: {
    borderColor: '#ef444440',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  questionCount: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
  },
  fixItBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  fixItText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  expandedContainer: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    overflow: 'hidden',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  expandedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  expandedQuestion: {
    padding: 16,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
    lineHeight: 20,
  },
  answerText: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 10,
  },
  questionDivider: {
    height: 1,
    backgroundColor: THEME_COLORS.border,
    marginHorizontal: 16,
  },
  noResults: {
    alignItems: 'center',
    padding: 32,
  },
  noResultsText: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    marginTop: 12,
  },
  noResultsSubtext: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    marginTop: 4,
  },
});
