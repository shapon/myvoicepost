# MyVoicePost Mobile - JWT Auth + Continuous Recording

This version combines two critical features:

## ✅ Features Included

### 1. JWT Authentication (Fixed)
- **Problem Solved**: Login authentication now works correctly
- **Changes**: Mobile app updated from cookie-based to JWT token authentication
- **Impact**: Users can now log in and access authenticated features

### 2. Continuous Voice Recording
- **Feature**: Extended recording capability with automatic audio chunking
- **Benefits**: 
  - Record for longer periods without hitting size limits
  - Automatic chunk processing
  - Progress indicator during processing
  - Clean error handling

## 📱 App Structure

### Navigation Tabs
1. **Polish** (index) - Standard voice recording with tap-to-record
2. **Continuous** (NEW!) - Extended recording with automatic chunking
3. **Translate** - Translation features
4. **Saved** - View saved items
5. **Profile** - User profile and settings

## 🔐 Authentication Flow

### How JWT Auth Works
```
Login → Server returns { token, user }
        ↓
Mobile app stores token in secure storage
        ↓
All API requests include: Authorization: Bearer <token>
        ↓
Server validates token and processes request
```

### Token Storage
- **Android**: EncryptedSharedPreferences
- **iOS**: Keychain Services
- **Managed by**: TokenManager service

## 🎙️ Recording Modes

### Standard Recording (Polish Tab)
- Tap to record, tap to stop
- Best for: Short recordings (< 1 minute)
- Processing: Immediate on stop
- Use case: Quick voice notes, short messages

### Continuous Recording (Continuous Tab)
- Hold to record continuously
- Automatic audio chunking every 30 seconds
- Best for: Long recordings (1+ minutes)
- Processing: Batch processing after stop
- Use case: Meetings, lectures, long-form content

## 🏗️ Key Components

### ContinuousVoiceRecorder
Location: `src/components/ContinuousVoiceRecorder.tsx`

Features:
- Auto-chunking every 30 seconds
- Visual recording indicator
- Duration counter
- Automatic cleanup of processed chunks

### VoiceRecorder
Location: `src/components/VoiceRecorder.tsx`

Features:
- Simple tap-to-record
- Immediate processing
- Clean UI

## 🚀 Installation

### Prerequisites
```bash
# Required tools
node >= 18
npm >= 9
Android Studio (for Android)
Xcode (for iOS)
```

### Setup Steps
```bash
# 1. Extract the package
unzip myvoicepost_mobile_jwt_continuous.zip
cd mobile_check/myvoicepost_mobile_improved

# 2. Install dependencies
npm install

# 3. Clean install (recommended)
adb uninstall com.myvoicepost.app

# 4. Run on Android
npm run android

# 5. Or run on iOS
npm run ios
```

## 🔧 Configuration

### API Endpoint
Edit `src/lib/constants.ts`:
```typescript
export const API_BASE_URL = 'http://your-server:3000';
```

### Recording Settings
Edit `src/components/ContinuousVoiceRecorder.tsx`:
```typescript
const CHUNK_DURATION = 30000; // 30 seconds (adjustable)
```

## 📝 Testing Checklist

### Authentication Tests
- [ ] Login with valid credentials
- [ ] Token persists after app restart
- [ ] Logout clears token
- [ ] API requests include Authorization header
- [ ] 401 errors handled properly

### Standard Recording Tests
- [ ] Tap to record
- [ ] Recording indicator shows
- [ ] Stop recording processes audio
- [ ] Results display correctly
- [ ] Save functionality works

### Continuous Recording Tests
- [ ] Hold to start continuous recording
- [ ] Auto-chunking at 30-second intervals
- [ ] Duration counter increments
- [ ] Release to stop and process
- [ ] Multiple chunks process sequentially
- [ ] Progress indicator shows during processing
- [ ] Final result combines all chunks

## 🐛 Troubleshooting

### Authentication Issues

