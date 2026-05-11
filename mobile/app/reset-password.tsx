import { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { THEME_COLORS } from '../src/lib/constants';
import api from '../src/lib/api';
import { getUserFriendlyMessage } from '../src/utils/errorHandler';
import { validators, validateForm, hasErrors } from '../src/utils/validators';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const emailRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const isSubmittingRef = useRef(false);

  // Initialize email from params or empty string (memoized)
  const initialEmail = useMemo(() =>
    (params.email && typeof params.email === 'string') ? params.email : '',
    [params.email]
  );

  const [email, setEmail] = useState(initialEmail);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handlers to clear errors when typing
  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    setErrors(prev => {
      if (prev.email) {
        const { email, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  const handleCodeChange = useCallback((text: string) => {
    setVerificationCode(text);
    setErrors(prev => {
      if (prev.verificationCode) {
        const { verificationCode, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  const handleNewPasswordChange = useCallback((text: string) => {
    setNewPassword(text);
    setErrors(prev => {
      if (prev.newPassword) {
        const { newPassword, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  const handleConfirmPasswordChange = useCallback((text: string) => {
    setConfirmPassword(text);
    setErrors(prev => {
      if (prev.confirmPassword) {
        const { confirmPassword, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);


  const handleSubmit = useCallback(async () => {
    // Prevent multiple submissions
    if (isSubmittingRef.current || isLoading) {
      console.log('[ResetPassword] Submission already in progress, skipping...');
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);

    // Normalize inputs
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = verificationCode.trim().toUpperCase();

    // Validate all inputs
    const validationErrors = validateForm(
      {
        email: normalizedEmail,
        verificationCode: normalizedCode,
        newPassword,
        confirmPassword,
      },
      {
        email: (value) => validators.email(value),
        verificationCode: (value) => {
          const requiredError = validators.required(value, 'Verification Code');
          if (requiredError) return requiredError;
          if (value.length !== 6) {
            return 'Verification code must be 6 characters';
          }
          return null;
        },
        newPassword: (value) => validators.password(value, { minLength: 6, requireUppercase: false, requireLowercase: false, requireNumber: false }),
        confirmPassword: (value) => {
          const requiredError = validators.required(value, 'Confirm Password');
          if (requiredError) return requiredError;
          if (value !== newPassword) {
            return 'Passwords do not match';
          }
          return null;
        },
      }
    );

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      setIsLoading(false);
      isSubmittingRef.current = false;
      return;
    }

    setErrors({});

    try {
      console.log('[ResetPassword] Submitting password reset...');

      const response = await api.resetPassword(
        normalizedEmail,
        normalizedCode,
        newPassword,
        confirmPassword
      );

      console.log('[ResetPassword] Success:', response);

      // Reset loading and submitting states immediately
      setIsLoading(false);
      isSubmittingRef.current = false;

      // Check if response indicates success
      if (response?.success !== false) {
        // Show success message and navigate to login
        Alert.alert(
          'Password Reset Successful',
          'Your password has been reset successfully. Please log in with your new password.',
          [
            {
              text: 'OK',
              onPress: () => {
                router.replace('/login');
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        // Unexpected response format
        console.error('[ResetPassword] Unexpected response:', response);
        setErrors({ general: response?.message || 'Failed to reset password. Please try again.' });
      }
    } catch (err: any) {
      console.error('[ResetPassword] ===== ERROR CAUGHT =====');
      console.error('[ResetPassword] Error object:', err);
      console.error('[ResetPassword] Error message:', err?.message);
      console.error('[ResetPassword] Error status:', err?.statusCode);
      console.error('[ResetPassword] Error response:', err?.response?.data);
      console.error('[ResetPassword] Full error:', JSON.stringify(err, null, 2));

      // Extract user-friendly message
      const errorMessage = getUserFriendlyMessage(err);

      console.log('[ResetPassword] User-friendly message:', errorMessage);

      // Set error for display
      setErrors({ general: errorMessage });
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [email, verificationCode, newPassword, confirmPassword, router, isLoading]);

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
              <Ionicons name="key-outline" size={48} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter the verification code sent to your email and create a new password.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              ref={emailRef}
              label="Email Address"
              value={email}
              onChangeText={handleEmailChange}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => codeRef.current?.focus()}
              blurOnSubmit={false}
              icon={<Ionicons name="mail-outline" size={20} color={THEME_COLORS.textMuted} />}
            />

            <Input
              ref={codeRef}
              label="Verification Code"
              value={verificationCode}
              onChangeText={handleCodeChange}
              placeholder="Enter 6-character code"
              autoCapitalize="characters"
              maxLength={6}
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => newPasswordRef.current?.focus()}
              blurOnSubmit={false}
              icon={<Ionicons name="shield-checkmark-outline" size={20} color={THEME_COLORS.textMuted} />}
            />

            <View>
              <Input
                ref={newPasswordRef}
                label="New Password"
                value={newPassword}
                onChangeText={handleNewPasswordChange}
                placeholder="Enter new password (min. 6 characters)"
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                blurOnSubmit={false}
                icon={<Ionicons name="lock-closed-outline" size={20} color={THEME_COLORS.textMuted} />}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                <Ionicons
                  name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={THEME_COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>

            <View>
              <Input
                ref={confirmPasswordRef}
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                placeholder="Re-enter new password"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                icon={<Ionicons name="lock-closed-outline" size={20} color={THEME_COLORS.textMuted} />}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={THEME_COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordRequirements}>
              <Text style={styles.requirementsTitle}>Password must contain:</Text>
              <Text style={styles.requirementItem}>• At least 6 characters</Text>
            </View>

            {errors.email && <Text style={styles.error}>{errors.email}</Text>}
            {errors.verificationCode && <Text style={styles.error}>{errors.verificationCode}</Text>}
            {errors.newPassword && <Text style={styles.error}>{errors.newPassword}</Text>}
            {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}
            {errors.general && <Text style={styles.error}>{errors.general}</Text>}

            <Button
              title="Reset Password"
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.button}
            />

            <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.linkContainer}>
              <Text style={styles.linkText}>Didn't receive the code? </Text>
              <Text style={styles.link}>Resend</Text>
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
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 42,
    padding: 4,
  },
  passwordRequirements: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 6,
  },
  requirementItem: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginTop: 2,
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
  linkText: {
    color: THEME_COLORS.textSecondary,
    fontSize: 15,
  },
  link: {
    color: THEME_COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
