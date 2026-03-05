# MyVoicePost - Mobile Android Release Testing Guide

## Overview

This guide covers the full workflow:
1. Build APK
2. Deploy to Android emulator
3. Run automated test cases using Maestro
4. Review test results
5. Decide: release or fix

---

## One-Time Setup (Do this once on your development machine)

### Step 1: Install Prerequisites

```bash
# 1. Install Android Studio (includes emulator + SDK)
# Download from: https://developer.android.com/studio
# During setup, ensure these are checked:
#   - Android SDK
#   - Android SDK Platform
#   - Android Virtual Device (AVD)

# 2. Set environment variables (add to ~/.bashrc or ~/.zshrc)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools/bin

# 3. Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# 4. Verify installations
adb --version          # Should show Android Debug Bridge version
maestro --version      # Should show Maestro version
```

### Step 2: Create an Android Emulator (AVD)

```bash
# Option A: Via Android Studio
# Open Android Studio → Tools → Device Manager → Create Device
# Choose: Pixel 6 → System Image: API 34 (Android 14) → Finish

# Option B: Via command line
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n MyVoicePost_Test -k "system-images;android-34;google_apis;x86_64" -d pixel_6
```

---

## Release Testing Workflow

### Step 1: Build the APK

```bash
# Navigate to your mobile project
cd mobile

# Install dependencies (if not already done)
npm install

# Build the Android APK using EAS (Expo Application Services)
# Option A: Development build (for testing)
npx eas build --platform android --profile preview --local

# Option B: If using bare workflow
cd android
./gradlew assembleRelease
# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

### Step 2: Start the Emulator

```bash
# List available emulators
emulator -list-avds

# Start the emulator (replace name with yours)
emulator -avd MyVoicePost_Test &

# Wait for emulator to fully boot
adb wait-for-device
adb shell getprop sys.boot_completed
# Wait until it returns "1"
```

### Step 3: Install the APK on Emulator

```bash
# Install the APK (replace path with your actual APK location)
adb install -r ./build/myvoicepost.apk

# Verify it's installed
adb shell pm list packages | grep myvoicepost
```

### Step 4: Run All Test Cases

```bash
# Run the full test suite
maestro test testcases/mobile_android/maestro_flows/ \
  --format junit \
  --output testcases/mobile_android/results/test-report.xml

# This will:
# - Launch the app on the emulator
# - Execute every test flow sequentially
# - Generate a JUnit XML report
# - Show pass/fail for each test in the terminal
```

### Step 5: Run Specific Test Category (Optional)

```bash
# Run only auth tests
maestro test testcases/mobile_android/maestro_flows/auth/

# Run only polish tests
maestro test testcases/mobile_android/maestro_flows/polish/

# Run a single test
maestro test testcases/mobile_android/maestro_flows/auth/TC_M_AUTH_001_login_valid.yaml
```

### Step 6: Review Test Results

```bash
# Terminal output shows:
#  ✅ TC_M_AUTH_001_login_valid - PASSED
#  ✅ TC_M_AUTH_002_login_invalid_password - PASSED
#  ❌ TC_M_POL_003_polish_empty_text - FAILED
#  ...
#  Results: 78/83 passed, 5 failed

# View detailed JUnit report
cat testcases/mobile_android/results/test-report.xml

# View screenshots of failures (Maestro captures automatically)
ls ~/.maestro/tests/
```

---

## Decision Flow After Test Run

```
Run All Tests
    │
    ├── ALL PASSED (83/83) ──→ Safe to release. Proceed to Play Store upload.
    │
    ├── SOME FAILED ──→ Review failed tests:
    │       │
    │       ├── Is it a real bug? ──→ Fix the code, rebuild APK, re-run tests
    │       │
    │       └── Is it a test issue? ──→ Update the test, re-run
    │           (e.g., UI text changed, element ID changed)
    │
    └── MANY FAILED ──→ Major regression detected.
            Do NOT release. Investigate recent code changes.
```

---

## Maestro Flow File Structure

Your test flows should be organized like this:

```
testcases/mobile_android/
├── maestro_flows/
│   ├── auth/
│   │   ├── TC_M_AUTH_001_login_valid.yaml
│   │   ├── TC_M_AUTH_002_login_invalid.yaml
│   │   └── ...
│   ├── polish/
│   │   ├── TC_M_POL_001_polish_voice.yaml
│   │   ├── TC_M_POL_002_polish_tones.yaml
│   │   └── ...
│   ├── translate/
│   │   ├── TC_M_TRN_001_translate_voice.yaml
│   │   └── ...
│   ├── process/
│   │   ├── TC_M_PRC_001_process_youtube.yaml
│   │   └── ...
│   ├── saved/
│   │   ├── TC_M_SAV_001_view_saved.yaml
│   │   └── ...
│   ├── subscription/
│   │   ├── TC_M_SUB_001_view_plans.yaml
│   │   └── ...
│   ├── settings/
│   │   ├── TC_M_SET_001_view_profile.yaml
│   │   └── ...
│   └── system/
│       ├── TC_M_SYS_001_background_recording.yaml
│       └── ...
├── results/
│   └── test-report.xml  (generated after test run)
├── config.yaml           (shared test configuration)
└── RELEASE_TEST_GUIDE.md (this file)
```

---

## Maestro Flow Examples

### config.yaml (shared settings)
```yaml
# Shared configuration for all test flows
appId: com.myvoicepost.app

