# 🔄 Background Processing Flow - Visual Guide

**Date**: February 5, 2026

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER STARTS RECORDING                         │
│                    (Authenticated User Only)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Recording Starts (t=0s)                       │
│   • Timer begins: setInterval(..., 1000)                        │
│   • Audio recording starts                                       │
│   • State: { isRecording: true, currentDuration: 0 }            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Timer Ticks Every Second                        │
│   • t=1s → currentDuration = 1                                  │
│   • t=2s → currentDuration = 2                                  │
│   • ...                                                          │
│   • t=59s → currentDuration = 59                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               🎯 60-SECOND MARK DETECTED (t=60s)                │
│   • Check: currentDuration % 60 === 0                           │
│   • Condition: TRUE                                              │
│   • Action: extractAndProcessChunk(0)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   🎙️ CHUNK EXTRACTION (Chunk 0)                 │
│   1. Stop current recording                                      │
│   2. Read audio file → base64                                   │
│   3. Start NEW recording (seamless continuation)                │
│   4. Call: processChunkInBackground(chunk0)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  📝 TRANSCRIPTION (Chunk 0)                      │
│   • Call: transcribeApi.transcribe(chunk0.base64Audio)          │
│   • Result: transcribedText = "..."                             │
│   • Append to: accumulatedOriginalText                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              🔄 BACKGROUND PROCESSING DECISION                   │
│   • Check: opts.type === 'polish' OR 'translate'?              │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              │ type='polish'                 │ type='translate'
              ▼                               ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   POLISH PROCESSING      │      │  TRANSLATE PROCESSING    │
│                          │      │                          │
│ Call:                    │      │ Call:                    │
│ polishApi.polishText(    │      │ translateApi.translate(  │
│   accumulatedText,       │      │   accumulatedText,       │
│   language,              │      │   sourceLanguage,        │
│   outputFormat,          │      │   targetLanguage,        │
│   outputType             │      │   outputFormat           │
│ )                        │      │ )                        │
│                          │      │                          │
│ Result:                  │      │ Result:                  │
│ polishedText             │      │ translatedText           │
└────────────┬─────────────┘      └────────────┬─────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  💾 STATE UPDATE                                 │
│   • setState({ processedResult: resultText })                   │
│   • Trigger: opts.onResultUpdated(originalText, resultText)     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  🖥️ UI UPDATE (Partial Result)                  │
│   • PolishScreen: onPartialResult() → setPolishedText()        │
│   • TranslateScreen: onPartialResult() → setTranslatedText()   │
│   • User sees: Original text + Result text (partial)            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Recording Continues (t=61s → t=119s)               │
│   • New recording active                                         │
│   • Timer continues ticking                                      │
│   • User can keep speaking                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            🎯 120-SECOND MARK DETECTED (t=120s)                 │
│   • Check: currentDuration % 60 === 0                           │
│   • Condition: TRUE                                              │
│   • Action: extractAndProcessChunk(1)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────┴──────────────┐
              │   REPEAT PROCESS FOR CHUNK 1│
              │   (Same flow as above)      │
              └──────────────┬──────────────┘
                             │
                             ▼
            [Process continues for each 60s interval]
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  USER STOPS RECORDING                            │
│   • Clear timer                                                  │
│   • Stop recording                                               │
│   • Process final segment (if > 2s remaining)                   │
│   • Return: { originalText, resultText }                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Key Decision Points

### 1. Recording Type (Guest vs Authenticated)

```
User Taps Record
    ↓
Check: isAuthenticated?
    │
    ├─ NO (Guest) → Simple Recording (max 55s, no chunks)
    │
    └─ YES (Authenticated) → Chunked Recording (60s intervals)
```

### 2. Action Type (Polish vs Translate)

```
Chunk Transcribed
    ↓
Call: processAccumulatedText()
    ↓
Check: opts.type === ?
    │
    ├─ 'polish' → polishApi.polishText()
    │
    └─ 'translate' → translateApi.translateText()
```

### 3. Online vs Offline

```
Chunk Ready
    ↓
Check: isOnline()?
    │
    ├─ YES → Process immediately
    │
    └─ NO → Queue for later (pendingChunksQueue)
```

---

## 📊 State Changes Over Time

