# MyVoicePost - Release Testing Quick Reference

## Detailed Guides

| Platform | Linux/Mac Guide | Windows Guide |
|----------|----------------|---------------|
| Web (Playwright) | `testcases/web/RELEASE_TEST_GUIDE.md` | `testcases/web/RELEASE_TEST_GUIDE_WINDOWS.md` |
| Mobile Android (Maestro) | `testcases/mobile_android/RELEASE_TEST_GUIDE.md` | `testcases/mobile_android/RELEASE_TEST_GUIDE_WINDOWS.md` |

---

## Pre-Release Checklist

```
Before every release, run through these steps:

[ ] 1. Build APK / Deploy web app
[ ] 2. Run automated tests
[ ] 3. Review results
[ ] 4. All tests pass? -> Release
[ ] 5. Tests fail? -> Fix -> Rebuild -> Re-run -> Repeat
```

---

## Quick Commands

### Web (Playwright)

**Linux/Mac:**
```bash
npm run dev &
npx playwright test
npx playwright show-report testcases/web/results
```

**Windows (Command Prompt):**
```cmd
:: Start app in a separate terminal first: npm run dev
npx playwright test
npx playwright show-report testcases\web\results
```

**Windows (One-Click Script):**
```cmd
web-release-test.bat
```

### Mobile Android (Maestro)

**Linux/Mac:**
```bash
emulator -avd MyVoicePost_Test &
adb wait-for-device
adb install -r ./build/myvoicepost.apk
maestro test testcases/mobile_android/maestro_flows/ \
  --format junit \
  --output testcases/mobile_android/results/test-report.xml
```

**Windows (Command Prompt):**
```cmd
:: Start emulator from Android Studio or:
start emulator -avd MyVoicePost_Test
adb wait-for-device
adb install -r build\myvoicepost.apk
maestro test testcases\mobile_android\maestro_flows\ --format junit --output testcases\mobile_android\results\test-report.xml
```

**Windows (One-Click Script):**
```cmd
release-test.bat build\myvoicepost.apk
```

**Windows (PowerShell):**
```powershell
.\release-test.ps1 -ApkPath "build\myvoicepost.apk"
```

### Run Specific Category

```cmd
:: Auth tests only
maestro test testcases\mobile_android\maestro_flows\auth\

:: Polish tests only
maestro test testcases\mobile_android\maestro_flows\polish\

:: Web auth tests only
npx playwright test auth.spec.ts
```

### Toggle Network for Offline Tests

```cmd
adb shell svc wifi disable
adb shell svc data disable
:: Run offline test here
adb shell svc wifi enable
```

---

## Test Coverage Summary

| Area | Web Tests | Mobile Tests |
|------|-----------|-------------|
| Auth (login/signup/SSO) | 15 | 19 |
| Polish (voice/text -> polished) | 15 | 17 |
| Translate | 10 | 12 |
| Process/Transcribe | 11 | 12 |
| Saved Items | 12 | 9 |
| Subscription/Payments | -- | 10 |
| Admin Dashboard | 15 | -- |
| Settings/Profile | -- | 13 |
| Landing/Navigation | 14 | -- |
| API Tests | 14 | -- |
| System/Edge Cases | -- | 16 |
| **Total** | **81** | **83** |

---

## When Tests Fail

1. **Open the report** -- Screenshots and traces show exactly what went wrong
2. **Check if it's a code bug** -- Did a recent change break something?
3. **Check if it's a test issue** -- Did UI text or element IDs change?
4. **Fix the root cause** -- Update code or test as needed
5. **Re-run** -- Confirm the fix works

---

## Manual-Only Tests (Cannot be automated)

These require human verification:
- **TC-M-AUTH-011**: Google SSO (needs real Google account interaction)
- **TC-M-POL-004 to 007**: Voice recording (emulator has no microphone)
- **TC-M-TRN-001**: Voice translation (same reason)
- **TC-M-SYS-002 to 004**: Crash recovery (hard to simulate reliably)
- **TC-M-SYS-005**: Battery warning (emulator-dependent)

For these, test the text-input path in automation and verify voice path manually before release.
