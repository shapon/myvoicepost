# MyVoicePost - Web Release Testing Guide (Windows)

## Overview

This guide covers running web test cases using Playwright on a Windows system:
1. Install Playwright
2. Run tests against your running web app
3. Review HTML report with screenshots
4. Decide: release or fix

---

## One-Time Setup

### Step 1: Install Node.js (if not already installed)

1. Download from https://nodejs.org/ (LTS version recommended)
2. Run the installer, check "Add to PATH"
3. Verify in a **new** Command Prompt:

```cmd
node --version
npm --version
```

### Step 2: Install Playwright

Open Command Prompt or PowerShell in your project root:

```cmd
:: Install Playwright as dev dependency
npm install -D @playwright/test

:: Install browser binaries (Chromium)
npx playwright install chromium
```

This downloads a Chromium browser specifically for testing. It does not affect your system browsers.

### Step 3: Create Playwright Config

Create `playwright.config.ts` in your project root:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './testcases/web/playwright_tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['html', { outputFolder: 'testcases/web/results' }],
    ['list'],
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

---

## Test File Structure

```
testcases\web\
+-- playwright_tests\
|   +-- auth.spec.ts
|   +-- polish.spec.ts
|   +-- translate.spec.ts
|   +-- process.spec.ts
|   +-- saved.spec.ts
|   +-- dashboard.spec.ts
|   +-- landing.spec.ts
|   +-- api.spec.ts
+-- results\               (generated after test run)
|   +-- index.html          (HTML report with screenshots)
+-- RELEASE_TEST_GUIDE_WINDOWS.md (this file)
```

---

## Running Tests

### Start Your App First

In one terminal window, start your app:

```cmd
npm run dev
```

Leave this running. Open a **second** terminal for tests.

### Run All Tests

```cmd
npx playwright test
```

Terminal output:

```
  PASSED  auth.spec.ts - TC-W-AUTH-001 Login valid (2.3s)
  PASSED  auth.spec.ts - TC-W-AUTH-002 Login invalid (1.1s)
  FAILED  polish.spec.ts - TC-W-POL-003 Empty text (0.8s)
  ...
  81 tests: 76 passed, 5 failed
```

### Run Specific Category

```cmd
npx playwright test auth.spec.ts
npx playwright test polish.spec.ts
npx playwright test api.spec.ts
```

### Run Single Test

```cmd
npx playwright test -g "TC-W-AUTH-001"
```

### View HTML Report (with Screenshots)

```cmd
npx playwright show-report testcases\web\results
```

This opens your browser with a visual report showing:
- Pass/fail status for every test
- Screenshots of failures
- Step-by-step trace of what happened

---

## Example Test Files

### auth.spec.ts
```typescript
import { test, expect } from '@playwright/test';

const TEST_EMAIL = 'testuser@myvoicepost.com';
const TEST_PASSWORD = 'TestPass123!';

test.describe('Authentication', () => {

  test('TC-W-AUTH-001: Login with valid email and password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="input-email"]', TEST_EMAIL);
    await page.fill('[data-testid="input-password"]', TEST_PASSWORD);
    await page.click('[data-testid="button-login"]');

    await expect(page).toHaveURL(/\/polish/, { timeout: 10000 });
  });

  test('TC-W-AUTH-002: Login with invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="input-email"]', TEST_EMAIL);
    await page.fill('[data-testid="input-password"]', 'WrongPassword');
    await page.click('[data-testid="button-login"]');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
  });

  test('TC-W-AUTH-014: Access protected page without login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('mvp_auth_token'));

    await page.goto('/saved');

    await expect(page).toHaveURL(/\/(login|$)/);
  });
});
```

### api.spec.ts
```typescript
import { test, expect } from '@playwright/test';

test.describe('API Integration', () => {

  test('TC-W-API-001: Health check', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('TC-W-API-003: Auth endpoint without token', async ({ request }) => {
    const response = await request.get('/api/v1/a/saved-texts');
    expect(response.status()).toBe(401);
  });

  test('TC-W-API-005: Backward compat /api/v1/m/ redirect', async ({ request }) => {
    const response = await request.get('/api/v1/m/auth/me');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Authentication required');
  });

  test('TC-W-API-012: Plans endpoint', async ({ request }) => {
    const response = await request.get('/api/v1/p/plans');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
```

---

## Decision Flow

```
Run: npx playwright test
    |
    +-- ALL PASSED (81/81) --> Safe to release
    |
    +-- SOME FAILED --> Open HTML report:
    |       |            npx playwright show-report testcases\web\results
    |       |
    |       +-- See screenshot of failure --> Is it a real bug? --> Fix code, re-run
    |       |
    |       +-- See trace of failure --> Is it a test issue? --> Update test, re-run
    |
    +-- MANY FAILED --> Major regression. Do NOT release.
```

