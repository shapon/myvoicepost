# Subscription Error Quick Reference

## Quick Diagnostic Checklist

When you see "Subscription Failed" error, check these in order:

### 1. ✅ Check Console Logs
Look for these key indicators:

| Log Pattern | Issue | Solution |
|-------------|-------|----------|
| `ERR_NETWORK` or `Network Error` | No internet connection | Check WiFi/data connection |
| `ECONNREFUSED` | Server not reachable | Check server status |
| `status: 401` | Auth token expired | Log out and log back in |
| `status: 404` | Plan not found | Refresh plans or check database |
| `status: 500/502/503` | Server error | Wait and retry |
| `Price ID: undefined` | Missing price configuration | Check plan setup |

### 2. ✅ Verify User State
```
[Environment] Using: production https://www.myvoicepost.com
[Auth] Logged in as: user@example.com
[Subscription] User email: user@example.com
```

### 3. ✅ Check Plan Configuration
```
[Subscription] Price ID: price_xxxxx (should not be null/undefined)
```

### 4. ✅ Verify API Response
```
[STRIPE] Response status: 200 (should be 200)
[STRIPE] Response data: { success: true, ... }
```

## Error Message Meanings

| User Sees | Actual Issue | Fix |
|-----------|--------------|-----|
| "Connection Error - Unable to connect..." | Network/Internet | Check internet connection |
| "Server Error - Our servers are experiencing..." | Backend down or error | Wait 5 min, retry |
| "Authentication Required - Your session..." | Token expired | Log out/in |
| "Access Denied - You do not have permission..." | 403 error | Check user permissions |
| "Plan Not Found - The selected subscription..." | Invalid plan | Refresh or contact support |
| "Payment Failed - Payment could not be..." | Stripe error | Check payment method |

## Fast Debug Commands

### Test API Connectivity
```bash
# Test if API is reachable
curl https://www.myvoicepost.com/api/v1/p/health

# Expected: 200 OK
```

### Check Environment
```javascript
// In app console
console.log(environment);
// Should show: { baseUrl: "https://www.myvoicepost.com", ... }
```

### Check Auth Status
```javascript
// In app console
console.log(user);
// Should show user object with email
```

## Critical Log Points

### Start of Subscription
```
[Subscription] Creating subscription for plan: Starter
[Subscription] User email: user@example.com  ← Must be present
[Subscription] Price ID: price_xxxxx        ← Must not be null
```

### API Call
```
[STRIPE] Creating subscription...
[STRIPE] Response status: 200               ← Should be 200
[STRIPE] Subscription created: {...}        ← Should have subscriptionId
```

### Success Indicators
```
[Subscription] Backend response: { subscriptionId: "sub_xxx", hasClientSecret: true }
[Subscription] Payment successful!
```

### Error Indicators
```
[STRIPE] Error creating subscription: [message]
[STRIPE] Error details: { status: XXX }     ← Note this number
[ErrorHandler] Processed error: {...}
```

## Immediate Actions by Error Type

### Network Error
1. Check phone/tablet internet
2. Try switching WiFi ↔ Mobile Data
3. Restart app
4. Retry subscription

### Server Error (500)
1. Wait 5 minutes
2. Retry subscription
3. If persists, check server status
4. Contact backend team

### Auth Error (401)
1. Log out
2. Log back in
3. Retry subscription
4. If persists, clear app data

### Not Found (404)
1. Pull to refresh subscription screen
2. Check if plan exists in Stripe
3. Check database for plan
4. Verify stripe_price_id is set

### Payment Error
1. Check Stripe keys are configured
2. Verify price ID in Stripe Dashboard
3. Try test mode first
4. Check Stripe logs

## One-Minute Health Check

Run this quick check before investigating deeper:

```
☑ Internet connected?
☑ User logged in? (check console for user email)
☑ Plan has price_id? (check console for "Price ID: price_xxx")
☑ API reachable? (curl test or app loads other data)
☑ Console shows any red errors?
```

If all ✅, issue is likely in backend or Stripe configuration.
If any ❌, fix that first.

## Most Common Issues (Ranked)

1. **Network connectivity** (30%)
   - Solution: Check internet, restart app

2. **Expired auth token** (25%)
   - Solution: Log out and back in

3. **Backend server down** (20%)
   - Solution: Wait and retry

4. **Missing/invalid price_id** (15%)
   - Solution: Check plan configuration

5. **Stripe misconfiguration** (10%)
   - Solution: Verify Stripe keys and prices

## When to Escalate

Escalate to backend team if:
- ✅ Internet works
- ✅ User is logged in
- ✅ Plan has valid price_id
- ✅ Error persists after logout/login
- ✅ Same error for all users

Escalate to Stripe team if:
- ✅ Payment sheet doesn't initialize
- ✅ Payment fails with Stripe error
- ✅ Console shows Stripe-specific error

## Related Docs

- Full details: `SUBSCRIPTION_ERROR_TROUBLESHOOTING.md`
- Changes made: `SUBSCRIPTION_ERROR_FIX_SUMMARY.md`