```
Time    | Duration | Action              | State
--------|----------|---------------------|---------------------------
t=0s    | 0s       | Start recording     | isRecording: true
t=1s    | 1s       | Timer tick          | currentDuration: 1
t=30s   | 30s      | Timer tick          | currentDuration: 30
t=60s   | 60s      | CHUNK EXTRACTED     | isProcessingChunk: true
                                         | chunks: [chunk0]
t=62s   | 62s      | TRANSCRIBING        | chunks[0].status: 'processing'
t=65s   | 65s      | POLISHING/TRANS     | processing background
t=67s   | 67s      | CHUNK COMPLETE      | isProcessingChunk: false
                                         | chunks[0].status: 'completed'
                                         | accumulatedText: "..."
                                         | processedResult: "..."
                                         | UI UPDATED ✅
t=120s  | 120s     | CHUNK EXTRACTED     | chunks: [chunk0, chunk1]
                                         | Repeat process...
```

---

## 🎯 Code Location Reference

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Timer | useChunkedRecording.ts | 476-483 | Detects 60s marks |
| Chunk Extraction | useChunkedRecording.ts | 177-271 | Extracts audio |
| Transcription | useChunkedRecording.ts | 306-324 | Transcribes audio |
| Polish Processing | useChunkedRecording.ts | 386-396 | Calls polish API |
| Translate Processing | useChunkedRecording.ts | 397-405 | Calls translate API |
| PolishScreen Setup | PolishScreen.tsx | 493-522 | Component config |
| TranslateScreen Setup | TranslateScreen.tsx | 459-488 | Component config |

---

## 🔬 Log Timeline Example (90-Second Recording)

```
[t=0s]
[ChunkedRecording] Recording started with session: session_1234567890_abc123

[t=1s - t=59s]
[Timer updates every second, no logs]

[t=60s]
============================================================
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
============================================================
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] Chunk ID: session_1234567890_abc123_chunk_0
[ChunkedRecording] Current duration: 60s
[ChunkedRecording] Time range: 0s - 60s
============================================================

[t=62s]
============================================================
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] Transcribed text: "This is the transcribed text..."
[ChunkedRecording] Text length: 145 characters
============================================================
[ChunkedRecording] New accumulated text length: 145
[ChunkedRecording] Triggering background polish processing...

[t=63s]
============================================================
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: polish
[ChunkedRecording] Accumulated text length: 145
[ChunkedRecording] Accumulated text preview: This is the transcribed text...
============================================================
[ChunkedRecording] Calling polishApi.polishText...

[t=65s]
[ChunkedRecording] ✅ Polish completed, result length: 158
[ChunkedRecording] State updated with processed result
============================================================
[PolishScreen] 📊 Partial result received
[PolishScreen] Updating UI with partial results

[t=61s - t=89s]
[Recording continues, timer ticks...]

[t=90s]
[User stops recording]
[ChunkedRecording] Processing final segment (30s)
[ChunkedRecording] ✅ Recording complete
```

---

## ✅ Verification Checklist

Use this to verify the flow is working:

### At t=60s:
- [ ] See: "60-second mark reached at 60s"
- [ ] See: "🎙️ EXTRACTING CHUNK 0"
- [ ] See: "✅ CHUNK 0 TRANSCRIBED"
- [ ] See: "🔄 BACKGROUND PROCESSING STARTED"
- [ ] See: "Type: polish" or "Type: translate"
- [ ] See: "Calling polishApi.polishText" or "Calling translateApi.translateText"
- [ ] See: "✅ Polish completed" or "✅ Translate completed"
- [ ] See: "[PolishScreen] 📊 Partial result received" or "[TranslateScreen]..."
- [ ] UI updates with partial result
- [ ] Recording continues without interruption

### At t=120s:
- [ ] See: "60-second mark reached at 120s"
- [ ] See: "🎙️ EXTRACTING CHUNK 1"
- [ ] See: Second processing cycle
- [ ] UI updates again with accumulated results

---

## 🎬 Quick Test

1. **Start**: Log in, go to Polish/Translate screen
2. **Record**: Tap record, speak continuously
3. **Watch**: Terminal logs at t=60s
4. **Verify**: Flow matches diagram above
5. **Success**: ✅ Background processing working

---

**Status**: ✅ Flow verified in code  
**Next**: Test in live environment

