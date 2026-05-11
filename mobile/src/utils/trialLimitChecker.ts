import { Alert } from 'react-native';

interface TrialInfo {
  trial_minutes_total?: number;
  trial_minutes_used?: number;
  is_subscribed?: boolean;
}

export function checkTrialLimitAndWarn(
  trialInfo: TrialInfo,
  onSubscribe?: () => void,
  onTopUp?: () => void
): boolean {
  const { trial_minutes_total, trial_minutes_used, is_subscribed } = trialInfo;

  if (trial_minutes_total === undefined || trial_minutes_used === undefined) {
    return false;
  }

  const remaining = trial_minutes_total - trial_minutes_used;
  const exceeded = remaining <= 0;
  const nearLimit = remaining > 0 && remaining <= 5;

  console.log(`[TrialLimitChecker] total=${trial_minutes_total}, used=${trial_minutes_used.toFixed(2)}, remaining=${remaining.toFixed(2)}, exceeded=${exceeded}, nearLimit=${nearLimit}, subscribed=${is_subscribed}`);

  if (exceeded) {
    if (is_subscribed) {
      Alert.alert(
        'Minutes Exhausted',
        `You've used all ${trial_minutes_total} minutes. You can buy a 60-minute top-up for $5 to continue recording.`,
        [
          { text: 'Later', style: 'cancel' },
          ...(onTopUp ? [{ text: 'Buy Top-Up', onPress: onTopUp }] : []),
        ]
      );
    } else {
      Alert.alert(
        'Trial Minutes Exhausted',
        `You've used all ${trial_minutes_total} trial minutes. Subscribe to get more recording time, or buy a 60-minute top-up for $5.`,
        [
          { text: 'Later', style: 'cancel' },
          ...(onSubscribe ? [{ text: 'Subscribe', onPress: onSubscribe }] : []),
        ]
      );
    }
    return true;
  }

  if (nearLimit) {
    const remainingRounded = Math.round(remaining * 10) / 10;
    Alert.alert(
      'Running Low on Minutes',
      `You have ${remainingRounded} minutes remaining.${is_subscribed ? ' Consider buying a top-up.' : ' Consider subscribing for more time.'}`,
      [{ text: 'OK' }]
    );
  }

  return false;
}
