# Quick Test Script - February 15, 2026

## Purpose
Quick validation checklist for all fixes and features.

---

## 🎯 Test 1: Subscription Payment Fix

### Prerequisites
- User must be logged in
- Have valid email address

### Steps
1. Open app and navigate to "Plans" tab
2. Select "Starter" plan ($9.99/month)
3. Tap "Subscribe" button
4. Wait for payment sheet to appear

### Expected Results
✅ Payment sheet opens (no validation error)
✅ Can enter payment details
✅ Payment processes successfully
✅ Subscription status updates

### Previous Error (Now Fixed)
```json
{
  "error": "Validation failed",
  "details": [{
    "path": ["priceId"],
    "message": "Required"
  }]
}
```

### Logs to Check
```
[STRIPE] Creating subscription...
[STRIPE] Email: user@example.com
[STRIPE] Price ID: price_1SzdUbJmqOTnhrj8g1euV9sT
[AUTH API] POST /create-subscription
[AUTH API] Response 200 from /create-subscription
```

---

## 🎯 Test 2: Profile Screen UI

### Steps
1. Login to app
2. Navigate to bottom tab bar
3. Look at the rightmost tab

### Expected Results
✅ Tab label shows "Settings" (not "Profile")
✅ Tab icon is person icon

### When You Tap the Tab
1. Should see user avatar with initial
2. Username below avatar
3. Email address below username
4. **Sign Out button below email** ⭐ (not at bottom)
5. Two tabs: "Settings" and "Statistics"
6. Settings menu items below

### Screenshot Verification
- Red circle in screenshot: Should say "Settings"
- Green line in screenshot: Sign Out button should be at that position

---

## 🎯 Test 3: Registration Auto-Fill

### Prerequisites
- Not logged in
- On registration screen

### Steps
1. Tap "Sign Up" from login screen
2. Enter email: `test@example.com`
3. Tap "Send Verification Code"
4. Wait for OTP sent confirmation

### Expected Results
✅ OTP sent alert appears
✅ Username field auto-fills with "test" (part before @)
✅ Only need to enter:
   - Verification code (from email)
   - Password
   - Confirm password

### Previous Behavior
User had to manually type username

### Logs to Check
```
[ReactNativeJS] OTP sent successfully
```

---

## 🎯 Test 4: Input Validation Security

### Test 4a: HTML Injection Protection
1. Try to register with username: `<script>alert('xss')</script>`
2. Try to login with email: `test@test.com<script>`

**Expected:** ❌ Rejected with error message

### Test 4b: SQL Injection Protection
1. Try username: `admin' OR '1'='1`
2. Try email: `test@test.com'; DROP TABLE users;--`

**Expected:** ❌ Rejected with error message

### Test 4c: Special Characters
1. Try username: `test@#$%^&*()`
2. Try email with spaces: `  test @ test . com  `

**Expected:** 
- Username: ❌ Rejected (only alphanumeric + underscore/dot/hyphen allowed)
- Email: ✅ Trimmed and validated

### Test 4d: Length Limits
1. Try email: 300 characters long
2. Try username: 100 characters long
3. Try password: 200 characters long

**Expected:** ❌ All rejected with "exceeds maximum length" error

### Logs to Check
```
[SECURITY] {
  field: 'username',
  issue: 'contains potentially malicious script tags',
  context: 'register'
}
```

---

## 🎯 Test 5: Blank Screen Investigation

### This is the trickiest one - need user to reproduce

### When It Happens
- User registers new account
- Successfully completes registration
- Gets "Welcome!" alert
- Taps "Get Started"
- **Screen goes blank** 🔍

### What to Check
1. **Does spinner show?**
   - If YES: Context providers stuck loading
   - If NO: React render issue

2. **Can you tap back button?**
   - If YES: Navigation works, UI issue
   - If NO: App frozen

3. **How long does blank last?**
   - Permanent: Need to force quit
   - 5-10 seconds: Loading timeout
   - Flash: Race condition

