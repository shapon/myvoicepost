# Quick Test Script - February 15, 2026 Fixes

Quick reference for testing all fixes applied today.

---

## 🚀 Quick Test Commands

### Start App with Logs
```bash
# Terminal 1: Start Metro bundler
npx expo start --clear

# Terminal 2: Watch logs
adb logcat -c && adb logcat | grep -E "ReactNativeJS|AutoLogin|LoadingGate|SubscriptionContext|STRIPE"
```

---

## ✅ Test 1: Subscription Payment (2 minutes)

**CRITICAL FIX**: priceId → price_id

1. Open app and login
2. Navigate to "Plans" tab
3. Select any plan
4. Tap "Subscribe & Keep Trial Minutes"

### ✅ Success Indicators:
```
[STRIPE] Creating subscription...
[STRIPE] Price ID: price_1SzdUbJmqOTnhrj8g1euV9sT
[AUTH API] Response 200 from /create-subscription
[Subscription] Payment sheet initialized
```

### ❌ Failure (OLD BUG):
```
[AUTH API] Error: { 
  "error": "Validation failed",
  "details": [{ "path": ["priceId"], "message": "Required" }]
}
```

**Expected**: Payment sheet opens successfully ✅

---

## ✅ Test 2: No Blank Screen (3 minutes)

**CRITICAL FIX**: Loading timeouts added

### Steps:
1. Clear app data: Settings → Apps → MyVoicePost → Clear Data
2. Open app
3. Tap "Sign Up"
4. Register new account:
   - Email: `test123@test.com`
   - Username: Auto-filled to `test123` ✅
   - Password: `Test123456`
5. Complete registration
6. Tap "Get Started" on welcome alert

### ✅ Success Indicators:
```
[AutoLogin] Starting auth check...
[AutoLogin] Token valid - user logged in: test123
[SubscriptionContext] Initialization complete
[LoadingGate] Rendering children
```

### If Network Slow:
```
[AutoLogin] Auth check timeout - setting loading to false
[LoadingGate] Loading timeout - forcing render
[LoadingGate] Rendering after timeout
```

**Expected**: 
- App renders within **10 seconds maximum** ✅
- No indefinite blank screen ✅
- If timeout occurs, app still renders ✅

---

## ✅ Test 3: Profile Screen UI (30 seconds)

**ALREADY CORRECT**: Just verify

1. Login to app
2. Navigate to bottom tab bar
3. Tap rightmost tab (Profile icon)

### ✅ Verify:
- [ ] Tab label shows **"Settings"** (not "Profile")
- [ ] User info at top (avatar, username, email)
- [ ] **Sign Out button is directly below email** (no scrolling needed)
- [ ] Settings menu items below that

**Expected**: UI matches requirements exactly ✅

---

## ✅ Test 4: Username Auto-Fill (1 minute)

**ALREADY CORRECT**: Just verify

1. Open app (not logged in)
2. Tap "Sign Up"
3. Enter email: `dsreekrishna@gmail.com`
4. Tap "Send Verification Code"

### ✅ Verify:
- [ ] Alert shows: "Your username has been pre-filled. You can change it if you like."
- [ ] Username field auto-filled with: `dsreekrishna`
- [ ] Username is editable

**Expected**: Username auto-fills from email ✅

---

## ✅ Test 5: Input Validation (2 minutes)

**ALREADY IMPLEMENTED**: Just verify it's working

### Test A: Script Tag
1. Go to Polish screen
2. Paste: `<script>alert('xss')</script>Hello world`
3. Tap Polish

### ✅ Expected:
```
[Security Issue] field: text, issue: contains potentially malicious script tags
```
Error message shown to user ✅

### Test B: SQL Injection
1. Try login with email: `admin@test.com' OR '1'='1`

### ✅ Expected:
```
[Security Issue] field: email, issue: contains suspicious SQL keywords
```
Login rejected ✅

**Expected**: All malicious inputs blocked ✅

---

## ⏱️ Test 6: Loading Timeout (Network Issue Simulation)

**NEW FIX**: Verify timeout protection

### Steps:
1. Login to app
2. Navigate to any screen
3. **Enable Airplane Mode** on device
4. Wait 10 seconds
5. **Disable Airplane Mode**
6. Watch logs

### ✅ Expected Logs:
```
[AutoLogin] Auth check timeout - setting loading to false
[SubscriptionContext] Initialization timeout - setting loading to false
[LoadingGate] Loading timeout - forcing render
```

**Expected**: App doesn't freeze, renders within 10 seconds ✅

---

## 🎯 All Tests Summary

| Test | Fix Type | Expected Time | Critical? |
|------|----------|---------------|-----------|
| Subscription Payment | 🔧 FIXED | 2 min | ⚠️ YES |
| No Blank Screen | 🔧 FIXED | 3 min | ⚠️ YES |
| Profile Screen UI | ✅ ALREADY OK | 30 sec | Medium |
| Username Auto-Fill | ✅ ALREADY OK | 1 min | Low |
| Input Validation | ✅ ALREADY OK | 2 min | Medium |
| Loading Timeout | 🔧 FIXED | 2 min | ⚠️ YES |

**Total Test Time**: ~11 minutes

---

## 🐛 If Something Fails

### Subscription Payment Still Fails
**Check:** `src/lib/api.ts` line 1390
**Should be:** `price_id: sanitizedPriceId.sanitizedValue`
**NOT:** `priceId: sanitizedPriceId.sanitizedValue`

### Blank Screen Still Occurs
**Check logs for:**
```
[LoadingGate] Loading timeout - forcing render
```

If this message appears but screen still blank:
1. Check `app/_layout.tsx` line 35-37
2. Verify `timedOut` state is being used
3. Check React render errors in logs

### Profile Tab Still Says "Profile"
**Check:** `app/(tabs)/profile.tsx` line 98
**Should be:** `<Text>Settings</Text>`

### Username Not Auto-Filling
**Check:** `app/register.tsx` lines 51-52
**Should have:**
```typescript
const usernameFromEmail = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '');
setUsername(usernameFromEmail);
```

---

## 📊 Success Criteria

### Before Testing:
```bash
# Verify TypeScript compilation
npx tsc --noEmit

# Should show: No errors
```

### During Testing:
- ✅ Subscription payment succeeds
- ✅ No blank screens longer than 10 seconds
- ✅ All UI elements correct
- ✅ Input validation blocks malicious inputs
- ✅ Timeout logs appear when network slow

### After Testing:
- ✅ All 6 tests pass
- ✅ No crashes
- ✅ No React errors in logs
- ✅ User experience smooth

---

## 🎉 If All Tests Pass

**YOU'RE DONE!** 🎊

The app is now:
- ✅ More secure (input validation)
- ✅ More reliable (timeout protection)
- ✅ More user-friendly (correct UI, auto-fill)
- ✅ Fully functional (payments work)

---

## 📞 Quick Debug Commands

```bash
# Clear cache and rebuild
npx expo start --clear

# View full logs
adb logcat | grep myvoicepost

# View only errors
adb logcat | grep -E "Error|ERROR|Exception"

# View only our custom logs
adb logcat | grep -E "ReactNativeJS|AutoLogin|STRIPE|LoadingGate"

# Check TypeScript errors
npx tsc --noEmit

# Clear app data (Android)
adb shell pm clear com.myvoicepost.app
```

---

**Test Date**: February 15, 2026  
**Estimated Time**: 11 minutes  
**Priority**: ⚠️ High (Critical fixes)
