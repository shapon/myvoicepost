/**
 * Privacy Consent Modal
 * 
 * Shows privacy consent on first launch
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../ui/Button';
import { THEME_COLORS } from '../../lib/constants';

const CONSENT_STORAGE_KEY = 'privacyConsentGiven';

interface PrivacyConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function PrivacyConsentModal({ visible, onAccept, onDecline }: PrivacyConsentModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView style={styles.content}>
            <Text style={styles.title}>Privacy & Data Usage</Text>
            
            <Text style={styles.sectionTitle}>Welcome to MyVoicePost</Text>
            <Text style={styles.text}>
              Before you start, please review how we handle your data.
            </Text>

            <Text style={styles.sectionTitle}>What We Collect</Text>
            <Text style={styles.bulletPoint}>• Account information (email, username)</Text>
            <Text style={styles.bulletPoint}>• Voice recordings for transcription</Text>
            <Text style={styles.bulletPoint}>• Saved texts and translations</Text>
            <Text style={styles.bulletPoint}>• App usage data (optional)</Text>

            <Text style={styles.sectionTitle}>How We Use Your Data</Text>
            <Text style={styles.bulletPoint}>• Process your voice recordings</Text>
            <Text style={styles.bulletPoint}>• Improve translation accuracy</Text>
            <Text style={styles.bulletPoint}>• Provide personalized experience</Text>
            <Text style={styles.bulletPoint}>• Send important updates</Text>

            <Text style={styles.sectionTitle}>Your Privacy Rights</Text>
            <Text style={styles.bulletPoint}>• Access your data anytime</Text>
            <Text style={styles.bulletPoint}>• Export or delete your data</Text>
            <Text style={styles.bulletPoint}>• Control data sharing preferences</Text>
            <Text style={styles.bulletPoint}>• Opt-out of analytics</Text>

            <Text style={styles.sectionTitle}>Data Security</Text>
            <Text style={styles.text}>
              We use industry-standard encryption to protect your data. Audio recordings
              are processed server-side and not permanently stored. Your account credentials
              are encrypted and secure.
            </Text>

            <Text style={styles.important}>
              By continuing, you agree to our Privacy Policy and Terms of Service.
              You can change your preferences anytime in Settings.
            </Text>
          </ScrollView>

          <View style={styles.buttons}>
            <Button
              title="Accept & Continue"
              onPress={onAccept}
              variant="primary"
              style={styles.button}
            />
            <Button
              title="Decline"
              onPress={onDecline}
              variant="outline"
              style={styles.button}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Hook to check and request privacy consent
 */
export function usePrivacyConsent() {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checkConsent = async () => {
    try {
      const consent = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      if (consent === 'true') {
        setConsentGiven(true);
      } else if (consent === 'false') {
        setConsentGiven(false);
      } else {
        // First launch - show consent modal
        setShowModal(true);
      }
    } catch (error) {
      console.error('Failed to check privacy consent:', error);
      setShowModal(true); // Show modal on error to be safe
    }
  };

  const acceptConsent = async () => {
    try {
      await AsyncStorage.setItem(CONSENT_STORAGE_KEY, 'true');
      setConsentGiven(true);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save consent:', error);
    }
  };

  const declineConsent = async () => {
    try {
      await AsyncStorage.setItem(CONSENT_STORAGE_KEY, 'false');
      setConsentGiven(false);
      setShowModal(false);
      // App should handle what to do when consent is declined
      // (e.g., show limited functionality or exit)
    } catch (error) {
      console.error('Failed to save consent:', error);
    }
  };

  return {
    consentGiven,
    showModal,
    checkConsent,
    acceptConsent,
    declineConsent,
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 500,
    overflow: 'hidden',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    lineHeight: 22,
    paddingLeft: 8,
  },
  important: {
    fontSize: 13,
    color: THEME_COLORS.warning,
    lineHeight: 18,
    marginTop: 16,
    fontStyle: 'italic',
  },
  buttons: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: THEME_COLORS.border,
  },
  button: {
    marginBottom: 8,
  },
});
