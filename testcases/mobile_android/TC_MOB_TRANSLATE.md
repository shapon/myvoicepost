# Mobile Android Test Cases: Translate Feature

## TC-M-TRN-001: Translate voice recording
- **Type**: Positive
- **Precondition**: User logged in with active trial/subscription
- **Steps**:
  1. Navigate to Translate tab
  2. Set source language: English
  3. Set target language: Spanish
  4. Tap record, speak for 10 seconds, stop
- **Expected**: Three result cards: Original Text, Translated Text, Polished Translation

## TC-M-TRN-002: Translate between non-English languages
- **Type**: Positive
- **Steps**:
  1. Set source: French, target: German
  2. Record voice in French
- **Expected**: Text translated from French to German

## TC-M-TRN-003: Translate with same source and target
- **Type**: Negative
- **Steps**:
  1. Set both source and target to English
  2. Record and translate
- **Expected**: Warning about same language, or only polished version returned

## TC-M-TRN-004: Re-translate edited text
- **Type**: Positive
- **Precondition**: Translation result displayed
- **Steps**:
  1. Edit the original text
  2. Tap "Re-translate"
- **Expected**: New translation generated from edited text

## TC-M-TRN-005: Save translated text
- **Type**: Positive
- **Steps**:
  1. Tap "Save" on the translated text card
- **Expected**: Saved to cloud with type "translate"

## TC-M-TRN-006: Copy translated text
- **Type**: Positive
- **Steps**:
  1. Tap "Copy" on the translated text card
- **Expected**: Translated text copied to clipboard

## TC-M-TRN-007: Play translated text in target language
- **Type**: Positive
- **Steps**:
  1. Tap "Play" on the translated text card
- **Expected**: Text read aloud in the target language accent

## TC-M-TRN-008: Share translated text
- **Type**: Positive
- **Steps**:
  1. Tap "Share" on a result card
- **Expected**: Android share sheet opens with the text

## TC-M-TRN-009: Translate offline - saved to queue
- **Type**: Positive
- **Precondition**: Device offline
- **Steps**:
  1. Record voice while offline
- **Expected**: Recording saved to offline queue for later processing

## TC-M-TRN-010: Translate without subscription
- **Type**: Negative
- **Precondition**: No active trial/subscription
- **Steps**:
  1. Attempt to record for translation
- **Expected**: Access denied, prompted to subscribe

## TC-M-TRN-011: Clear translation results
- **Type**: Positive
- **Steps**:
  1. Tap "Clear" button
- **Expected**: All result cards cleared

## TC-M-TRN-012: Long recording translation (chunked)
- **Type**: Positive
- **Steps**:
  1. Record 3+ minutes of speech
  2. Stop and wait
- **Expected**: Chunked processing, full translation displayed
