# Build Commands Guide - MyVoicePost Mobile

## 📱 Development Commands

### Start Development Server
```bash
# Start Expo development server
npm start

# Start with cache cleared
npm start -- --clear

# Start on specific port
npm start -- --port 8081

# Start in tunnel mode (for remote testing)
npm start -- --tunnel
```

### Run on Devices/Emulators
```bash
# Run on Android device/emulator
npm run android

# Run on iOS simulator (macOS only)
npm run ios

# Run on web browser
npm run web
```

---

## 🔨 Build Commands

### Development Builds

#### Android Development Build
```bash
# Build APK for development
npx expo build:android -t apk

# Build with specific profile
npx expo build:android -t apk --profile development
```

#### iOS Development Build (macOS only)
```bash
# Build for iOS simulator
npx expo build:ios -t simulator

# Build for iOS device
npx expo build:ios -t archive
```

---

## 🚀 Production Builds

### Using EAS Build (Recommended)

#### 1. Install EAS CLI
```bash
npm install -g eas-cli
```

#### 2. Login to Expo
```bash
eas login
```

#### 3. Configure EAS Build
```bash
# Initialize EAS configuration
eas build:configure
```

This creates `eas.json`:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

#### 4. Build for Android Production
```bash
# Build APK (for direct distribution)
eas build --platform android --profile production

# Build AAB (for Google Play Store)
eas build --platform android --profile production
```

#### 5. Build for iOS Production (macOS only)
```bash
# Build for App Store
eas build --platform ios --profile production

# Build for TestFlight
eas build --platform ios --profile preview
```

#### 6. Build for Both Platforms
```bash
# Build for both Android and iOS
eas build --platform all --profile production
```

---

### Using Expo Build (Classic)

#### Android Production Build

##### APK (for direct distribution)
```bash
# Build APK
expo build:android -t apk

# Build with release keystore
expo build:android -t apk --release-channel production
```

##### AAB (for Google Play Store)
```bash
# Build Android App Bundle
expo build:android -t app-bundle

# Build AAB for production
expo build:android -t app-bundle --release-channel production
```

#### iOS Production Build (macOS only)
```bash
# Build for App Store
expo build:ios -t archive

# Build for App Store with release channel
expo build:ios -t archive --release-channel production
```

---

## 🔧 Pre-build Commands

### Generate Native Projects

```bash
# Generate native Android and iOS folders
npx expo prebuild

# Generate with clean slate
npx expo prebuild --clean

# Generate for specific platform
npx expo prebuild --platform android
npx expo prebuild --platform ios
```

### After Prebuild, Use Native Build Tools

#### Android (after prebuild)
```bash
# Navigate to android folder
cd android

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Build release AAB
./gradlew bundleRelease

# Install on connected device
./gradlew installDebug
```

#### iOS (after prebuild, macOS only)
```bash
# Open Xcode
open ios/myvoicepost.xcworkspace

# Or build from command line
xcodebuild -workspace ios/myvoicepost.xcworkspace \
  -scheme myvoicepost \
  -configuration Release \
  archive
```

---

## 📦 Build Configuration

### Update app.json for Production

```json
{
  "expo": {
    "name": "MyVoicePost",
    "slug": "myvoicepost",
    "version": "1.0.0",
    "android": {
      "versionCode": 1,
      "package": "com.myvoicepost.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#6366f1"
      }
    },
    "ios": {
      "buildNumber": "1",
      "bundleIdentifier": "com.myvoicepost.app",
      "supportsTablet": true
    }
  }
}
```

### Create eas.json (if using EAS)

```bash
# Create eas.json automatically
eas build:configure
```

