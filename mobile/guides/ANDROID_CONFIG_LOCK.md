# Android Configuration Lock - Production Stable

**Date Locked**: March 3, 2026  
**Purpose**: Stable build for Android 14/15 support  
**Status**: PRODUCTION READY

## Current Configuration Summary

### SDK Versions
- **minSdkVersion**: 24 (Android 7.0 Nougat)
- **targetSdkVersion**: 34 (Android 14)
- **compileSdkVersion**: 35 (Android 15)
- **buildToolsVersion**: 35.0.0
- **ndkVersion**: 26.1.10909125

### Kotlin & Gradle
- **kotlinVersion**: 1.9.25
- **Gradle**: 8.10.2
- **Android Gradle Plugin**: 8.6.0

### App Information
- **applicationId**: com.myvoicepost.app
- **versionCode**: 1
- **versionName**: 1.0.0
- **package**: com.myvoicepost.app

### Supported Architectures
- armeabi-v7a (32-bit ARM)
- arm64-v8a (64-bit ARM)
- x86 (32-bit Intel)
- x86_64 (64-bit Intel)

### Build Configuration
- **hermesEnabled**: true
- **newArchEnabled**: false
- **enableProguardInReleaseBuilds**: false
- **enablePngCrunchInReleaseBuilds**: true
- **expo.useLegacyPackaging**: false

### Expo Modules
- expo-application (6.0.2)
- expo-asset (11.0.5)
- expo-av (15.0.2)
- expo-clipboard (7.0.1)
- expo-constants (17.0.8)
- expo-crypto (14.0.2)
- expo-document-picker (13.0.3)
- expo-file-system (18.0.12)
- expo-font (13.0.4)
- expo-keep-awake (14.0.3)
- expo-linking (7.0.5)
- expo-modules-core (2.2.1)
- expo-notifications (0.29.14)
- expo-secure-store (14.0.1)
- expo-sharing (13.0.1)
- expo-speech (13.0.1)
- expo-splash-screen (0.29.24)

## Critical Files for Configuration

### 1. android/build.gradle
```groovy
buildToolsVersion = '35.0.0'
minSdkVersion = 24
compileSdkVersion = 35
targetSdkVersion = 34
kotlinVersion = '1.9.25'
ndkVersion = "26.1.10909125"
```

### 2. android/gradle.properties
```ini
android.useAndroidX=true
android.enablePngCrunchInReleaseBuilds=true
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
newArchEnabled=false
hermesEnabled=true
expo.gif.enabled=true
expo.webp.enabled=true
expo.webp.animated=false
expo.useLegacyPackaging=false
android.kotlinVersion=1.9.25
```

### 3. app.json
```json
{
  "expo": {
    "name": "MyVoicePost",
    "slug": "myvoicepost",
    "version": "1.0.0",
    "newArchEnabled": false,
    "plugins": [
      "expo-router",
      ["expo-av", { "microphonePermission": "..." }],
      ["expo-splash-screen", { ... }],
      ["expo-build-properties", {
        "android": {
          "kotlinVersion": "1.9.25",
          "suppressKotlinVersionCompatibilityCheck": true
        }
      }],
      "./plugins/withNetworkSecurity"
    ]
  }
}
```

## Build Commands

### Clean Build (Release)
```powershell
cd D:\mvp_improved\android
.\gradlew clean assembleRelease
```

### Build Outputs
APKs will be generated at:
`D:\mvp_improved\android\app\build\outputs\apk\release\`

**Generated Files**:
- app-universal-release.apk (All architectures - ~50-70MB)
- app-arm64-v8a-release.apk (64-bit ARM - Modern devices)
- app-armeabi-v7a-release.apk (32-bit ARM - Older devices)
- app-x86_64-release.apk (64-bit Intel - Emulators)
- app-x86-release.apk (32-bit Intel - Old emulators)

### Recommended APK for Distribution
- **Real Devices**: Use `app-universal-release.apk` for widest compatibility
- **Modern Devices Only**: Use `app-arm64-v8a-release.apk` for smaller size
- **Emulators**: Use `app-x86_64-release.apk`

## Android Version Compatibility

This configuration supports:
- ✅ Android 7.0 - 7.1 (Nougat) - API 24-25
- ✅ Android 8.0 - 8.1 (Oreo) - API 26-27
- ✅ Android 9 (Pie) - API 28
- ✅ Android 10 (Q) - API 29
- ✅ Android 11 (R) - API 30
- ✅ Android 12/12L (S) - API 31-32
- ✅ Android 13 (T) - API 33
- ✅ Android 14 (U) - API 34 (Target)
- ✅ Android 15 (V) - API 35 (Compile)
- ⚠️ Android 16 - NOT TESTED (Future test required)

## Testing Notes

### Verified On
- ✅ Emulator: Android 14/15
- ✅ Real Device: [Add your test device info]

### Known Issues
- None in current configuration

## Restore Instructions

To restore this configuration from Git:
```powershell
git checkout main  # or your stable branch
git pull
cd android
.\gradlew clean
.\gradlew assembleRelease
```

## Next Steps (Android 16 Testing)

See: `ANDROID_16_TEST_CONFIG.md`

---

**DO NOT MODIFY THIS FILE MANUALLY**  
This file represents the locked production configuration.  
Any changes should be tracked through version control.
