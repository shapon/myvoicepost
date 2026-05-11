import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHelpTheme } from '../src/lib/helpTheme';
import { SupportHero } from '../src/components/SupportHero';
import { SmartFAQCategories } from '../src/components/SmartFAQCategories';
import { DiagnosticWidget } from '../src/components/DiagnosticWidget';
import { MicroTutorialStories } from '../src/components/MicroTutorialStories';
import { MultiChannelSupport } from '../src/components/MultiChannelSupport';
import {
  FadeInView,
  IdlePulseContactButton,
  useIdlePulse,
} from '../src/components/HelpInteractions';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useHelpTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const { isIdle, resetTimer } = useIdlePulse();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    resetTimer();
  };

  const handleSuggestionPress = (suggestion: string) => {
    setSearchQuery(suggestion);
    resetTimer();
  };

  const handleScroll = () => {
    resetTimer();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          data-testid="button-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Help & Support</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={handleScroll}
      >
        <FadeInView delay={0}>
          <SupportHero
            onSearch={handleSearch}
            onSuggestionPress={handleSuggestionPress}
          />
        </FadeInView>

        <FadeInView delay={80}>
          <MicroTutorialStories />
        </FadeInView>

        <FadeInView delay={160}>
          <View style={styles.faqSection}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Browse by Topic</Text>
            <SmartFAQCategories searchQuery={searchQuery} />
          </View>
        </FadeInView>

        <FadeInView delay={240}>
          <DiagnosticWidget />
        </FadeInView>

        <FadeInView delay={320}>
          <MultiChannelSupport />
        </FadeInView>

        <IdlePulseContactButton isIdle={isIdle} />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  faqSection: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  bottomSpacer: {
    height: 40,
  },
});
