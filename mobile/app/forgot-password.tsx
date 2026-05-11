import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { THEME_COLORS } from '../src/lib/constants';
import api from '../src/lib/api';
import { getUserFriendlyMessage } from '../src/utils/errorHandler';
import { validators, validateForm, hasErrors } from '../src/utils/validators';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email
    const validationErrors = validateForm(
      { email: normalizedEmail },
      {
        email: (value) => validators.email(value),
      }
    );

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      console.log('[ForgotPassword] Sending request for email:', normalizedEmail);

      const response = await api.forgotPassword(normalizedEmail);

      console.log('[ForgotPassword] Response received:', response);

      // Check if response indicates success
      if (response?.success !== false) {
        // Show success message
        Alert.alert(
          'Check Your Email',
          'A verification code has been sent to your email address. Please check your inbox and spam folder.',
          [
            {
              text: 'OK',
              onPress: () => {
                console.log('[ForgotPassword] Navigating to reset-password with email:', normalizedEmail);
                router.push({
                  pathname: '/reset-password',
                  params: { email: normalizedEmail }
                });
              },
            },
          ]
        );
      } else {
        console.error('[ForgotPassword] Unexpected response:', response);
        setErrors({ general: response?.message || 'Failed to send verification code. Please try again.' });
      }
    } catch (err: any) {
      console.error('[ForgotPassword] Error:', err);
      const errorMessage = getUserFriendlyMessage(err);
      console.log('[ForgotPassword] Displaying error:', errorMessage);
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={THEME_COLORS.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed-outline" size={48} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a verification code to reset your password.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              icon={<Ionicons name="mail-outline" size={20} color={THEME_COLORS.textMuted} />}
            />

            {errors.email && <Text style={styles.error}>{errors.email}</Text>}
            {errors.general && <Text style={styles.error}>{errors.general}</Text>}

            <Button
              title="Send Verification Code"
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.button}
            />

            <TouchableOpacity onPress={() => router.back()} style={styles.linkContainer}>
              <Ionicons name="arrow-back-outline" size={16} color={THEME_COLORS.primary} />
              <Text style={styles.link}> Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: THEME_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  form: {
    width: '100%',
  },
  error: {
    color: THEME_COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  link: {
    color: THEME_COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
