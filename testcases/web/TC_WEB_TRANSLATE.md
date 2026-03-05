# Web Test Cases: Translate Feature

## TC-W-TRN-001: Translate text as guest
- **Type**: Positive
- **Precondition**: User NOT logged in
- **Steps**:
  1. Navigate to /translate
  2. Enter text: "Hello, how are you doing today?"
  3. Set source language: English
  4. Set target language: Spanish
  5. Click "Translate"
- **Expected**: Original, translated, and polished translation displayed

## TC-W-TRN-002: Translate text as authenticated user
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to /translate
  2. Enter text, set languages
  3. Click "Translate"
- **Expected**: Uses /api/v1/a/translate endpoint, save button visible

## TC-W-TRN-003: Translate with empty text
- **Type**: Negative
- **Steps**:
  1. Navigate to /translate
  2. Leave text empty
  3. Click "Translate"
- **Expected**: Validation error, no API call made

## TC-W-TRN-004: Swap source and target languages
- **Type**: Positive
- **Steps**:
  1. Navigate to /translate
  2. Set source: English, target: French
  3. Click the "Swap" button
- **Expected**: Source becomes French, target becomes English

## TC-W-TRN-005: Translate with same source and target language
- **Type**: Negative
- **Steps**:
  1. Navigate to /translate
  2. Set both source and target to English
  3. Enter text and click "Translate"
- **Expected**: Warning or error that languages are the same, or polished version returned

## TC-W-TRN-006: Translate via voice recording
- **Type**: Positive
- **Steps**:
  1. Navigate to /translate
  2. Click record button
  3. Speak in English for 10 seconds
  4. Stop recording
  5. Set target language to Japanese
  6. Click "Translate"
- **Expected**: Speech transcribed, then translated to Japanese

## TC-W-TRN-007: Save translated text
- **Type**: Positive
- **Precondition**: User logged in, translation result displayed
- **Steps**:
  1. Click "Save" on the result card
- **Expected**: Saved successfully, appears in /saved items

## TC-W-TRN-008: Copy translated text
- **Type**: Positive
- **Precondition**: Translation result displayed
- **Steps**:
  1. Click "Copy" on the translated text card
- **Expected**: Translated text copied to clipboard

## TC-W-TRN-009: Play translated text in target language
- **Type**: Positive
- **Precondition**: Translation to Spanish result displayed
- **Steps**:
  1. Click "Play" on the translated text card
- **Expected**: Browser reads the text in Spanish accent/voice

## TC-W-TRN-010: Translate between non-English languages
- **Type**: Positive
- **Steps**:
  1. Set source: French, target: German
  2. Enter French text
  3. Click "Translate"
- **Expected**: Text translated from French to German successfully
