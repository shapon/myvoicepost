import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME_COLORS } from '../lib/constants';

interface SupportHeroProps {
  onSearch?: (query: string) => void;
  onSuggestionPress?: (suggestion: string) => void;
  onVoiceResult?: (text: string) => void;
}

const QUICK_SUGGESTIONS = [
  { label: 'Getting Started', icon: 'rocket-outline' as const },
  { label: 'Voice Recording', icon: 'mic-outline' as const },
  { label: 'Subscription', icon: 'card-outline' as const },
  { label: 'Storage Full', icon: 'cloud-outline' as const },
  { label: 'Translation', icon: 'language-outline' as const },
  { label: 'Account', icon: 'person-outline' as const },
];

export function SupportHero({ onSearch, onSuggestionPress, onVoiceResult }: SupportHeroProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const borderColorAnim = useRef(new Animated.Value(0)).current;
  const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (isListening) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const borderLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(borderColorAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(borderColorAnim, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );

      const glowIn = Animated.timing(glowAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      });

      animationsRef.current = [pulseLoop, borderLoop, glowIn];
      pulseLoop.start();
      borderLoop.start();
      glowIn.start();

      return () => {
        animationsRef.current.forEach((anim) => anim.stop());
        animationsRef.current = [];
        pulseAnim.setValue(1);
        glowAnim.setValue(0);
        borderColorAnim.setValue(0);
      };
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0);
      borderColorAnim.setValue(0);
    }
  }, [isListening]);

  const handleMicPress = () => {
    if (isListening) {
      setIsListening(false);
      if (searchQuery.trim() && onVoiceResult) {
        onVoiceResult(searchQuery);
      }
    } else {
      setSearchQuery('');
      setIsListening(true);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (onSearch) {
      onSearch(text);
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setSearchQuery(suggestion);
    if (onSuggestionPress) {
      onSuggestionPress(suggestion);
    }
  };

  const animatedBorderColor = borderColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME_COLORS.border, THEME_COLORS.primary],
  });

  const animatedShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.5],
  });

  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <View style={styles.iconContainer}>
          <Ionicons name="headset-outline" size={36} color={THEME_COLORS.primary} />
        </View>
        <Text style={styles.heading}>How can we help{'\n'}you today?</Text>
        <Text style={styles.subheading}>
          Search our help center or use your voice
        </Text>
      </View>

      <Animated.View
        style={[
          styles.searchBarWrapper,
          {
            borderColor: isListening ? animatedBorderColor : THEME_COLORS.border,
            shadowOpacity: isListening ? animatedShadowOpacity : 0.15,
          },
        ]}
      >
        <View style={styles.searchBarInner}>
          <Ionicons
            name="search-outline"
            size={20}
            color={THEME_COLORS.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={isListening ? 'Listening...' : 'Search for help...'}
            placeholderTextColor={THEME_COLORS.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
            data-testid="input-support-search"
          />
          <TouchableOpacity
            onPress={handleMicPress}
            activeOpacity={0.7}
            style={styles.micButton}
            data-testid="button-support-mic"
          >
            <Animated.View
              style={[
                styles.micIconWrapper,
                isListening && styles.micIconWrapperActive,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={22}
                color={isListening ? '#fff' : THEME_COLORS.primary}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
        {isListening && (
          <View style={styles.listeningIndicator}>
            <View style={[styles.listeningDot, styles.listeningDot1]} />
            <View style={[styles.listeningDot, styles.listeningDot2]} />
            <View style={[styles.listeningDot, styles.listeningDot3]} />
            <Text style={styles.listeningText}>Listening for your question...</Text>
          </View>
        )}
      </Animated.View>

      <View style={styles.suggestionsSection}>
        <Text style={styles.suggestionsLabel}>Quick Help</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsRow}
        >
          {QUICK_SUGGESTIONS.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionChip}
              onPress={() => handleSuggestionPress(suggestion.label)}
              activeOpacity={0.7}
              data-testid={`chip-suggestion-${index}`}
            >
              <Ionicons
                name={suggestion.icon}
                size={14}
                color={THEME_COLORS.primary}
                style={styles.chipIcon}
              />
              <Text style={styles.suggestionText}>{suggestion.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${THEME_COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: THEME_COLORS.text,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  searchBarWrapper: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 20,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    height: 52,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: THEME_COLORS.text,
    height: '100%',
  },
  micButton: {
    padding: 4,
  },
  micIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${THEME_COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIconWrapperActive: {
    backgroundColor: THEME_COLORS.primary,
  },
  listeningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
    gap: 4,
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME_COLORS.primary,
    opacity: 0.6,
  },
  listeningDot1: {
    opacity: 0.4,
  },
  listeningDot2: {
    opacity: 0.7,
  },
  listeningDot3: {
    opacity: 1,
  },
  listeningText: {
    fontSize: 12,
    color: THEME_COLORS.primary,
    marginLeft: 6,
    fontWeight: '500',
  },
  suggestionsSection: {
    marginTop: 4,
  },
  suggestionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME_COLORS.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  suggestionsRow: {
    gap: 8,
    paddingRight: 20,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  chipIcon: {
    marginRight: 6,
  },
  suggestionText: {
    fontSize: 13,
    color: THEME_COLORS.text,
    fontWeight: '500',
  },
});
