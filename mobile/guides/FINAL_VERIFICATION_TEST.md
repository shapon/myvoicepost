# Final Verification Test Script

**Purpose**: Verify that background processing works correctly for both Polish and Translate actions at exactly 60-second intervals.

**Estimated Time**: 15 minutes

---

## 🚀 Pre-Test Setup

### Step 1: Clear Cache and Restart

```powershell
# Stop any running Metro processes
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force

# Clear Metro cache and start fresh
npm start -- --reset-cache
```

### Step 2: Open Log Terminal

Keep your terminal visible to watch logs in real-time.

### Step 3: Prepare Test Device/Emulator

- Open the app
- Make sure you're logged in (to test authenticated user features)
- Navigate to the Polish screen

---

## 🧪 Test 1: Polish Background Processing (90 seconds)

**Goal**: Verify chunk processing at exactly 60 seconds.

### Actions

1. **Start Recording** (t=0s)
   - Tap the microphone button
   - Start speaking continuously

2. **Keep Speaking** (t=1-59s)
   - Speak clearly and continuously
   - Watch duration counter

3. **Observe at t=60s** ⭐ CRITICAL
   - Keep speaking
   - Watch terminal logs
   - UI should stay responsive

4. **Continue Speaking** (t=61-90s)
   - Keep recording
   - Speak continuously

5. **Stop Recording** (t=90s)
   - Tap stop button
   - Wait for final processing

### Expected Logs

#### At t=60s (while still recording):

```
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
============================================================
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] Chunk ID: session_XXXXX_chunk_0
[ChunkedRecording] Current duration: 60s
[ChunkedRecording] Time range: 0s - 60s
============================================================
```

Wait 2-5 seconds, then:

```
============================================================
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] Transcribed text: "Your spoken content..."
[ChunkedRecording] Text length: XXX characters
============================================================
[ChunkedRecording] New accumulated text length: XXX
[ChunkedRecording] Triggering background polish processing...
============================================================
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: polish
[ChunkedRecording] Accumulated text length: XXX
============================================================
[ChunkedRecording] Calling polishApi.polishText...
[ChunkedRecording] ✅ Polish completed, result length: XXX
[ChunkedRecording] State updated with processed result
============================================================
[PolishScreen] 📊 Partial result received
[PolishScreen] Updating UI with partial results
```

### Expected UI Behavior

- ✅ Recording continues (duration counter keeps going 60→61→62...)
- ✅ No interruption in recording
- ✅ Partial results appear in the text boxes
- ✅ Processing indicator may briefly appear

### ✅ Pass Criteria

- [ ] Logs show "60-second mark reached at 60s"
- [ ] Logs show "EXTRACTING CHUNK 0"
- [ ] Logs show "CHUNK 0 TRANSCRIBED"
- [ ] Logs show "BACKGROUND PROCESSING STARTED"
- [ ] Logs show "Polish completed"
- [ ] UI shows partial results
- [ ] Recording continues without interruption

---

## 🧪 Test 2: Translate Background Processing (150 seconds)

**Goal**: Verify chunk processing at 60s AND 120s.

### Actions

1. Navigate to Translate screen
2. Select languages (e.g., English → Spanish)
3. Start recording and speak for 150 seconds
4. Observe logs at both t=60s and t=120s

### Expected Logs

#### At t=60s:

```
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
...
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: translate
[ChunkedRecording] Calling translateApi.translateText...
[ChunkedRecording] ✅ Translate completed, result length: XXX
```

#### At t=120s:

```
[ChunkedRecording] 60-second mark reached at 120s, extracting chunk 1
...
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: translate
[ChunkedRecording] Calling translateApi.translateText...
[ChunkedRecording] ✅ Translate completed, result length: XXX
```

### ✅ Pass Criteria

- [ ] Chunk 0 processed at t=60s
- [ ] Chunk 1 processed at t=120s
- [ ] Both chunks show translate API calls
- [ ] UI updates twice (at 60s and 120s)
- [ ] Final result includes all text

---

## 🧪 Test 3: Guest User Restrictions

**Goal**: Verify 55-second limit for non-authenticated users.

### Actions

1. **Log out** of the app
2. Navigate to Polish screen
3. Start recording
4. Keep speaking past 55 seconds

### Expected Behavior

- ✅ Recording automatically stops at exactly 55 seconds
- ✅ No chunk processing (recording too short)
- ✅ Standard processing flow for the single 55-second recording

### Expected Logs

```
[ChunkedVoiceRecorder] Guest max duration reached, stopping recording
```

### ✅ Pass Criteria

- [ ] Recording stops at 55s
- [ ] No background chunk processing
- [ ] Audio is processed normally
- [ ] No errors in logs

---

## 🧪 Test 4: Offline Functionality (Authenticated)

**Goal**: Verify recordings saved to pending when offline.

### Actions

1. **Log back in**
2. **Enable Airplane Mode** on device
3. Start recording on Polish screen
4. Record for 30 seconds
5. Stop recording

### Expected Behavior

- ✅ Alert: "Saved for Later"
- ✅ Recording appears in Pending tab
- ✅ No immediate processing

### Expected Logs

```
[PolishScreen] OFFLINE - Queueing recording for later (authenticated user)
```

### ✅ Pass Criteria

- [ ] "Saved for Later" alert shown
- [ ] Recording in Pending tab
- [ ] No API errors in logs

---

