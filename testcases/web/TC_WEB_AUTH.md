# Web Test Cases: Authentication & Session Management

## TC-W-AUTH-001: Login with valid email and password
- **Type**: Positive
- **Precondition**: User account exists with known credentials
- **Steps**:
  1. Navigate to /login
  2. Enter valid email in the email field
  3. Enter correct password
  4. Click "Login" button
- **Expected**: User is logged in, redirected to /polish, auth token stored in localStorage

## TC-W-AUTH-002: Login with invalid password
- **Type**: Negative
- **Precondition**: User account exists
- **Steps**:
  1. Navigate to /login
  2. Enter valid email
  3. Enter wrong password
  4. Click "Login"
- **Expected**: Error toast displayed "Invalid credentials", user stays on /login

## TC-W-AUTH-003: Login with non-existent email
- **Type**: Negative
- **Steps**:
  1. Navigate to /login
  2. Enter an email that is not registered
  3. Enter any password
  4. Click "Login"
- **Expected**: Error message displayed, user stays on /login

## TC-W-AUTH-004: Login with empty fields
- **Type**: Negative
- **Steps**:
  1. Navigate to /login
  2. Leave email and password empty
  3. Click "Login"
- **Expected**: Form validation error shown, login not attempted

## TC-W-AUTH-005: Google SSO login (existing user)
- **Type**: Positive
- **Precondition**: User has previously registered via Google
- **Steps**:
  1. Navigate to /login
  2. Click "Sign in with Google"
  3. Complete Google authentication
- **Expected**: User is logged in, redirected to /polish

## TC-W-AUTH-006: Google SSO login (new user - auto registration)
- **Type**: Positive
- **Steps**:
  1. Navigate to /login
  2. Click "Sign in with Google" with a Google account not previously used
  3. Complete Google authentication
- **Expected**: New account created, user logged in, redirected to /polish

## TC-W-AUTH-007: Signup with valid data and OTP
- **Type**: Positive
- **Steps**:
  1. Navigate to /signup
  2. Enter valid email
  3. Click "Verify" to request OTP
  4. Enter the 6-digit OTP received via email
  5. Fill in username, password, confirm password
  6. Click "Sign Up"
- **Expected**: Account created, user logged in, redirected to app

## TC-W-AUTH-008: Signup with mismatched passwords
- **Type**: Negative
- **Steps**:
  1. Navigate to /signup
  2. Enter valid email, request and enter OTP
  3. Enter password "Pass123"
  4. Enter confirm password "Pass456"
  5. Click "Sign Up"
- **Expected**: Validation error "Passwords do not match"

## TC-W-AUTH-009: Signup with already registered email
- **Type**: Negative
- **Precondition**: Email already registered
- **Steps**:
  1. Navigate to /signup
  2. Enter an already registered email
  3. Complete OTP and form
  4. Click "Sign Up"
- **Expected**: Error message "Email already exists" or similar

## TC-W-AUTH-010: Signup with invalid OTP
- **Type**: Negative
- **Steps**:
  1. Navigate to /signup
  2. Enter valid email, request OTP
  3. Enter wrong 6-digit code
  4. Complete form and click "Sign Up"
- **Expected**: Error "Invalid OTP" or similar

## TC-W-AUTH-011: Signup with short password (< 6 chars)
- **Type**: Negative
- **Steps**:
  1. Navigate to /signup
  2. Complete OTP verification
  3. Enter password "abc" (less than 6 characters)
  4. Click "Sign Up"
- **Expected**: Validation error about minimum password length

## TC-W-AUTH-012: Logout
- **Type**: Positive
- **Precondition**: User is logged in
- **Steps**:
  1. Click user avatar or logout button
  2. Confirm logout
- **Expected**: User logged out, token removed from localStorage, redirected to landing page

## TC-W-AUTH-013: Session replaced (single device enforcement)
- **Type**: Positive
- **Precondition**: User logged in on Browser A
- **Steps**:
  1. Login with same account on Browser B
  2. On Browser A, perform any authenticated action (e.g., navigate to /saved)
- **Expected**: Browser A shows "Your account has been logged in on another device" message, user is logged out on Browser A

## TC-W-AUTH-014: Access protected page without login
- **Type**: Negative
- **Steps**:
  1. Clear any stored auth tokens
  2. Navigate directly to /saved
- **Expected**: Redirected to login page or shown "login required" message

## TC-W-AUTH-015: Token expiry handling
- **Type**: Negative
- **Precondition**: User has an expired JWT token in localStorage
- **Steps**:
  1. Make any authenticated API request
- **Expected**: User is logged out gracefully, redirected to login
