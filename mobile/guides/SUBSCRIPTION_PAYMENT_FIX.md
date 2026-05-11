# Subscription Payment Error Fix

## Issue
The subscription payment was failing with error: **"Subscription Failed - An unexpected error occurred"**

## Root Cause
The API call to create a subscription was sending the parameter `priceId` in **camelCase** format, but the backend API expects `price_id` in **snake_case** format.

This is a common issue when frontend and backend use different naming conventions.

## Evidence
1. Looking at the codebase, the backend uses **snake_case** naming convention:
   - `stripe_price_id` (Plan interface)
   - `plan_id` (subscribe function)
   - All other backend fields use snake_case

2. The `createSubscription` function was incorrectly sending:
   ```typescript
   const response = await authApiClient.post('/create-subscription', {
     email,
     priceId,  // ❌ WRONG - camelCase
   });
   ```

3. It should be sending:
   ```typescript
   const response = await authApiClient.post('/create-subscription', {
     email,
     price_id: priceId,  // ✅ CORRECT - snake_case
   });
   ```

## Fix Applied

**File:** `src/lib/api.ts`
**Line:** ~1113

Changed from:
```typescript
const response = await authApiClient.post('/create-subscription', {
  email,
  priceId,
});
```

To:
```typescript
const response = await authApiClient.post('/create-subscription', {
  email,
  price_id: priceId,
});
```

## Testing
To verify the fix works:

1. Log in to the app
2. Navigate to Subscription/Plans screen
3. Click "Subscribe & Keep Trial Minutes" on any plan
4. The payment sheet should now initialize correctly
5. Complete the payment flow

## Expected Behavior After Fix
1. Click subscribe → Backend successfully receives `priceId` parameter (camelCase)
2. Backend creates Stripe subscription and returns `clientSecret`
3. Payment sheet initializes with the client secret
4. User can complete payment
5. Subscription activates successfully

## Prevention

To prevent similar issues in the future:
1. **Always check backend validation schema** for expected parameter names and formats
2. **Check API error messages carefully** - they show exactly which parameters are missing or wrong
3. **Add API integration tests** to catch these mismatches early
4. **Consider using TypeScript interfaces** that match the backend schema exactly
To prevent similar issues in the future:

1. **Always check backend API documentation** for expected parameter names
2. **Use snake_case** for all backend API parameters (following Python/Flask convention)
3. **Add API integration tests** to catch these mismatches early
4. **Consider using a code generator** or API client library that ensures type safety

## Related Files
- `src/lib/api.ts` - API client (FIXED)
- `src/screens/SubscriptionScreen.tsx` - Subscription UI
- `src/utils/errorHandler.ts` - Error handling

## Status
✅ **FIXED** - Ready for testing on device/emulator
