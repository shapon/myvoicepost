import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { THEME_COLORS } from '../src/lib/constants';
import { validators, validateForm, hasErrors, validatePasswordConfirmation } from '../src/utils/validators';
import { getUserFriendlyMessage } from '../src/utils/errorHandler';
import api from '../src/lib/api';

export default function RegisterScreen() {
  const { register, loginWithGoogle, isGoogleLoading } = useAuth();
  const router = useRouter();
  const otpRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSendOTP = async () => {
    // Validate email first
    const emailError = validators.email(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    setIsSendingOTP(true);
    setErrors({});

    try {
      const response = await api.sendOTP(email.toLowerCase().trim());

      if (response.success) {
        setOtpSent(true);

        // Auto-fill username from email (part before @)
        const usernameFromEmail = email.split('@')[0] ?? '';
        setUsername(usernameFromEmail);

        Alert.alert(
          '✓ Code Sent',
          'A verification code has been sent to your email. Please check your inbox.',
          [{ text: 'OK', onPress: () => otpRef.current?.focus() }]
        );
      }
    } catch (err: any) {
      const errorMessage = getUserFriendlyMessage(err);
      setErrors({ email: errorMessage });
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleRegister = async () => {
    // Validate all inputs
    const validationErrors = validateForm(
      { email, otp, username, password, confirmPassword },
      {
        email: validators.email,
        otp: (value) => validators.required(value, 'Verification code'),
        username: (value) => validators.required(value, 'Username'),
        password: (value) => validators.password(value, { minLength: 8 }),
        confirmPassword: (value) => validatePasswordConfirmation(password, value),
      }
    );

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await register(
        username.trim(),
        email.toLowerCase().trim(),
        password,
        confirmPassword,
        otp.trim()
      );

      Alert.alert(
        'Welcome!',
        'Your account is ready!\n\nYou have a 7-day free trial with 90 minutes of recording.\n\nEnjoy exploring all features!',
        [{ text: 'Get Started', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      const errorMessage = getUserFriendlyMessage(err);
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
            <View style={styles.logo}>
              <Ionicons name="mic" size={48} color={THEME_COLORS.primary} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Sign up to get started</Text>
          </View>

          <View style={styles.form}>
            {/* Email Field - Always visible */}
            <Input
              label="Email"
              value={email}
              onChangeText={(text) => setEmail(text.toLowerCase())}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="done"
              editable={!otpSent}
              icon={<Ionicons name="mail-outline" size={20} color={THEME_COLORS.textMuted} />}
            />

            {errors.email && <Text style={styles.error}>{errors.email}</Text>}

            {/* Send OTP Button - Only visible before OTP is sent */}
            {!otpSent && (
              <Button
                title="Send Verification Code"
                onPress={handleSendOTP}
                loading={isSendingOTP}
                style={styles.sendOtpButton}
              />
            )}

            {/* Remaining Fields - Only visible after OTP is sent */}
            {otpSent && (
              <>
                <Input
                  ref={otpRef}
                  label="Verification Code"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="Enter 6-digit code"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  maxLength={6}
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  blurOnSubmit={false}
                  icon={<Ionicons name="shield-checkmark-outline" size={20} color={THEME_COLORS.textMuted} />}
                />

                {errors.otp && <Text style={styles.error}>{errors.otp}</Text>}

                <Input
                  ref={usernameRef}
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter your username"
                  autoCapitalize="words"
                  autoComplete="username"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  icon={<Ionicons name="person-outline" size={20} color={THEME_COLORS.textMuted} />}
                />

                {errors.username && <Text style={styles.error}>{errors.username}</Text>}

                <View>
                  <Input
                    ref={passwordRef}
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                    blurOnSubmit={false}
                    icon={<Ionicons name="lock-closed-outline" size={20} color={THEME_COLORS.textMuted} />}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={THEME_COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                {errors.password && <Text style={styles.error}>{errors.password}</Text>}

                <Input
                  ref={confirmPasswordRef}
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  icon={<Ionicons name="lock-closed-outline" size={20} color={THEME_COLORS.textMuted} />}
                />

                {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}
                {errors.general && <Text style={styles.error}>{errors.general}</Text>}

                <Button
                  title="Create Account"
                  onPress={handleRegister}
                  loading={isLoading}
                  style={styles.button}
                />
              </>
            )}
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={loginWithGoogle}
            disabled={isGoogleLoading}
            activeOpacity={0.7}
          >
            {isGoogleLoading ? (
              <ActivityIndicator size="small" color={THEME_COLORS.text} style={{ marginRight: 12 }} />
            ) : (
              <Ionicons name="logo-google" size={20} color={THEME_COLORS.text} style={{ marginRight: 12 }} />
            )}
            <Text style={styles.googleButtonText}>
              {isGoogleLoading ? 'Signing up...' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerSmall} />

          <TouchableOpacity onPress={() => router.replace('/login')} style={styles.linkContainer}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Text style={styles.link}>Sign In</Text>
          </TouchableOpacity>
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
    marginBottom: 32,
  },
  logo: {
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
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
  error: {
    color: THEME_COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  sendOtpButton: {
    marginTop: 8,
    marginBottom: 8,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME_COLORS.surface,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerSmall: {
    height: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME_COLORS.border,
  },
  dividerText: {
    color: THEME_COLORS.textMuted,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
