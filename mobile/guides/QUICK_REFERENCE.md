# Quick Reference Guide - Audio Recording Behavior

## 🎯 Expected Behavior Summary

### Guest Users (NOT logged in)
```
✅ Max Duration: 55 seconds (auto-stops)
✅ Recording Type: Simple (no chunks)
✅ Processing: After stop only
✅ Offline: Shows error, NO pending save
✅ Continue Mode: NOT available
```

### Authenticated Users (Logged in)
```
✅ Max Duration: 10 minutes
✅ Recording Type: Chunked (every 60s)
✅ Processing: Background (while recording)
✅ Offline: Saves to pending queue
✅ Continue Mode: Available
```

---

## 🔍 Quick Test Checklist

### Test #1: Guest User Offline (MOST IMPORTANT)
```
1. DON'T log in
2. Turn OFF internet
3. Record 30 seconds
4. Stop

Expected:
✅ Alert: "No Connection"
✅ NOT in pending list
✅ No error thrown
```

### Test #2: Guest User Auto-Stop
```
1. DON'T log in
2. Record continuously
3. Wait...

Expected:
✅ Auto-stops at 55 seconds
```

### Test #3: Authenticated User Chunks
```
1. Log in
2. Record 90 seconds

Expected:
✅ Results appear at 60 seconds (partial)
✅ Recording continues
✅ Final results at 90 seconds
```

### Test #4: Continue Mode
```
1. Log in
2. Record 30s → get results
3. Record again → select "Continue"
4. Record 20s

Expected:
✅ Alert with 3 options
✅ Both texts combined
✅ Re-polished combined text
```

---

## 📋 Implementation Files

```
src/hooks/useChunkedRecording.ts       → Chunk logic + 60s timer
src/components/ChunkedVoiceRecorder.tsx → Guest vs Auth routing
src/screens/PolishScreen.tsx           → Polish + offline handling
src/screens/TranslateScreen.tsx        → Translate + offline handling
```

---

## 🚨 What to Check If Issues Occur

### Issue: Guest user recording saved to pending when offline
**Check**: `PolishScreen.tsx` line 155 or `TranslateScreen.tsx` line 123
**Should see**: `if (isAuthenticated)` check BEFORE `pendingProcessor.addAudioItem()`

### Issue: Authenticated user not getting chunked processing
**Check**: `ChunkedVoiceRecorder.tsx` line 310
**Should see**: `if (effectiveEnableChunkedProcessing)` → `startChunkedRecording()`

### Issue: No 60-second processing
**Check**: `useChunkedRecording.ts` line 476-486
**Should see**: `setInterval()` with `currentDuration % CHUNK_DURATION_SEC === 0` check

### Issue: Continue mode not appending text
**Check**: `PolishScreen.tsx` line 173 or `TranslateScreen.tsx` line 141
**Should see**: `if (appendMode === 'continue' && originalText.trim())`

---

## ✅ Status: COMPLETE

All features implemented correctly.
No code changes needed.
Ready for testing and production.

**Last Updated**: February 5, 2026
