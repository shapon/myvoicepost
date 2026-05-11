import { secureLog } from '../utils/secureLogger';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { subscriptionApi, Subscription, Plan, Trial } from '../lib/api';
import { useAuth } from './AuthContext';
import { handleApiError, ErrorReporter } from '../utils/errorHandler';

interface SubscriptionContextType {
  subscription: Subscription | null;
  trial: Trial | null;
  plans: Plan[];
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
  refreshPlans: () => Promise<void>;
  hasFeature: (feature: keyof Subscription) => boolean;
  remainingMinutes: number | null;
  hasAccess: boolean;
  checkAccess: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    initialize();
  }, [isAuthenticated]);

  const initialize = async () => {
    const timeoutId = setTimeout(() => {
      secureLog.warn('[SubscriptionContext] Initialization timeout - setting loading to false');
      setIsLoading(false);
    }, 8000);

    setIsLoading(true);
    try {
      await refreshPlans();

      if (isAuthenticated) {
        try {
          await refreshSubscription();
          await checkAccess();
        } catch (error) {
          secureLog.error('[SubscriptionContext] Error fetching subscription for authenticated user:', error);
          ErrorReporter.warn('Failed to fetch subscription', 'SubscriptionContext.initialize', {
            error: handleApiError(error).message,
          });
          setSubscription({
            plan_name: 'Free',
            valid_total_minutes: null,
            recordings_available_days: 0,
            chunks_count: 0,
            offline_recording: false,
          });
          setTrial(null);
          setHasAccess(false);
        }
      } else {
        setSubscription({
          plan_name: 'Free',
          valid_total_minutes: null,
          recordings_available_days: 0,
          chunks_count: 0,
          offline_recording: false,
        });
        setTrial(null);
        setHasAccess(false);
      }
    } catch (error) {
      secureLog.error('[SubscriptionContext] Initialization error (plans fetch failed):', error);
      ErrorReporter.warn('Failed to initialize subscription', 'SubscriptionContext.initialize', {
        error: handleApiError(error).message,
      });
      setPlans([]);
      setSubscription({
        plan_name: 'Free',
        valid_total_minutes: null,
        recordings_available_days: 0,
        chunks_count: 0,
        offline_recording: false,
      });
      setTrial(null);
      setHasAccess(false);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const refreshPlans = async () => {
    try {
      const fetchedPlans = await subscriptionApi.getPlans();
      setPlans(fetchedPlans);
    } catch (error) {
      secureLog.error('[SubscriptionContext] Error fetching plans:', error);
      throw error;
    }
  };

  const refreshSubscription = async () => {
    if (!isAuthenticated) {
      setSubscription(null);
      setTrial(null);
      return;
    }

    try {
      const response = await subscriptionApi.getSubscription();
      setSubscription(response.subscription);
      setTrial(response.trial);

      secureLog.debug('[SubscriptionContext] Updated subscription:', {
        plan: response.subscription?.plan_name,
        status: response.subscription?.status,
        trialStatus: response.trial?.status,
        trialActive: response.trial?.is_active
      });
    } catch (error) {
      secureLog.error('[SubscriptionContext] Error fetching subscription:', error);
      throw error;
    }
  };

  const checkAccess = async (): Promise<boolean> => {
    if (!isAuthenticated) {
      setHasAccess(false);
      return false;
    }

    try {
      const accessResponse = await subscriptionApi.checkAccess();
      setHasAccess(accessResponse.access_granted);

      if (accessResponse.trial) {
        setTrial(accessResponse.trial as any);
      }

      if (accessResponse.subscription) {
        setSubscription(accessResponse.subscription as any);
      }

      secureLog.debug('[SubscriptionContext] Access check:', {
        granted: accessResponse.access_granted,
        source: accessResponse.access_source,
        trialStatus: accessResponse.trial?.status,
        trialMinutesRemaining: accessResponse.trial?.minutes_remaining,
        subscriptionStatus: accessResponse.subscription?.status,
        subscriptionMinutes: accessResponse.subscription?.minutes_remaining,
      });

      return accessResponse.access_granted;
    } catch (error) {
      secureLog.error('[SubscriptionContext] Error checking access:', error);
      setHasAccess(false);
      return false;
    }
  };

  const hasFeature = (feature: keyof Subscription): boolean => {
    if (!subscription) return false;
    const value = subscription[feature];
    return value !== null && value !== undefined && value !== false;
  };

  const remainingMinutes =
    subscription?.minutes_remaining ??
    trial?.minutes_remaining ??
    subscription?.valid_total_minutes ??
    null;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        trial,
        plans,
        isLoading,
        refreshSubscription,
        refreshPlans,
        hasFeature,
        remainingMinutes,
        hasAccess,
        checkAccess,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
