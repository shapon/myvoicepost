# Quick Setup Guide

## 🚀 Get Started in 5 Minutes

### 1. Extract & Navigate
```bash
unzip myvoicepost_mobile_jwt_continuous.zip
cd mobile_check/myvoicepost_mobile_improved
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure API (if needed)
Edit `src/lib/constants.ts` if your server is not at `http://10.0.2.2:3000`:
```typescript
export const API_BASE_URL = 'http://YOUR_SERVER_IP:PORT';
```

### 4. Clean Install (Recommended)
```bash
# Remove old version
adb uninstall com.myvoicepost.app

# Install new version
npm run android
```

### 5. Test Login
- Open app
- Enter credentials
- Should see "Logged in successfully"
- Check logs: `adb logcat | grep "TokenManager"`
- Look for: `[TokenManager] Token stored successfully`

## ✅ Verification

### Test Standard Recording
1. Tap "Polish" tab
2. Tap microphone button
3. Speak for 5-10 seconds
4. Tap to stop
5. Should see transcription + polished text

### Test Continuous Recording
1. Tap "Continuous" tab
2. Hold microphone button
3. Speak for 1+ minute
4. Release to stop
5. Should see "Processing chunks... X/Y"
6. Wait for processing to complete
7. Should see combined result

## 🔥 Troubleshooting

### Login Fails
```bash
# Clear app data
adb shell pm clear com.myvoicepost.app

# Check server is running
curl http://YOUR_SERVER_IP:PORT/health
```

### Recording Doesn't Work
```bash
# Check permissions
adb logcat | grep "Permission"

# Grant microphone permission in Settings
```

### No Results After Recording
```bash
# Check API logs
adb logcat | grep "API"

# Verify server endpoint
curl http://YOUR_SERVER_IP:PORT/polish
```

## 📋 Quick Reference

### Important Logs
```bash
# Authentication
adb logcat | grep "TokenManager"

# API Requests
adb logcat | grep "API Request"

# Recording (Standard)
adb logcat | grep "\[Polish\]"

# Recording (Continuous)
adb logcat | grep "PolishContinuous"
```

### Key Features
- **Polish Tab**: Tap-to-record, immediate processing
- **Continuous Tab**: Hold-to-record, auto-chunking, batch processing
- **Saved Tab**: View all saved items
- **Profile Tab**: User settings and logout

### Common Commands
```bash
# View logs
adb logcat

# Clear app data
adb shell pm clear com.myvoicepost.app

# Uninstall app
adb uninstall com.myvoicepost.app

# Install app
npm run android

# Rebuild
npm run android --reset-cache
```

## 🎯 Success Checklist
- [ ] App installs without errors
- [ ] Login works and shows profile
- [ ] Polish tab records and processes audio
- [ ] Continuous tab handles long recordings
- [ ] Save functionality works
- [ ] App remembers login after restart
- [ ] No 401 errors in logs

## 💡 Pro Tips

1. **First time?** Always do a clean install
2. **Login issues?** Clear app data first
3. **Recording long content?** Use Continuous tab
4. **Quick notes?** Use Polish tab
5. **Server down?** Check server logs
6. **Weird behavior?** Check app logs with `adb logcat`

## 🚨 Emergency Reset
```bash
# Nuclear option - completely reset everything
adb uninstall com.myvoicepost.app
rm -rf node_modules
rm -rf android/build
rm -rf android/app/build
npm install
npm run android
```

That's it! You should be up and running. 🎉
