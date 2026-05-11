# Quick Fix Reference - Real Device Installation

## Problem
App crashes during installation on real devices but works fine on emulator.

## Solution (3 Steps)

### 1️⃣ Install Dependencies
```powershell
cd D:\mvp_improved
npm install
```

### 2️⃣ Build APK
```powershell
.\build-android.ps1
```

### 3️⃣ Install & Test
```powershell
# Auto install (recommended)
.\build-android.ps1
# Select "Y" when prompted

# Or manual install
adb install android\app\build\outputs\apk\release\app-universal-release.apk
```

---

## What Was Fixed?

| Issue | Fix |
|-------|-----|
| 🔴 largeHeap=true crashes | ✅ Changed to false |
| 🔴 Missing dependencies | ✅ Added expo-application, expo-keep-awake |
| 🔴 ProGuard stripping classes | ✅ Added comprehensive rules |
| 🔴 META-INF conflicts | ✅ Excluded duplicate files |
| 🔴 Native libs not extracted | ✅ Enabled extractNativeLibs |
| 🔴 No code optimization | ✅ Enabled R8 full mode |

---

## Testing Commands

```powershell
# Device info
.\test-device.ps1 -Action info

# View logs
.\test-device.ps1 -Action logs

# Check crashes
.\test-device.ps1 -Action crash

# Restart app
.\test-device.ps1 -Action restart
```

---

## Troubleshooting

### "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
```powershell
adb uninstall com.myvoicepost.app
adb install android\app\build\outputs\apk\release\app-universal-release.apk
```

### "INSTALL_FAILED_INSUFFICIENT_STORAGE"
Use architecture-specific APK (smaller):
```powershell
adb install android\app\build\outputs\apk\release\app-arm64-v8a-release.apk
```

### App crashes on startup
```powershell
.\test-device.ps1 -Action crash
```

---

## Files Modified

✅ `android/app/build.gradle` - Build config  
✅ `android/app/src/main/AndroidManifest.xml` - App settings  
✅ `android/app/proguard-rules.pro` - Code protection  
✅ `android/gradle.properties` - Build properties  
✅ `package.json` - Dependencies  

---

## Success Checklist

After installation:

- [ ] App installs without error
- [ ] App launches (no blank screen)
- [ ] Login works
- [ ] Recording works
- [ ] Playback works
- [ ] No crashes when minimized

---

## Need Help?

View detailed docs:
- `INSTALLATION_FIX_SUMMARY.md` - Complete fix details
- `REAL_DEVICE_INSTALLATION_FIX.md` - Technical guide

**All fixes applied! Just run the 3 steps above.** 🚀
