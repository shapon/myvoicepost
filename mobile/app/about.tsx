import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { THEME_COLORS } from '../src/lib/constants';

const APP_VERSION = '1.0.0';
const WEBSITE_URL = 'https://www.myvoicepost.com';
const SUPPORT_EMAIL = 'support@myvoicepost.com';
const PRIVACY_URL = 'https://www.myvoicepost.com/privacy';
const TERMS_URL = 'https://www.myvoicepost.com/terms';

const FEATURES = [
  {
    icon: 'mic-outline',
    title: 'Voice to Text',
    description: 'Transcribe speech into accurate text in real-time across 18+ languages.',
  },
  {
    icon: 'sparkles-outline',
    title: 'AI Polish',
    description: 'Transform rough voice notes into professionally polished content instantly.',
  },
  {
    icon: 'language-outline',
    title: 'Smart Translation',
    description: 'Translate and polish your text across languages in a single step.',
  },
  {
    icon: 'cloud-offline-outline',
    title: 'Offline Recording',
    description: 'Record without an internet connection and sync when you are back online.',
  },
  {
    icon: 'layers-outline',
    title: 'Chunked Processing',
    description: 'Record for up to 10 minutes with automatic background chunk transcription.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Secure & Private',
    description: 'Your recordings are processed securely and never stored without your consent.',
  },
];

const TEAM_VALUES = [
  {
    icon: 'bulb-outline',
    title: 'Innovation',
    description: 'We use the latest AI to make voice-to-text faster and smarter every day.',
  },
  {
    icon: 'accessibility-outline',
    title: 'Accessibility',
    description: 'Making communication easier for everyone, everywhere, in any language.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Privacy First',
    description: 'We believe your voice data belongs to you — always.',
  },
];

export default function AboutScreen() {
  const router = useRouter();

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          data-testid="button-back-about"
        >
          <Ionicons name="arrow-back" size={22} color={THEME_COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Us</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <Ionicons name="mic" size={40} color="#fff" />
          </View>
          <Text style={styles.appName}>MyVoicePost</Text>
          <Text style={styles.tagline}>
            Transform your voice into polished, professional text — instantly.
          </Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Version {APP_VERSION}</Text>
          </View>
        </View>

        {/* Mission */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Mission</Text>
          <View style={styles.card}>
            <Text style={styles.missionText}>
              At MyVoicePost, we believe everyone has something valuable to say — and no one should
              be held back by the time it takes to write it down. We built this app to bridge the
              gap between your thoughts and polished communication, using the power of AI.
            </Text>
            <Text style={styles.missionText}>
              Whether you are composing a professional email, drafting a social post, or capturing
              an idea on the go, MyVoicePost helps you do it faster, smarter, and in any language.
            </Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What We Offer</Text>
          <View style={styles.card}>
            {FEATURES.map((feature, index) => (
              <View key={feature.title}>
                <View style={styles.featureRow}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon as any} size={20} color={THEME_COLORS.primary} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureDescription}>{feature.description}</Text>
                  </View>
                </View>
                {index < FEATURES.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Values */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Values</Text>
          <View style={styles.valuesGrid}>
            {TEAM_VALUES.map((value) => (
              <View key={value.title} style={styles.valueCard}>
                <View style={styles.valueIcon}>
                  <Ionicons name={value.icon as any} size={24} color={THEME_COLORS.primary} />
                </View>
                <Text style={styles.valueTitle}>{value.title}</Text>
                <Text style={styles.valueDescription}>{value.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tech */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Built With</Text>
          <View style={styles.card}>
            <Text style={styles.techText}>
              MyVoicePost is powered by Google Gemini for transcription and AI text refinement,
              React Native for a seamless cross-platform experience, and a secure Node.js backend
              to keep your data safe.
            </Text>
            <View style={styles.techBadges}>
              {['Google Gemini AI', 'React Native', 'Expo', 'Node.js'].map((tech) => (
                <View key={tech} style={styles.techBadge}>
                  <Text style={styles.techBadgeText}>{tech}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Contact / Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => openLink(WEBSITE_URL)}
              activeOpacity={0.7}
              data-testid="link-website"
            >
              <View style={styles.linkIcon}>
                <Ionicons name="globe-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>Website</Text>
                <Text style={styles.linkSubtitle}>www.myvoicepost.com</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={THEME_COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
              activeOpacity={0.7}
              data-testid="link-email"
            >
              <View style={styles.linkIcon}>
                <Ionicons name="mail-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>Support</Text>
                <Text style={styles.linkSubtitle}>{SUPPORT_EMAIL}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={THEME_COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => openLink(PRIVACY_URL)}
              activeOpacity={0.7}
              data-testid="link-privacy"
            >
              <View style={styles.linkIcon}>
                <Ionicons name="shield-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>Privacy Policy</Text>
                <Text style={styles.linkSubtitle}>How we handle your data</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={THEME_COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => openLink(TERMS_URL)}
              activeOpacity={0.7}
              data-testid="link-terms"
            >
              <View style={styles.linkIcon}>
                <Ionicons name="document-text-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View style={styles.linkText}>
                <Text style={styles.linkTitle}>Terms of Service</Text>
                <Text style={styles.linkSubtitle}>Usage guidelines and policies</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={THEME_COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            &copy; {new Date().getFullYear()} MyVoicePost. All rights reserved.
          </Text>
          <Text style={styles.footerSub}>Made with care for communicators everywhere.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: THEME_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME_COLORS.text,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
    marginBottom: 16,
  },
  versionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: THEME_COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  versionText: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    fontWeight: '500',
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    paddingTop: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME_COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  card: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  divider: {
    height: 1,
    backgroundColor: THEME_COLORS.border,
    marginVertical: 2,
  },

  // Mission
  missionText: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 12,
  },

  // Features
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 14,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    lineHeight: 19,
  },

  // Values
  valuesGrid: {
    gap: 12,
  },
  valueCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  valueIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  valueTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginBottom: 6,
  },
  valueDescription: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    lineHeight: 20,
  },

  // Tech
  techText: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 14,
  },
  techBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  techBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: THEME_COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  techBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME_COLORS.primary,
  },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  linkText: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  linkSubtitle: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 24,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
  },
  footerSub: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