### Debug Steps
1. Open app with USB debugging
2. Run: `adb logcat | grep -E "myvoicepost|ReactNativeJS"`
3. Register new account
4. Watch logs when blank screen appears
5. Look for:
   - Auth check messages
   - Context provider errors
   - Navigation events
   - React errors

### Key Logs to Find
```
[AutoLogin] Starting auth check...
[AutoLogin] Token found - validating with server...
[AutoLogin] Token valid - user logged in: USERNAME
[AutoLogin] Auth check complete
```

### If Blank Screen Appears, Check For
```
[AUTH API] Error: <-- Look for this
[ReactNativeJS] ERROR: <-- Or this
[AuthContext] <-- Or this
```

---

## 🎯 Test 6: Complete User Journey

### New User Registration → First Use
1. Open app (not logged in)
2. Tap "Sign Up"
3. Enter email: `newuser@test.com`
4. Tap "Send Verification Code"
5. Check username auto-filled: `newuser` ✅
6. Enter verification code from email
7. Enter password: `SecurePass123`
8. Enter confirm password: `SecurePass123`
9. Tap "Sign Up"
10. See "Welcome!" alert ✅
11. Tap "Get Started"
12. **Should land on Polish tab** ✅ (not blank screen)
13. Navigate to "Plans" tab
14. See trial information ✅
15. Navigate to "Settings" tab ✅ (not "Profile")
16. See Sign Out button below email ✅
17. Tap Sign Out
18. See "Sign Out" confirmation alert ✅
19. Confirm sign out
20. **Should return to login screen** ✅

---

## 📱 Device Testing Matrix

### Android
- [ ] Android 10 (API 29)
- [ ] Android 11 (API 30)
- [ ] Android 12 (API 31)
- [ ] Android 13 (API 33)

### Screen Sizes
- [ ] Phone (small)
- [ ] Phone (large)
- [ ] Tablet

### Network Conditions
- [ ] WiFi
- [ ] Mobile data
- [ ] Slow connection (3G)
- [ ] Offline then online

---

## 🚨 Known Issues

### Issue 1: Blank Screen (Under Investigation)
- **Status:** Need more logs
- **Workaround:** Force quit and reopen app
- **Priority:** High

### Issue 2: None Currently
All other issues fixed ✅

---

## 📊 Test Results Template

```
Date: _______________
Tester: _______________
Device: _______________
OS Version: _______________

Test 1 (Subscription): ☐ Pass ☐ Fail
Test 2 (Profile UI): ☐ Pass ☐ Fail
Test 3 (Auto-fill): ☐ Pass ☐ Fail
Test 4 (Security): ☐ Pass ☐ Fail
Test 5 (Blank Screen): ☐ Pass ☐ Fail ☐ Cannot Reproduce
Test 6 (User Journey): ☐ Pass ☐ Fail

Notes:
___________________________________
___________________________________
___________________________________
```

---

## 🔧 Debugging Commands

### View Real-time Logs
```bash
adb logcat | grep -E "myvoicepost|ReactNativeJS|STRIPE|AUTH"
```

### Clear App Data (Fresh Start)
```bash
adb shell pm clear com.myvoicepost.app
```

### Check Network Traffic
```bash
adb shell setprop log.tag.NetworkSecurityConfig DEBUG
adb logcat | grep NetworkSecurityConfig
```

### Check App is Running
```bash
adb shell dumpsys activity activities | grep myvoicepost
```

---

## ✅ Success Criteria

### Must Pass
1. ✅ Subscription payment works without error
2. ✅ "Settings" label appears in tab bar
3. ✅ Sign Out button visible below email
4. ✅ Username auto-fills on registration

### Should Pass
1. ⏳ No blank screens appear
2. ⏳ All input validation blocks malicious input
3. ⏳ Navigation smooth and responsive
4. ⏳ Error messages are user-friendly

### Nice to Have
1. ⏳ Fast app load time (<2 seconds)
2. ⏳ Smooth animations
3. ⏳ No memory leaks
4. ⏳ Efficient network usage

---

**Test Script Version:** 1.0  
**Date:** February 15, 2026  
**Status:** Ready for Testing
