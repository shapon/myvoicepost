# Web Test Cases: Polish Feature

## TC-W-POL-001: Polish text as guest user
- **Type**: Positive
- **Precondition**: User is NOT logged in
- **Steps**:
  1. Navigate to /polish
  2. Type text in the input area: "hey i wanted to tell u that the meeting is tmrw at 3pm"
  3. Select language: English
  4. Select tone: Professional
  5. Select output type: Message
  6. Click "Polish Text"
- **Expected**: Original text and polished text displayed in result cards, polished text is grammatically correct and professional

## TC-W-POL-002: Polish text as authenticated user
- **Type**: Positive
- **Precondition**: User is logged in
- **Steps**:
  1. Navigate to /polish
  2. Type text: "can u plz send me the report asap"
  3. Select tone: Formal
  4. Select output type: Email
  5. Click "Polish Text"
- **Expected**: Result displayed using authenticated endpoint (/api/v1/a/polish), save button visible

## TC-W-POL-003: Polish with empty text
- **Type**: Negative
- **Steps**:
  1. Navigate to /polish
  2. Leave text area empty
  3. Click "Polish Text"
- **Expected**: Validation error or button disabled, no API call made

## TC-W-POL-004: Polish with voice recording (guest)
- **Type**: Positive
- **Precondition**: Microphone permission granted, user NOT logged in
- **Steps**:
  1. Navigate to /polish
  2. Click the microphone/record button
  3. Speak for 10 seconds
  4. Stop recording
  5. Wait for transcription
  6. Click "Polish Text"
- **Expected**: Voice transcribed to text, then polished successfully

## TC-W-POL-005: Voice recording time limit (guest - 55 seconds)
- **Type**: Negative
- **Precondition**: User NOT logged in
- **Steps**:
  1. Navigate to /polish
  2. Start voice recording
  3. Continue recording for 55+ seconds
- **Expected**: Recording auto-stops at 55 seconds, transcription proceeds

## TC-W-POL-006: Voice recording time limit (authenticated - 300 seconds)
- **Type**: Positive
- **Precondition**: User is logged in
- **Steps**:
  1. Navigate to /polish
  2. Start voice recording
  3. Record for 60+ seconds
- **Expected**: Recording continues past 55s (up to 300s), chunked processing sends partial results

## TC-W-POL-007: Copy polished text
- **Type**: Positive
- **Precondition**: Polish result is displayed
- **Steps**:
  1. Click the "Copy" button on the polished text card
- **Expected**: Text copied to clipboard, confirmation shown

## TC-W-POL-008: Edit polished text inline
- **Type**: Positive
- **Precondition**: Polish result is displayed
- **Steps**:
  1. Click "Edit" on the polished text card
  2. Modify the text
  3. Click "Save" / confirm edit
- **Expected**: Text updated in the card

## TC-W-POL-009: Save polished text (authenticated)
- **Type**: Positive
- **Precondition**: User logged in, polish result displayed
- **Steps**:
  1. Click "Save" on the result card
- **Expected**: Text saved to /saved items, success toast shown

## TC-W-POL-010: Save polished text (guest - not allowed)
- **Type**: Negative
- **Precondition**: User NOT logged in, polish result displayed
- **Steps**:
  1. Look for "Save" button
- **Expected**: Save button not visible or prompts login

## TC-W-POL-011: Polish with different languages
- **Type**: Positive
- **Steps**:
  1. Navigate to /polish
  2. Enter text in Spanish: "oye necesito q me envies el informe"
  3. Select language: Spanish
  4. Click "Polish Text"
- **Expected**: Text polished in Spanish

## TC-W-POL-012: Polish with all output types
- **Type**: Positive
- **Steps**:
  1. For each output type (Message, Note, Email, Post, Journal):
     a. Enter text
     b. Select the output type
     c. Click "Polish Text"
     d. Verify result format matches the output type
- **Expected**: Each output type produces appropriately formatted result

## TC-W-POL-013: Play polished text (TTS)
- **Type**: Positive
- **Precondition**: Polish result displayed
- **Steps**:
  1. Click "Play" button on the polished text card
- **Expected**: Browser speaks the text aloud using Speech Synthesis API

## TC-W-POL-014: Share polished text
- **Type**: Positive
- **Precondition**: Polish result displayed, browser supports Web Share API
- **Steps**:
  1. Click "Share" button on the result card
- **Expected**: Native share dialog opens (or clipboard fallback)

## TC-W-POL-015: Microphone permission denied
- **Type**: Negative
- **Steps**:
  1. Navigate to /polish
  2. Deny microphone permission
  3. Click record button
- **Expected**: Error message about microphone access needed
