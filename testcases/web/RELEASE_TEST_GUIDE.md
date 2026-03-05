# MyVoicePost - Web Release Testing Guide

## Overview

This guide covers running web test cases using Playwright:
1. Install Playwright
2. Run tests against your running web app
3. Review HTML report with screenshots
4. Decide: release or fix

---

## One-Time Setup

### Step 1: Install Playwright

```bash
# From your project root
npm install -D @playwright/test
npx playwright install chromium
```

### Step 2: Create Playwright Config

Create `playwright.config.ts` in your project root:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './testcases/web/playwright_tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5000',  // Your dev server
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [
    ['html', { outputFolder: 'testcases/web/results' }],
    ['list'],  // Terminal output
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

---

## Test File Structure

```
testcases/web/
├── playwright_tests/
│   ├── auth.spec.ts
│   ├── polish.spec.ts
│   ├── translate.spec.ts
│   ├── process.spec.ts
│   ├── saved.spec.ts
│   ├── dashboard.spec.ts
│   ├── landing.spec.ts
│   └── api.spec.ts
├── results/           (generated after test run)
│   └── index.html     (HTML report with screenshots)
└── RELEASE_TEST_GUIDE.md (this file)
```

---

## Running Tests

### Run All Tests
```bash
# Make sure your app is running first
npm run dev &

# Run the full test suite
npx playwright test

# Output:
#  ✅ auth.spec.ts - TC-W-AUTH-001 Login valid (2.3s)
#  ✅ auth.spec.ts - TC-W-AUTH-002 Login invalid (1.1s)
#  ❌ polish.spec.ts - TC-W-POL-003 Empty text (0.8s)
#  ...
#  81 tests: 76 passed, 5 failed
```

### Run Specific Category
```bash
npx playwright test auth.spec.ts        # Auth tests only
npx playwright test polish.spec.ts      # Polish tests only
npx playwright test api.spec.ts         # API tests only
```

### Run Single Test
```bash
npx playwright test -g "TC-W-AUTH-001"
```

### View HTML Report
```bash
npx playwright show-report testcases/web/results
# Opens browser with visual report, screenshots of failures, and traces
```

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
    
    // Should stay on login and show error
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('text=Invalid')).toBeVisible({ timeout: 5000 });
  });

  test('TC-W-AUTH-014: Access protected page without login', async ({ page }) => {
    // Clear any stored tokens
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('mvp_auth_token'));
    
    await page.goto('/saved');
    
    // Should redirect to login or show login prompt
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
    // Should reach the handler (401 because no token, but not 404)
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
    │
    ├── ALL PASSED (81/81) ──→ Safe to release
    │
    ├── SOME FAILED ──→ Open HTML report:
    │       │            npx playwright show-report
    │       │
    │       ├── See screenshot of failure ──→ Is it a real bug? ──→ Fix code, re-run
    │       │
    │       └── See trace of failure ──→ Is it a test issue? ──→ Update test, re-run
    │
    └── MANY FAILED ──→ Major regression. Do NOT release.
```

---

## CI/CD Script

```bash
#!/bin/bash
# web-release-test.sh

set -e

echo "=== Starting app ==="
npm run dev &
APP_PID=$!
sleep 10  # Wait for server to start

echo "=== Running Playwright tests ==="
npx playwright test --reporter=list,html 2>&1 | tee testcases/web/results/output.log

RESULT=$?

kill $APP_PID 2>/dev/null

if [ $RESULT -eq 0 ]; then
  echo "✅ ALL WEB TESTS PASSED — SAFE TO RELEASE"
else
  echo "❌ WEB TESTS FAILED — DO NOT RELEASE"
  echo "View report: npx playwright show-report testcases/web/results"
  exit 1
fi
```
