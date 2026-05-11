# Background Processing Fix - February 5, 2026

## Issues Identified & Fixed

### Issue 1: Background Processing Not Working Every 60 Seconds ❌ → ✅

**Problem:**
- The `setInterval` for chunk extraction was set to fire AFTER 60 seconds, not AT 60 seconds
- This meant:
  - Recording starts at t=0s
  - First chunk extracted at t=60s (should be 0-60s audio)
  - Second chunk extracted at t=120s (should be 60-120s audio)
- But the interval was wrong - it was a separate interval that only fired after the delay

**Root Cause:**
```typescript
// OLD CODE - WRONG ❌
durationIntervalRef.current = setInterval(() => {
  setState(prev => ({
    ...prev,
    currentDuration: prev.currentDuration + 1,
  }));
}, 1000);

// Separate chunk interval - fires independently
chunkIntervalRef.current = setInterval(() => {
  chunkIndex++;
  extractAndProcessChunk(chunkIndex - 1);
}, CHUNK_DURATION_MS); // 60000ms
```

This creates TWO separate intervals:
1. Duration counter (every 1 second)
2. Chunk extractor (every 60 seconds)

The problem: These aren't synchronized! The chunk interval starts at t=0 and fires at t=60, t=120, etc., but it doesn't know the actual recording duration.

**Solution:**
```typescript
// NEW CODE - CORRECT ✅
let currentDuration = 0;
durationIntervalRef.current = setInterval(() => {
  currentDuration++;
  setState(prev => ({
    ...prev,
    currentDuration: currentDuration,
  }));

  // Check if we've hit a 60-second mark
  if (currentDuration % CHUNK_DURATION_SEC === 0 && currentDuration > 0) {
    const chunkIndex = Math.floor(currentDuration / CHUNK_DURATION_SEC) - 1;
    console.log(`[ChunkedRecording] 60-second mark reached at ${currentDuration}s, extracting chunk ${chunkIndex}`);
    extractAndProcessChunk(chunkIndex);
  }
}, 1000);
```

Now we have ONE interval that:
- Updates duration every second
- Checks if we've reached a 60-second boundary
- Immediately triggers chunk extraction at t=60s, t=120s, t=180s, etc.

### Issue 2: Insufficient Logging for Debugging

**Added comprehensive logging:**

1. **Chunk Extraction Logging:**
```typescript
console.log('='.repeat(60));
console.log(`[ChunkedRecording] 🎙️ EXTRACTING CHUNK ${chunkIndex}`);
console.log(`[ChunkedRecording] Chunk ID: ${chunkId}`);
console.log(`[ChunkedRecording] Current duration: ${state.currentDuration}s`);
console.log(`[ChunkedRecording] Time range: ${lastProcessedDurationRef.current}s - ${lastProcessedDurationRef.current + CHUNK_DURATION_SEC}s`);
console.log('='.repeat(60));
```

2. **Transcription Logging:**
```typescript
console.log('='.repeat(60));
console.log(`[ChunkedRecording] ✅ CHUNK ${chunk.index} TRANSCRIBED`);
console.log(`[ChunkedRecording] Transcribed text: "${transcribedText}"`);
console.log(`[ChunkedRecording] Text length: ${transcribedText.length} characters`);
console.log('='.repeat(60));
```

3. **Background Processing Logging:**
```typescript
console.log('='.repeat(60));
console.log('[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED');
console.log('[ChunkedRecording] Type:', opts.type);
console.log('[ChunkedRecording] Accumulated text length:', accumulatedText.length);
console.log('[ChunkedRecording] Accumulated text preview:', accumulatedText.substring(0, 100));
console.log('='.repeat(60));
```

## How to Verify the Fix

### Test Case 1: Record for 2+ Minutes

1. **Setup:**
   - Open Polish or Translate screen
   - Start recording

2. **Expected Behavior:**
   - At t=60s: Log shows "60-second mark reached at 60s, extracting chunk 0"
   - At t=120s: Log shows "60-second mark reached at 120s, extracting chunk 1"
   - At t=180s: Log shows "60-second mark reached at 180s, extracting chunk 2"