# Test user credentials (use a dedicated test account)
env:
  TEST_EMAIL: "testuser@myvoicepost.com"
  TEST_PASSWORD: "TestPass123!"
  TEST_USERNAME: "testuser"
```

### Example: TC_M_AUTH_001_login_valid.yaml
```yaml
appId: com.myvoicepost.app
name: "TC-M-AUTH-001: Login with valid email and password"
---
- launchApp:
    clearState: true

# Navigate to login (if not already there)
- assertVisible: "Login"

# Enter credentials
- tapOn:
    id: "input-email"
- inputText: ${TEST_EMAIL}

- tapOn:
    id: "input-password"
- inputText: ${TEST_PASSWORD}

# Tap login button
- tapOn:
    id: "button-login"

# Wait for navigation to main app
- assertVisible:
    id: "tab-polish"
    timeout: 10000

# Verify user is on the main screen
- assertVisible: "Polish"
```

### Example: TC_M_AUTH_002_login_invalid.yaml
```yaml
appId: com.myvoicepost.app
name: "TC-M-AUTH-002: Login with invalid password"
---
- launchApp:
    clearState: true

- tapOn:
    id: "input-email"
- inputText: ${TEST_EMAIL}

- tapOn:
    id: "input-password"
- inputText: "WrongPassword123"

- tapOn:
    id: "button-login"

# Should show error, NOT navigate away
- assertVisible: "Invalid credentials"
- assertNotVisible:
    id: "tab-polish"
```

### Example: TC_M_POL_009_save_polished.yaml
```yaml
appId: com.myvoicepost.app
name: "TC-M-POL-009: Save polished text"
---
- launchApp:
    clearState: true

# Login first
- tapOn:
    id: "input-email"
- inputText: ${TEST_EMAIL}
- tapOn:
    id: "input-password"
- inputText: ${TEST_PASSWORD}
- tapOn:
    id: "button-login"
- assertVisible:
    id: "tab-polish"
    timeout: 10000

# Type text to polish (skip voice for automation)
- tapOn:
    id: "input-text"
- inputText: "hey can u send me the report by tmrw"

# Tap polish button
- tapOn:
    id: "button-polish"

# Wait for result
- assertVisible:
    id: "card-polished-text"
    timeout: 15000

# Save the result
- tapOn:
    id: "button-save"

# Verify save confirmation
- assertVisible: "Saved"
```

---

## Running Tests in CI/CD (Future Automation)

When you want to fully automate this in a build pipeline:

```bash
#!/bin/bash
# release-test.sh — Run before every release

set -e  # Stop on first failure

echo "=== Step 1: Start emulator ==="
emulator -avd MyVoicePost_Test -no-window -no-audio &
adb wait-for-device
adb shell input keyevent 82  # Unlock screen

echo "=== Step 2: Install APK ==="
adb install -r ./build/myvoicepost.apk

echo "=== Step 3: Run test suite ==="
maestro test testcases/mobile_android/maestro_flows/ \
  --format junit \
  --output testcases/mobile_android/results/test-report.xml \
  --env TEST_EMAIL=testuser@myvoicepost.com \
  --env TEST_PASSWORD=TestPass123!

echo "=== Step 4: Check results ==="
FAILED=$(grep -c 'failures="[^0]"' testcases/mobile_android/results/test-report.xml || true)

if [ "$FAILED" -gt 0 ]; then
  echo "❌ TESTS FAILED — DO NOT RELEASE"
  echo "Review: testcases/mobile_android/results/test-report.xml"
  exit 1
else
  echo "✅ ALL TESTS PASSED — SAFE TO RELEASE"
  exit 0
fi
```

Usage:
```bash
chmod +x release-test.sh
./release-test.sh
```

---

## Important Notes

1. **Test Account**: Create a dedicated test user account that won't interfere with real users. This account should have an active subscription or trial for testing authenticated features.

2. **Voice Recording Tests**: Maestro cannot use a real microphone on emulators. For recording tests, either:
   - Test only the text-input path (type text → polish/translate)
   - Push a pre-recorded audio file to the emulator and use it as input
   - Mark voice-specific tests as "manual only"

3. **Google SSO Tests**: Cannot be fully automated on emulator. Mark TC-M-AUTH-011 as "manual test" — verify during manual QA.

4. **Network Tests**: For offline tests (TC-M-POL-013, TC-M-SYS-006), use:
   ```bash
   # Disable network on emulator
   adb shell svc wifi disable
   adb shell svc data disable
   # Run offline test
   # Re-enable network
   adb shell svc wifi enable
   ```

5. **Test Data Cleanup**: After each full test run, the test account may have saved items. Either clean up in the test flows or use a fresh test account.

6. **Emulator vs Real Device**: For final release validation, also run on a real Android device:
   ```bash
   # Connect device via USB, enable USB debugging
   adb devices  # Should list your device
   maestro test testcases/mobile_android/maestro_flows/
   ```
