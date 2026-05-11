# Chunked Background Audio Processing Guide

## Overview

This guide explains how to implement background audio processing for long recordings (> 60 seconds) in the MyVoicePost mobile app.

## Components Created

### 1. `useChunkedRecording` Hook (`src/hooks/useChunkedRecording.ts`)

A custom hook that manages chunked audio recording and background processing.

**Features:**
- Automatic chunk detection at 60-second intervals
- Background transcription processing while recording continues
- Accumulated text management
- Polish/Translate API integration
- Offline queue support with retry logic
- State management for partial results

**Usage:**
```typescript
import { useChunkedRecording } from '../hooks/useChunkedRecording';

const {
  state,
  startRecording,
  stopRecording,
  cancelRecording,
  appendToAccumulatedText,
  clearState,
  permissionGranted,
  isOnline,
} = useChunkedRecording({
  type: 'polish', // or 'translate'
  language: 'en',
  outputFormat: 'professional',
  outputType: 'general',
  enableBackgroundProcessing: true,
  onChunkProcessed: (chunk, accumulatedText) => {
    console.log(`Chunk ${chunk.index} processed: ${accumulatedText}`);
  },
  onResultUpdated: (originalText, resultText) => {
    // Update UI with partial results
    setOriginalText(originalText);
    setPolishedText(resultText);
  },
  onError: (error, chunk) => {
    console.error('Chunk processing error:', error);
  },
});
```

**State Properties:**
- `isRecording`: Whether recording is active
- `currentDuration`: Current recording duration in seconds
- `chunks`: Array of chunk information
- `accumulatedOriginalText`: Combined transcribed text from all processed chunks
- `processedResult`: Polished/translated result of accumulated text
- `isProcessingChunk`: Whether a chunk is currently being processed
- `currentChunkIndex`: Index of current chunk being processed
- `processingProgress`: Processing progress percentage (0-100)

### 2. `ChunkedVoiceRecorder` Component (`src/components/ChunkedVoiceRecorder.tsx`)

A voice recorder component that automatically handles chunked processing for long recordings.

**Features:**
- Seamless transition from simple to chunked recording mode
- Visual indicators for chunk processing progress
- Partial transcription preview
- Offline status indicator
- Support for "Continue" mode (appending to existing text)

**Props:**
```typescript
interface ChunkedVoiceRecorderProps {
  // For short recordings (< 60s), use traditional flow
  onRecordingComplete?: (base64Audio: string, duration: number) => Promise<void>;
  
  // For chunked recordings, use these callbacks
  onChunkedRecordingComplete?: (originalText: string, resultText: string) => Promise<void>;
  onPartialResult?: (originalText: string, resultText: string) => void;
  
  // Configuration
  isProcessing?: boolean;
  maxDuration?: number; // Maximum total recording duration (default: 600s)
  chunkDuration?: number; // Duration per chunk (default: 60s)
  enableChunkedProcessing?: boolean;
  
  // Processing options
  type: 'polish' | 'translate';
  language?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  outputFormat?: string;
  outputType?: string;
  
  // Continue mode support
  onBeforeRecord?: () => Promise<'continue' | 'new' | 'cancel'>;
  existingText?: string;
}
```

## Integration Examples

### PolishScreen Integration

```typescript
import { ChunkedVoiceRecorder } from '../components/ChunkedVoiceRecorder';

export function PolishScreen() {
  const [originalText, setOriginalText] = useState('');
  const [polishedText, setPolishedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState('en');
  const [tone, setTone] = useState('professional');
  const [outputType, setOutputType] = useState('general');

  // Handle chunked recording completion
  const handleChunkedComplete = async (original: string, result: string) => {
    setOriginalText(original);
    setPolishedText(result);
  };

  // Handle partial results during recording
  const handlePartialResult = (original: string, result: string) => {
    setOriginalText(original);
    setPolishedText(result);
  };

  // Handle before recording for continue mode
  const handleBeforeRecord = async (): Promise<'continue' | 'new' | 'cancel'> => {
    if (originalText.trim()) {
      // Show alert to user
      return new Promise((resolve) => {
        Alert.alert(
          'Existing Content',
          'Continue with existing text or start fresh?',
          [
            { text: 'Cancel', onPress: () => resolve('cancel') },
            { text: 'New', onPress: () => {
              setOriginalText('');
              setPolishedText('');
              resolve('new');
            }},
            { text: 'Continue', onPress: () => resolve('continue') },
          ]
        );
      });
    }
    return 'new';
  };

  return (
    <ChunkedVoiceRecorder
      type="polish"
      language={language}
      outputFormat={tone}
      outputType={outputType}
      onChunkedRecordingComplete={handleChunkedComplete}
      onPartialResult={handlePartialResult}
      onBeforeRecord={handleBeforeRecord}
      existingText={originalText}
      isProcessing={isProcessing}
      enableChunkedProcessing={true}
    />
  );
}
```

