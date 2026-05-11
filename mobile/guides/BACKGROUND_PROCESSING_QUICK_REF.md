# Quick Reference: Background Processing Fix

## 🎯 What Was Fixed?

Background polish/translate processing now happens at **exactly every 60 seconds** during recording.

**✅ FIX APPLIED**: Both PolishScreen and TranslateScreen now use `ChunkedVoiceRecorder` instead of the old `VoiceRecorder`.

---

## ⚡ Quick Test

1. Open Polish or Translate screen
2. Start recording
3. Keep talking for 2+ minutes
4. Watch logs for this at t=60s:

```
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] ✅ Polish completed
```

---

## 📊 Expected Timeline

```
t=0s    ➡️  Recording starts
t=60s   ➡️  Chunk 0 extracted → transcribed → polished/translated
t=120s  ➡️  Chunk 1 extracted → transcribed → polished/translated
t=180s  ➡️  Chunk 2 extracted → transcribed → polished/translated
Stop    ➡️  Final segment processed
```

---

## 🔍 What to Look For

### ✅ Good Signs
- Logs show "60-second mark reached at 60s"
- Logs show "BACKGROUND PROCESSING STARTED" at t=60s
- Logs show "Polish/Translate completed"
- UI shows partial results updating

### ❌ Red Flags
- No logs at t=60s
- Processing happens at random times
- No "BACKGROUND PROCESSING STARTED" logs
- UI doesn't update with partial results

---

## 🎨 Log Markers Guide

| Marker | What It Means |
|--------|---------------|
| 🎙️ | Chunk extraction started |
| ✅ | Success |
| 🔄 | Background processing started |
| ❌ | Error |

---

## 🔧 The Fix in Simple Terms

**Before:** Two separate timers that weren't synced
- Timer 1: Counts seconds
- Timer 2: Tries to extract chunks (not reliable)

**After:** One timer that does both
- Every second: Update counter
- At 60s, 120s, etc.: Extract chunk automatically

---

## 📱 User Features

### Authenticated Users
- ✅ Can record unlimited time
- ✅ Background processing every 60s
- ✅ Offline recordings saved to pending
- ✅ Continue mode works

### Guest Users
- ✅ Max 55 seconds per recording
- ✅ Must start fresh each time
- ❌ Cannot save offline recordings
- ✅ Can still use continue mode (if online)

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| No logs appearing | Restart Metro bundler |
| Processing at wrong times | Restart app, clear cache |
| Guest can record > 55s | Check ChunkedVoiceRecorder.tsx |
| Offline not working | Check network status |

---

## 📚 Full Documentation

- **Detailed Fix:** `guides/BACKGROUND_PROCESSING_FIX.md`
- **Test Plan:** `guides/BACKGROUND_PROCESSING_TEST_PLAN.md`
- **Summary:** `guides/BACKGROUND_PROCESSING_SUMMARY.md`

---

## ✨ Key Improvement

**One simple change makes background processing reliable:**

```typescript
// Check every second if we've hit a 60s boundary
if (currentDuration % 60 === 0 && currentDuration > 0) {
  extractAndProcessChunk();
}
```

This guarantees processing happens at **exactly** the right time! 🎯
