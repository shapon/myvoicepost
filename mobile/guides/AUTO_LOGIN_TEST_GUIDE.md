# Auto-Login Testing Guide

## Overview
This guide helps you verify that the auto-login functionality is working correctly in the MyVoicePost mobile app.

---

## 🧪 Test Cases

### Test 1: First Time User (No Token)
**Steps:**
1. Fresh install or clear app data
2. Open the app
3. Navigate to Profile tab

**Expected Result:**
- ✅ Console shows: `[AutoLogin] No token found - user not logged in`
- ✅ Profile shows "Not Signed In" state
- ✅ "Sign In" button is visible
- ✅ No authentication errors

---

### Test 2: Login and Auto-Login on Reopen
**Steps:**
1. Login with valid credentials
2. Verify you see logged-in state
3. **Completely close the app** (kill the process)
4. Reopen the app
5. Navigate to Profile tab

**Expected Result:**
- ✅ Console shows: `[AutoLogin] Token found - validating with server...`
- ✅ Console shows: `[AutoLogin] Token valid - user logged in: [username]`
- ✅ **No login screen appears**
- ✅ Profile immediately shows your username and email
- ✅ All authenticated features work (Saved items, Pending, etc.)

---

### Test 3: Logout and Verify Token Cleared
**Steps:**
1. While logged in, click "Sign Out"
2. Confirm logout
3. Close app completely
4. Reopen app
5. Navigate to Profile tab

**Expected Result:**
- ✅ Console shows: `[AutoLogin] No token found - user not logged in`
- ✅ Profile shows "Not Signed In" state
- ✅ App does not auto-login

---

### Test 4: Invalid/Expired Token Handling
**Steps:**
1. Login to the app
2. Wait for token to expire (or manually invalidate server-side)
3. Close and reopen app

**Expected Result:**
- ✅ Console shows: `[AutoLogin] Token invalid/expired - clearing and staying logged out`
- ✅ Profile shows "Not Signed In" state
- ✅ User must manually login again
- ✅ No error alerts shown to user

---

### Test 5: Network Error During Auto-Login
**Steps:**
1. Login to the app
2. Close app
3. Turn off network/airplane mode
4. Reopen app

**Expected Result:**
- ✅ Console shows: `[AutoLogin] Auth check failed with error: [network error]`
- ✅ App stays logged out (safe fallback)
- ✅ When network restored, user can manually login

---

## 📊 Console Log Reference

### Successful Auto-Login Flow
```
[TokenManager] Initialized with existing token
[AutoLogin] Starting auth check...
[AutoLogin] Token found - validating with server...
[AUTH API] GET /auth/me
[AUTH API] Response 200 from /auth/me
[AutoLogin] Token valid - user logged in: johndoe
[AutoLogin] Auth check complete
```

### No Token Flow
```
[TokenManager] Initialized without token
[AutoLogin] Starting auth check...
[AutoLogin] No token found - user not logged in
[AutoLogin] Auth check complete
```

### Expired Token Flow
```
[TokenManager] Initialized with existing token
[AutoLogin] Starting auth check...
[AutoLogin] Token found - validating with server...
[AUTH API] GET /auth/me
[AUTH API] Error: 401
[AutoLogin] Token invalid/expired - clearing and staying logged out
[AutoLogin] Auth check complete
```

---

## 🔧 Debugging Tips

### If Auto-Login Not Working:

1. **Check Console Logs**
   - Look for `[AutoLogin]` prefixed messages
   - Verify token validation is being attempted

2. **Check Token Storage**
   - Add breakpoint in `tokenManager.getToken()`
   - Verify token is actually stored after login

3. **Check API Response**
   - Look for `[AUTH API]` logs
   - Verify `/auth/me` endpoint returns user data

4. **Check Network**
   - Verify app has internet connection
   - Check if API server is reachable

5. **Clear App Data**
   - Uninstall and reinstall
   - Test fresh login → close → reopen flow

---

## ✅ Success Criteria

Auto-login is working correctly if:
- ✅ User logged in once remains logged in after app restart
- ✅ No manual login required on app reopen
- ✅ Invalid tokens are cleared gracefully
- ✅ First-time users see logged-out state
- ✅ After logout, auto-login does not occur

---

## 🚨 Common Issues

### Issue: Auto-login works but shows errors
**Cause:** Network issues during token validation
**Fix:** Check network connection and API server status

### Issue: Token valid but user not set
**Cause:** API response format mismatch
**Fix:** Verify `response.user` structure matches User interface

### Issue: Auto-login happens on every tab switch
**Cause:** `checkAuth()` called in wrong place
**Fix:** Ensure `checkAuth()` only runs in `useEffect` in AuthProvider

---

## 📱 Testing on Different Scenarios

### Scenario 1: Background → Foreground
- App sent to background
- App brought to foreground
- **Expected:** User stays logged in (no re-check needed)

### Scenario 2: Complete App Restart
- App force-closed
- App relaunched
- **Expected:** Auto-login attempts, user logged in if token valid

### Scenario 3: After App Update
- App updated via store
- App relaunched
- **Expected:** Auto-login works, existing tokens persist

---

## 🎯 Metrics to Track

During testing, verify:
- ⏱️ Auto-login speed (should be < 2 seconds)
- 📊 Success rate (should be 100% with valid tokens)
- 🚫 Error handling (no crashes on network failure)
- 🔄 Token refresh (if implemented in future)

---

## 🏁 Final Verification

Run this complete test sequence:

```
1. Install app (fresh) → No token → Logged out ✓
2. Login successfully → Token stored ✓
3. Close & reopen → Auto-login ✓
4. Use app features → All work ✓
5. Logout → Token cleared ✓
6. Close & reopen → Logged out ✓
7. Login again → Token stored ✓
8. Close & reopen → Auto-login ✓
```

If all steps pass: **Auto-login is working perfectly! 🎉**
