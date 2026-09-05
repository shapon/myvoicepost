import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { spawn } from "child_process";
import path from "path";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "myvoicepost-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const locTrackerDir = path.resolve("mobile_loc/backend");
  let locProc: ReturnType<typeof spawn> | null = null;
  const startLocTracker = () => {
    locProc = spawn("python", ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"], {
      cwd: locTrackerDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    locProc.stdout?.on("data", (d: Buffer) => log(d.toString().trim(), "loc-tracker"));
    locProc.stderr?.on("data", (d: Buffer) => log(d.toString().trim(), "loc-tracker"));
    locProc.on("error", (err) => log(`Location Tracker failed to start: ${err.message}`, "loc-tracker"));
    locProc.on("exit", (code) => {
      log(`Location Tracker exited with code ${code}, restarting in 3s...`, "loc-tracker");
      setTimeout(startLocTracker, 3000);
    });
    log("Location Tracker API starting on port 8001", "loc-tracker");
  };
  try {
    startLocTracker();
  } catch (e: any) {
    log(`Location Tracker spawn error: ${e.message}`, "loc-tracker");
  }
  process.on("exit", () => { locProc?.kill(); });
  process.on("SIGTERM", () => { locProc?.kill(); process.exit(0); });
  process.on("SIGINT", () => { locProc?.kill(); process.exit(0); });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Internal cron scheduler — runs the notification cron every hour.
  // Falls back gracefully when CRON_SECRET is not configured.
  const runInternalCron = async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      log("CRON_SECRET not set — skipping scheduled notification run", "cron");
      return;
    }
    try {
      log("Running scheduled notification cron...", "cron");
      const res = await fetch(`http://localhost:${port}/api/cron/subscription-expiry-notifications`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const body = await res.json().catch(() => ({}));
      log(`Cron finished: ${res.status} — sent=${body.notifications?.sent ?? "?"} skipped=${body.notifications?.skipped ?? "?"}`, "cron");
    } catch (err: any) {
      log(`Cron fetch error: ${err.message}`, "cron");
    }
  };

  // Run once after a 60-second delay (gives the server time to fully start),
  // then every hour thereafter.
  setTimeout(() => {
    runInternalCron();
    setInterval(runInternalCron, 60 * 60 * 1000);
  }, 60 * 1000);
})();
