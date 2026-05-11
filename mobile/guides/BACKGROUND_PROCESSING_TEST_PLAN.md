# Background Processing Verification Test Plan

## Test Date: February 5, 2026

## Objective
Verify that background processing (polish/translate) happens at exactly every 60-second mark during recording.

---

## Test Setup

### Prerequisites
- React Native app installed and running
- Metro bundler connected
- Logs visible in terminal

### Enable Detailed Logging
All necessary logging is already added to the code. You'll see:
- 🎙️ Chunk extraction markers
- ✅ Transcription completion markers
- 🔄 Background processing markers

---

## Test Case 1: 2-Minute Polish Recording

### Steps
1. Open the Polish screen
2. Start recording
3. Continue speaking for 2+ minutes
4. Monitor the logs

### Expected Log Output

**At t=60s:**
```
============================================================
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
============================================================
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] Chunk ID: session_xxxxx_chunk_0
[ChunkedRecording] Current duration: 60s
[ChunkedRecording] Time range: 0s - 60s
============================================================
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] Transcribed text: "Your speech here..."
[ChunkedRecording] Text length: XXX characters
============================================================
[ChunkedRecording] New accumulated text length: XXX
[ChunkedRecording] Triggering background polish processing...
============================================================
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: polish
[ChunkedRecording] Accumulated text length: XXX
[ChunkedRecording] Accumulated text preview: "Your speech..."
============================================================
[ChunkedRecording] Calling polishApi.polishText...
[ChunkedRecording] ✅ Polish completed, result length: XXX
[ChunkedRecording] State updated with processed result
============================================================
```

**At t=120s:**
Same sequence should repeat with:
- "60-second mark reached at 120s, extracting chunk 1"
- Time range: 60s - 120s
- Accumulated text now includes both chunks

### Pass/Fail Criteria
✅ PASS: Logs show processing at exactly t=60s and t=120s
❌ FAIL: Processing happens at other times or not at all

---

## Test Case 2: 2-Minute Translate Recording

### Steps
1. Open the Translate screen
2. Start recording
3. Continue speaking for 2+ minutes
4. Monitor the logs

### Expected Log Output

**At t=60s:**
```
============================================================
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: translate
============================================================
[ChunkedRecording] Calling translateApi.translateText...
[ChunkedRecording] ✅ Translate completed, result length: XXX
============================================================
```

### Pass/Fail Criteria
✅ PASS: Logs show "Type: translate" instead of "Type: polish"
✅ PASS: translateApi is called instead of polishApi
❌ FAIL: Wrong API called or no processing

---

## Test Case 3: Stop Before 60 Seconds (Guest User)

### Steps
1. Log out (become guest user)
2. Open Polish or Translate screen
3. Start recording
4. Stop at 50 seconds

### Expected Behavior
- No chunk extraction should occur (no "EXTRACTING CHUNK" logs)
- Recording should be processed normally when stopped
- Max duration should be 55 seconds for guest users

### Pass/Fail Criteria
✅ PASS: No chunk extraction logs before 60s
✅ PASS: Guest limited to 55s max
❌ FAIL: Chunk processing happens before 60s

---

## Test Case 4: Continue Mode with Chunked Recording

### Steps
1. Record for 70 seconds (should trigger chunk 0 at t=60s)
2. Stop recording
3. Click record again
4. Choose "Continue" when prompted
5. Record for another 70 seconds (should trigger chunk 1 at t=60s)

### Expected Behavior
- First recording: Chunk 0 extracted at t=60s
- Second recording (continue): Chunk 1 extracted at t=60s of NEW recording
- Final result should combine all chunks

### Pass/Fail Criteria
✅ PASS: Both recordings trigger chunk extraction at their respective 60s marks
✅ PASS: Final text combines all chunks
❌ FAIL: Continue mode doesn't work with chunking

---

## Test Case 5: Offline Behavior (Guest User)

