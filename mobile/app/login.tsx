import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { Input } from '../src/components/ui/Input';
import { Button } from '../src/components/ui/Button';
import { THEME_COLORS } from '../src/lib/constants';
import { validators, validateForm, hasErrors } from '../src/utils/validators';
import { getUserFriendlyMessage } from '../src/utils/errorHandler';

export default function LoginScreen() {
  const { login, loginWithGoogle, isGoogleLoading } = useAuth();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleLogin = async () => {
    // Validate inputs
    const validationErrors = validateForm(
      { 
        email: email.trim(),
        password
      },
      {
        email: validators.email,
        password: (value) => validators.required(value, 'Password'),
      }
    );

    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await login(email.toLowerCase().trim(), password);
      router.replace('/');
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
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={(text) => setEmail(text.toLowerCase())}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              icon={<Ionicons name="mail-outline" size={20} color={THEME_COLORS.textMuted} />}
            />

            <View>
              <Input
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
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

            {errors.email && <Text style={styles.error}>{errors.email}</Text>}
            {errors.password && <Text style={styles.error}>{errors.password}</Text>}
            {errors.general && <Text style={styles.error}>{errors.general}</Text>}

            <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={isLoading}
              style={styles.button}
            />

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
                {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerSmall} />

            <TouchableOpacity onPress={() => router.replace('/register')} style={styles.linkContainer}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <Text style={styles.link}>Sign Up</Text>
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
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 16,
  },
  forgotPasswordText: {
    color: THEME_COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
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
