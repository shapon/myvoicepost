# Web Test Cases: Landing Page & Navigation

## TC-W-LND-001: Landing page loads
- **Type**: Positive
- **Steps**:
  1. Navigate to /
- **Expected**: Landing page displays with hero section, features, testimonials, and demo recorder

## TC-W-LND-002: Landing page demo - Polish recording
- **Type**: Positive
- **Steps**:
  1. On landing page, find the Polish demo section
  2. Click the record button
  3. Speak for 5 seconds
  4. Stop recording
- **Expected**: Text transcribed and polished, results shown inline

## TC-W-LND-003: Landing page demo - Translate recording
- **Type**: Positive
- **Steps**:
  1. On landing page, find the Translate demo section
  2. Click the record button
  3. Speak for 5 seconds
  4. Stop recording
  5. Select target language
- **Expected**: Text transcribed and translated, results shown

## TC-W-LND-004: Landing page demo - Type and polish
- **Type**: Positive
- **Steps**:
  1. On landing page, switch to text input mode
  2. Type sample text
  3. Click polish button
- **Expected**: Polished result displayed

## TC-W-LND-005: Navigation to Polish page
- **Type**: Positive
- **Steps**:
  1. Click "Polish" in the navigation
- **Expected**: Navigated to /polish page

## TC-W-LND-006: Navigation to Translate page
- **Type**: Positive
- **Steps**:
  1. Click "Translate" in the navigation
- **Expected**: Navigated to /translate page

## TC-W-LND-007: Navigation to Process page
- **Type**: Positive
- **Steps**:
  1. Click "Process" or "Transcribe" in the navigation
- **Expected**: Navigated to /process page

## TC-W-LND-008: Navigation to Pricing page
- **Type**: Positive
- **Steps**:
  1. Click "Pricing" in the navigation
- **Expected**: Navigated to /pricing page with plan cards

## TC-W-LND-009: Pricing page - plan display
- **Type**: Positive
- **Steps**:
  1. Navigate to /pricing
- **Expected**: Three plans displayed (Starter, Pro, Enterprise) with features and prices

## TC-W-LND-010: Pricing page - toggle monthly/yearly
- **Type**: Positive
- **Steps**:
  1. Navigate to /pricing
  2. Toggle from Monthly to Yearly
- **Expected**: Prices update to show yearly rates with discount

## TC-W-LND-011: Privacy policy page
- **Type**: Positive
- **Steps**:
  1. Navigate to /privacy
- **Expected**: Privacy policy content displayed

## TC-W-LND-012: Terms of service page
- **Type**: Positive
- **Steps**:
  1. Navigate to /terms
- **Expected**: Terms of service content displayed

## TC-W-LND-013: Affiliate page
- **Type**: Positive
- **Steps**:
  1. Navigate to /affiliate
- **Expected**: Affiliate program information displayed

## TC-W-LND-014: 404 page for invalid route
- **Type**: Negative
- **Steps**:
  1. Navigate to /nonexistent-page
- **Expected**: 404 Not Found page displayed
