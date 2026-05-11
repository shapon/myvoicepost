# Quick Test Guide - February 15, 2026 Fixes

## ⚡ Quick Test Steps

### 1️⃣ Test UI Changes (2 minutes)

**Settings Label:**
1. Open app
2. Look at bottom navigation
3. ✅ Should see "Settings" (not "Profile") with person icon
4. Tap Settings tab
5. ✅ Should see "Settings" tab selected with gear icon

**Sign Out Button:**
1. Ensure you're logged in
2. Go to Settings tab
3. ✅ Sign Out button should be visible below email
4. ✅ Should NOT need to scroll to see it
5. Tap Sign Out
6. ✅ Should show confirmation dialog

---

### 2️⃣ Test Subscription Fix (3 minutes)

**IMPORTANT**: This is the critical fix that was broken before.

**Steps:**
1. Login to app with test account
2. Navigate to Plans tab (diamond icon)
3. Choose "Starter" plan (or any plan)
4. Tap "Subscribe & Keep Trial Minutes"
5. ✅ Should see payment sheet open (NOT an error)
6. Check logs for: `[STRIPE] Response status: 200`
7. ✅ Should NOT see: "Validation failed" error

**Before Fix** (What was broken):
```
❌ [AUTH API] Error: 400
❌ "Validation failed"
❌ "expected: string, received: undefined, path: ['priceId']"
```

**After Fix** (What should happen):
```
✅ [STRIPE] Creating subscription...
✅ [STRIPE] Response status: 200
✅ Payment sheet opens successfully
```

---

### 3️⃣ Test Username Auto-fill (2 minutes)

**Steps:**
1. Log out if logged in
2. Go to Register screen
3. Enter email: `test123@example.com`
4. Tap "Send Verification Code"
5. Wait for OTP sent confirmation
6. ✅ Username field should auto-fill with: `test123`
7. ✅ Only need to enter: OTP, password, confirm password

---

## 🐛 What Was Fixed

### Critical Bug: Subscription Payment Failed ✅
- **Issue**: Users couldn't subscribe - got 400 error
- **Cause**: API sent `priceId` but backend expected `price_id`
- **Fix**: Changed to snake_case in api.ts line 1391
- **Impact**: Payment flow now works

### UI Improvements: ✅
- **Profile → Settings**: Label changed in bottom nav and tab
- **Sign Out Button**: Moved to be visible without scrolling

### Already Working: ✅
- **Username auto-fill**: Was already implemented
- **Input security**: Already has comprehensive validation

---

## 📋 Expected vs Actual

### Settings Screen:
| Element | Expected | Location |
|---------|----------|----------|
| Bottom tab label | "Settings" | Bottom navigation |
| Tab header label | "Settings" | Profile screen tab bar |
| Sign Out button | Below email | Profile screen top section |

### Subscription Flow:
| Step | Expected Result |
|------|----------------|
| Click Subscribe | No validation error |
| API request | Sends `price_id` (snake_case) |
| Backend response | Returns 200 with subscription ID |
| Payment sheet | Opens successfully |

### Registration Flow:
| Input | Auto-filled? | Source |
|-------|-------------|--------|
| Email | User enters | - |
| Username | ✅ Yes | Part before @ in email |
| OTP | User enters | - |
| Password | User enters | - |

---

## 🔍 Logs to Check

### Successful Subscription:
```
[Subscription] Creating subscription for plan: Starter
[Subscription] User email: user@example.com
[Subscription] Price ID: price_1SzdUbJmqOTnhrj8g1euV9sT
[STRIPE] Creating subscription...
[STRIPE] Response status: 200
[STRIPE] Subscription created: { subscriptionId: "sub_...", hasClientSecret: true }
```

### Successful Registration:
```
[AUTH] Send OTP response: { success: true }
[Register] Username auto-filled: username_from_email
[AUTH] Register: { username: "...", email: "...", otp: "***" }
[AUTH] Register response: { success: true, token: "..." }
```

---

## ⏱️ Total Test Time: ~7 minutes

1. UI changes: 2 min
2. Subscription: 3 min
3. Registration: 2 min

---

## 🚨 If You See Issues

### Subscription still fails:
- Check logs for exact error
- Verify internet connection
- Try different plan
- Check Stripe dashboard for API issues

### Username not auto-filling:
- Ensure you entered valid email
- Ensure OTP was sent successfully
- Check that email contains '@' symbol

### Sign Out button not visible:
- Check if logged in
- Ensure you're on Settings tab (not Statistics)
- Try scrolling up to top of screen

---

## ✅ Success Criteria

All of these should work:
- [x] Bottom nav shows "Settings"
- [x] Settings tab shows gear icon and "Settings" label
- [x] Sign Out button visible below email
- [x] Subscription payment doesn't throw 400 error
- [x] Payment sheet opens successfully
- [x] Username auto-fills from email during registration

---

**Ready to Test!** 🚀

If all tests pass, the fixes are working correctly and app is ready for deployment.