---

## Windows Batch Script for Automated Testing

Save as `web-release-test.bat`:

```batch
@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  MyVoicePost Web Release Test (Windows)
echo ============================================
echo.

:: Step 1: Start the app in background
echo === Step 1: Starting app ===
start "MyVoicePost Dev Server" /min cmd /c "npm run dev"
echo Waiting for server to start...
timeout /t 15 /nobreak >nul

:: Check if server is responding
curl -s http://localhost:5000/api/health >nul 2>&1
if errorlevel 1 (
    echo WARNING: Server may not be ready. Waiting 15 more seconds...
    timeout /t 15 /nobreak >nul
)
echo Server is ready.
echo.

:: Step 2: Run Playwright tests
echo === Step 2: Running Playwright tests ===
npx playwright test --reporter=list,html
set TEST_RESULT=%errorlevel%
echo.

:: Step 3: Results
echo === Step 3: Results ===
echo.
if %TEST_RESULT%==0 (
    echo =============================================
    echo   ALL WEB TESTS PASSED - SAFE TO RELEASE
    echo =============================================
) else (
    echo =============================================
    echo   WEB TESTS FAILED - DO NOT RELEASE
    echo =============================================
    echo.
    echo View detailed report:
    echo   npx playwright show-report testcases\web\results
)

:: Stop the dev server
echo.
echo Stopping dev server...
taskkill /fi "WINDOWTITLE eq MyVoicePost Dev Server" /f >nul 2>&1

endlocal
exit /b %TEST_RESULT%
```

Usage:

```cmd
web-release-test.bat
```

---

## PowerShell Script (Alternative)

Save as `web-release-test.ps1`:

```powershell
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " MyVoicePost Web Release Test (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Start the app
Write-Host "=== Step 1: Starting app ===" -ForegroundColor Yellow
$serverJob = Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev" -WindowStyle Minimized -PassThru
Write-Host "Waiting for server to start..."
Start-Sleep -Seconds 15

# Check if server is ready
$maxRetries = 6
$retryCount = 0
do {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 5
        if ($health.status -eq "ok") {
            Write-Host "Server is ready." -ForegroundColor Green
            break
        }
    } catch {
        $retryCount++
        if ($retryCount -ge $maxRetries) {
            Write-Host "ERROR: Server failed to start after $($maxRetries * 5) seconds" -ForegroundColor Red
            Stop-Process -Id $serverJob.Id -ErrorAction SilentlyContinue
            exit 1
        }
        Write-Host "Server not ready yet, retrying in 5 seconds... ($retryCount/$maxRetries)"
        Start-Sleep -Seconds 5
    }
} while ($true)

# Step 2: Run tests
Write-Host ""
Write-Host "=== Step 2: Running Playwright tests ===" -ForegroundColor Yellow
npx playwright test --reporter=list,html
$testResult = $LASTEXITCODE

# Step 3: Results
Write-Host ""
Write-Host "=== Step 3: Results ===" -ForegroundColor Yellow
Write-Host ""
if ($testResult -eq 0) {
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  ALL WEB TESTS PASSED - SAFE TO RELEASE" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
} else {
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host "  WEB TESTS FAILED - DO NOT RELEASE" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "View detailed report:" -ForegroundColor Yellow
    Write-Host "  npx playwright show-report testcases\web\results"
}

# Cleanup
Write-Host ""
Write-Host "Stopping dev server..."
Stop-Process -Id $serverJob.Id -ErrorAction SilentlyContinue

exit $testResult
```

Usage:

```powershell
# Allow script execution (one-time)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Run the web release test
.\web-release-test.ps1
```

---

## Troubleshooting (Windows-Specific)

### "npx is not recognized"
- Ensure Node.js is installed and added to PATH
- Open a **new** terminal after installing Node.js
- Verify: `node --version`

### Playwright browser download fails
- Try running as Administrator
- If behind a proxy, set: `set HTTPS_PROXY=http://your-proxy:port`
- Manual download: `npx playwright install --with-deps chromium`

### Tests timeout waiting for server
- Increase the wait time in the batch script (change `timeout /t 15` to `timeout /t 30`)
- Check if port 5000 is already in use: `netstat -ano | findstr :5000`

### "curl is not recognized" (Windows 10 older versions)
- Use PowerShell instead of Command Prompt
- Or install curl: `winget install curl.curl`
- Windows 10 (build 17063+) and Windows 11 include curl by default

### Port conflict
- Check what's using port 5000: `netstat -ano | findstr :5000`
- Kill the process: `taskkill /PID <PID_NUMBER> /F`
- Or change the port in your app config