Or create manually:
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "gradleCommand": ":app:assembleDebug"
      },
      "ios": {
        "buildConfiguration": "Debug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "buildConfiguration": "Release"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 🎯 Build Profiles

### Development Build
```bash
# Quick builds for testing
eas build --profile development --platform android

# Features:
# - Development client enabled
# - Faster build times
# - Debug symbols included
```

### Preview Build
```bash
# Internal testing builds
eas build --profile preview --platform android

# Features:
# - Internal distribution
# - APK for Android
# - Can be shared with testers
```

### Production Build
```bash
# Store-ready builds
eas build --profile production --platform android

# Features:
# - Optimized for stores
# - AAB for Play Store
# - IPA for App Store
# - Release configuration
```

---

## 📱 Platform-Specific Commands

### Android Only

#### Local Build (after prebuild)
```bash
cd android

# Debug build
./gradlew assembleDebug

# Release build
./gradlew assembleRelease

# Clean build
./gradlew clean
./gradlew assembleRelease

# Check build
./gradlew check

# List tasks
./gradlew tasks
```

#### Install on Device
```bash
# Install debug
adb install app/build/outputs/apk/debug/app-debug.apk

# Install release
adb install app/build/outputs/apk/release/app-release.apk

# Uninstall
adb uninstall com.myvoicepost.app
```

### iOS Only (macOS required)

#### Using Xcode
```bash
# Open project
open ios/myvoicepost.xcworkspace

# Then in Xcode:
# 1. Select your device/simulator
# 2. Product > Archive (for production)
# 3. Product > Build (for testing)
```

#### Command Line
```bash
# Build for simulator
xcodebuild -workspace ios/myvoicepost.xcworkspace \
  -scheme myvoicepost \
  -configuration Debug \
  -sdk iphonesimulator

# Build for device
xcodebuild -workspace ios/myvoicepost.xcworkspace \
  -scheme myvoicepost \
  -configuration Release \
  -sdk iphoneos
```

---

## 🔐 Signing & Credentials

### Android Keystore

#### Generate Keystore
```bash
# Generate new keystore
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore my-release-key.keystore \
  -alias my-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

#### Configure in gradle.properties
```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=your-store-password
MYAPP_RELEASE_KEY_PASSWORD=your-key-password
```

### iOS Certificates (macOS only)

```bash
# Using EAS (automatic)
eas credentials

# Manual setup in Xcode:
# 1. Xcode > Preferences > Accounts
# 2. Add Apple ID
# 3. Download certificates
# 4. Select team in project settings
```

---

## 📤 Submission Commands

### Submit to Google Play Store

#### Using EAS Submit
```bash
# Configure submission
eas submit --platform android

# With specific build
eas submit --platform android --id <build-id>

# With latest build
eas submit --platform android --latest
```

#### Manual Upload
1. Build AAB: `eas build --platform android --profile production`
2. Download AAB from Expo dashboard
3. Upload to Google Play Console

### Submit to Apple App Store

#### Using EAS Submit
```bash
# Configure submission
eas submit --platform ios

# With specific build
eas submit --platform ios --id <build-id>

# With latest build
eas submit --platform ios --latest
```

#### Using Xcode
1. Archive build in Xcode
2. Window > Organizer
3. Distribute App > App Store Connect
4. Upload

---

## 🧪 Testing Builds

### Install on Test Devices

#### Android
```bash
# Via ADB
adb install path/to/app.apk

# Via EAS (internal distribution)
eas build --profile preview --platform android
# Share link from Expo dashboard
```

#### iOS (macOS only)
```bash
# TestFlight
eas submit --platform ios

# Or Ad Hoc distribution
eas build --profile preview --platform ios
```

---

## 🔄 Update Commands

### OTA Updates (Over-The-Air)

#### Publish Update
```bash
# Publish to default channel
npx expo publish

# Publish to specific channel
npx expo publish --release-channel production

# Publish to staging
npx expo publish --release-channel staging
```

#### Using EAS Update
```bash
# Install EAS Update
npm install expo-updates

# Configure updates
eas update:configure

# Create update
eas update --branch production

# Create update for specific platform
eas update --branch production --platform android
```

---

## 📊 Build Optimization

### Reduce Build Size

#### Android
```bash
# Enable ProGuard/R8
# In android/app/build.gradle:
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt')
        }
    }
}
```

#### iOS
```bash
# Enable bitcode and optimization
# In Xcode build settings:
# - Enable Bitcode: Yes
# - Optimization Level: Fastest, Smallest
```

### Analyze Bundle
```bash
# Analyze Android bundle
npx expo-bundler-visualizer android