### TranslateScreen Integration

```typescript
import { ChunkedVoiceRecorder } from '../components/ChunkedVoiceRecorder';

export function TranslateScreen() {
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [tone, setTone] = useState('professional');

  const handleChunkedComplete = async (original: string, result: string) => {
    setOriginalText(original);
    setTranslatedText(result);
  };

  const handlePartialResult = (original: string, result: string) => {
    setOriginalText(original);
    setTranslatedText(result);
  };

  return (
    <ChunkedVoiceRecorder
      type="translate"
      sourceLanguage={sourceLanguage}
      targetLanguage={targetLanguage}
      outputFormat={tone}
      onChunkedRecordingComplete={handleChunkedComplete}
      onPartialResult={handlePartialResult}
      enableChunkedProcessing={true}
    />
  );
}
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER STARTS RECORDING                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              SIMPLE RECORDING MODE (< 60s)                       │
│  - Standard expo-av recording                                    │
│  - Duration counter                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Duration reaches 55s
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              SWITCH TO CHUNKED MODE                              │
│  - Stop current recording                                        │
│  - Save initial audio                                            │
│  - Start new recording session                                   │
│  - Initialize chunk processing                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                     Every 60 seconds
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              CHUNK EXTRACTION & PROCESSING                       │
│  1. Stop current recording                                       │
│  2. Read audio as base64                                         │
│  3. Start new recording immediately                              │
│  4. Process chunk in background:                                 │
│     a. Send to /transcribe API                                   │
│     b. Append text to accumulated original                       │
│     c. Send accumulated text to /polish or /translate            │
│     d. Update UI with partial results                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    User stops recording
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              FINAL PROCESSING                                    │
│  1. Stop recording                                               │
│  2. Process remaining audio (if > 2s)                            │
│  3. Combine with accumulated text                                │
│  4. Final polish/translate API call                              │
│  5. Return complete results                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling Strategy

### Chunk Processing Failures

Each chunk has built-in retry logic:
- Maximum 3 retry attempts
- 2-second delay between retries
- Failed chunks are marked and can be manually retried

### Offline Handling

When offline:
- Chunks are queued for later processing
- Visual indicator shows offline status
- Recording continues uninterrupted
- Queued chunks are processed when online

### API Failures

- Individual chunk failures don't stop recording
- Partial results are preserved
- User can retry failed chunks via `retryFailedChunks()`

## State Management

The hook maintains comprehensive state:

```typescript
interface ChunkedRecordingState {
  isRecording: boolean;
  currentDuration: number;
  chunks: ChunkInfo[];
  accumulatedOriginalText: string;
  processedResult: string;
  isProcessingChunk: boolean;
  currentChunkIndex: number;
  processingProgress: number;
}

interface ChunkInfo {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcribedText?: string;
  error?: string;
  retryCount: number;
  base64Audio?: string;
}
```

## UX Considerations

1. **Processing Indicator**: Shows when background chunks are being processed
2. **Progress Display**: Shows completed vs total chunks
3. **Partial Preview**: Shows transcribed text as it accumulates
4. **Offline Indicator**: Warns user when chunks will be queued
5. **Seamless Transition**: User doesn't notice switch from simple to chunked mode

## Technical Constraints

- Works with expo-av Recording API
- Uses existing API endpoints (/transcribe, /polish, /translate)
- Compatible with offline queue system
- No external dependencies beyond existing packages

## Files Modified/Created

1. **Created**: `src/hooks/useChunkedRecording.ts`
2. **Created**: `src/components/ChunkedVoiceRecorder.tsx`
3. **Modified**: `src/hooks/index.ts` - Added export for new hook
4. **Modified**: `src/lib/constants.ts` - Added cardBackground color
