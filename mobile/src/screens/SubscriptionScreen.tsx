import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { subscriptionApi, Plan } from '../lib/api';
import { THEME_COLORS } from '../lib/constants';
import { handleApiError } from '../utils/errorHandler';

interface SubscriptionStatus {
  trial: {
    is_active: boolean;
    days_remaining: number;
    minutes_remaining: number;
    minutes_used: number;
    trial_ends_at: string;
  };
  subscription: any | null;
  has_active_subscription: boolean;
  has_active_trial: boolean;
}

export function SubscriptionScreen() {
  const { user, isAuthenticated } = useAuth();
  const { refreshSubscription: refreshContextSubscription, checkAccess: checkContextAccess } = useSubscription();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const plansData = await subscriptionApi.getPlans();
      setPlans(plansData);

      if (isAuthenticated) {
        const status = await subscriptionApi.getSubscriptionStatus();
        setSubscriptionStatus(status);
      }
    } catch (error) {
      const apiError = handleApiError(error);
      console.error('[Subscription] Error loading data:', apiError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAfterSubscription = async () => {
    try {
      await refreshContextSubscription();
      await checkContextAccess();
      await loadData();
      console.log('[Subscription] Context and local state refreshed after subscription change');
    } catch (error) {
      console.error('[Subscription] Error refreshing after subscription:', error);
      await loadData();
    }
  };

  const handleSubscribe = async (plan: Plan) => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please log in to subscribe.');
      return;
    }

    if (!user?.email) {
      Alert.alert('Error', 'User email not found. Please log in again.');
      return;
    }

    if (!plan.stripe_price_id) {
      Alert.alert('Error', 'This plan is not available for subscription.');
      return;
    }

    try {
      const preCheck = await subscriptionApi.preSubscribeCheck();

      if (preCheck.is_subscribed || preCheck.has_active_access) {
        const planMinutes = plan.valid_total_minutes || 0;
        const planDays = 30;
        const currentMins = Math.round(preCheck.current_minutes_remaining);
        const currentDays = preCheck.current_days_remaining;

        const message = preCheck.is_subscribed
          ? `You already have an active subscription.\n\n` +
            `Current status:\n` +
            `  ${currentDays} days remaining\n` +
            `  ${currentMins} minutes remaining\n\n` +
            `Subscribing again will extend your plan by:\n` +
            `  +${planDays} days\n` +
            `  +${planMinutes} minutes\n\n` +
            `Would you like to proceed?`
          : `You have an active trial.\n\n` +
            `Current status:\n` +
            `  ${currentDays} days remaining\n` +
            `  ${currentMins} minutes remaining\n\n` +
            `Subscribing will add:\n` +
            `  +${planDays} days\n` +
            `  +${planMinutes} minutes\n` +
            `  (your unused minutes carry forward)\n\n` +
            `Would you like to proceed?`;

        Alert.alert(
          'Extend Your Plan',
          message,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Proceed to Payment',
              onPress: () => proceedWithPayment(plan),
            },
          ]
        );
        return;
      }
    } catch (error) {
      console.log('[Subscription] Pre-check failed, proceeding directly:', error);
    }

    proceedWithPayment(plan);
  };

  const proceedWithPayment = async (plan: Plan) => {
    if (!user?.email || !plan.stripe_price_id) return;

    setIsProcessing(true);
    try {
      console.log('[Subscription] Creating subscription for plan:', plan.name);
      console.log('[Subscription] User email:', user.email);
      console.log('[Subscription] Price ID:', plan.stripe_price_id);

      const { subscriptionId, clientSecret, type, ephemeralKey, customerId } = await subscriptionApi.createSubscription(
        user.email,
        plan.stripe_price_id
      );

      console.log('[Subscription] Backend response:', { subscriptionId, hasClientSecret: !!clientSecret, type, hasEphemeralKey: !!ephemeralKey, customerId });

      if (!clientSecret) {
        console.error('[Subscription] No client secret returned - cannot proceed with payment');
        Alert.alert('Payment Setup Error', 'Unable to set up payment. Please try again or contact support.');
        return;
      }

      if (!ephemeralKey || !customerId) {
        console.error('[Subscription] Missing ephemeralKey or customerId for PaymentSheet');
        Alert.alert('Payment Setup Error', 'Unable to set up payment. Please try again or contact support.');
        return;
      }

      console.log('[Subscription] Initializing payment sheet with type:', type);
      const initParams: any = {
        merchantDisplayName: 'MyVoicePost',
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        allowsDelayedPaymentMethods: false,
        returnURL: 'myvoicepost://subscription',
      };

      if (type === 'setup') {
        initParams.setupIntentClientSecret = clientSecret;
      } else {
        initParams.paymentIntentClientSecret = clientSecret;
      }

      const { error: initError } = await initPaymentSheet(initParams);

      if (initError) {
        console.error('[Subscription] Payment sheet init error:', initError);
        Alert.alert('Payment Setup Failed', initError.message || 'Unable to initialize payment. Please try again.');
        return;
      }

      console.log('[Subscription] Presenting payment sheet...');
      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        console.error('[Subscription] Payment error:', paymentError);
        if (paymentError.code === 'Canceled') {
          console.log('[Subscription] User cancelled payment');
          return;
        }
        Alert.alert('Payment Failed', paymentError.message || 'Payment could not be processed. Please check your payment method and try again.');
        return;
      }

      console.log('[Subscription] Payment completed via PaymentSheet, confirming with server...');

      try {
        const confirmResult = await subscriptionApi.confirmSubscription(subscriptionId);
        console.log('[Subscription] Confirmation result:', confirmResult);
        Alert.alert('Success', 'Your subscription is now active!');
      } catch (confirmError: any) {
        console.error('[Subscription] Confirm error (payment was processed):', confirmError);
        Alert.alert('Payment Processed', 'Your payment was successful. Your subscription will be activated shortly.');
      }

      await refreshAfterSubscription();

    } catch (error) {
      console.error('[Subscription] Error in handleSubscribe:', error);
      const apiError = handleApiError(error);

      // Provide more helpful error messages based on the error
      let errorTitle = 'Subscription Failed';
      let errorMessage = apiError.message;

      if (apiError.statusCode === 401) {
        errorTitle = 'Authentication Required';
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (apiError.statusCode === 403) {
        errorTitle = 'Access Denied';
        errorMessage = 'You do not have permission to subscribe. Please contact support.';
      } else if (apiError.statusCode === 404) {
        errorTitle = 'Plan Not Found';
        errorMessage = 'The selected subscription plan is not available. Please try again or contact support.';
      } else if (apiError.statusCode === 500 || apiError.statusCode === 502 || apiError.statusCode === 503) {
        errorTitle = 'Server Error';
        errorMessage = 'Our servers are experiencing issues. Please try again in a few moments.';
      } else if (!apiError.statusCode) {
        errorTitle = 'Connection Error';
        errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      }

      Alert.alert(errorTitle, errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscriptionStatus?.subscription?.stripe_subscription_id) {
      Alert.alert('Error', 'No active subscription found.');
      return;
    }

    Alert.alert(
      'Cancel Subscription',
      'Your subscription will remain active until the end of the current billing period. Are you sure?',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsProcessing(true);
              const result = await subscriptionApi.cancelSubscription(
                subscriptionStatus.subscription.stripe_subscription_id
              );

              Alert.alert('Cancelled', result.message);
              await refreshAfterSubscription();
            } catch (error) {
              const apiError = handleApiError(error);
              Alert.alert('Error', apiError.message);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleRestorePurchase = async () => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please log in to restore your subscription.');
      return;
    }

    try {
      setIsProcessing(true);
      console.log('[Subscription] Restoring purchase...');

      await loadData();

      // Check if subscription is now active
      const status = await subscriptionApi.getSubscriptionStatus();

      if (status.has_active_subscription || status.has_active_trial) {
        Alert.alert(
          'Success',
          status.has_active_subscription
            ? 'Your subscription has been restored!'
            : 'Your trial has been restored!'
        );
      } else {
        Alert.alert(
          'No Subscription Found',
          'We could not find an active subscription for your account. If you believe this is an error, please contact support.'
        );
      }
    } catch (error) {
      console.error('[Subscription] Error restoring purchase:', error);
      const apiError = handleApiError(error);
      Alert.alert('Restore Failed', apiError.message || 'Unable to restore your subscription. Please try again or contact support.');
    } finally {
      setIsProcessing(false);
    }
  };


  const handleBuyTopUp = async () => {
    if (!isAuthenticated) {
      Alert.alert('Login Required', 'Please log in to purchase a top-up.');
      return;
    }

    Alert.alert(
      'Buy 60-Minute Top-Up',
      'Add 60 minutes of recording time for $5.00. This is a one-time purchase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy Now',
          onPress: async () => {
            try {
              setIsProcessing(true);
              console.log('[Subscription] Creating top-up payment intent...');
              const { clientSecret, ephemeralKey, customerId, paymentIntentId } = await subscriptionApi.createTopupCheckout();

              if (!clientSecret) {
                Alert.alert('Error', 'Failed to set up payment. Please try again.');
                return;
              }

              console.log('[Subscription] Initializing top-up payment sheet...');
              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: 'MyVoicePost',
                paymentIntentClientSecret: clientSecret,
                customerEphemeralKeySecret: ephemeralKey,
                customerId: customerId,
                allowsDelayedPaymentMethods: false,
                returnURL: 'myvoicepost://subscription',
              });

              if (initError) {
                console.error('[Subscription] Top-up payment sheet init error:', initError);
                Alert.alert('Payment Setup Failed', initError.message || 'Unable to initialize payment. Please try again.');
                return;
              }

              console.log('[Subscription] Presenting top-up payment sheet...');
              const { error: paymentError } = await presentPaymentSheet();

              if (paymentError) {
                console.error('[Subscription] Top-up payment error:', paymentError);
                if (paymentError.code === 'Canceled') {
                  console.log('[Subscription] User cancelled top-up payment');
                  return;
                }
                Alert.alert('Payment Failed', paymentError.message || 'Payment could not be processed. Please try again.');
                return;
              }

              console.log('[Subscription] Top-up payment successful! Confirming with server...');
              try {
                const confirmResult = await subscriptionApi.confirmTopup(paymentIntentId);
                console.log('[Subscription] Top-up confirmed:', confirmResult);
                Alert.alert('Success', confirmResult.message || '60 minutes have been added to your account!');
              } catch (confirmError: any) {
                console.error('[Subscription] Top-up confirm error (payment was charged):', confirmError);
                Alert.alert('Payment Processed', 'Your payment was successful. Minutes will be added shortly.');
              }
              loadData();
            } catch (error) {
              const apiError = handleApiError(error);
              Alert.alert('Top-Up Failed', apiError.message || 'Unable to process top-up. Please try again.');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const formatPrice = (priceInCents: number): string => {
    if (priceInCents === 0) return 'Free';
    return `$${(priceInCents / 100).toFixed(2)}/month`;
  };

  const formatMinutes = (minutes: number | null): string => {
    if (minutes === null || minutes === 0) return 'Unlimited';
    return `${minutes.toLocaleString()} minutes`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        <Text style={styles.loadingText}>Loading subscription details...</Text>
      </View>
    );
  }

  const starterPlan = plans.find(p => p.name === 'Starter');
  const hasActiveTrial = subscriptionStatus?.has_active_trial;
  const hasActiveSubscription = subscriptionStatus?.has_active_subscription;
  const subscription = subscriptionStatus?.subscription;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.backButton} data-testid="button-back">
          <Ionicons name="arrow-back" size={24} color={THEME_COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.navHeaderTitle}>Plans & Subscription</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="diamond" size={48} color={THEME_COLORS.primary} />
          <Text style={styles.title}>MyVoicePost Starter</Text>
          <Text style={styles.subtitle}>
            {isAuthenticated
              ? 'Professional voice transcription and translation'
              : 'Sign in to activate your free trial'}
          </Text>
        </View>

        {/* Trial Status Card */}
        {isAuthenticated && hasActiveTrial && subscriptionStatus && (
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Ionicons name="gift" size={28} color={THEME_COLORS.warning} />
              <Text style={styles.statusTitle}>Free Trial Active</Text>
            </View>
            <Text style={styles.statusSubtitle}>7-Day Trial • 90 Minutes</Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{subscriptionStatus.trial.days_remaining}</Text>
                <Text style={styles.statLabel}>Days Left</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{Math.round(subscriptionStatus.trial.minutes_remaining)}</Text>
                <Text style={styles.statLabel}>Minutes Left</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{Math.round(subscriptionStatus.trial.minutes_used)}</Text>
                <Text style={styles.statLabel}>Used</Text>
              </View>
            </View>

            <View style={styles.trialHint}>
              <Ionicons name="information-circle" size={16} color={THEME_COLORS.primary} />
              <Text style={styles.trialHintText}>
                Subscribe now and keep your unused trial minutes!
              </Text>
            </View>
          </View>
        )}

        {/* Active Subscription Card */}
        {isAuthenticated && hasActiveSubscription && subscription && (
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Ionicons name="checkmark-circle" size={28} color={THEME_COLORS.success} />
              <Text style={styles.statusTitle}>Active Subscription</Text>
            </View>
            <Text style={styles.statusSubtitle}>{subscription.plan_name} Plan</Text>

            <View style={styles.subscriptionDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Minutes Remaining:</Text>
                <Text style={styles.detailValue}>
                  {subscription.minutes_remaining !== undefined
                    ? `${Math.round(subscription.minutes_remaining)} min`
                    : formatMinutes(subscription.valid_total_minutes)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Renewal Date:</Text>
                <Text style={styles.detailValue}>
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : 'N/A'}
                </Text>
              </View>
              {subscription.cancel_at_period_end && (
                <View style={[styles.detailRow, styles.warningRow]}>
                  <Ionicons name="warning" size={16} color={THEME_COLORS.warning} />
                  <Text style={styles.warningText}>
                    Cancels on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>

            {!subscription.cancel_at_period_end && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelSubscription}
                disabled={isProcessing}
              >
                <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Starter Plan Card */}
        {starterPlan && (
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <View>
                <Text style={styles.planName}>{starterPlan.name}</Text>
                <Text style={styles.planPrice}>{formatPrice(starterPlan.price_monthly)}</Text>
              </View>
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>BEST VALUE</Text>
              </View>
            </View>

            <View style={styles.planFeatures}>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  {formatMinutes(starterPlan.valid_total_minutes)} per month
                </Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  {starterPlan.recordings_available_days} days recording access
                </Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  Up to {starterPlan.chunks_count} chunks per recording
                </Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  {starterPlan.offline_recording ? 'Offline recording' : 'Online only'}
                </Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  Background chunk processing
                </Text>
              </View>
              <View style={styles.feature}>
                <Ionicons name="checkmark-circle" size={20} color={THEME_COLORS.success} />
                <Text style={styles.featureText}>
                  Polish & translate in 18+ languages
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.subscribeButton, isProcessing && styles.subscribeButtonDisabled]}
              onPress={() => handleSubscribe(starterPlan)}
              disabled={!isAuthenticated || isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color={THEME_COLORS.text} />
              ) : (
                <Text style={styles.subscribeButtonText}>
                  {hasActiveSubscription
                    ? 'Extend Subscription'
                    : hasActiveTrial
                      ? 'Subscribe & Keep Trial Minutes'
                      : 'Start 7-Day Free Trial'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Trial Info */}
        {!hasActiveSubscription && (
          <View style={styles.trialInfo}>
            <Ionicons name="information-circle-outline" size={20} color={THEME_COLORS.textSecondary} />
            <Text style={styles.trialInfoText}>
              Start with a 7-day free trial (90 minutes). No payment required to start. Cancel anytime.
            </Text>
          </View>
        )}


        {/* Top-Up Section */}
        {isAuthenticated && (hasActiveTrial || hasActiveSubscription) && (
          <View style={styles.topupCard}>
            <View style={styles.topupHeader}>
              <Ionicons name="flash" size={24} color={THEME_COLORS.primary} />
              <Text style={styles.topupTitle}>Need More Minutes?</Text>
            </View>
            <Text style={styles.topupDescription}>
              Add 60 minutes of recording time instantly. One-time purchase, no recurring charges.
            </Text>
            <TouchableOpacity
              style={[styles.topupButton, isProcessing && styles.buttonDisabled]}
              onPress={handleBuyTopUp}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.topupButtonText}>Buy 60 Minutes - $5.00</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Restore Purchase Button */}
        {isAuthenticated && (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestorePurchase}
            disabled={isProcessing}
          >
            <Ionicons name="refresh" size={18} color={THEME_COLORS.primary} />
            <Text style={styles.restoreButtonText}>Restore Purchase</Text>
          </TouchableOpacity>
        )}

        {/* Login Prompt */}
        {!isAuthenticated && (
          <View style={styles.loginPrompt}>
            <Ionicons name="lock-closed-outline" size={32} color={THEME_COLORS.textMuted} />
            <Text style={styles.loginPromptText}>
              Sign in to activate your free trial
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME_COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  statusCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: THEME_COLORS.border,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    marginLeft: 12,
  },
  statusSubtitle: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: THEME_COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: THEME_COLORS.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: THEME_COLORS.border,
  },
  trialHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME_COLORS.primaryMuted,
    padding: 12,
    borderRadius: 8,
  },
  trialHintText: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  subscriptionDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  detailLabel: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  warningRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
    alignItems: 'center',
  },
  warningText: {
    fontSize: 14,
    color: THEME_COLORS.warning,
    marginLeft: 8,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME_COLORS.error,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.error,
  },
  planCard: {
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: THEME_COLORS.primary,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.primary,
    marginTop: 4,
  },
  planBadge: {
    backgroundColor: THEME_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
    letterSpacing: 0.5,
  },
  planFeatures: {
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: THEME_COLORS.text,
    marginLeft: 12,
    flex: 1,
  },
  subscribeButton: {
    backgroundColor: THEME_COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME_COLORS.text,
  },
  currentPlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: THEME_COLORS.primaryMuted,
    borderRadius: 8,
  },
  currentPlanText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.success,
    marginLeft: 8,
  },
  trialInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: THEME_COLORS.surfaceLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  trialInfoText: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },

  topupCard: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME_COLORS.primary + '30',
  },
  topupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
    gap: 8,
  },
  topupTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: THEME_COLORS.text,
  },
  topupDescription: {
    fontSize: 14,
    color: THEME_COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  topupButton: {
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  topupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 24,
  },
  restoreButtonText: {
    fontSize: 14,
    color: THEME_COLORS.primary,
    marginLeft: 8,
    fontWeight: '600',
  },
  loginPrompt: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loginPromptText: {
    fontSize: 16,
    color: THEME_COLORS.textMuted,
    marginTop: 12,
  },
});