# Analyze iOS bundle
npx expo-bundler-visualizer ios
```

---

## 🚨 Troubleshooting Build Issues

### Clean Everything
```bash
# Clean Expo cache
npx expo start --clear

# Clean node modules
rm -rf node_modules
npm install

# Clean native builds
npx expo prebuild --clean

# Android clean
cd android && ./gradlew clean && cd ..

# iOS clean
rm -rf ios/build
```

### Common Build Errors

#### "Bundle identifier already exists"
```bash
# Update in app.json
"android": {
  "package": "com.yourcompany.yourapp"
},
"ios": {
  "bundleIdentifier": "com.yourcompany.yourapp"
}
```

#### "Gradle build failed"
```bash
cd android
./gradlew clean
./gradlew assembleRelease --stacktrace
```

#### "CocoaPods error" (iOS)
```bash
cd ios
pod deintegrate
pod install
cd ..
```

---

## 📋 Complete Build Checklist

### Pre-Build
- [ ] Update version in `app.json`
- [ ] Update version codes (Android/iOS)
- [ ] Test app thoroughly
- [ ] Run `npm run validate`
- [ ] Update CHANGELOG.md
- [ ] Create git tag for version

### Build
- [ ] Choose build method (EAS or Classic)
- [ ] Select platform (Android/iOS/Both)
- [ ] Select build type (APK/AAB/IPA)
- [ ] Configure signing credentials
- [ ] Start build

### Post-Build
- [ ] Test build on device
- [ ] Verify app functionality
- [ ] Check app size
- [ ] Test on different devices/OS versions
- [ ] Submit to stores (if production)

---

## 🎯 Recommended Build Workflow

### For Development
```bash
npm run android  # Quick testing
npm run ios      # Quick testing
```

### For Internal Testing
```bash
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

### For Production
```bash
# 1. Update version
# Edit app.json: version, versionCode, buildNumber

# 2. Build
eas build --profile production --platform all

# 3. Submit
eas submit --platform android
eas submit --platform ios
```

---

## 📱 Quick Reference

```bash
# Development
npm start                                    # Start dev server
npm run android                              # Run on Android
npm run ios                                  # Run on iOS

# Build (EAS)
eas build -p android                        # Build Android
eas build -p ios                            # Build iOS
eas build -p all                            # Build both

# Build Profiles
eas build --profile development             # Dev build
eas build --profile preview                 # Preview build
eas build --profile production              # Production build

# Submit
eas submit -p android                       # Submit to Play Store
eas submit -p ios                           # Submit to App Store

# Updates
eas update --branch production              # OTA update
```

---

## 💡 Pro Tips

1. **Use EAS Build** - More reliable and easier than classic builds
2. **Test on real devices** - Simulators don't catch all issues
3. **Use preview builds** for internal testing before production
4. **Keep keystores safe** - Back them up securely
5. **Version properly** - Increment version codes for each build
6. **Test OTA updates** on staging before production

---

## 📞 Need Help?

- **Expo Docs**: https://docs.expo.dev/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **EAS Submit**: https://docs.expo.dev/submit/introduction/
- **Troubleshooting**: https://docs.expo.dev/build-reference/troubleshooting/

---

**Ready to build? Start with `eas build:configure` and follow the prompts!** 🚀

build apk:
# Go back to project root
cd ..

# Install the missing package
npm install expo-asset

# Also install other commonly needed expo packages
npx expo install expo-asset expo-constants

# Clean and rebuild
cd android
.\gradlew clean
.\gradlew assembleRelease