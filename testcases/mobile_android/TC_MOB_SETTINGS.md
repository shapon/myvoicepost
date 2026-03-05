# Mobile Android Test Cases: Settings, Profile & Help

## TC-M-SET-001: View profile screen
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to Profile tab
- **Expected**: Shows username, email, usage stats, subscription info

## TC-M-SET-002: View usage statistics
- **Type**: Positive
- **Steps**:
  1. Navigate to Profile tab
  2. View usage charts
- **Expected**: Shows total transcription count, total usage seconds, recent activity

## TC-M-SET-003: Update username
- **Type**: Positive
- **Steps**:
  1. Navigate to Account Settings
  2. Change username to a new value
  3. Save
- **Expected**: Username updated successfully

## TC-M-SET-004: Update username to duplicate
- **Type**: Negative
- **Steps**:
  1. Change username to an already taken username
  2. Save
- **Expected**: Error "Username already taken"

## TC-M-SET-005: Update email
- **Type**: Positive
- **Steps**:
  1. Navigate to Account Settings
  2. Change email
  3. Save
- **Expected**: Email updated

## TC-M-SET-006: Change password
- **Type**: Positive
- **Steps**:
  1. Navigate to Account Settings
  2. Enter current password, new password, confirm new password
  3. Save
- **Expected**: Password changed, can login with new password

## TC-M-SET-007: Change password with wrong current password
- **Type**: Negative
- **Steps**:
  1. Enter wrong current password
  2. Enter new password
  3. Save
- **Expected**: Error "Current password is incorrect"

## TC-M-SET-008: App settings - default language
- **Type**: Positive
- **Steps**:
  1. Navigate to App Settings
  2. Change default language
  3. Save
- **Expected**: Setting persisted, used as default in Polish/Translate

## TC-M-SET-009: Settings sync across devices
- **Type**: Positive
- **Steps**:
  1. Change a setting on Device A
  2. Login on Device B
- **Expected**: Settings synced from server, same values on Device B

## TC-M-SET-010: Delete a setting
- **Type**: Positive
- **Steps**:
  1. Navigate to settings
  2. Reset a specific setting to default
- **Expected**: Setting deleted from server, default value used

## TC-M-SET-011: Help tab - diagnostics
- **Type**: Positive
- **Steps**:
  1. Navigate to Help tab
  2. Run diagnostic check
- **Expected**: Shows network status, microphone permission status, server latency

## TC-M-SET-012: Help tab - submit support request
- **Type**: Positive
- **Steps**:
  1. Navigate to Help tab
  2. Tap "Contact Support"
  3. Fill in subject and message
  4. Submit
- **Expected**: Support request created, confirmation shown

## TC-M-SET-013: Help tab - FAQ
- **Type**: Positive
- **Steps**:
  1. Navigate to Help tab
  2. Browse FAQ items
- **Expected**: FAQ questions and answers displayed
