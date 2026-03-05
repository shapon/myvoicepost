# MyVoicePost - Mobile Android Release Testing Guide (Windows)

## Overview

This guide covers the full workflow on a Windows system:
1. Build APK
2. Deploy to Android emulator
3. Run automated test cases using Maestro
4. Review test results
5. Decide: release or fix

---

## One-Time Setup (Do this once on your Windows machine)

### Step 1: Install Android Studio

1. Download Android Studio from https://developer.android.com/studio
2. Run the installer
3. During setup, ensure these are checked:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (AVD)
4. After installation, open Android Studio and go to **Tools > SDK Manager**
5. Under **SDK Platforms**, install **Android 14 (API 34)**
6. Under **SDK Tools**, ensure these are installed:
   - Android SDK Build-Tools
   - Android SDK Command-line Tools
   - Android Emulator
   - Android SDK Platform-Tools

### Step 2: Set Environment Variables

1. Open **Start Menu**, search for "Environment Variables", click **Edit the system environment variables**
2. Click **Environment Variables** button
3. Under **User variables**, click **New** and add:
   - Variable name: `ANDROID_HOME`
   - Variable value: `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`
4. Find the **Path** variable under **User variables**, click **Edit**, then **New**, and add these entries one by one:
   ```
   %ANDROID_HOME%\emulator
   %ANDROID_HOME%\platform-tools
   %ANDROID_HOME%\tools\bin
   %ANDROID_HOME%\cmdline-tools\latest\bin
   ```
5. Click **OK** on all dialogs to save

### Step 3: Verify Android SDK

Open a **new** Command Prompt (cmd) or PowerShell window and run:

```cmd
adb --version
```

Expected output: `Android Debug Bridge version X.X.XX`

If it says "not recognized", restart your terminal or check the Path variable.

### Step 4: Install Maestro CLI

Maestro requires **Java 11+** and runs on Windows via WSL (Windows Subsystem for Linux) or PowerShell.

**Option A: Using PowerShell (Recommended for Windows)**

```powershell
# Install via PowerShell (requires Java 11+)
# First, verify Java is installed:
java -version

# If Java is not installed, download from: https://adoptium.net/
# Choose: Windows x64, JDK 17 LTS

# Install Maestro using the Windows installer
iwr -useb "https://get.maestro.mobile.dev/windows" | iex
```

**Option B: Using WSL (Windows Subsystem for Linux)**

If you have WSL installed (Ubuntu recommended):

```bash
# Open WSL terminal
wsl

# Install Maestro in WSL
curl -Ls "https://get.maestro.mobile.dev" | bash

# Add to path
export PATH="$PATH":"$HOME/.maestro/bin"
echo 'export PATH="$PATH":"$HOME/.maestro/bin"' >> ~/.bashrc
```

**Option C: Manual Download**

1. Go to https://github.com/mobile-dev-inc/maestro/releases
2. Download the latest `.zip` for Windows
3. Extract to `C:\maestro`
4. Add `C:\maestro\bin` to your Path environment variable (same steps as Step 2)

### Step 5: Verify Maestro

```cmd
maestro --version
```

Expected output: `Maestro version X.XX.X`

### Step 6: Create an Android Emulator (AVD)

**Option A: Via Android Studio (Easiest)**

1. Open Android Studio
2. Go to **Tools > Device Manager**
3. Click **Create Device**
4. Choose: **Pixel 6** > Click **Next**
5. Select System Image: **API 34 (Android 14)** with **Google APIs** > Click **Next**
   - If not downloaded yet, click the **Download** link next to it
6. Name it: `MyVoicePost_Test` > Click **Finish**

**Option B: Via Command Line**

Open Command Prompt as Administrator:

```cmd
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n MyVoicePost_Test -k "system-images;android-34;google_apis;x86_64" -d pixel_6
```

---

## Release Testing Workflow

### Step 1: Build the APK

Open Command Prompt or PowerShell, navigate to your mobile project:

```cmd
cd C:\path\to\your\project\mobile

:: Install dependencies (if not already done)
npm install

:: Build the Android APK using EAS
npx eas build --platform android --profile preview --local
```

Or if using bare workflow:

