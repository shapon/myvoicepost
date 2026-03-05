# Mobile Android Test Cases: Process/Transcribe Feature

## TC-M-PRC-001: Process YouTube URL
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to Transcribe/Process tab
  2. Enter a valid YouTube URL
  3. Tap "Process"
- **Expected**: Content extracted, transcribed text displayed

## TC-M-PRC-002: Process webpage URL
- **Type**: Positive
- **Steps**:
  1. Enter a valid article/blog URL
  2. Tap "Process"
- **Expected**: Text extracted from webpage

## TC-M-PRC-003: Process invalid URL
- **Type**: Negative
- **Steps**:
  1. Enter "not-a-url"
  2. Tap "Process"
- **Expected**: Error message about invalid URL

## TC-M-PRC-004: Process empty URL
- **Type**: Negative
- **Steps**:
  1. Leave URL field empty
  2. Tap "Process"
- **Expected**: Validation error

## TC-M-PRC-005: Upload audio file
- **Type**: Positive
- **Steps**:
  1. Tap file upload button
  2. Select an MP3 file from device (< 50MB)
- **Expected**: Audio transcribed, text displayed

## TC-M-PRC-006: Upload oversized audio file
- **Type**: Negative
- **Steps**:
  1. Attempt to upload file > 50MB
- **Expected**: Error about file size limit

## TC-M-PRC-007: Upload non-audio file
- **Type**: Negative
- **Steps**:
  1. Attempt to upload a non-audio file type
- **Expected**: Error "Only audio files are allowed"

## TC-M-PRC-008: Apply tone transformation to transcribed text
- **Type**: Positive
- **Precondition**: Transcribed text displayed
- **Steps**:
  1. Select tone category: "Conversational"
  2. Select specific tone: "Bullet Points"
  3. Apply transformation
- **Expected**: Text rewritten in bullet point format

## TC-M-PRC-009: Apply different tone categories
- **Type**: Positive
- **Steps**:
  1. For each category (Conversational, Informational, Emotional):
     a. Select category and a tone within it
     b. Apply transformation
     c. Verify result matches the tone
- **Expected**: Different transformation styles applied correctly

## TC-M-PRC-010: Save processed text
- **Type**: Positive
- **Steps**:
  1. Tap "Save" on the result card
- **Expected**: Saved successfully

## TC-M-PRC-011: Process with target language
- **Type**: Positive
- **Steps**:
  1. Enter YouTube URL
  2. Set target language to Spanish
  3. Tap "Process"
- **Expected**: Content extracted and translated to Spanish

## TC-M-PRC-012: Process while offline
- **Type**: Negative
- **Precondition**: Device offline
- **Steps**:
  1. Enter URL and tap "Process"
- **Expected**: Error about no network connection