## 🧪 Test 5: Offline Functionality (Guest)

**Goal**: Verify guests cannot save offline recordings.

### Actions

1. **Log out**
2. **Keep Airplane Mode enabled**
3. Start recording on Polish screen
4. Record for 20 seconds
5. Stop recording

### Expected Behavior

- ✅ Alert: "No Connection"
- ✅ Recording NOT saved to pending
- ✅ Clear error message

### Expected Logs

```
[PolishScreen] OFFLINE - Guest user, not saving to pending
```

### ✅ Pass Criteria

- [ ] "No Connection" alert shown
- [ ] Recording NOT in Pending tab
- [ ] No crashes or errors

---

## 🧪 Test 6: Continue Mode

**Goal**: Verify new audio appends to existing text.

### Actions

1. **Disable Airplane Mode** (go back online)
2. **Log back in**
3. Navigate to Polish screen
4. Record 20 seconds of speech (e.g., "This is the first part")
5. Wait for processing to complete
6. Tap record button again
7. Choose **"Continue"** from alert
8. Record 20 more seconds (e.g., "This is the second part")
9. Wait for processing

### Expected Behavior

- ✅ Alert shows: Cancel / New / Continue
- ✅ Choosing "Continue" appends new audio
- ✅ New transcription combined with existing text
- ✅ Combined text sent to polish API
- ✅ UI shows both parts in original text

### Expected Logs

```
[PolishScreen] CASE 1: Continue mode - will append new audio to existing text
[PolishScreen] Existing originalText: This is the first part
[PolishScreen] New transcribed text: This is the second part
[PolishScreen] Combined text: This is the first part This is the second part
[PolishScreen] CASE 1 COMPLETE - Updated with appended text
```

### ✅ Pass Criteria

- [ ] Continue prompt appears
- [ ] New audio transcribed
- [ ] Texts combined correctly
- [ ] Combined text polished
- [ ] UI shows full combined result

---

## 📊 Master Checklist

### Background Processing ✅

- [ ] Polish: Chunk at t=60s
- [ ] Polish: Chunk at t=120s (if recording that long)
- [ ] Translate: Chunk at t=60s
- [ ] Translate: Chunk at t=120s (if recording that long)
- [ ] Logs show exact timing
- [ ] UI updates with partial results
- [ ] Recording continues seamlessly

### User Restrictions ✅

- [ ] Authenticated: Unlimited recording
- [ ] Authenticated: Background processing enabled
- [ ] Guest: Max 55 seconds
- [ ] Guest: Auto-stop at limit
- [ ] Guest: No background processing

### Offline Handling ✅

- [ ] Authenticated + Offline: Save to pending
- [ ] Authenticated + Offline: "Saved for Later" alert
- [ ] Guest + Offline: Immediate error
- [ ] Guest + Offline: "No Connection" alert
- [ ] Guest + Offline: Nothing saved

### Continue Mode ✅

- [ ] Prompt appears when existing content
- [ ] "Continue" appends new audio
- [ ] "New" clears existing content
- [ ] "Cancel" stops action
- [ ] Combined text processed correctly

---

## 🎯 Overall Success Criteria

**All tests must pass for verification to be complete.**

### Critical Tests (Must Pass):
- ✅ Test 1: Polish background processing at 60s
- ✅ Test 2: Translate background processing at 60s and 120s

### Important Tests (Should Pass):
- ✅ Test 3: Guest user 55s limit
- ✅ Test 4: Authenticated offline save
- ✅ Test 5: Guest offline error
- ✅ Test 6: Continue mode

---

## 🐛 Troubleshooting

### Problem: No logs at t=60s

**Solutions:**
1. Check imports in PolishScreen.tsx and TranslateScreen.tsx
   - Should be: `import { ChunkedVoiceRecorder } from '../components/ChunkedVoiceRecorder';`
   - NOT: `import { VoiceRecorder } from '../components/VoiceRecorder';`

2. Restart Metro with cache clear:
   ```powershell
   npm start -- --reset-cache
   ```

3. Check component props:
   ```typescript
   <ChunkedVoiceRecorder
     enableChunkedProcessing={true}  // ← Must be true
     // ... other props
   />
   ```

### Problem: Processing happens at wrong times

**Solutions:**
1. Check `useChunkedRecording.ts` line 476-483
2. Verify timer logic: `if (currentDuration % 60 === 0 && currentDuration > 0)`
3. Check logs for timer ticks

### Problem: Very short transcription results

**Cause:** Not speaking continuously or silence in recording

**Solution:** Speak clearly and continuously throughout the test

### Problem: Guest user can record > 55s

**Cause:** Authentication check failing

**Solution:** 
1. Verify `isAuthenticated` prop is passed correctly
2. Check `effectiveMaxDuration` calculation in ChunkedVoiceRecorder.tsx

---

## 📝 Test Report Template

After completing all tests, fill out this report:

```
Background Processing Test Report
Date: __________
Tester: __________

Test 1 (Polish 90s): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Test 2 (Translate 150s): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Test 3 (Guest Limit): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Test 4 (Auth Offline): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Test 5 (Guest Offline): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Test 6 (Continue Mode): [ ] PASS [ ] FAIL
  Notes: _______________________________________________

Overall Result: [ ] ALL PASS [ ] SOME FAILURES
```

---

**Ready to test!** 🚀

Follow each test in order and check off the pass criteria as you go.

