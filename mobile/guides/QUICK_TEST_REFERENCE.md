# 🚀 Quick Testing Reference Card

## Status: Ready to Test ✅

---

## 🎯 Priority Test (The Screenshot Issue)

**Test**: Polish Without Login - Manual Stop  
**Steps**:
1. Log out (or use guest mode)
2. Open Polish screen
3. Tap record
4. Speak for 5-10 seconds
5. Tap stop

**Expected**: ✅ Recording processes successfully, shows transcribed and polished text  
**Expected**: ❌ NO error dialog "Audio file not found"

---

## 📝 Quick Test Matrix

| Scenario | Guest (Not Logged In) | Authenticated (Logged In) |
|----------|----------------------|---------------------------|
| **Polish - Short Audio** | ✅ Process immediately (max 55s) | ✅ Process immediately |
| **Polish - Long Audio (90s)** | 🚫 Auto-stops at 55s | ✅ Chunks at 60s + 90s |
| **Translate - Short Audio** | ✅ Process immediately (max 55s) | ✅ Process immediately |
| **Translate - Long Audio (90s)** | 🚫 Auto-stops at 55s | ✅ Chunks at 60s + 90s |
| **Offline Polish** | ❌ Error shown, not saved | ✅ Saved to Pending |
| **Offline Translate** | ❌ Error shown, not saved | ✅ Saved to Pending |

---

## 🔍 What to Look For

### ✅ Good Signs
- "Max: 55s (Guest)" appears for non-logged users
- "Max: 10min (chunked)" for logged users
- At 60 seconds: "📊 Partial result received" in console
- Text appears during recording (chunked mode)
- Clean transitions, no errors

### ❌ Red Flags
- "Audio file not found" error
- Recording doesn't stop at 55s for guests
- No partial results for authenticated users
- Crashes or freezes
- Offline saves for guests

---

## 📱 Test Scenarios

### Scenario 1: Guest Polish (Manual Stop)
```
1. Logout
2. Polish screen
3. Record 10s → Stop
4. ✅ Should process successfully
```

### Scenario 2: Guest Polish (Auto Stop)
```
1. Logout
2. Polish screen
3. Record 60s (will auto-stop at 55s)
4. ✅ Should process successfully
```

### Scenario 3: Authenticated Polish (Chunked)
```
1. Login
2. Polish screen
3. Record continuously for 90s
4. ✅ At 60s: See partial results
5. ✅ At 90s: Stop, see complete results
```

### Scenario 4: Guest Translate (Manual Stop)
```
1. Logout
2. Translate screen
3. Record 10s → Stop
4. ✅ Should translate successfully
```

### Scenario 5: Authenticated Translate (Chunked)
```
1. Login
2. Translate screen
3. Record continuously for 90s
4. ✅ At 60s: See partial translation
5. ✅ At 90s: Stop, see complete translation
```

### Scenario 6: Guest Offline (Should NOT save)
```
1. Logout
2. Turn on Airplane Mode
3. Polish or Translate screen
4. Record → Stop
5. ✅ Error: "No Connection... check internet"
6. ✅ NOT saved to Pending
```

### Scenario 7: Authenticated Offline (Should save)
```
1. Login
2. Turn on Airplane Mode
3. Polish or Translate screen
4. Record → Stop
5. ✅ Alert: "Saved for Later"
6. ✅ Check Pending tab - item saved
```

---

## 🐛 If Something Goes Wrong

### Error: "Audio file not found"
- **Should not happen anymore**
- Check console logs for:
  - File existence check
  - Recording URI
  - File size

### Error: Recording doesn't stop at 55s for guests
- Check "Max: 55s (Guest)" appears
- Check console: "Guest max duration reached"

### Error: No chunked processing for authenticated users
- Verify user is logged in
- Check console: "Authenticated user - starting chunked recording"
- Check console at 60s: "60-second mark reached"

### Error: Partial results not showing
- Check console: "📊 Partial result received"
- Check console: "Updating UI with partial results"
- Verify text state updates

---

## 📊 Console Logs Cheat Sheet

### Guest Mode (Simple Recording):
```
[ChunkedVoiceRecorder] Guest user - starting simple recording (max 55s)
[ChunkedVoiceRecorder] Stopping simple recording...
[ChunkedVoiceRecorder] Recording URI: file://...
[ChunkedVoiceRecorder] File exists, size: XXX
```

### Authenticated Mode (Chunked):
```
[ChunkedVoiceRecorder] Authenticated user - starting chunked recording
[ChunkedRecording] 60-second mark reached at 60s, extracting chunk 0
[ChunkedRecording] ✅ CHUNK 0 TRANSCRIBED
[ChunkedRecording] 🔄 BACKGROUND PROCESSING STARTED
[TranslateScreen] 📊 Partial result received (chunked processing)
```

### Offline Guest:
```
[PolishScreen] OFFLINE - Guest user, not saving to pending
```

### Offline Authenticated:
```
[PolishScreen] OFFLINE - Queueing recording for later (authenticated user)
```

---

## ✅ Success Criteria

All of these should work:
- ✅ Guest polish: 55s limit, no errors
- ✅ Guest translate: 55s limit, no errors
- ✅ Auth polish: Chunked processing every 60s
- ✅ Auth translate: Chunked processing every 60s
- ✅ Guest offline: Error shown, not saved
- ✅ Auth offline: Saved to pending

---

## 📞 Need Help?

Check these files for details:
- `guides/FIX_SUMMARY_CHUNKED_RECORDING.md` - Complete fix documentation
- `guides/TESTING_GUIDE_CHUNKED_FIX.md` - Detailed testing guide

---

**Last Updated**: February 5, 2026  
**Status**: All fixes applied ✅