```cmd
cd android
.\gradlew.bat assembleRelease
:: APK will be at: android\app\build\outputs\apk\release\app-release.apk
```

### Step 2: Start the Emulator

```cmd
:: List available emulators
emulator -list-avds

:: Start the emulator (replace name with yours)
:: Use 'start' to run it in background on Windows
start emulator -avd MyVoicePost_Test

:: Wait for emulator to fully boot (run in a new terminal)
adb wait-for-device

:: Check if boot is complete (wait until it returns "1")
adb shell getprop sys.boot_completed
```

**Alternative**: Open Android Studio > Tools > Device Manager > Click the Play button next to your emulator.

### Step 3: Install the APK on Emulator

```cmd
:: Install the APK (replace path with your actual APK location)
adb install -r .\build\myvoicepost.apk

:: Verify it's installed
adb shell pm list packages | findstr myvoicepost
```

### Step 4: Run All Test Cases

```cmd
:: Run the full test suite
maestro test testcases\mobile_android\maestro_flows\ --format junit --output testcases\mobile_android\results\test-report.xml

:: This will:
:: - Launch the app on the emulator
:: - Execute every test flow sequentially
:: - Generate a JUnit XML report
:: - Show pass/fail for each test in the terminal
```

**If using WSL for Maestro** (Maestro in WSL can connect to Windows emulator):

```bash
# In WSL terminal, first set ADB to use Windows host
export ADB_SERVER_SOCKET=tcp:host.docker.internal:5037

# Or connect directly
export ANDROID_HOME=/mnt/c/Users/<YourUsername>/AppData/Local/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Run tests
maestro test testcases/mobile_android/maestro_flows/ \
  --format junit \
  --output testcases/mobile_android/results/test-report.xml
```

### Step 5: Run Specific Test Category (Optional)

```cmd
:: Run only auth tests
maestro test testcases\mobile_android\maestro_flows\auth\

:: Run only polish tests
maestro test testcases\mobile_android\maestro_flows\polish\

:: Run a single test
maestro test testcases\mobile_android\maestro_flows\auth\TC_M_AUTH_001_login_valid.yaml
```

### Step 6: Review Test Results

Terminal output shows:
```
  PASSED  TC_M_AUTH_001_login_valid
  PASSED  TC_M_AUTH_002_login_invalid_password
  FAILED  TC_M_POL_003_polish_empty_text
  ...
  Results: 78/83 passed, 5 failed
```

View detailed JUnit report:

```cmd
:: View the XML report
type testcases\mobile_android\results\test-report.xml

:: View screenshots of failures (Maestro captures automatically)
dir %USERPROFILE%\.maestro\tests\
```

---

## Decision Flow After Test Run

```
Run All Tests
    |
    +-- ALL PASSED (83/83) --> Safe to release. Proceed to Play Store upload.
    |
    +-- SOME FAILED --> Review failed tests:
    |       |
    |       +-- Is it a real bug? --> Fix the code, rebuild APK, re-run tests
    |       |
    |       +-- Is it a test issue? --> Update the test, re-run
    |           (e.g., UI text changed, element ID changed)
    |
    +-- MANY FAILED --> Major regression detected.
            Do NOT release. Investigate recent code changes.
```

---

## Maestro Flow File Structure

Your test flows should be organized like this:

```
testcases\mobile_android\
+-- maestro_flows\
|   +-- auth\
|   |   +-- TC_M_AUTH_001_login_valid.yaml
|   |   +-- TC_M_AUTH_002_login_invalid.yaml
|   |   +-- ...
|   +-- polish\
|   |   +-- TC_M_POL_001_polish_voice.yaml
|   |   +-- TC_M_POL_002_polish_tones.yaml
|   |   +-- ...
|   +-- translate\
|   |   +-- TC_M_TRN_001_translate_voice.yaml
|   |   +-- ...
|   +-- process\
|   |   +-- TC_M_PRC_001_process_youtube.yaml
|   |   +-- ...
|   +-- saved\
|   |   +-- TC_M_SAV_001_view_saved.yaml
|   |   +-- ...
|   +-- subscription\
|   |   +-- TC_M_SUB_001_view_plans.yaml
|   |   +-- ...
|   +-- settings\
|   |   +-- TC_M_SET_001_view_profile.yaml
|   |   +-- ...
|   +-- system\
|       +-- TC_M_SYS_001_background_recording.yaml
|       +-- ...
+-- results\
|   +-- test-report.xml  (generated after test run)
+-- config.yaml           (shared test configuration)
+-- RELEASE_TEST_GUIDE_WINDOWS.md (this file)
```

