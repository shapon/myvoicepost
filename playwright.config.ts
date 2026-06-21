import { defineConfig, devices } from "@playwright/test";
import { execSync } from "child_process";

// Detect system Chromium (Nix/Linux). Falls back to CHROMIUM_PATH env var.
function detectChromium(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const path = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      { encoding: "utf8" }
    ).trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

const chromiumPath = detectChromium();

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
          // Use the system Chromium when available (required in Replit/Nix envs
          // where the Playwright-bundled headless shell is missing libglib-2.0)
          ...(chromiumPath ? { executablePath: chromiumPath } : {}),
        },
      },
    },
  ],
  // Start the dev server automatically when running tests locally.
  // In CI where the server is already running, set SKIP_WEB_SERVER=1.
  webServer: process.env.SKIP_WEB_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
