# Mobile Android Test Cases: System, Background & Edge Cases

## TC-M-SYS-001: Background recording continues when app minimized
- **Type**: Positive
- **Steps**:
  1. Start recording
  2. Minimize the app (press home button)
  3. Wait 10 seconds
  4. Return to app
- **Expected**: Recording continued in background, audio not lost

## TC-M-SYS-002: Recovery after app crash during recording
- **Type**: Positive
- **Precondition**: App crashed during an active recording
- **Steps**:
  1. Reopen the app
- **Expected**: RecoveryModal appears, offering to recover the audio segment

## TC-M-SYS-003: Recovery modal - recover recording
- **Type**: Positive
- **Precondition**: Recovery modal shown
- **Steps**:
  1. Tap "Recover" on the recovery modal
- **Expected**: Previous audio segments recovered and queued for processing

## TC-M-SYS-004: Recovery modal - discard
- **Type**: Positive
- **Precondition**: Recovery modal shown
- **Steps**:
  1. Tap "Discard" on the recovery modal
- **Expected**: Previous recording discarded, app starts fresh

## TC-M-SYS-005: Battery usage warning during long recording
- **Type**: Positive
- **Steps**:
  1. Start recording
  2. Continue for an extended period
- **Expected**: HighBatteryUsageWarning alert shown

## TC-M-SYS-006: Network connectivity change during recording
- **Type**: Positive
- **Steps**:
  1. Start recording with WiFi
  2. Disable WiFi mid-recording
  3. Stop recording
- **Expected**: Recording saved to offline queue, not lost

## TC-M-SYS-007: Crash report auto-submission
- **Type**: Positive
- **Precondition**: App previously crashed
- **Steps**:
  1. Reopen app after crash
- **Expected**: Crash report automatically sent to /api/v1/a/crash-report

## TC-M-SYS-008: Error logging
- **Type**: Positive
- **Steps**:
  1. Trigger any error in the app (e.g., failed API call)
- **Expected**: Error logged to /api/v1/a/error-log for admin visibility

## TC-M-SYS-009: Reliability status bar
- **Type**: Positive
- **Steps**:
  1. Start recording
  2. Observe the status bar
- **Expected**: Shows real-time connection and processing status

## TC-M-SYS-010: App startup with no internet
- **Type**: Negative
- **Steps**:
  1. Disable internet
  2. Open the app
- **Expected**: App loads with cached data, shows offline indicator

## TC-M-SYS-011: Deep link handling (Google SSO callback)
- **Type**: Positive
- **Steps**:
  1. Trigger Google SSO
  2. After Google auth, deep link back to app (myvoicepost://auth/google?token=...)
- **Expected**: Token extracted, user logged in

## TC-M-SYS-012: SSL pinning / host validation
- **Type**: Positive
- **Steps**:
  1. Make any API request
- **Expected**: Only requests to allowed hosts (myvoicepost.com) succeed

## TC-M-SYS-013: SSL pinning - blocked host
- **Type**: Negative
- **Steps**:
  1. Attempt to redirect API call to unauthorized host
- **Expected**: Request blocked with "[SSL] Blocked request to unauthorized host" error

## TC-M-SYS-014: Token refresh on 401
- **Type**: Positive
- **Precondition**: Token about to expire
- **Steps**:
  1. Make an authenticated API request
  2. Receive 401 response
- **Expected**: Token cleared, user redirected to login

## TC-M-SYS-015: Multiple rapid recordings
- **Type**: Positive
- **Steps**:
  1. Record, stop, immediately record again
  2. Repeat 5 times quickly
- **Expected**: All recordings processed without crash or data loss

## TC-M-SYS-016: Large text handling
- **Type**: Positive
- **Steps**:
  1. Record a very long speech (5 minutes)
  2. Wait for full processing
- **Expected**: Large text displayed correctly, scrollable, all actions work
