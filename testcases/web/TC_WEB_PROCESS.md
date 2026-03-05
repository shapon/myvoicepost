# Web Test Cases: Process/Transcribe Feature

## TC-W-PRC-001: Process YouTube URL as guest
- **Type**: Positive
- **Precondition**: User NOT logged in
- **Steps**:
  1. Navigate to /process
  2. Enter a valid YouTube URL
  3. Click "Process"
- **Expected**: Content extracted and transcribed text displayed

## TC-W-PRC-002: Process YouTube URL as authenticated user
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to /process
  2. Enter a valid YouTube URL
  3. Click "Process"
- **Expected**: Uses /api/v1/a/process-url, transcribed text displayed

## TC-W-PRC-003: Process invalid URL
- **Type**: Negative
- **Steps**:
  1. Navigate to /process
  2. Enter "not-a-valid-url"
  3. Click "Process"
- **Expected**: Error message "Invalid URL" or "Failed to process"

## TC-W-PRC-004: Process with empty URL
- **Type**: Negative
- **Steps**:
  1. Navigate to /process
  2. Leave URL field empty
  3. Click "Process"
- **Expected**: Validation error, button disabled or error shown

## TC-W-PRC-005: Upload audio file (authenticated)
- **Type**: Positive
- **Precondition**: User logged in
- **Steps**:
  1. Navigate to /process
  2. Click file upload area
  3. Select a valid MP3 file (< 25MB)
- **Expected**: File uploaded, transcribed text displayed

## TC-W-PRC-006: Upload oversized file
- **Type**: Negative
- **Steps**:
  1. Navigate to /process
  2. Attempt to upload a file > 25MB
- **Expected**: Error message about file size limit

## TC-W-PRC-007: Upload non-audio file
- **Type**: Negative
- **Steps**:
  1. Navigate to /process
  2. Attempt to upload a .txt or .pdf file
- **Expected**: Error message "Only audio files are allowed" or file rejected

## TC-W-PRC-008: Apply tone transformation
- **Type**: Positive
- **Precondition**: Transcribed text is displayed
- **Steps**:
  1. Select a tone category (e.g., "Conversational")
  2. Select a specific tone (e.g., "Bullet Points")
  3. Click "Transform" or apply button
- **Expected**: Text rewritten in the selected tone style

## TC-W-PRC-009: Save processed text
- **Type**: Positive
- **Precondition**: User logged in, processed result displayed
- **Steps**:
  1. Click "Save" on the result card
- **Expected**: Text saved, appears in /saved

## TC-W-PRC-010: Edit transcribed text before tone transformation
- **Type**: Positive
- **Precondition**: Transcribed text displayed
- **Steps**:
  1. Edit the transcribed text in the textarea
  2. Apply a tone transformation
- **Expected**: Tone applied to the edited version of the text

## TC-W-PRC-011: Process webpage URL
- **Type**: Positive
- **Steps**:
  1. Navigate to /process
  2. Enter a valid article/blog webpage URL
  3. Click "Process"
- **Expected**: Text content extracted from the webpage
