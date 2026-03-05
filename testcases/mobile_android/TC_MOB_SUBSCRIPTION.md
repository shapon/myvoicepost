# Mobile Android Test Cases: Subscription & Payments

## TC-M-SUB-001: View subscription plans
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to Profile tab
  2. Tap "Subscription" or "Upgrade"
- **Expected**: Subscription screen shows available plans with prices and features

## TC-M-SUB-002: Check trial status (new user)
- **Type**: Positive
- **Precondition**: Newly registered user within 7 days
- **Steps**:
  1. Navigate to Profile tab
  2. Check trial information
- **Expected**: Shows "Trial Active", remaining days and minutes

## TC-M-SUB-003: Trial expired - access denied
- **Type**: Negative
- **Precondition**: Trial period (7 days) expired, no subscription
- **Steps**:
  1. Attempt to record voice
- **Expected**: Access denied, prompted to subscribe

## TC-M-SUB-004: Subscribe to a plan (Stripe checkout)
- **Type**: Positive
- **Steps**:
  1. Navigate to subscription screen
  2. Select a plan
  3. Complete Stripe payment flow
- **Expected**: Subscription activated, recording minutes available

## TC-M-SUB-005: View active subscription details
- **Type**: Positive
- **Precondition**: Active subscription exists
- **Steps**:
  1. Navigate to Profile > Subscription
- **Expected**: Shows plan name, status, valid until date, minutes used/remaining

## TC-M-SUB-006: Cancel subscription
- **Type**: Positive
- **Precondition**: Active subscription
- **Steps**:
  1. Navigate to subscription screen
  2. Tap "Cancel Subscription"
  3. Confirm cancellation
- **Expected**: Subscription set to cancel at end of billing period

## TC-M-SUB-007: Check access with active subscription
- **Type**: Positive
- **Precondition**: Active subscription with remaining minutes
- **Steps**:
  1. Tap record button
- **Expected**: Recording starts, access granted

## TC-M-SUB-008: Check access with exhausted minutes
- **Type**: Negative
- **Precondition**: Subscription active but all minutes used
- **Steps**:
  1. Tap record button
- **Expected**: Access denied, shown minutes exhausted message

## TC-M-SUB-009: Top-up minutes
- **Type**: Positive
- **Steps**:
  1. Navigate to subscription screen
  2. Tap "Top Up" or similar
  3. Complete payment
- **Expected**: Additional minutes added to account

## TC-M-SUB-010: Payment failed
- **Type**: Negative
- **Steps**:
  1. Attempt to subscribe
  2. Use a declined card in Stripe checkout
- **Expected**: Error message, subscription not activated