---

## Maestro Flow Examples

### config.yaml (shared settings)
```yaml
appId: com.myvoicepost.app

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

- assertVisible: "Login"

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

- tapOn:
    id: "input-text"
- inputText: "hey can u send me the report by tmrw"

- tapOn:
    id: "button-polish"

- assertVisible:
    id: "card-polished-text"
    timeout: 15000

- tapOn:
    id: "button-save"

- assertVisible: "Saved"
```

---

## Windows Batch Script for Automated Release Testing

Save the following as `release-test.bat` in your project root:

```batch
@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  MyVoicePost Release Test Runner (Windows)
echo ============================================
echo.

:: Step 1: Check if emulator is running
echo === Step 1: Checking emulator ===
adb devices | findstr "emulator" >nul 2>&1
if errorlevel 1 (
    echo No emulator detected. Starting emulator...
    start "" emulator -avd MyVoicePost_Test
    echo Waiting for emulator to boot...
    adb wait-for-device
    timeout /t 30 /nobreak >nul
    echo Checking boot status...
    :waitboot
    for /f %%i in ('adb shell getprop sys.boot_completed 2^>nul') do set BOOT=%%i
    if not "!BOOT!"=="1" (
        timeout /t 5 /nobreak >nul
        goto waitboot
    )
    echo Emulator is ready.
) else (
    echo Emulator is already running.
)
echo.

:: Step 2: Install APK
echo === Step 2: Installing APK ===
if "%~1"=="" (
    echo Usage: release-test.bat [path-to-apk]
    echo Example: release-test.bat build\myvoicepost.apk
    exit /b 1
)
adb install -r "%~1"
if errorlevel 1 (
    echo FAILED: Could not install APK
    exit /b 1
)
echo APK installed successfully.
echo.

:: Step 3: Run test suite
echo === Step 3: Running Maestro test suite ===
if not exist "testcases\mobile_android\results" mkdir "testcases\mobile_android\results"

maestro test testcases\mobile_android\maestro_flows\ --format junit --output testcases\mobile_android\results\test-report.xml --env TEST_EMAIL=testuser@myvoicepost.com --env TEST_PASSWORD=TestPass123!

set TEST_RESULT=%errorlevel%
echo.

:: Step 4: Check results
echo === Step 4: Results ===
echo.
if %TEST_RESULT%==0 (
    echo =============================================
    echo   ALL TESTS PASSED - SAFE TO RELEASE
    echo =============================================
) else (
    echo =============================================
    echo   TESTS FAILED - DO NOT RELEASE
    echo =============================================
    echo.
    echo Review the report at:
    echo   testcases\mobile_android\results\test-report.xml
    echo.
    echo Screenshots of failures are at:
    echo   %USERPROFILE%\.maestro\tests\
)
echo.

endlocal
exit /b %TEST_RESULT%
```

Usage:

```cmd
:: Run the release test script
release-test.bat build\myvoicepost.apk
```

---

## PowerShell Script (Alternative)

