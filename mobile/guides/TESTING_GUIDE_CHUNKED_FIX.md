# Quick Testing Guide - Chunked Recording Fix

## 🚀 Quick Test Scenarios

### ✅ Test 1: Polish Without Login - Manual Stop (CRITICAL)
**This was the main issue from the screenshot**

**Steps**:
1. Log out (or use guest mode)
2. Go to Polish screen
3. Tap record button
4. Speak for 5-10 seconds
5. Tap stop button

**Expected Result**:
- ✅ Recording stops
- ✅ Processing indicator appears
- ✅ Transcribed original text appears
- ✅ Polished text appears
- ❌ NO error dialog "Audio file not found"

**Console Logs to Check**:
```
[ChunkedVoiceRecorder] Guest user - starting simple recording (max 55s)
[ChunkedVoiceRecorder] Stopping simple recording...
[ChunkedVoiceRecorder] Recording status: {...}
[ChunkedVoiceRecorder] Recording URI: file://...
[ChunkedVoiceRecorder] File exists, size: XXX
[ChunkedVoiceRecorder] Reading audio file...
[ChunkedVoiceRecorder] Audio file read successfully, length: XXX
[PolishScreen] Fresh recording - starting new
```

---

### ✅ Test 2: Polish Without Login - Auto Stop at 55s

**Steps**:
1. Log out (or use guest mode)
2. Go to Polish screen
3. Tap record button
4. Speak continuously for 55+ seconds

**Expected Result**:
- ✅ Recording auto-stops at 55 seconds
- ✅ Processing indicator appears
- ✅ Transcribed and polished text appears
- ✅ Shows "Max: 55s (Guest)" hint

**Console Logs to Check**:
```
[ChunkedVoiceRecorder] Guest max duration reached, stopping recording
[ChunkedVoiceRecorder] Stopping simple recording...
```

---

### ✅ Test 3: Translate Without Login - 55s Limit

**Steps**:
1. Log out
2. Go to Translate screen
3. Record for 55+ seconds

**Expected Result**:
- ✅ Recording auto-stops at 55 seconds
- ✅ Translation processed and displayed
- ✅ Shows "Max: 55s (Guest)" hint

---

### ✅ Test 4: Polish With Login - Chunked Processing (DO NOT BREAK!)

**Steps**:
1. Log in
2. Go to Polish screen
3. Record for 90 seconds continuously

**Expected Result**:
- ✅ At 60s: Partial results appear (chunk 0 processed)
- ✅ Recording continues without interruption
- ✅ At 90s: Stop, final results with all text combined

**Console Logs to Check**:
```
[ChunkedVoiceRecorder] Authenticated user - starting chunked recording
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: polish
[PolishScreen] 📊 Partial result received
```

---

### ✅ Test 5: Translate With Login - Chunked Processing

**Steps**:
1. Log in
2. Go to Translate screen
3. Record for 90 seconds continuously

**Expected Result**:
- ✅ At 60s: Partial results appear (chunk 0 processed)
- ✅ Recording continues without interruption
- ✅ At 90s: Stop, final translation with all text combined

**Console Logs to Check**:
```
[ChunkedVoiceRecorder] Authenticated user - starting chunked recording
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] Type: translate
[TranslateScreen] 📊 Partial result received
```

---

### ✅ Test 6: Guest Offline - No Pending Save

**Steps**:
1. Log out
2. Turn on Airplane Mode (disable network)
3. Go to Polish screen
4. Record and stop

**Expected Result**:
- ✅ Alert shows: "No Connection - Unable to process your recording..."
- ✅ No pending item created
- ✅ Can try again when online

**Console Logs to Check**:
```
[PolishScreen] OFFLINE - Guest user, not saving to pending
```

---

### ✅ Test 7: Authenticated Offline - Save to Pending

**Steps**:
1. Log in
2. Turn on Airplane Mode
3. Go to Polish screen
4. Record and stop

**Expected Result**:
- ✅ Alert shows: "Saved for Later - Your recording has been saved..."
- ✅ Pending item created
- ✅ Can process in Pending tab when online

**Console Logs to Check**:
```
[PolishScreen] OFFLINE - Queueing recording for later (authenticated user)
```

---

## 🔍 Key Things to Verify

### Guest Users (Not Logged In)
- ✅ Max 55 seconds recording
- ✅ NO chunked processing
- ✅ NO "Audio file not found" errors
- ✅ Offline recordings show error (not saved)

### Authenticated Users (Logged In)
- ✅ Up to 10 minutes recording
- ✅ Chunked processing every 60 seconds
- ✅ Partial results appear during recording
- ✅ Offline recordings saved to Pending queue

---

## 🐛 If You See These Errors

### Error: "Failed to save or process audio: Audio file not found"
**Cause**: The recording URI is invalid or file doesn't exist
**Fix Applied**: Now checks file existence before processing and shows user-friendly message

### Error: Recording stops but nothing happens
**Cause**: `onRecordingComplete` not being called
**Fix Applied**: Now properly gets URI even if recording already stopped

### Error: "switchToChunkedMode is not defined"
**Cause**: Old logic tried to switch modes mid-recording
**Fix Applied**: Removed switch logic - mode determined at start

---

## 📝 Testing Checklist

- [ ] Test 1: Polish guest manual stop - **NO ERRORS**
- [ ] Test 2: Polish guest auto stop at 55s
- [ ] Test 3: Translate guest 55s limit
- [ ] Test 4: Polish authenticated chunked (verify still works)
- [ ] Test 5: Translate authenticated chunked (new feature)
- [ ] Test 6: Guest offline behavior
- [ ] Test 7: Authenticated offline behavior

---

## 🎯 Most Important Test

**The screenshot error fix**: 
- Polish screen
- Guest user (not logged in)
- Record short audio and stop
- Should process successfully with NO "Audio file not found" error

This was the main issue reported!
