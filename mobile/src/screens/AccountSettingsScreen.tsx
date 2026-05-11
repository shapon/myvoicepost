import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
  Switch,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { THEME_COLORS } from '../lib/constants';
import { subscriptionApi, type PaymentRecord, type Plan } from '../lib/api';

interface SubscriptionInfo {
  stripe_subscription_id: string | null;
  stripe_status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  plan_name: string | null;
  status: string | null;
}

interface TrialInfo {
  is_active: boolean;
  days_remaining: number;
  minutes_remaining: number;
  minutes_used: number;
  trial_ends_at: string;
}

interface AccountSettingsScreenProps {
  onBack?: () => void;
}

export default function AccountSettingsScreen({ onBack }: AccountSettingsScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [planPrice, setPlanPrice] = useState<number | null>(null);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const [paymentsData, statusData, plansData] = await Promise.all([
        subscriptionApi.getPaymentHistory(),
        subscriptionApi.getSubscriptionStatus().catch(() => null),
        subscriptionApi.getPlans(true).catch(() => [] as Plan[]),
      ]);

      setPayments(paymentsData);

      if (statusData?.trial) {
        setTrialInfo({
          is_active: statusData.trial.is_active,
          days_remaining: statusData.trial.days_remaining,
          minutes_remaining: statusData.trial.minutes_remaining,
          minutes_used: statusData.trial.minutes_used,
          trial_ends_at: statusData.trial.trial_ends_at,
        });
      } else {
        setTrialInfo(null);
      }

      if (statusData?.subscription) {
        const subPlanName = statusData.subscription.plan_name || null;
        setSubInfo({
          stripe_subscription_id: statusData.subscription.stripe_subscription_id || null,
          stripe_status: statusData.subscription.stripe_status || null,
          cancel_at_period_end: statusData.subscription.cancel_at_period_end || false,
          current_period_end: statusData.subscription.current_period_end || null,
          plan_name: subPlanName,
          status: statusData.subscription.status || null,
        });

        const matchedPlan = plansData.find((p: Plan) => p.name === subPlanName);
        setPlanPrice(matchedPlan?.price_monthly ?? null);
      } else {
        setSubInfo(null);
        setPlanPrice(null);
      }
    } catch (err: any) {
      console.error('[AccountSettings] Error fetching data:', err.message);
      setError(err.message || 'Failed to load account details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(false);
  }, [fetchData]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subInfo?.stripe_subscription_id) return;

    const isCurrentlyAutoRenewing = !subInfo.cancel_at_period_end;

    if (isCurrentlyAutoRenewing) {
      Alert.alert(
        'Turn Off Auto-Renewal',
        'Your subscription will remain active until the end of the current billing period, but will not renew automatically. Are you sure?',
        [
          { text: 'Keep Auto-Renewal', style: 'cancel' },
          {
            text: 'Turn Off',
            style: 'destructive',
            onPress: async () => {
              setTogglingAutoRenew(true);
              try {
                await subscriptionApi.cancelSubscription(subInfo.stripe_subscription_id!);
                setSubInfo(prev => prev ? { ...prev, cancel_at_period_end: true } : null);
                Alert.alert('Auto-Renewal Off', 'Your subscription will not renew at the end of the current period.');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to update auto-renewal setting');
              } finally {
                setTogglingAutoRenew(false);
              }
            },
          },
        ]
      );
    } else {
      setTogglingAutoRenew(true);
      try {
        await subscriptionApi.reactivateSubscription(subInfo.stripe_subscription_id);
        setSubInfo(prev => prev ? { ...prev, cancel_at_period_end: false } : null);
        Alert.alert('Auto-Renewal On', 'Your subscription will automatically renew at the end of the current period.');
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to reactivate auto-renewal');
      } finally {
        setTogglingAutoRenew(false);
      }
    }
  };

  const handleUpdateCard = async () => {
    setUpdatingCard(true);
    try {
      const { clientSecret, ephemeralKey, customerId } = await subscriptionApi.updatePaymentMethod();

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: 'MyVoicePost',
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        console.error('[UpdateCard] initPaymentSheet error:', initError);
        Alert.alert('Error', initError.message || 'Failed to initialize payment form');
        return;
      }

      const { error: sheetError } = await presentPaymentSheet();

      if (sheetError) {
        if (sheetError.code === 'Canceled') {
          return;
        }
        Alert.alert('Error', sheetError.message || 'Failed to update card');
        return;
      }

      Alert.alert('Card Updated', 'Your payment method has been updated successfully. It will be used for future charges.');
    } catch (err: any) {
      console.error('[UpdateCard] Error:', err);
      Alert.alert('Error', err.message || 'Failed to update payment method');
    } finally {
      setUpdatingCard(false);
    }
  };

  const formatAmount = (amount: number, currency: string): string => {
    const dollars = amount / 100;
    const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase() + ' ';
    return `${currencySymbol}${dollars.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string, refunded: boolean): string => {
    if (refunded) return '#ef4444';
    switch (status) {
      case 'active':
      case 'succeeded':
      case 'completed':
        return '#22c55e';
      case 'pending':
        return '#f59e0b';
      case 'failed':
      case 'canceled':
        return '#ef4444';
      default:
        return THEME_COLORS.textMuted;
    }
  };

  const getStatusLabel = (status: string, refunded: boolean): string => {
    if (refunded) return 'Refunded';
    switch (status) {
      case 'active': return 'Active';
      case 'succeeded': return 'Completed';
      case 'completed': return 'Completed';
      case 'pending': return 'Pending';
      case 'failed': return 'Failed';
      case 'canceled': return 'Canceled';
      default: return status;
    }
  };

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'topup': return 'flash-outline';
      case 'subscription': return 'card-outline';
      default: return 'receipt-outline';
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'topup': return 'Top-Up';
      case 'subscription': return 'Subscription';
      default: return 'Payment';
    }
  };

  const handleCancelSubscription = () => {
    if (!subInfo?.stripe_subscription_id) return;
    setShowCancelModal(true);
  };

  const confirmCancelSubscription = async () => {
    if (!subInfo?.stripe_subscription_id) return;
    setCancellingSubscription(true);
    try {
      await subscriptionApi.cancelSubscription(subInfo.stripe_subscription_id);
      setSubInfo(prev => prev ? { ...prev, cancel_at_period_end: true } : null);
      setShowCancelModal(false);
      Alert.alert('Subscription Cancelled', `Your subscription will remain active until ${formatDate(subInfo.current_period_end)}, but will not renew.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to cancel subscription');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const renderTrialPlan = () => {
    if (!trialInfo || subInfo?.stripe_subscription_id) return null;

    const trialMinutesTotal = trialInfo.minutes_remaining + trialInfo.minutes_used;
    const trialProgress = trialMinutesTotal > 0 ? Math.min(1, trialInfo.minutes_used / trialMinutesTotal) : 0;

    return (
      <>
        <Text style={styles.sectionTitle}>Current Plan</Text>
        <Card style={styles.currentPlanCard}>
          <View style={styles.currentPlanTop}>
            <View style={styles.currentPlanNameRow}>
              <View style={styles.currentPlanIconBg}>
                <Ionicons name="time-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View>
                <Text style={styles.currentPlanName} data-testid="text-plan-name">Free Trial</Text>
                <Text style={styles.currentPlanPrice} data-testid="text-plan-price">7-day trial</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: (trialInfo.is_active ? '#22c55e' : '#ef4444') + '20' }]}>
              <Text style={[styles.statusText, { color: trialInfo.is_active ? '#22c55e' : '#ef4444' }]} data-testid="text-trial-status">
                {trialInfo.is_active ? 'Active' : 'Expired'}
              </Text>
            </View>
          </View>

          <View style={styles.accountDivider} />

          <View style={styles.subRow}>
            <View style={styles.subRowLeft}>
              <Ionicons name="calendar-outline" size={18} color={THEME_COLORS.textSecondary} />
              <Text style={styles.subLabel}>Trial Expires</Text>
            </View>
            <Text style={styles.subValue} data-testid="text-trial-expiry">{formatDate(trialInfo.trial_ends_at)}</Text>
          </View>

          <View style={styles.accountDivider} />

          <View style={styles.subRow}>
            <View style={styles.subRowLeft}>
              <Ionicons name="hourglass-outline" size={18} color={THEME_COLORS.textSecondary} />
              <Text style={styles.subLabel}>Days Remaining</Text>
            </View>
            <Text style={[styles.subValue, { color: trialInfo.days_remaining <= 2 ? '#f59e0b' : THEME_COLORS.text }]} data-testid="text-trial-days">
              {trialInfo.days_remaining} {trialInfo.days_remaining === 1 ? 'day' : 'days'}
            </Text>
          </View>

          <View style={styles.accountDivider} />

          <View style={styles.trialUsageSection}>
            <View style={styles.subRow}>
              <View style={styles.subRowLeft}>
                <Ionicons name="mic-outline" size={18} color={THEME_COLORS.textSecondary} />
                <Text style={styles.subLabel}>Minutes Used</Text>
              </View>
              <Text style={styles.subValue} data-testid="text-trial-minutes-used">
                {trialInfo.minutes_used.toFixed(1)} / {trialMinutesTotal.toFixed(0)} min
              </Text>
            </View>
            <View style={styles.trialProgressBarBg}>
              <View style={[styles.trialProgressBarFill, { width: `${trialProgress * 100}%` }]} />
            </View>
            <Text style={styles.trialMinutesLeft}>
              {trialInfo.minutes_remaining.toFixed(1)} minutes remaining
            </Text>
          </View>
        </Card>
      </>
    );
  };

  const renderSubscriptionManagement = () => {
    if (!subInfo || !subInfo.stripe_subscription_id) return null;

    const isActive = subInfo.stripe_status === 'active' || subInfo.stripe_status === 'trialing';
    const autoRenewOn = !subInfo.cancel_at_period_end;
    const pendingCancellation = isActive && subInfo.cancel_at_period_end;
    const priceDisplay = planPrice !== null ? `$${(planPrice / 100).toFixed(2)}/mo` : null;

    const statusLabel = pendingCancellation
      ? 'Pending Cancellation'
      : isActive ? 'Active' : (subInfo.stripe_status || 'Inactive');
    const statusColor = pendingCancellation ? '#f59e0b' : isActive ? '#22c55e' : '#ef4444';

    return (
      <>
        <Text style={styles.sectionTitle}>Current Plan</Text>
        <Card style={styles.currentPlanCard}>
          <View style={styles.currentPlanTop}>
            <View style={styles.currentPlanNameRow}>
              <View style={styles.currentPlanIconBg}>
                <Ionicons name="diamond-outline" size={20} color={THEME_COLORS.primary} />
              </View>
              <View>
                <Text style={styles.currentPlanName} data-testid="text-plan-name">{subInfo.plan_name || 'Starter'}</Text>
                {priceDisplay && (
                  <Text style={styles.currentPlanPrice} data-testid="text-plan-price">{priceDisplay}</Text>
                )}
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]} data-testid="text-sub-status">
                {statusLabel}
              </Text>
            </View>
          </View>

          {subInfo.current_period_end && (
            <>
              <View style={styles.accountDivider} />
              <View style={styles.subRow}>
                <View style={styles.subRowLeft}>
                  <Ionicons name="calendar-outline" size={18} color={THEME_COLORS.textSecondary} />
                  <Text style={styles.subLabel}>{pendingCancellation ? 'Final Expiry Date' : autoRenewOn ? 'Next Billing Date' : 'Expires On'}</Text>
                </View>
                <Text style={styles.subValue} data-testid="text-renewal-date">{formatDate(subInfo.current_period_end)}</Text>
              </View>
            </>
          )}

          <View style={styles.accountDivider} />
          <View style={styles.subRow}>
            <View style={styles.subRowLeft}>
              <Ionicons name="repeat-outline" size={18} color={autoRenewOn ? '#22c55e' : '#f59e0b'} />
              <Text style={styles.subLabel}>Auto Renewal</Text>
            </View>
            {togglingAutoRenew ? (
              <ActivityIndicator size="small" color={THEME_COLORS.primary} />
            ) : (
              <Switch
                value={autoRenewOn}
                onValueChange={handleToggleAutoRenew}
                disabled={!isActive}
                trackColor={{ false: '#d1d5db', true: THEME_COLORS.primary + '60' }}
                thumbColor={autoRenewOn ? THEME_COLORS.primary : '#9ca3af'}
                data-testid="switch-auto-renew"
              />
            )}
          </View>

          {pendingCancellation && (
            <View style={styles.pendingCancelNotice}>
              <Ionicons name="warning-outline" size={16} color="#f59e0b" />
              <Text style={styles.pendingCancelText}>
                Your subscription has been cancelled and will expire on {formatDate(subInfo.current_period_end)}. No further charges will be made. You can reactivate anytime before that date by turning auto-renewal back on.
              </Text>
            </View>
          )}
        </Card>

        <Card style={styles.updateCardSection}>
          <View style={styles.updateCardRow}>
            <View style={styles.updateCardInfo}>
              <Ionicons name="card-outline" size={22} color={THEME_COLORS.primary} />
              <View style={styles.updateCardText}>
                <Text style={styles.updateCardTitle}>Payment Method</Text>
                <Text style={styles.updateCardDesc}>Update your card for future charges</Text>
              </View>
            </View>
            <Button
              title={updatingCard ? 'Loading...' : 'Update Card'}
              onPress={handleUpdateCard}
              disabled={updatingCard}
              style={styles.updateCardButton}
              icon={updatingCard ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="create-outline" size={16} color="#fff" />}
              data-testid="button-update-card"
            />
          </View>
        </Card>

        {isActive && !subInfo.cancel_at_period_end && (
          <TouchableOpacity
            style={styles.cancelSubscriptionButton}
            onPress={handleCancelSubscription}
            disabled={cancellingSubscription}
            activeOpacity={0.7}
            data-testid="button-cancel-subscription"
          >
            {cancellingSubscription ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
            )}
            <Text style={styles.cancelSubscriptionText}>
              {cancellingSubscription ? 'Cancelling...' : 'Cancel Subscription'}
            </Text>
          </TouchableOpacity>
        )}
      </>
    );
  };

  const renderPaymentItem = (payment: PaymentRecord) => (
    <Card key={payment.id} style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <View style={styles.paymentTypeContainer}>
          <View style={[styles.paymentIcon, { backgroundColor: payment.type === 'topup' ? '#fef3c7' : THEME_COLORS.surfaceLight }]}>
            <Ionicons
              name={getTypeIcon(payment.type) as any}
              size={18}
              color={payment.type === 'topup' ? '#d97706' : THEME_COLORS.primary}
            />
          </View>
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentPlanName} data-testid={`text-payment-plan-${payment.id}`}>
              {payment.planName}
            </Text>
            <Text style={styles.paymentType}>{getTypeLabel(payment.type)}</Text>
          </View>
        </View>
        <View style={styles.paymentAmountContainer}>
          <Text style={[styles.paymentAmount, payment.refunded && styles.paymentAmountRefunded]} data-testid={`text-payment-amount-${payment.id}`}>
            {formatAmount(payment.amount, payment.currency)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.status, payment.refunded) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(payment.status, payment.refunded) }]}>
              {getStatusLabel(payment.status, payment.refunded)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.paymentDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>{formatDate(payment.date)}</Text>
        </View>

        {payment.minutesAdded !== null && payment.minutesAdded > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Minutes Added</Text>
            <Text style={styles.detailValue}>{payment.minutesAdded} min</Text>
          </View>
        )}

        {payment.validUntil && payment.type === 'subscription' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Valid Until</Text>
            <Text style={styles.detailValue}>{formatDate(payment.validUntil)}</Text>
          </View>
        )}

        {payment.cardBrand && payment.cardLast4 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Method</Text>
            <View style={styles.cardInfo}>
              <Ionicons name="card-outline" size={14} color={THEME_COLORS.textMuted} />
              <Text style={styles.detailValue}>
                {payment.cardBrand.charAt(0).toUpperCase() + payment.cardBrand.slice(1)} ****{payment.cardLast4}
              </Text>
            </View>
          </View>
        )}
      </View>

      {payment.receiptUrl && (
        <TouchableOpacity
          style={styles.receiptButton}
          onPress={() => Linking.openURL(payment.receiptUrl!)}
          activeOpacity={0.7}
          data-testid={`button-receipt-${payment.id}`}
        >
          <Ionicons name="document-text-outline" size={16} color={THEME_COLORS.primary} />
          <Text style={styles.receiptButtonText}>View Receipt</Text>
        </TouchableOpacity>
      )}
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} data-testid="button-back">
          <Ionicons name="arrow-back" size={24} color={THEME_COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME_COLORS.primary} />
          <Text style={styles.loadingText}>Loading account details...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME_COLORS.primary} />
          }
        >
          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Username</Text>
              <Text style={styles.accountValue} data-testid="text-username">{user?.username || 'N/A'}</Text>
            </View>
            <View style={styles.accountDivider} />
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Email</Text>
              <Text style={styles.accountValue} data-testid="text-email">{user?.email || 'N/A'}</Text>
            </View>
          </Card>

          {renderTrialPlan()}
          {renderSubscriptionManagement()}

          <Text style={styles.sectionTitle}>Payment History</Text>

          {error ? (
            <Card style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={32} color={THEME_COLORS.textMuted} />
              <Text style={styles.errorText}>{error}</Text>
              <Button
                title="Retry"
                onPress={() => fetchData()}
                style={{ marginTop: 12 }}
                icon={<Ionicons name="refresh-outline" size={16} color="#fff" />}
              />
            </Card>
          ) : payments.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={40} color={THEME_COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No Payments Yet</Text>
              <Text style={styles.emptyText}>
                Your payment history will appear here after you make a purchase.
              </Text>
            </Card>
          ) : (
            payments.map(renderPaymentItem)
          )}

          <View style={styles.bottomSpacing} />
        </ScrollView>
      )}

      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => !cancellingSubscription && setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="heart-dislike-outline" size={32} color="#ef4444" />
            </View>

            <Text style={styles.modalHeading}>We're sorry to see you go.</Text>

            <Text style={styles.modalBody}>
              Your subscription will remain active until{' '}
              <Text style={styles.modalBodyBold}>{formatDate(subInfo?.current_period_end ?? null)}</Text>.
            </Text>

            <Text style={styles.modalBody}>
              No refunds are provided for the remaining period, but no further charges will be made.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.keepPlanButton}
                onPress={() => setShowCancelModal(false)}
                disabled={cancellingSubscription}
                activeOpacity={0.7}
                data-testid="button-keep-plan"
              >
                <Text style={styles.keepPlanButtonText}>Keep My Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={confirmCancelSubscription}
                disabled={cancellingSubscription}
                activeOpacity={0.7}
                data-testid="button-confirm-cancel"
              >
                {cancellingSubscription ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Text style={styles.confirmCancelButtonText}>Confirm Cancellation</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME_COLORS.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  placeholder: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: THEME_COLORS.textMuted,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  accountCard: {
    padding: 16,
    marginBottom: 24,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  accountLabel: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.text,
  },
  accountDivider: {
    height: 1,
    backgroundColor: THEME_COLORS.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 12,
  },
  currentPlanCard: {
    padding: 16,
    marginBottom: 12,
  },
  currentPlanTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  currentPlanNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currentPlanIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPlanName: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  currentPlanPrice: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
    marginTop: 2,
  },
  trialUsageSection: {
    paddingTop: 4,
  },
  trialProgressBarBg: {
    height: 6,
    backgroundColor: THEME_COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  trialProgressBarFill: {
    height: '100%',
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 3,
  },
  trialMinutesLeft: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 6,
    textAlign: 'right',
  },
  cancelSubscriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ef444440',
    borderRadius: 10,
  },
  cancelSubscriptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ef4444',
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  subRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subLabel: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  subValue: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME_COLORS.text,
  },
  pendingCancelNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f59e0b10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  pendingCancelText: {
    flex: 1,
    fontSize: 12,
    color: '#f59e0b',
    lineHeight: 18,
  },
  updateCardSection: {
    padding: 16,
    marginBottom: 24,
  },
  updateCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  updateCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  updateCardText: {
    flex: 1,
  },
  updateCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME_COLORS.text,
  },
  updateCardDesc: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
    marginTop: 2,
  },
  updateCardButton: {
    paddingHorizontal: 14,
  },
  paymentCard: {
    padding: 16,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paymentTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentPlanName: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginBottom: 2,
  },
  paymentType: {
    fontSize: 12,
    color: THEME_COLORS.textMuted,
  },
  paymentAmountContainer: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginBottom: 4,
  },
  paymentAmountRefunded: {
    textDecorationLine: 'line-through',
    color: THEME_COLORS.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  paymentDetails: {
    borderTopWidth: 1,
    borderTopColor: THEME_COLORS.border,
    paddingTop: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: THEME_COLORS.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: THEME_COLORS.text,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: THEME_COLORS.border,
  },
  receiptButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: THEME_COLORS.primary,
  },
  errorCard: {
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME_COLORS.text,
    marginTop: 12,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: THEME_COLORS.textMuted,
    textAlign: 'center',
  },
  bottomSpacing: {
    height: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: THEME_COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef444415',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalBody: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  modalBodyBold: {
    fontWeight: '700',
    color: THEME_COLORS.text,
  },
  modalButtons: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  keepPlanButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: THEME_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepPlanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  confirmCancelButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444440',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ef4444',
  },
});