Save as `release-test.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$ApkPath
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " MyVoicePost Release Test Runner (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check emulator
Write-Host "=== Step 1: Checking emulator ===" -ForegroundColor Yellow
$devices = adb devices 2>$null
if ($devices -notmatch "emulator") {
    Write-Host "Starting emulator..."
    Start-Process -FilePath "emulator" -ArgumentList "-avd MyVoicePost_Test" -WindowStyle Minimized
    Write-Host "Waiting for emulator to boot..."
    adb wait-for-device
    do {
        Start-Sleep -Seconds 5
        $bootComplete = adb shell getprop sys.boot_completed 2>$null
    } while ($bootComplete -ne "1")
    Write-Host "Emulator is ready." -ForegroundColor Green
} else {
    Write-Host "Emulator is already running." -ForegroundColor Green
}

# Step 2: Install APK
Write-Host ""
Write-Host "=== Step 2: Installing APK ===" -ForegroundColor Yellow
if (-not (Test-Path $ApkPath)) {
    Write-Host "ERROR: APK not found at $ApkPath" -ForegroundColor Red
    exit 1
}
adb install -r $ApkPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Could not install APK" -ForegroundColor Red
    exit 1
}
Write-Host "APK installed successfully." -ForegroundColor Green

# Step 3: Run tests
Write-Host ""
Write-Host "=== Step 3: Running Maestro test suite ===" -ForegroundColor Yellow
$resultsDir = "testcases\mobile_android\results"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
}

maestro test testcases\mobile_android\maestro_flows\ `
    --format junit `
    --output "$resultsDir\test-report.xml" `
    --env TEST_EMAIL=testuser@myvoicepost.com `
    --env TEST_PASSWORD=TestPass123!

$testResult = $LASTEXITCODE

# Step 4: Results
Write-Host ""
Write-Host "=== Step 4: Results ===" -ForegroundColor Yellow
Write-Host ""
if ($testResult -eq 0) {
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  ALL TESTS PASSED - SAFE TO RELEASE" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
} else {
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host "  TESTS FAILED - DO NOT RELEASE" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Review the report at:" -ForegroundColor Yellow
    Write-Host "  $resultsDir\test-report.xml"
    Write-Host ""
    Write-Host "Screenshots of failures are at:" -ForegroundColor Yellow
    Write-Host "  $env:USERPROFILE\.maestro\tests\"
}

exit $testResult
```

Usage:

```powershell
# Allow script execution (one-time)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Run the release test
.\release-test.ps1 -ApkPath "build\myvoicepost.apk"
```

---

## Network Tests on Windows

For offline tests (TC-M-POL-013, TC-M-SYS-006):

```cmd
:: Disable network on emulator
adb shell svc wifi disable
adb shell svc data disable

:: Run the offline test
maestro test testcases\mobile_android\maestro_flows\system\TC_M_SYS_010_offline_startup.yaml

:: Re-enable network
adb shell svc wifi enable
```

---

## Testing on a Real Android Device (Windows)

1. Connect your Android phone via USB
2. Enable **Developer Options** on phone:
   - Settings > About Phone > Tap "Build Number" 7 times
3. Enable **USB Debugging**:
   - Settings > Developer Options > USB Debugging > ON
4. When prompted on phone, tap **Allow USB Debugging**
5. Verify connection:

```cmd
adb devices
:: Should show your device serial number
```

6. Install APK and run tests:

```cmd
adb install -r build\myvoicepost.apk
maestro test testcases\mobile_android\maestro_flows\
```

---

## Troubleshooting (Windows-Specific)

### "adb is not recognized"
- Verify `ANDROID_HOME` is set correctly
- Check that `%ANDROID_HOME%\platform-tools` is in your Path
- Open a **new** terminal after changing environment variables

### "emulator is not recognized"
- Add `%ANDROID_HOME%\emulator` to your Path
- Restart terminal

### "maestro is not recognized"
- If installed via PowerShell: Check `%USERPROFILE%\.maestro\bin` is in Path
- If installed manually: Check `C:\maestro\bin` is in Path
- Try running: `%USERPROFILE%\.maestro\bin\maestro --version`

### Emulator won't start
- Open Android Studio > Tools > Device Manager > Check for errors
- Ensure Intel HAXM or Windows Hypervisor Platform is enabled:
  - Control Panel > Programs > Turn Windows features on/off
  - Enable "Windows Hypervisor Platform"
  - Restart computer

### Maestro cannot find the emulator
- Make sure `adb devices` shows the emulator
- If using WSL, set `export ADB_SERVER_SOCKET=tcp:localhost:5037`
- Try restarting ADB: `adb kill-server && adb start-server`

### Java not found
- Download from https://adoptium.net/ (Temurin JDK 17)
- After install, verify: `java -version`
- If still not found, add Java's bin folder to Path:
  `C:\Program Files\Eclipse Adoptium\jdk-17...\bin`

### Gradle build fails on Windows
- Use `.\gradlew.bat` instead of `./gradlew`
- If permission errors: Run Command Prompt as Administrator