**Problem**: Login fails with 401
```bash
# Solution: Clear app data and reinstall
adb shell pm clear com.myvoicepost.app
adb uninstall com.myvoicepost.app
npm run android
```

**Problem**: Token not persisting
```bash
# Check logs for TokenManager
adb logcat | grep "TokenManager"

# Look for:
# [TokenManager] Token stored successfully
# [TokenManager] Token retrieved: eyJ...
```

### Recording Issues

**Problem**: Audio chunks not processing
```bash
# Check logs
adb logcat | grep "PolishContinuous"

# Look for chunk processing logs:
# [PolishContinuous] Processing chunk 1/5
# [PolishContinuous] Chunk 1 processed successfully
```

**Problem**: Out of memory on long recordings
```
Solution: This shouldn't happen due to chunking, 
but if it does, reduce CHUNK_DURATION in 
ContinuousVoiceRecorder.tsx
```

## 📊 Logging

All major operations are logged with prefixes:

- `[TokenManager]` - Authentication/token operations
- `[API Request]` - HTTP request details
- `[Polish]` - Standard recording operations
- `[PolishContinuous]` - Continuous recording operations
- `[AuthContext]` - Auth state changes

### View logs
```bash
# All logs
adb logcat

# Filtered logs
adb logcat | grep -E "(TokenManager|API|Polish|Auth)"
```

## 🔄 Update Process

### Updating from Previous Version

If updating from the JWT-only fix:
```bash
# The continuous recording feature is already integrated
# Just install this package as normal
```

If updating from continuous recording only:
```bash
# Authentication is fixed in this version
# Clean install recommended:
adb uninstall com.myvoicepost.app
npm run android
```

## 📦 Modified Files

### Authentication (JWT Fix)
- `src/lib/api.ts` - JWT token injection, removed cookies
- `src/contexts/AuthContext.tsx` - Token storage/retrieval

### Continuous Recording
- `src/components/ContinuousVoiceRecorder.tsx` - NEW component
- `app/(tabs)/polish-continuous.tsx` - NEW screen
- `app/(tabs)/_layout.tsx` - Added new tab

## 🎯 Key Improvements

1. **Authentication Fixed**: Login now works correctly with JWT tokens
2. **Extended Recording**: Can now record for extended periods
3. **Better UX**: Progress indicators during processing
4. **Error Handling**: Improved error messages and recovery
5. **Clean Architecture**: Separated concerns (standard vs continuous recording)

## 🔐 Security Notes

- Tokens stored in secure storage (Keychain/EncryptedSharedPreferences)
- Tokens cleared on logout
- Automatic token refresh on 401 errors
- No sensitive data in logs (tokens are redacted)

## 📱 Minimum Requirements

- Android: API 24+ (Android 7.0+)
- iOS: iOS 13+
- Node: 18+
- React Native: 0.72+

## 🤝 Support

For issues or questions:
1. Check logs: `adb logcat | grep -E "(TokenManager|API|Polish|Auth)"`
2. Try clean install: `adb shell pm clear com.myvoicepost.app`
3. Review this documentation
4. Check server logs for API errors

## 📈 Performance

### Standard Recording
- Processing time: ~2-5 seconds per recording
- Memory usage: Low (single audio file)
- Best for: Quick interactions

### Continuous Recording
- Processing time: ~2-5 seconds per chunk
- Memory usage: Low (chunks processed sequentially)
- Total processing time: ~2-5s × number of chunks
- Best for: Long-form content

## 🎉 Success Indicators

You'll know everything is working when you see:

1. ✅ Login succeeds and shows profile
2. ✅ Standard recording (Polish tab) processes immediately
3. ✅ Continuous recording (Continuous tab) shows chunk progress
4. ✅ Results save successfully
5. ✅ App reopens with user still logged in
6. ✅ No 401 errors in logs

## 📝 Version History

- **v1.0.0** - Initial JWT authentication fix
- **v1.1.0** - Added continuous recording feature
- **v1.2.0** - Combined both features (this version)
