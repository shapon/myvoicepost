// Runs the full release test suite (web + mobile) and emails a summary report.
//
// Usage:
//   npm run test:release                 # run web + mobile suites, then email results
//   npm run test:release -- --web-only   # run only Playwright web tests
//   npm run test:release -- --mobile-only # run only the mobile API test suite
//
// Required env vars (same ones used by server/email.ts):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM (optional, defaults to SMTP_USER)
//
// Optional:
//   RELEASE_TEST_EMAILS   comma-separated override for report recipients
//   MVP_BASE_URL          base URL for mobile API tests (default http://localhost:5000)
//   SKIP_WEB_SERVER=1      set if the app is already running (used by playwright.config.ts)

import "dotenv/config";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import nodemailer from "nodemailer";

const ROOT = process.cwd();

const DEFAULT_RECIPIENTS = [
  "shapon.talukder83@serpiancetech.com",
  "dsreekrishna@gmail.com",
];

interface SuiteResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: string[];
  ran: boolean;
  error?: string;
}

function runCommand(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd || ROOT, shell: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

async function runWebTests(): Promise<SuiteResult> {
  console.log("\n=== Running web (Playwright) tests ===\n");

  const result = await runCommand("npx", [
    "playwright",
    "test",
    "--reporter=json",
  ]);
  const code = result.code;

  let passed = 0, failed = 0, skipped = 0;
  const failedTests: string[] = [];

  try {
    const jsonStart = result.stdout.indexOf("{");
    if (jsonStart >= 0) {
      const report = JSON.parse(result.stdout.slice(jsonStart));
      const walk = (suite: any) => {
        for (const spec of suite.specs || []) {
          for (const test of spec.tests || []) {
            const outcome = test.results?.[test.results.length - 1]?.status;
            if (outcome === "passed") passed++;
            else if (outcome === "skipped") skipped++;
            else {
              failed++;
              failedTests.push(spec.title);
            }
          }
        }
        for (const s of suite.suites || []) walk(s);
      };
      for (const s of report.suites || []) walk(s);
    }
  } catch (err) {
    return { name: "Web (Playwright)", passed, failed, skipped, failedTests, ran: true, error: `Failed to parse report: ${err}` };
  }

  return { name: "Web (Playwright)", passed, failed, skipped, failedTests, ran: true, error: code !== 0 && passed === 0 && failed === 0 ? "Playwright exited with an error before producing results" : undefined };
}

async function runMobileTests(): Promise<SuiteResult> {
  console.log("\n=== Running mobile (API) test suite ===\n");
  const scriptPath = path.join(ROOT, "testcases", "mobile_android", "scripts", "run_all.sh");

  if (!existsSync(scriptPath)) {
    return { name: "Mobile Android (API)", passed: 0, failed: 0, skipped: 0, failedTests: [], ran: false, error: "run_all.sh not found" };
  }

  // bash is required (Git Bash / WSL on Windows, native on macOS/Linux).
  const { code, stdout, stderr } = await runCommand("bash", [scriptPath]);

  if (code === 127 || /not recognized|command not found/i.test(stderr)) {
    return {
      name: "Mobile Android (API)",
      passed: 0, failed: 0, skipped: 0, failedTests: [],
      ran: false,
      error: "bash is not available. Install Git for Windows (Git Bash) or run this suite from WSL.",
    };
  }

  const passed = Number(/(\d+)\s+PASSED/i.exec(stdout)?.[1] ?? 0);
  const failed = Number(/(\d+)\s+FAILED/i.exec(stdout)?.[1] ?? 0);
  const skipped = Number(/(\d+)\s+SKIPPED/i.exec(stdout)?.[1] ?? 0);
  const failedTests = [...stdout.matchAll(/FAIL\s+\[([^\]]+)\]\s+(.+)/g)].map(m => `${m[1]} ${m[2]}`.trim());

  return { name: "Mobile Android (API)", passed, failed, skipped, failedTests, ran: true, error: code !== 0 && passed === 0 && failed === 0 ? "Suite exited before producing results" : undefined };
}

