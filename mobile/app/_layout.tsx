import { useEffect, useState, useRef, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SubscriptionProvider, useSubscription } from '../src/contexts/SubscriptionContext';
import { ReliabilityProvider } from '../src/contexts/ReliabilityContext';
import { BatteryProvider } from '../src/contexts/BatteryContext';
import { ScreenSettingsProvider } from '../src/contexts/ScreenSettingsContext';
import { ThemeProvider, useThemeColors } from '../src/contexts/ThemeContext';
import { tokenManager } from '../src/lib/tokenManager';
import { subscriptionApi } from '../src/lib/api';
import { addNotificationResponseListener } from '../src/utils/pushNotifications';
import { recordingPersistenceManager, RecoveryResult } from '../src/utils/recordingPersistenceManager';
import { RecordingRecoveryModal } from '../src/components/RecoveryModal';
import { secureLog } from '../src/utils/secureLogger';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AuthAwareThemeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return (
    <ThemeProvider isAuthenticated={isAuthenticated}>
      {children}
    </ThemeProvider>
  );
}

function LoadingGate({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: subscriptionLoading } = useSubscription();
  const colors = useThemeColors();

  const isLoading = authLoading || subscriptionLoading;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

function ThemedStack() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="account-settings" options={{ headerShown: false }} />
      <Stack.Screen name="help-support" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  const [recordingRecoveryResults, setRecordingRecoveryResults] = useState<RecoveryResult[]>([]);
  const [showRecordingRecovery, setShowRecordingRecovery] = useState(false);

  const handleRecoverRecording = useCallback(async (sessionId: string, segmentPaths: string[]) => {
    secureLog.info('[RootLayout] Recording recovered:', sessionId, 'segments:', segmentPaths.length);
    setRecordingRecoveryResults(prev => {
      const next = prev.filter(r => r.sessionId !== sessionId);
      if (next.length === 0) {
        setShowRecordingRecovery(false);
      }
      return next;
    });
  }, []);

  const handleDiscardRecording = useCallback(async (sessionId: string) => {
    secureLog.info('[RootLayout] Recording discarded:', sessionId);
    setRecordingRecoveryResults(prev => {
      const next = prev.filter(r => r.sessionId !== sessionId);
      if (next.length === 0) {
        setShowRecordingRecovery(false);
      }
      return next;
    });
  }, []);

  const handleDismissRecordingRecovery = useCallback(() => {
    setShowRecordingRecovery(false);
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        await tokenManager.initialize();

        try {
          const stripeConfig = await subscriptionApi.getStripeConfig();
          setStripePublishableKey(stripeConfig.publishableKey);
          secureLog.info('[Stripe] Publishable key loaded');
        } catch (error) {
          secureLog.error('[Stripe] Failed to load publishable key:', error);
        }

        try {
          const recoveryResults = await recordingPersistenceManager.scanForRecovery();
          if (recoveryResults.length > 0) {
            secureLog.info('[RootLayout] Found', recoveryResults.length, 'recoverable recording sessions');
            setRecordingRecoveryResults(recoveryResults);
            setShowRecordingRecovery(true);
          }
        } catch (error) {
          secureLog.error('[RootLayout] Recording recovery scan failed:', error);
        }
      } catch (e) {
        console.warn('Initialization error:', e);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();

    notificationResponseListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      secureLog.info('[Notification] User tapped notification:', data);
    });

    return () => {
      if (notificationResponseListener.current) {
        Notifications.removeNotificationSubscription(notificationResponseListener.current);
      }
    };
  }, []);

  if (!isReady) {
    return null;
  }

  const AppContent = (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthAwareThemeProvider>
            <SubscriptionProvider>
              <ReliabilityProvider>
                <BatteryProvider>
                  <ScreenSettingsProvider>
                    <StatusBar style="light" />
                    <RecordingRecoveryModal
                      visible={showRecordingRecovery}
                      recoveryResults={recordingRecoveryResults}
                      onRecover={handleRecoverRecording}
                      onDiscardRecording={handleDiscardRecording}
                      onDismiss={handleDismissRecordingRecovery}
                    />
                    <LoadingGate>
                      <ThemedStack />
                    </LoadingGate>
                  </ScreenSettingsProvider>
                </BatteryProvider>
              </ReliabilityProvider>
            </SubscriptionProvider>
          </AuthAwareThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  if (stripePublishableKey) {
    return (
      <StripeProvider publishableKey={stripePublishableKey} merchantIdentifier="merchant.com.myvoicepost">
        {AppContent}
      </StripeProvider>
    );
  }

  return AppContent;
}
