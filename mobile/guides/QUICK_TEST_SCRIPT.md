# Quick Test Script - Background Processing

## 🚀 Restart and Test (< 5 minutes)

### Step 1: Restart Metro Bundler
```bash
# Stop current Metro (Ctrl+C)
# Clear cache and restart
npm start -- --reset-cache
```

Wait for: `✓ Metro bundler is ready`

---

### Step 2: Test Background Processing (90 seconds)

1. **Open app** → Go to **Polish** screen

2. **Press record button** 

3. **Speak continuously** for 90 seconds (any topic - doesn't matter what)
   - Example: Count numbers, describe your day, read a book, etc.
   - **Important**: Keep talking! Silence = no text

4. **Watch Metro logs** for these EXACT markers:

**At t=60s you MUST see:**
```
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] ✅ Polish completed
```

**At t=~63s:**
- UI should update with partial results
- You should see transcribed text appear
- Polished text should appear

5. **Stop recording** at 90 seconds

6. **Final result** should show:
   - Transcribed text from all 3 chunks (0-60s, 60-90s, final 30s)
   - Polished version of combined text

---

### Step 3: Quick Offline Test (Authenticated User)

1. **Make sure you're logged in**

2. **Turn OFF WiFi** (or enable Airplane mode)

3. **Record 10 seconds** of audio

4. **Stop recording**

5. **Check for alert**: "Saved for Later"

6. **Go to Pending tab**: Recording should be listed

7. **Turn ON WiFi**: Can process from Pending tab

---

### Step 4: Quick Offline Test (Guest User)

1. **Logout** (or use as guest)

2. **Turn OFF WiFi**

3. **Record 10 seconds** of audio

4. **Stop recording**

5. **Check for alert**: "No Connection"

6. **Go to Pending tab**: Nothing should be saved

---

## ✅ Success Criteria

### Test 2 (Background Processing):
- ✅ Logs appear at EXACTLY t=60s
- ✅ UI updates with partial results
- ✅ Final result combines all chunks
- ❌ If no logs at 60s → Check imports in PolishScreen.tsx

### Test 3 (Offline - Authenticated):
- ✅ Alert shows "Saved for Later"
- ✅ Recording appears in Pending tab
- ❌ If error shown → Check login status

### Test 4 (Offline - Guest):
- ✅ Alert shows "No Connection"  
- ✅ Nothing saved to Pending tab
- ❌ If saved to pending → Check authentication logic

---

## 🐛 If Test Fails

### No background processing logs:
```bash
# 1. Check imports
grep "ChunkedVoiceRecorder" src/screens/PolishScreen.tsx
# Should show: import { ChunkedVoiceRecorder }

# 2. Clear cache harder
rm -rf node_modules/.cache
npm start -- --reset-cache

# 3. Restart phone/emulator
```

### Guest user offline recording saves:
```bash
# Check authentication
# Look for: [PolishScreen] OFFLINE - Guest user
# Should NOT save to pending
```

### Very short transcription:
```
# This is usually because:
- Not speaking continuously
- Audio quality issues
- Background noise
- Speaking too quietly

# Solution: Speak clearly and continuously
```

---

## 📊 Expected Results

### 90-second recording (speaking continuously):
- **Chunk 0 (0-60s)**: ~150-200 words transcribed
- **Chunk 1 (60-90s)**: ~75-100 words transcribed
- **Final result**: ~225-300 words combined

### 90-second recording (silence):
- **Chunk 0**: Empty or very short
- **Chunk 1**: Empty or very short
- **Final result**: Almost nothing

**Note**: Transcription quality depends on clear, continuous speech!

---

## 📸 What to Share

If it works:
✅ Screenshot of final results  
✅ Copy of logs showing 60s processing  
✅ Confirmation that offline works correctly

If it doesn't work:
❌ Full Metro logs from 0-90s  
❌ Screenshot of imports in PolishScreen.tsx  
❌ What error/issue you're seeing

---

## 🎯 Bottom Line

**If you see these logs at t=60s, it's working:**
```
[ChunkedRecording] 60-second mark reached at 60s
[ChunkedRecording] 🎙️ EXTRACTING CHUNK 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[ChunkedRecording] ✅ Polish completed
```

**If you DON'T see these logs, something is wrong.**

Check:
1. Are you using ChunkedVoiceRecorder? (not VoiceRecorder)
2. Did you clear Metro cache?
3. Did you restart the app?

---

## ⏱️ Time Required

- Step 1 (Restart): 2 minutes
- Step 2 (90s test): 2 minutes
- Step 3 (Offline auth): 1 minute
- Step 4 (Offline guest): 1 minute

**Total: ~6 minutes** to fully verify all functionality

---

## 🎬 After Testing

Once confirmed working:
1. Test Translate screen (same as Polish)
2. Test Continue mode (record → Continue → record again)
3. Test guest 55s limit (should auto-stop)
4. Test multiple chunks (record 3+ minutes)

---

Good luck! The fix is in place, just need to verify it works! 🚀
