# Visual Flow Diagram - Chunked Recording

## Before vs After Fix

---

## 🔴 BEFORE FIX - Translate Chunked Processing (BROKEN)

```
┌─────────────────────────────────────────────────────────────┐
│  User Starts Recording (Authenticated, Translate)          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  [0-60s] Recording...                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  At 60s: Extract Chunk 0                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Background: Transcribe Chunk 0                             │
│  → "Hello world"                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Background: translateApi.translateText()                   │
│  Returns: {                                                 │
│    translatedText: "Hola mundo",  ← RAW                     │
│    polishedText: "Hola, mundo."   ← POLISHED               │
│  }                                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ❌ BUG: Hook returns result.translatedText                 │
│  → resultText = "Hola mundo" (RAW, unpolished)              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ❌ BUG: Screen sets setTranslatedText(resultText)          │
│  → translatedText = "Hola mundo"                            │
│  → polishedText = "" (EMPTY!)                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ❌ RESULT: Display shows empty or wrong text               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🟢 AFTER FIX - Translate Chunked Processing (WORKING)

```
┌─────────────────────────────────────────────────────────────┐
│  User Starts Recording (Authenticated, Translate)          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  [0-60s] Recording...                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  At 60s: Extract Chunk 0                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Background: Transcribe Chunk 0                             │
│  → "Hello world"                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Background: translateApi.translateText()                   │
│  Returns: {                                                 │
│    translatedText: "Hola mundo",  ← RAW                     │
│    polishedText: "Hola, mundo."   ← POLISHED               │
│  }                                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ✅ FIX: Hook returns result.polishedText                   │
│  → resultText = "Hola, mundo." (POLISHED!)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ✅ FIX: Screen sets both text fields                       │
│  → setPolishedText(resultText) → "Hola, mundo."             │
│  → setTranslatedText(resultText) → "Hola, mundo."           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  ✅ RESULT: Display shows polished translation correctly!   │
└─────────────────────────────────────────────────────────────┘
```

---

## Guest vs Authenticated Comparison

### Guest User (Simple Recording)

```
┌──────────────────────────┐
│   Start Recording        │
│   (Guest Mode)           │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  [0-55s] Recording...    │
│  Display: "Max: 55s"     │
└──────────┬───────────────┘
           │
           ↓ (at 55s or manual stop)
┌──────────────────────────┐
│  Stop Recording          │
│  Get complete audio      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Process Entire Audio    │
│  - Transcribe            │
│  - Polish/Translate      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Display Results         │
│  ✅ All at once          │
└──────────────────────────┘
```

### Authenticated User (Chunked Recording)

```
┌──────────────────────────┐
│   Start Recording        │
│   (Authenticated)        │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  [0-60s] Recording...    │
│  Display: "Max: 10min"   │
└──────────┬───────────────┘
           │
           ↓ (at 60s mark)
┌──────────────────────────┐
│  Extract Chunk 0         │
│  Continue Recording      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Process Chunk 0         │
│  - Transcribe            │
│  - Polish/Translate      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Display Partial Results │
│  📊 User sees progress!  │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  [60-120s] Recording...  │
│  (continues seamlessly)  │
└──────────┬───────────────┘
           │
           ↓ (at 120s mark)
┌──────────────────────────┐
│  Extract Chunk 1         │
│  Continue Recording      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Process Chunk 1         │
│  Append to Chunk 0       │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Display Updated Results │
│  📊 More text appears!   │
└──────────┬───────────────┘
           │
           ↓ (user stops)
┌──────────────────────────┐
│  Process Final Segment   │
│  Combine all chunks      │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────────┐
│  Display Complete Result │
│  ✅ Full text ready!     │
└──────────────────────────┘
```

---

## Polish vs Translate Data Flow

### Polish (Already Working)

```
Audio → Transcribe → originalText
                           ↓
                     polishApi.polishText()
                           ↓
                     polishedText ← Display this
```

### Translate (Now Fixed)

```
Audio → Transcribe → originalText
                           ↓
                  translateApi.translateText()
                           ↓
                    ┌──────┴──────┐
                    ↓             ↓
              translatedText  polishedText
              (raw)           (polished)
                                  ↓
                          Display this ✅
```

---

## Error Handling Flow

### Guest Offline

```
Record → Stop → Check Online? 
                      ↓ NO
              ┌───────┴────────┐
              │ Guest User?    │
              │ YES ↓          │
              └────────────────┘
                      ↓
              Show Error Alert
              "No Connection..."
              ↓
              ❌ NOT saved to pending
```

### Authenticated Offline

```
Record → Stop → Check Online?
                      ↓ NO
              ┌───────┴────────┐
              │ Authenticated? │
              │ YES ↓          │
              └────────────────┘
                      ↓
              Save to Pending Queue
              ↓
              Show Alert
              "Saved for Later..."
              ↓
              ✅ Can process when online
```

---

## Key Differences Summary

| Feature | Guest | Authenticated |
|---------|-------|---------------|
| Max Duration | 55 seconds | 10 minutes |
| Processing | Simple (all at once) | Chunked (every 60s) |
| Partial Results | No | Yes ✅ |
| Offline Save | No ❌ | Yes ✅ |
| Continue Mode | No | Yes ✅ |

---

## The Fix in Simple Terms

**Problem**: When translating with chunked recording, the app was showing the raw translation instead of the polished translation.

**Solution**: Changed 4 lines of code to use `polishedText` instead of `translatedText` as the result.

**Impact**: Now translate chunked mode works exactly like polish chunked mode - seamless, with beautiful polished results!

---

**Visual Guide Complete** ✅