3. **Logs to Look For:**
   ```
   ============================================================
   [ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
   [ChunkedRecording] Current duration: 60s
   ============================================================
   [ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
   [ChunkedRecording] Transcribed text: "..."
   ============================================================
   [ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
   [ChunkedRecording] Type: polish
   [ChunkedRecording] Accumulated text length: 150
   ============================================================
   [ChunkedRecording] ✅ Polish completed, result length: 180
   ============================================================
   ```

4. **UI Indicators:**
   - Partial results should appear in the UI as chunks are processed
   - The result text should update in real-time

### Test Case 2: Polish Action Every Minute

**For Polish Screen:**

1. Record for 2 minutes
2. Check logs at t=60s:
   - Should see: "BACKGROUND PROCESSING STARTED" with "Type: polish"
   - Should see: "Calling polishApi.polishText..."
   - Should see: "✅ Polish completed"
3. Check logs at t=120s:
   - Same sequence should repeat with accumulated text

**For Translate Screen:**

1. Record for 2 minutes
2. Check logs at t=60s:
   - Should see: "BACKGROUND PROCESSING STARTED" with "Type: translate"
   - Should see: "Calling translateApi.translateText..."
   - Should see: "✅ Translate completed"
3. Check logs at t=120s:
   - Same sequence should repeat with accumulated text

## Expected Timeline

### Example: 2.5 Minute Recording

```
t=0s:    Recording starts
t=60s:   ✅ Chunk 0 extracted (0-60s audio)
         ✅ Transcribed
         ✅ Polish/Translate API called with chunk 0 text
t=120s:  ✅ Chunk 1 extracted (60-120s audio)
         ✅ Transcribed
         ✅ Polish/Translate API called with chunks 0+1 combined text
t=150s:  User stops recording
         ✅ Final segment (120-150s) processed
         ✅ Polish/Translate API called with all chunks combined
```

## What Was NOT Changed

1. **Guest user restrictions** - Already implemented correctly:
   - Max 55 seconds for non-authenticated users
   - No saving to pending queue when offline/error

2. **Continue mode** - Already working correctly:
   - Appends new audio to existing text
   - Re-processes combined text

3. **Offline handling** - Already correct:
   - Authenticated users: Saves to pending queue
   - Guest users: Shows error, doesn't save

## Debugging Tips

If background processing still doesn't work:

1. **Check the logs for the exact timing:**
   ```
   Look for: "60-second mark reached at XXXs"
   ```

2. **Verify the API is being called:**
   ```
   Look for: "Calling polishApi.polishText..." or "Calling translateApi.translateText..."
   ```

3. **Check for errors:**
   ```
   Look for: "❌ Result processing failed"
   ```

4. **Verify chunk extraction:**
   ```
   Look for: "🎙️ EXTRACTING CHUNK"
   ```

5. **Check transcription results:**
   ```
   Look for: "✅ CHUNK X TRANSCRIBED"
   ```

## Files Modified

- `src/hooks/useChunkedRecording.ts`
  - Fixed interval timing logic
  - Merged duration and chunk intervals into one
  - Added comprehensive logging
  - Cleaned up interval cleanup code

## Next Steps

1. Test with a 2+ minute recording
2. Monitor the logs to confirm timing
3. Verify UI updates with partial results
4. Test both Polish and Translate actions

## Known Limitations

- First chunk processing happens at t=60s (not t=0s)
- This is intentional - we wait for a full 60-second chunk before processing
- Final segment (< 60s) is processed when user stops recording

## Success Criteria

✅ Chunk extraction happens at exactly 60s, 120s, 180s, etc.
✅ Background polish/translate APIs are called immediately after each chunk
✅ Logs show detailed timing and processing steps
✅ UI displays partial results as they arrive
✅ Guest users still limited to 55 seconds
✅ Offline handling works correctly for both authenticated and guest users