### Steps
1. Log out (become guest user)
2. Turn off network (airplane mode)
3. Open Polish screen
4. Start recording
5. Record for 70+ seconds
6. Stop recording

### Expected Behavior
- Recording should NOT be saved to pending queue
- Alert should show "No Connection" message
- No processing should occur

### Pass/Fail Criteria
✅ PASS: Alert shows "No Connection" for guest
✅ PASS: Nothing saved to pending queue
❌ FAIL: Recording saved to pending or processed

---

## Test Case 6: Offline Behavior (Authenticated User)

### Steps
1. Log in
2. Turn off network (airplane mode)
3. Open Polish screen
4. Start recording
5. Record for 70+ seconds
6. Stop recording

### Expected Behavior
- Recording SHOULD be saved to pending queue
- Alert should show "Saved for Later"
- Can be processed later in Pending tab

### Pass/Fail Criteria
✅ PASS: Alert shows "Saved for Later" for authenticated user
✅ PASS: Recording appears in Pending tab
❌ FAIL: Recording not saved or error shown

---

## Common Issues & Troubleshooting

### Issue: No logs appearing
**Solution:** Check Metro bundler connection. Restart app if needed.

### Issue: Processing happens at wrong times
**Solution:** Check that you're using the latest code with the fix applied.

### Issue: Multiple chunks extracted at once
**Solution:** This shouldn't happen with the new fix. If it does, check the interval logic.

### Issue: Guest user can record > 55 seconds
**Solution:** Check ChunkedVoiceRecorder.tsx for GUEST_MAX_DURATION enforcement.

---

## Success Summary

After all tests:
- [ ] Chunk extraction happens at exactly t=60s, t=120s, etc.
- [ ] Background polish/translate APIs are called after each chunk
- [ ] Guest users limited to 55 seconds
- [ ] Authenticated users can queue offline recordings
- [ ] Guest users see error when offline (not saved)
- [ ] Continue mode works with chunked recording
- [ ] Logs show detailed timing and processing steps

---

## Performance Notes

- Each chunk extraction takes ~1-2 seconds
- Background transcription takes ~2-5 seconds per chunk
- Background polish/translate takes ~3-10 seconds per chunk
- Total processing time per chunk: ~5-17 seconds
- Recording continues uninterrupted during background processing

---

## Report Template

```
Test Date: _______________
Tester: _______________

Test Case 1 (2-Min Polish): ⬜ PASS ⬜ FAIL
  - Chunk 0 extracted at t=60s: ⬜ Yes ⬜ No
  - Polish API called: ⬜ Yes ⬜ No
  - Chunk 1 extracted at t=120s: ⬜ Yes ⬜ No
  - Polish API called again: ⬜ Yes ⬜ No

Test Case 2 (2-Min Translate): ⬜ PASS ⬜ FAIL
  - Chunk 0 extracted at t=60s: ⬜ Yes ⬜ No
  - Translate API called: ⬜ Yes ⬜ No

Test Case 3 (Guest < 60s): ⬜ PASS ⬜ FAIL
  - No chunk extraction: ⬜ Yes ⬜ No
  - Max 55s enforced: ⬜ Yes ⬜ No

Test Case 4 (Continue Mode): ⬜ PASS ⬜ FAIL
  - Both recordings chunked: ⬜ Yes ⬜ No
  - Text combined: ⬜ Yes ⬜ No

Test Case 5 (Guest Offline): ⬜ PASS ⬜ FAIL
  - Shows error: ⬜ Yes ⬜ No
  - Not saved: ⬜ Yes ⬜ No

Test Case 6 (Auth Offline): ⬜ PASS ⬜ FAIL
  - Saved for later: ⬜ Yes ⬜ No
  - In pending tab: ⬜ Yes ⬜ No

Overall Result: ⬜ ALL PASS ⬜ SOME FAILURES

Notes:
_________________________________________________
_________________________________________________
_________________________________________________
```
