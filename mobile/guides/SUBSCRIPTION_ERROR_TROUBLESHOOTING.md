# Subscription Error Troubleshooting Guide

## Issue: "Subscription Failed - An unexpected error occurred"

This error can occur for several reasons. This guide will help you identify and resolve the issue.

## Recent Improvements

### Enhanced Error Handling (Latest Update)

We've improved error handling to provide more specific error messages:

1. **Better Error Messages**: Instead of generic "An unexpected error occurred", you'll now see:
   - "Connection Error" - Network/internet issues
   - "Server Error" - Backend issues (500, 502, 503)
   - "Authentication Required" - Session expired (401)
   - "Access Denied" - Permission issues (403)
   - "Plan Not Found" - Invalid plan (404)

2. **Enhanced Logging**: More detailed console logs to help diagnose issues:
   - Full request details (email, price ID)
   - Response status and data
   - Network error codes
   - API endpoint URLs

3. **Improved Restore Purchase**: Better feedback when restoring subscriptions

## Common Causes & Solutions

### 1. Network Connection Issues

**Symptoms:**
- Error message: "Connection Error - Unable to connect to the server"
- Error message: "Network error. Please check your internet connection"

**Solutions:**
- Check internet connection
- Try switching between WiFi and mobile data
- Restart the app
- Check if https://www.myvoicepost.com is accessible

**Debugging:**
Check console logs for:
```
[STRIPE] Error details: { status: undefined }
ERR_NETWORK or Network Error
```

### 2. Backend Server Issues

**Symptoms:**
- Error message: "Server Error - Our servers are experiencing issues"
- Status code: 500, 502, or 503

**Solutions:**
- Wait a few minutes and try again
- Check server status
- Contact support if issue persists

**Debugging:**
Check console logs for:
```
[STRIPE] Response status: 500
[STRIPE] Server returned error: [error message]
```

### 3. Authentication Issues

**Symptoms:**
- Error message: "Authentication Required - Your session has expired"
- Status code: 401

**Solutions:**
- Log out and log back in
- Clear app data (if safe to do so)
- Check if token is expired

**Debugging:**
Check console logs for:
```
[STRIPE] Error details: { status: 401 }
```

### 4. Stripe Configuration Issues

**Symptoms:**
- Missing or invalid `stripe_price_id`
- Payment sheet fails to initialize

**Solutions:**
- Verify plan has valid `stripe_price_id`
- Check Stripe dashboard for price object
- Ensure Stripe publishable key is correct

**Debugging:**
Check console logs for:
```
[Subscription] Price ID: undefined or null
[Subscription] Payment sheet init error: [error]
```

### 5. Invalid Plan or Price

**Symptoms:**
- Error message: "Plan Not Found"
- Status code: 404

**Solutions:**
- Refresh plans list
- Verify plan exists in backend
- Check if price is archived in Stripe

## How to Debug

### Step 1: Enable Detailed Logging

The app now logs detailed information at each step:

1. **Subscription Initiation:**
   ```
   [Subscription] Creating subscription for plan: Starter
   [Subscription] User email: user@example.com
   [Subscription] Price ID: price_xxxxx
   ```

2. **API Request:**
   ```
   [STRIPE] Creating subscription...
   [STRIPE] Email: user@example.com
   [STRIPE] Price ID: price_xxxxx
   ```

3. **API Response:**
   ```
   [STRIPE] Response status: 200
   [STRIPE] Response data: { ... }
   [STRIPE] Subscription created: { subscriptionId, hasClientSecret }
   ```

4. **Error Details (if any):**
   ```
   [STRIPE] Error creating subscription: [message]
   [STRIPE] Error details: { status, statusText, data, config }
   [ErrorHandler] Processed error: { message, statusCode, code }
   ```

### Step 2: Check Console Output

Run the app with console open and look for:

1. Environment configuration:
   ```
   [Environment] Using: production https://www.myvoicepost.com
   ```

2. Authentication status:
   ```
   [Auth] Logged in as: user@example.com
   ```

3. Plans loaded:
   ```
   [Subscription] Plans loaded: 3
   ```

4. Error patterns:
   - Network errors: `ERR_NETWORK`, `ECONNREFUSED`, `ECONNABORTED`
   - Auth errors: `401 Unauthorized`
   - Server errors: `500 Internal Server Error`

### Step 3: Test Connectivity

```javascript
// In console or test script
const testApiConnection = async () => {
  try {
    const response = await fetch('https://www.myvoicepost.com/api/v1/p/health');
    console.log('API Status:', response.status);
  } catch (error) {
    console.error('Connection failed:', error);
  }
};
```

### Step 4: Verify Stripe Integration

1. Check Stripe publishable key in app
2. Verify price IDs in database match Stripe
3. Check Stripe webhooks are configured
4. Test with Stripe test mode first

## Testing the Fix

### Test Scenarios

1. **Happy Path:**
   - Login with valid credentials
   - Navigate to subscription screen
   - Click "Subscribe & Keep Trial Minutes"
   - Complete payment successfully

2. **Network Error Test:**
   - Turn off internet
   - Try to subscribe
   - Should see: "Connection Error - Unable to connect to the server"

3. **Session Expired Test:**
   - Use expired auth token
   - Try to subscribe
   - Should see: "Authentication Required - Your session has expired"

4. **Restore Purchase Test:**
   - With active subscription
   - Click "Restore Purchase"
   - Should see success message with subscription details

## Backend Requirements

Ensure backend endpoint `/api/v1/m/create-subscription` returns:

```json
{
  "success": true,
  "subscriptionId": "sub_xxxxx",
  "clientSecret": "pi_xxxxx_secret_xxxxx"
}
```

Or for errors:

```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

## Stripe Configuration Checklist

- [ ] Stripe API keys configured (production)
- [ ] Price objects created in Stripe Dashboard
- [ ] Price IDs match database `stripe_price_id` field
- [ ] Webhook endpoint configured
- [ ] Webhook signing secret configured
- [ ] Test mode working before production

## User-Facing Error Messages

| Error Type | User Message |
|------------|--------------|
| Network failure | "Connection Error - Unable to connect to the server. Please check your internet connection and try again." |
| Server error (5xx) | "Server Error - Our servers are experiencing issues. Please try again in a few moments." |
| Auth error (401) | "Authentication Required - Your session has expired. Please log in again." |
| Permission error (403) | "Access Denied - You do not have permission to subscribe. Please contact support." |
| Not found (404) | "Plan Not Found - The selected subscription plan is not available. Please try again or contact support." |
| Payment failed | "Payment Failed - Payment could not be processed. Please check your payment method and try again." |
| Payment cancelled | User cancelled - no message shown |
| Generic error | Original error message from API |

## Next Steps if Error Persists

1. **Collect Logs:**
   - Copy all console output from subscription attempt
   - Note exact error message shown to user
   - Record timestamp

2. **Check Backend:**
   - Review server logs for same timestamp
   - Check database for subscription attempts
   - Verify Stripe dashboard for payment intents

3. **Contact Support:**
   - Provide collected logs
   - Share user email (if safe)
   - Include steps to reproduce

## Related Files

- `src/screens/SubscriptionScreen.tsx` - Main subscription UI and error handling
- `src/lib/api.ts` - API client with enhanced logging
- `src/utils/errorHandler.ts` - Error processing and user-friendly messages
- `src/config/environment.ts` - API endpoint configuration

## Additional Resources

- [Stripe React Native SDK](https://stripe.com/docs/payments/accept-a-payment?platform=react-native)
- [Error Handling Best Practices](https://stripe.com/docs/error-handling)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
