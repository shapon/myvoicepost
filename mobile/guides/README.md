# MyVoicePost Mobile App

React Native (Expo) mobile app for MyVoicePost - Transform your voice into polished text.

## Features

- **Polish**: Record your voice and transform it into polished text
- **Translate**: Speak in one language, get polished translated text in another
- **Save**: Store your polished and translated texts for later access
- **Authentication**: Secure email/password login

---

## Prerequisites

1. **Node.js 18+** - https://nodejs.org
2. **Android Studio** - https://developer.android.com/studio
3. **Java JDK 17** - Required for Android builds

---

## Android Studio Setup

### 1. Install Android Studio
Download and install Android Studio from the official website.

### 2. Configure SDK
In Android Studio:
1. Go to **File > Settings > Languages & Frameworks > Android SDK**
2. Install **Android SDK 34** (API Level 34)
3. In **SDK Tools** tab, install:
   - Android SDK Build-Tools 34
   - Android SDK Command-line Tools
   - Android Emulator
   - Android SDK Platform-Tools
   - **NDK (Side by side)** - Required for native builds
   - **CMake** - Required for native builds

### 3. Create an Emulator
1. Go to **Tools > Device Manager**
2. Click **Create Device**
3. Select **Pixel 6** or any phone
4. Select **API 34** system image (download if needed)
5. Finish and start the emulator

### 4. Set Environment Variables (Windows)
Add to System Environment Variables:
```
ANDROID_HOME = C:\Users\<YourUser>\AppData\Local\Android\Sdk
```

Add to PATH:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

---

## Installation & Running

### Step 1: Install Dependencies
```bash
cd mobile
npm install --legacy-peer-deps
```

### Step 2: Generate Android Project
```bash
npx expo prebuild --platform android
```

This creates the `android/` folder with native Android code.

### Step 3: Run on Emulator
Make sure your Android emulator is running, then:
```bash
npx expo start
```
Press `a` to open in Android emulator.

---

## Building APK

**IMPORTANT:** Due to Windows path length limitations, build from a short path.

### Step 1: Copy to Short Path
```powershell
Copy-Item -Path "mobile" -Destination "C:\mvp" -Recurse
```

### Step 2: Generate Android Project (if not already done)
```powershell
cd C:\mvp
npx expo prebuild --platform android
```

### Step 3: Build Release APK
```powershell
cd C:\mvp\android
.\gradlew.bat assembleRelease -x lint -x test
```

### Step 4: Find APK
APK location: `C:\mvp\android\app\build\outputs\apk\release\app-release.apk`

---

## Installing APK

### On Emulator
```powershell
# Use full path to adb
& "C:\Users\user\AppData\Local\Android\Sdk\platform-tools\adb.exe" install "C:\mvp\android\app\build\outputs\apk\release\app-release.apk"
```

Or drag and drop the APK file onto the emulator window.

### On Physical Device
1. Transfer the APK to your phone
2. Enable "Install from unknown sources" in settings
3. Tap the APK to install

---

## Troubleshooting

### Path Length Errors (ninja: error mkdir)
This is a Windows limitation. Copy the project to a shorter path like `C:\mvp`.

### Gradle Build Failures
1. Clean and rebuild: `.\gradlew.bat clean`
2. Delete `.gradle` folder and rebuild

### Emulator Not Detected
1. Ensure emulator is running
2. Check `adb devices` shows your emulator
3. Restart adb: `adb kill-server && adb start-server`

### Metro Bundler Issues
```bash
npx expo start --clear
```

---

## API Configuration

The app connects to the web backend at `https://myvoicepost.com/api`.

To change the API URL, edit `src/lib/api.ts`:
```typescript
const API_BASE_URL = 'https://myvoicepost.com/api';
```

---

## Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/             # Tab navigation
│   │   ├── _layout.tsx     # Tab layout
│   │   ├── index.tsx       # Polish screen
│   │   ├── translate.tsx   # Translate screen
│   │   ├── saved.tsx       # Saved items screen
│   │   └── profile.tsx     # Profile screen
│   ├── _layout.tsx         # Root layout
│   ├── login.tsx           # Login screen
│   └── register.tsx        # Register screen
├── src/
│   ├── components/         # Reusable components
│   │   ├── ui/             # UI primitives (Button, Card, Input, Select)
│   │   ├── VoiceRecorder.tsx
│   │   └── ResultDisplay.tsx
│   ├── contexts/           # React contexts (AuthContext)
│   └── lib/                # API and utilities
├── assets/                 # App icons and images
├── app.json               # Expo configuration
└── package.json           # Dependencies
```

---

## Tech Stack

- **Expo SDK 52** with React Native 0.76
- **Expo Router** for file-based navigation
- **TypeScript** for type safety
- **TanStack Query** for data fetching
- **Expo AV** for audio recording
- **Expo Secure Store** for token storage
- **Axios** for HTTP requests
