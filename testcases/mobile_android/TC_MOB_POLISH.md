# Mobile Android Test Cases: Polish Feature

## TC-M-POL-001: Polish voice recording (authenticated)
- **Type**: Positive
- **Precondition**: User logged in with active trial/subscription
- **Steps**:
  1. Navigate to Polish tab
  2. Select language: English
  3. Select tone: Professional
  4. Select output type: Message
  5. Tap record button
  6. Speak for 10 seconds
  7. Tap stop
- **Expected**: Audio transcribed, original text and polished text displayed in TextResultCards

## TC-M-POL-002: Polish with different tones
- **Type**: Positive
- **Steps**:
  1. For each tone (Professional, Casual, Formal, Friendly):
     a. Record voice
     b. Verify polished text matches the selected tone style
- **Expected**: Each tone produces appropriately styled text

## TC-M-POL-003: Polish with different output types
- **Type**: Positive
- **Steps**:
  1. For each output type (Message, Note, Email, Post, Journal):
     a. Record voice
     b. Verify polished text format matches output type
- **Expected**: Email output looks like email format, etc.

## TC-M-POL-004: Polish in non-English language
- **Type**: Positive
- **Steps**:
  1. Select language: Spanish
  2. Record voice in Spanish
  3. Wait for result
- **Expected**: Transcribed and polished in Spanish

## TC-M-POL-005: Re-polish (edit and re-process)
- **Type**: Positive
- **Precondition**: Polish result displayed
- **Steps**:
  1. Edit the original text in the result card
  2. Tap "Re-polish" or equivalent
- **Expected**: New polished version generated from edited text

## TC-M-POL-006: Append mode recording
- **Type**: Positive
- **Steps**:
  1. Record first segment (10 seconds), stop
  2. Enable "Append Mode"
  3. Record second segment (10 seconds), stop
- **Expected**: Second segment appended to first, combined text polished

## TC-M-POL-007: Chunked recording (long audio)
- **Type**: Positive
- **Precondition**: User has sufficient minutes
- **Steps**:
  1. Start recording
  2. Speak continuously for 2+ minutes
  3. Stop recording
- **Expected**: Audio processed in 60-second chunks, partial transcriptions shown, final combined result displayed

## TC-M-POL-008: Save polished text
- **Type**: Positive
- **Precondition**: Polish result displayed, user logged in
- **Steps**:
  1. Tap "Save" on the polished text card
- **Expected**: Saved to cloud, appears in Saved tab

## TC-M-POL-009: Copy polished text
- **Type**: Positive
- **Steps**:
  1. Tap "Copy" on the polished text card
- **Expected**: Text copied to clipboard, confirmation shown

## TC-M-POL-010: Share polished text
- **Type**: Positive
- **Steps**:
  1. Tap "Share" on the result card
- **Expected**: Native Android share sheet opens

## TC-M-POL-011: Play polished text (TTS)
- **Type**: Positive
- **Steps**:
  1. Tap "Play" on the polished text card
- **Expected**: Text read aloud via text-to-speech

## TC-M-POL-012: Polish without subscription/trial
- **Type**: Negative
- **Precondition**: Trial expired, no active subscription
- **Steps**:
  1. Navigate to Polish tab
  2. Tap record
- **Expected**: Access denied, prompted to subscribe

## TC-M-POL-013: Polish offline - saved to queue
- **Type**: Positive
- **Precondition**: Device is offline, user logged in
- **Steps**:
  1. Record voice while offline
  2. Wait for processing to fail
- **Expected**: Recording saved to offline queue (pending items), notification shown

## TC-M-POL-014: Offline queue auto-process on reconnect
- **Type**: Positive
- **Precondition**: Pending items exist in offline queue
- **Steps**:
  1. Reconnect to internet
  2. Wait for auto-processing
- **Expected**: Pending items processed automatically, results saved

## TC-M-POL-015: Clear results
- **Type**: Positive
- **Precondition**: Polish result displayed
- **Steps**:
  1. Tap "Clear" or equivalent button
- **Expected**: Results cleared, ready for new recording

## TC-M-POL-016: AI image generation from polished text
- **Type**: Positive
- **Precondition**: Polish result displayed
- **Steps**:
  1. Tap "Image" button on the result card
- **Expected**: AI-generated image created from the text content

## TC-M-POL-017: Microphone permission denied
- **Type**: Negative
- **Steps**:
  1. Deny microphone permission
  2. Tap record button
- **Expected**: Permission request shown, or error about microphone access