function buildEmailHtml(results: SuiteResult[]): string {
  const totalPassed = results.reduce((a, r) => a + r.passed, 0);
  const totalFailed = results.reduce((a, r) => a + r.failed, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skipped, 0);
  const overallOk = totalFailed === 0 && results.every(r => !r.error);

  const rows = results.map(r => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${r.name}</td>
      <td style="padding:8px;border:1px solid #e0e0e0;color:#2e7d32;">${r.passed}</td>
      <td style="padding:8px;border:1px solid #e0e0e0;color:#c62828;">${r.failed}</td>
      <td style="padding:8px;border:1px solid #e0e0e0;color:#f9a825;">${r.skipped}</td>
      <td style="padding:8px;border:1px solid #e0e0e0;">${r.ran ? "Ran" : "Not run"}${r.error ? ` — ${r.error}` : ""}</td>
    </tr>`).join("");

  const failedList = results.flatMap(r => r.failedTests.map(t => `<li>[${r.name}] ${t}</li>`)).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;">
    <div style="background:${overallOk ? "linear-gradient(135deg,#43a047,#2e7d32)" : "linear-gradient(135deg,#e53935,#c62828)"};padding:24px;border-radius:10px 10px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;">MyVoicePost Release Test Report</h1>
      <p style="color:#fff;margin:8px 0 0;">${overallOk ? "✅ All tests passed" : "❌ Failures detected — review before release"}</p>
    </div>
    <div style="background:#fff;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;padding:24px;">
      <p><strong>Run date:</strong> ${new Date().toISOString()}</p>
      <p><strong>Totals:</strong> ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #e0e0e0;text-align:left;">Suite</th>
            <th style="padding:8px;border:1px solid #e0e0e0;text-align:left;">Passed</th>
            <th style="padding:8px;border:1px solid #e0e0e0;text-align:left;">Failed</th>
            <th style="padding:8px;border:1px solid #e0e0e0;text-align:left;">Skipped</th>
            <th style="padding:8px;border:1px solid #e0e0e0;text-align:left;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${failedList ? `<h3>Failed tests</h3><ul>${failedList}</ul>` : ""}
      <p style="color:#888;font-size:12px;margin-top:24px;">Full HTML report: <code>npx playwright show-report</code>. Mobile suite output printed to console during this run.</p>
    </div>
  </body></html>`;
}

async function sendReport(results: SuiteResult[]): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser || "";

  const recipients = (process.env.RELEASE_TEST_EMAILS?.split(",").map(e => e.trim()).filter(Boolean)) || DEFAULT_RECIPIENTS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("\n[Release Tests] SMTP_HOST/SMTP_USER/SMTP_PASS not set — skipping email, printing summary instead.\n");
    console.log(buildEmailHtml(results).replace(/<[^>]+>/g, ""));
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
    ...(smtpPort === 587 && !smtpSecure && {
      requireTLS: true,
      tls: { ciphers: "SSLv3", rejectUnauthorized: false },
    }),
  });

  const totalFailed = results.reduce((a, r) => a + r.failed, 0);
  const status = totalFailed === 0 && results.every(r => !r.error) ? "PASSED" : "FAILED";

  await transporter.sendMail({
    from: emailFrom,
    to: recipients.join(","),
    subject: `MyVoicePost Release Test Report — ${status} (${new Date().toISOString().slice(0, 10)})`,
    html: buildEmailHtml(results),
  });

  console.log(`\n[Release Tests] Report emailed to: ${recipients.join(", ")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const webOnly = args.includes("--web-only");
  const mobileOnly = args.includes("--mobile-only");

  const results: SuiteResult[] = [];

  if (!mobileOnly) results.push(await runWebTests());
  if (!webOnly) results.push(await runMobileTests());

  await sendReport(results);

  const failed = results.reduce((a, r) => a + r.failed, 0);
  const hadError = results.some(r => r.error && !r.ran);
  if (failed > 0) process.exit(1);
  if (hadError) process.exit(2);
}

main().catch((err) => {
  console.error("[Release Tests] Fatal error:", err);
  process.exit(1);
});
