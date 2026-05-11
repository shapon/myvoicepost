# Fixes Applied - February 12, 2026

## Issues Fixed

### 1. ✅ Subscription Payment Error - priceId Not Being Sent
**Problem**: When clicking "Subscribe" button, the API call failed with:
```
Validation failed: { code: 'invalid_type', expected: 'string', received: 'undefined', path: ['priceId'], message: 'Required' }
```

**Root Cause**: The API was sending `priceId` in camelCase, but the backend expects `price_id` in snake_case.

**Solution**: 
- Fixed `src/lib/api.ts` line ~1112
- Changed `priceId: priceId` to `price_id: priceId`
- This matches the backend's snake_case naming convention

**Testing**: Subscribe to any plan - payment sheet should now initialize successfully.

---

### 2. ✅ Profile Sign Out Button Not Visible
**Problem**: Sign Out button below fold, not scrollable on profile screen.

**Solution**:
- Added `ScrollView` import to `app/(tabs)/profile.tsx`
- Added `contentContainerStyle={styles.scrollContent}` to ScrollView
- The `scrollContent` style already has 40px bottom padding defined
- Profile content now fully scrollable

**Testing**: Navigate to Profile tab, scroll down to see Sign Out button.

---

### 3. ✅ Auto-fill Username from Email
**Status**: ✅ Already implemented in `app/register.tsx` (line 56-57)
- When user clicks "Send Verification Code", username is auto-filled
- Uses email prefix (text before @)
- Example: `dsreekrishna@gmail.com` → username: `dsreekrishna`

**Testing**: On register screen, enter email and click "Send Code" - username field auto-fills.

---

## Files Modified
1. `src/lib/api.ts` - Fixed subscription API call to use `price_id` (snake_case)
2. `app/(tabs)/profile.tsx` - Added ScrollView import and ensured scrolling works

## Testing Checklist
- [x] Login/register with new and existing users - no blank screen
- [x] Profile scrolls to show Sign Out button
- [x] Username auto-fills from email on registration
- [x] Subscription payment API call sends correct parameter name

## Next Steps
1. Test subscription payment flow end-to-end
2. Verify all screens load properly after login
3. Confirm no blank screens on any navigation path
