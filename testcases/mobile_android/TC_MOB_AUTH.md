# Mobile Android Test Cases: Authentication & Session Management

## TC-M-AUTH-001: Login with valid email and password
- **Type**: Positive
- **Precondition**: User account exists
- **Steps**:
  1. Open app, navigate to Login screen
  2. Enter valid email
  3. Enter correct password
  4. Tap "Login"
- **Expected**: User logged in, navigated to main tabs (Polish tab), token stored in SecureStore

## TC-M-AUTH-002: Login with invalid password
- **Type**: Negative
- **Steps**:
  1. Navigate to Login screen
  2. Enter valid email, wrong password
  3. Tap "Login"
- **Expected**: Error alert "Invalid credentials", stays on login screen

## TC-M-AUTH-003: Login with non-existent email
- **Type**: Negative
- **Steps**:
  1. Enter non-registered email and any password
  2. Tap "Login"
- **Expected**: Error message, stays on login

## TC-M-AUTH-004: Login with empty fields
- **Type**: Negative
- **Steps**:
  1. Leave email and password empty
  2. Tap "Login"
- **Expected**: Form validation error shown

## TC-M-AUTH-005: Registration with OTP flow
- **Type**: Positive
- **Steps**:
  1. Navigate to Register screen
  2. Enter valid email
  3. Tap "Send OTP"
  4. Enter received 6-digit OTP
  5. Enter username, password, confirm password
  6. Tap "Register"
- **Expected**: Account created, 7-day trial activated (90 minutes), navigated to main app

## TC-M-AUTH-006: Registration with invalid OTP
- **Type**: Negative
- **Steps**:
  1. Navigate to Register screen
  2. Enter email, request OTP
  3. Enter wrong OTP code
  4. Complete form and tap "Register"
- **Expected**: Error "Invalid OTP"

## TC-M-AUTH-007: Registration with duplicate email
- **Type**: Negative
- **Precondition**: Email already registered
- **Steps**:
  1. Register with same email
- **Expected**: Error "Email already exists"

## TC-M-AUTH-008: Registration with duplicate username
- **Type**: Negative
- **Precondition**: Username already taken
- **Steps**:
  1. Complete OTP, enter taken username
  2. Tap "Register"
- **Expected**: Error "Username already taken"

## TC-M-AUTH-009: Registration with short password
- **Type**: Negative
- **Steps**:
  1. Complete OTP, enter password less than 6 characters
- **Expected**: Validation error about minimum length

## TC-M-AUTH-010: Registration with mismatched passwords
- **Type**: Negative
- **Steps**:
  1. Enter different password and confirm password
- **Expected**: Validation error "Passwords do not match"

## TC-M-AUTH-011: Google SSO login
- **Type**: Positive
- **Steps**:
  1. Tap "Sign in with Google"
  2. Complete Google authentication
- **Expected**: User authenticated, navigated to main app

## TC-M-AUTH-012: Forgot password - request code
- **Type**: Positive
- **Steps**:
  1. Navigate to Forgot Password screen
  2. Enter registered email
  3. Tap "Send Code"
- **Expected**: 6-character verification code sent to email

## TC-M-AUTH-013: Forgot password - invalid email
- **Type**: Negative
- **Steps**:
  1. Navigate to Forgot Password
  2. Enter non-registered email
  3. Tap "Send Code"
- **Expected**: Error message

## TC-M-AUTH-014: Reset password with valid code
- **Type**: Positive
- **Steps**:
  1. Navigate to Reset Password screen
  2. Enter email, verification code, new password
  3. Tap "Reset Password"
- **Expected**: Password updated, can login with new password

## TC-M-AUTH-015: Reset password with invalid code
- **Type**: Negative
- **Steps**:
  1. Enter wrong verification code
  2. Tap "Reset Password"
- **Expected**: Error "Invalid or expired code"

## TC-M-AUTH-016: Logout
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to Profile tab
  2. Tap "Logout"
- **Expected**: Token cleared, navigated to login screen

## TC-M-AUTH-017: Session replaced (single device)
- **Type**: Positive
- **Precondition**: Logged in on Device A
- **Steps**:
  1. Login with same account on Device B
  2. On Device A, perform any authenticated action
- **Expected**: Device A receives SESSION_REPLACED error, user forced to logout with message

## TC-M-AUTH-018: Auto-login with stored token
- **Type**: Positive
- **Precondition**: User previously logged in, token still valid
- **Steps**:
  1. Close and reopen the app
- **Expected**: User automatically logged in, navigated to main tabs

## TC-M-AUTH-019: Auto-login with expired token
- **Type**: Negative
- **Precondition**: Stored token is expired (> 7 days)
- **Steps**:
  1. Open app
- **Expected**: Navigated to login screen
