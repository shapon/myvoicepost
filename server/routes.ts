import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseStorage } from "./supabase-storage";
import {
  insertUserSchema,
  subscriptionPlans,
  userSubscriptions,
  users,
  userSettings,
  emailOtps,
  userSsoAccounts,
  USER_ROLES,
  supportRequests,
  errorLogs,
  savedTexts,
  audioLogs,
  passwordResetTokens,
  pushTokens,
  appSettings,
  crashReports,
  notificationLog,
} from "@shared/schema";
import type { UserRole } from "@shared/schema";
import nodemailer from "nodemailer";
import { transcribeAudio, transcribeAudioAuto, translateAndPolish, polishText, transformTextWithTone, transcribeAudioFromUrl, toneCategories } from "./gemini";
import { db } from "./supabase-db";
import { eq, and, gte, desc, sql, count, lt, lte } from "drizzle-orm";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getUncachableStripeClient, getStripePublishableKey, getStripeSync } from "./stripeClient";
import { runMigrations } from "stripe-replit-sync";
import { YoutubeTranscript } from "youtube-transcript";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as cheerio from "cheerio";

// JWT configuration - JWT_SECRET is required for security
const JWT_SECRET: string =
  process.env.JWT_SECRET || process.env.SESSION_SECRET || "";
if (!JWT_SECRET) {
  console.error(
    "FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set",
  );
  process.exit(1);
}
const JWT_EXPIRES_IN = "60d";

// Extend Express Request to include user from JWT
declare global {
  namespace Express {
    interface Request {
      jwtUser?: {
        userId: string;
        username: string;
        email?: string;
        role?: UserRole;
        sessionId?: string;
      };
    }
  }
}

// JWT middleware - extracts user from Bearer token
function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
        userId: string;
        username: string;
        email?: string;
        role?: UserRole;
        sessionId?: string;
      };
      req.jwtUser = decoded;
    } catch (err) {
      // Token invalid or expired - continue without user
      console.log("[JWT] Token verification failed:", (err as Error).message);
    }
  }

  next();
}

// Helper to get userId from JWT or session (prefers JWT)
function getUserId(req: Request): string | null {
  if (req.jwtUser?.userId) {
    return req.jwtUser.userId;
  }
  return null;
}

function generateSessionId(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Helper to generate JWT token with sessionId for single-device enforcement
function generateToken(userId: string, username: string, role: UserRole = "GUEST", sessionId?: string): string {
  return jwt.sign({ userId, username, role, sessionId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function storeSessionId(userId: string, sessionId: string): Promise<void> {
  await db.update(users).set({ activeSessionId: sessionId }).where(eq(users.id, userId));
}

async function validateSessionId(userId: string, sessionId?: string): Promise<boolean> {
  if (!sessionId) return true;
  const userRows = await db.select({ activeSessionId: users.activeSessionId }).from(users).where(eq(users.id, userId)).limit(1);
  if (userRows.length === 0) return false;
  return userRows[0].activeSessionId === sessionId;
}

// Use supabase storage for database operations
const storage = supabaseStorage;

// ============ RBAC: Role Refresh & Middleware ============

async function refreshUserRole(userId: string): Promise<UserRole> {
  const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userResult[0];
  if (!user) return "GUEST";

  if (user.role === "ADMIN") return "ADMIN";

  const activeSubResult = await db.select().from(userSubscriptions)
    .where(and(
      eq(userSubscriptions.userId, userId),
      eq(userSubscriptions.status, "active"),
      gte(userSubscriptions.validDateUpto, new Date()),
    ))
    .limit(1);

  const hasActiveSub = activeSubResult.length > 0;

  let newRole: UserRole;
  if (hasActiveSub) {
    newRole = "USER";
  } else {
    const now = new Date();
    const trialActive = user.trialEndsAt && !user.trialUsed && now < user.trialEndsAt;
    const trialMinutesUsed = parseFloat(user.trialMinutesUsed || "0");
    const trialMinutesTotal = user.trialMinutesTotal || 90;
    const trialHasMinutes = (trialMinutesTotal - trialMinutesUsed) > 0;

    if (trialActive && trialHasMinutes) {
      newRole = "TRIAL";
    } else {
      newRole = "GUEST";
    }
  }

  if (user.role !== newRole) {
    await storage.updateUserRole(userId, newRole);
    console.log(`[RBAC] User ${userId} role changed: ${user.role} -> ${newRole}`);
  }

  return newRole;
}

function checkRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const currentRole = await refreshUserRole(userId);

    if (currentRole === "ADMIN") {
      return next();
    }

    if (!allowedRoles.includes(currentRole)) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Insufficient permissions.",
        required_role: allowedRoles,
        current_role: currentRole,
      });
    }

    next();
  };
}

const APP_SCHEME = process.env.APP_SCHEME || "myvoicepost";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://myvoicepost.com";
const RESET_TOKEN_EXPIRY_HOURS = 1;
const TOPUP_MINUTES = 60;

const GOOGLE_SSO_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: "https://www.myvoicepost.com/api/v1/p/auth/google/callback",
  appScheme: APP_SCHEME,
};

const PROCESS_AUDIO_CFG = {
  PROCESS_AUDIO_SUPPORTED_TYPES: ["audio/webm", "audio/mp4", "audio/wav", "audio/ogg", "audio/mpeg", "audio/m4a"],
  PROCESS_AUDIO_MAX_SIZE_BYTES: 20 * 1024 * 1024,
  isAudioTypeSupported(mimeType: string) {
    return this.PROCESS_AUDIO_SUPPORTED_TYPES.some((t) => mimeType.startsWith(t));
  },
  formatMaxSize() { return "20MB"; },
};

const crashReportRateLimit: Record<string, { count: number; resetAt: number }> = {};
const CRASH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CRASH_RATE_LIMIT_MAX = 5;

const crashEmailThrottle: Record<string, number> = {};
const CRASH_EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

// Configure multer for audio file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
  },
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    // Accept audio files
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Apply JWT middleware to all API routes
  app.use("/api", jwtAuthMiddleware);


  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });



  // ============ EMAIL OTP ENDPOINTS ============

  async function sendOtpEmail(email: string, otp: string): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("[OTP EMAIL] SMTP configuration missing");
      throw new Error("Email service not configured properly");
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

    await transporter.verify();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Verify Your Email</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Verify Your Email</h2>
          <p>Hello,</p>
          <p>Your verification code for MyVoicePost registration is:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #f5f5f5; display: inline-block; padding: 20px 40px; border-radius: 10px; letter-spacing: 8px; font-size: 32px; font-weight: bold; color: #333;">${otp}</div>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
          <p style="color: #888; font-size: 13px; margin-bottom: 0;">-- The MyVoicePost Team</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} MyVoicePost. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: "MyVoicePost - Email Verification Code",
      text: `Your MyVoicePost verification code is: ${otp}. This code expires in 10 minutes.`,
      html: htmlContent,
    });

    console.log(`[OTP EMAIL] Verification code sent to ${email}`);
  }

  app.post("/api/v1/p/mail_otp", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email("Valid email is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Valid email is required",
          details: parseResult.error.errors,
        });
      }

      const { email } = parseResult.data;
      const normalizedEmail = email.toLowerCase().trim();

      const existingEmail = await storage.getUserByEmail?.(normalizedEmail);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: "Email already registered",
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.delete(emailOtps).where(eq(emailOtps.email, normalizedEmail));

      await db.insert(emailOtps).values({
        email: normalizedEmail,
        otp,
        expiresAt,
        verified: false,
      });

      await sendOtpEmail(normalizedEmail, otp);

      console.log(`[OTP] Code generated for ${normalizedEmail}, expires at ${expiresAt.toISOString()}`);

      res.json({
        success: true,
        message: "Verification code sent to your email",
      });
    } catch (error: any) {
      console.error("[OTP] Error sending OTP:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send verification code",
      });
    }
  });


  // ============================================================
  // PUBLIC API ENDPOINTS - /api/v1/p/
  // No authentication required
  // ============================================================

  // Public: Transcribe audio -- language-agnostic (auto-detect, returns all speech regardless of language)
  app.post("/api/v1/p/transcribe", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const GUEST_MAX_DURATION_SECONDS = 55;
      const GUEST_MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;

      const schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        mimeType: z.string().optional().default("audio/mp4"),
        durationSeconds: z.number().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, durationSeconds } = parseResult.data;

      if (durationSeconds !== undefined && durationSeconds > GUEST_MAX_DURATION_SECONDS) {
        return res.status(400).json({
          success: false,
          error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. Please register for a free account to record longer.`,
        });
      }

      const audioBuffer = Buffer.from(audio, "base64");

      if (audioBuffer.length > GUEST_MAX_AUDIO_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. The uploaded audio file is too large. Please register for a free account to record longer.`,
        });
      }

      console.log(
        `[Public Transcribe Auto] Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}, durationSeconds: ${durationSeconds}`,
      );

      const { text: originalText, detectedLanguage } = await transcribeAudioAuto(audioBuffer, mimeType);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Public Transcribe Auto] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        ...(detectedLanguage ? { detectedLanguage } : {}),
      });
    } catch (error: any) {
      console.error("[Public Transcribe Auto] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Public: Transcribe audio -- language-specific (only transcribes speech in the given language)
  app.post("/api/v1/p/transcribe_l", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const GUEST_MAX_DURATION_SECONDS = 55;
      const GUEST_MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;

      const schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        mimeType: z.string().optional().default("audio/mp4"),
        language: z.string().min(1, "Language is required"),
        durationSeconds: z.number().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, language, durationSeconds } = parseResult.data;

      if (durationSeconds !== undefined && durationSeconds > GUEST_MAX_DURATION_SECONDS) {
        return res.status(400).json({
          success: false,
          error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. Please register for a free account to record longer.`,
        });
      }

      const audioBuffer = Buffer.from(audio, "base64");

      if (audioBuffer.length > GUEST_MAX_AUDIO_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. The uploaded audio file is too large. Please register for a free account to record longer.`,
        });
      }

      console.log(
        `[Public Transcribe Lang] Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}, language: ${language}, durationSeconds: ${durationSeconds}`,
      );

      const originalText = await transcribeAudio(audioBuffer, mimeType, language);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Public Transcribe Lang] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        language,
      });
    } catch (error: any) {
      console.error("[Public Transcribe Lang] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Public: Polish text
  app.post("/api/v1/p/polish", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        text: z.string().min(1, "Text is required"),
        language: z.string().optional().default("en"),
        outputFormat: z.string().optional().default("professional"),
        outputType: z.string().optional().default("message"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, language, outputFormat, outputType } = parseResult.data;

      console.log(
        `[Public Polish] Text length: ${text.length}, Format: ${outputFormat}, Type: ${outputType}`,
      );

      const polishedText = await polishText(
        text,
        language,
        outputFormat,
        outputType,
      );

      res.json({
        success: true,
        originalText: text,
        polishedText,
        language,
        outputFormat,
        outputType,
      });
    } catch (error: any) {
      console.error("[Public Polish] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to polish text",
      });
    }
  });

  // Public: Translate text
  app.post("/api/v1/p/translate", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        text: z.string().min(1, "Text is required"),
        sourceLanguage: z.string().min(1, "Source language is required"),
        targetLanguage: z.string().min(1, "Target language is required"),
        outputFormat: z.string().optional().default("professional"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, sourceLanguage, targetLanguage, outputFormat } =
        parseResult.data;

      console.log(
        `[Public Translate] From: ${sourceLanguage}, To: ${targetLanguage}, Format: ${outputFormat}`,
      );

      const result = await translateAndPolish(
        text,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      );

      res.json({
        success: true,
        originalText: text,
        translatedText: result.translatedText,
        polishedText: result.polishedText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });
    } catch (error: any) {
      console.error("[Public Translate] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to translate text",
      });
    }
  });

  // Public: Login (no auth required - user provides credentials to get token)
  app.post("/api/v1/p/auth/login", async (req, res) => {
    try {
      const loginSchema = z.object({
        identifier: z.string().min(1, "Username or email is required"),
        password: z.string().min(1, "Password is required"),
      });

      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { identifier, password } = parseResult.data;

      // Check if identifier is email or username
      const isEmail = identifier.includes("@");
      let user;

      if (isEmail) {
        user = await storage.getUserByEmail?.(identifier);
      } else {
        user = await storage.getUserByUsername(identifier);
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          error: "No account found with this email. Please check your email or sign up.",
        });
      }

      // Validate password
      const isValidPassword = await storage.validatePassword?.(user, password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: "Incorrect password. Please try again or reset your password.",
        });
      }

      // Generate session ID for single-device enforcement
      const sessionId = generateSessionId();
      await storeSessionId(user.id, sessionId);

      // Generate JWT token (valid for 60 days)
      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username, sessionId },
        JWT_SECRET,
        { expiresIn: "60d" },
      );

      // Check trial expiry on login and auto-assign pending_payment if needed
      const userRecord = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const fullUser = userRecord[0];

      let trialExpired = false;
      if (fullUser && fullUser.trialEndsAt && !fullUser.trialUsed) {
        const now = new Date();
        const trialMinutesUsed = parseFloat(fullUser.trialMinutesUsed || "0");
        const trialMinutesTotal = fullUser.trialMinutesTotal || 90;
        const trialMinutesRemaining = trialMinutesTotal - trialMinutesUsed;

        if (now > fullUser.trialEndsAt || trialMinutesRemaining <= 0) {
          trialExpired = true;

          // Check if user already has any subscription
          const existingSub = await db
            .select()
            .from(userSubscriptions)
            .where(eq(userSubscriptions.userId, user.id))
            .limit(1);

          if (existingSub.length === 0) {
            // Auto-assign default plan with pending_payment status
            const defaultPlanResult = await db
              .select()
              .from(subscriptionPlans)
              .where(eq(subscriptionPlans.isDefault, true))
              .limit(1);

            if (defaultPlanResult.length > 0) {
              const defaultPlan = defaultPlanResult[0];
              await db.insert(userSubscriptions).values({
                userId: user.id,
                planId: defaultPlan.id,
                validDateUpto: new Date(),
                minutesUsed: 0,
                chunksUsed: 0,
                minutesRemaining: "0",
                status: "pending_payment",
              });
              console.log(
                `[Login] Trial expired for ${user.username}, auto-assigned ${defaultPlan.name} with pending_payment`,
              );
            }
          }
        }
      }

      const currentRole = await refreshUserRole(user.id);
      console.log(`[Public Login] User ${user.username} logged in successfully, role: ${currentRole}`);

      res.json({
        success: true,
        token,
        expiresIn: 60 * 24 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: currentRole,
        },
        trial_expired: trialExpired,
      });
    } catch (error: any) {
      console.error("[Public Login] Error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed",
      });
    }
  });

  // Public: Signup (no auth required - user creates account then gets token)
  app.post("/api/v1/p/auth/signup", async (req, res) => {
    try {
      const signupSchemaPublic = z
        .object({
          username: z.string().min(3, "Username must be at least 3 characters"),
          email: z.string().email("Valid email is required"),
          password: z.string().min(6, "Password must be at least 6 characters"),
          confirmPassword: z.string(),
          otp: z.string().length(6, "6-digit verification code is required"),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Passwords don't match",
          path: ["confirmPassword"],
        });

      const parseResult = signupSchemaPublic.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { username, email, password, otp } = parseResult.data;
      const normalizedEmail = email.toLowerCase().trim();

      const otpRecords = await db.select().from(emailOtps)
        .where(and(eq(emailOtps.email, normalizedEmail), eq(emailOtps.otp, otp)))
        .limit(1);

      if (otpRecords.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid verification code",
        });
      }

      const otpRecord = otpRecords[0];
      if (new Date() > otpRecord.expiresAt) {
        return res.status(400).json({
          success: false,
          error: "Verification code has expired. Please request a new one.",
        });
      }

      // Check if username exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Username already exists",
        });
      }

      // Check if email exists
      const existingEmailUser = await storage.getUserByEmail?.(normalizedEmail);
      if (existingEmailUser) {
        return res.status(409).json({
          success: false,
          error: "Email already exists",
        });
      }

      await db.delete(emailOtps).where(eq(emailOtps.email, normalizedEmail));

      // Create user
      const user = await storage.createUser({ username, email: normalizedEmail, password });

      // Initialize trial: 7 days, 90 minutes
      const trialStartsAt = new Date();
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      await db
        .update(users)
        .set({
          trialStartsAt,
          trialEndsAt,
          trialUsed: false,
          trialMinutesTotal: 90,
          trialMinutesUsed: "0",
        })
        .where(eq(users.id, user.id));

      // Generate session ID for single-device enforcement
      const sessionId = generateSessionId();
      await storeSessionId(user.id, sessionId);

      // Generate JWT token (valid for 60 days)
      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username, sessionId },
        JWT_SECRET,
        { expiresIn: "60d" },
      );

      console.log(`[Public Signup] User ${user.username} created successfully with 7-day trial`);

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        token,
        expiresIn: 60 * 24 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
        trial: {
          starts_at: trialStartsAt.toISOString(),
          ends_at: trialEndsAt.toISOString(),
          minutes_total: 90,
          minutes_used: 0,
          minutes_remaining: 90,
        },
      });
    } catch (error: any) {
      console.error("[Public Signup] Error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create account",
      });
    }
  });

  // GET /api/v1/wp/auth/google/config - Web-specific: Get Google Client ID for frontend GSI
  app.get("/api/v1/wp/auth/google/config", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    res.json({ success: true, clientId });
  });

  // ============================================================
  // GOOGLE SSO ENDPOINT - /api/v1/p/auth/google
  // Accepts Google ID token, verifies it, creates/links user, returns JWT
  // ============================================================

  app.post("/api/v1/p/auth/google", async (req, res) => {
    try {
      const schema = z.object({
        idToken: z.string().min(1, "Google ID token is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { idToken } = parseResult.data;

      const googleResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
      );

      if (!googleResponse.ok) {
        console.error("[Google SSO] Token verification failed:", googleResponse.status);
        return res.status(401).json({
          success: false,
          error: "Invalid Google token. Please try again.",
        });
      }

      const googleUser = await googleResponse.json() as {
        sub: string;
        email: string;
        email_verified: string;
        name: string;
        picture: string;
      };

      if (!googleUser.email || googleUser.email_verified !== "true") {
        return res.status(401).json({
          success: false,
          error: "Google account email is not verified.",
        });
      }

      const normalizedEmail = googleUser.email.toLowerCase().trim();
      const googleId = googleUser.sub;

      console.log(`[Google SSO] Verified Google user: email=${normalizedEmail}, googleId=${googleId}`);

      const existingSso = await db.select().from(userSsoAccounts)
        .where(and(eq(userSsoAccounts.provider, "google"), eq(userSsoAccounts.providerUserId, googleId)))
        .limit(1);

      if (existingSso.length > 0) {
        const sso = existingSso[0];
        const userRows = await db.select().from(users).where(eq(users.id, sso.userId)).limit(1);
        if (userRows.length > 0) {
          const user = userRows[0];
          const currentRole = await refreshUserRole(user.id);
          const ssoSessionId = generateSessionId();
          await storeSessionId(user.id, ssoSessionId);
          const token = generateToken(user.id, user.username, currentRole, ssoSessionId);

          await db.update(userSsoAccounts)
            .set({ providerEmail: normalizedEmail, providerName: googleUser.name, providerAvatar: googleUser.picture, updatedAt: new Date() })
            .where(eq(userSsoAccounts.id, sso.id));

          return res.json({
            success: true,
            token,
            expiresIn: 60 * 24 * 60 * 60,
            user: { id: user.id, email: user.email, username: user.username, role: currentRole },
            isNewUser: false,
          });
        }
      }

      const existingEmailUser = await db.select().from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingEmailUser.length > 0) {
        const user = existingEmailUser[0];

        await db.insert(userSsoAccounts).values({
          userId: user.id,
          provider: "google",
          providerUserId: googleId,
          providerEmail: normalizedEmail,
          providerName: googleUser.name,
          providerAvatar: googleUser.picture,
        }).onConflictDoNothing();

        const currentRole = await refreshUserRole(user.id);
        const emailSsoSessionId = generateSessionId();
        await storeSessionId(user.id, emailSsoSessionId);
        const token = generateToken(user.id, user.username, currentRole, emailSsoSessionId);

        return res.json({
          success: true,
          token,
          expiresIn: 60 * 24 * 60 * 60,
          user: { id: user.id, email: user.email, username: user.username, role: currentRole },
          isNewUser: false,
        });
      }

      const googleName = googleUser.name || normalizedEmail.split("@")[0];
      let baseUsername = googleName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
      if (baseUsername.length < 3) baseUsername = "user" + baseUsername;

      let finalUsername = baseUsername;
      let suffix = 1;
      while (true) {
        const existing = await db.select().from(users)
          .where(eq(users.username, finalUsername))
          .limit(1);
        if (existing.length === 0) break;
        finalUsername = `${baseUsername}${suffix}`;
        suffix++;
        if (suffix > 100) {
          finalUsername = `user_${crypto.randomUUID().substring(0, 8)}`;
          break;
        }
      }

      const user = await storage.createUser({ username: finalUsername, email: normalizedEmail, password: crypto.randomUUID() });

      const trialStartsAt = new Date();
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      await db
        .update(users)
        .set({
          trialStartsAt,
          trialEndsAt,
          trialUsed: false,
          trialMinutesTotal: 90,
          trialMinutesUsed: "0",
          role: "GUEST",
        })
        .where(eq(users.id, user.id));

      await db.insert(userSsoAccounts).values({
        userId: user.id,
        provider: "google",
        providerUserId: googleId,
        providerEmail: normalizedEmail,
        providerName: googleUser.name,
        providerAvatar: googleUser.picture,
      });

      const newUserSessionId = generateSessionId();
      await storeSessionId(user.id, newUserSessionId);
      const token = generateToken(user.id, user.username, "GUEST", newUserSessionId);

      console.log(`[Google SSO] New user created: userId=${user.id}, username=${user.username}`);

      res.status(201).json({
        success: true,
        token,
        expiresIn: 60 * 24 * 60 * 60,
        user: { id: user.id, email: user.email, username: user.username, role: "GUEST" },
        isNewUser: true,
        trial: {
          starts_at: trialStartsAt.toISOString(),
          ends_at: trialEndsAt.toISOString(),
          minutes_total: 90,
          minutes_used: 0,
          minutes_remaining: 90,
        },
      });
    } catch (error: any) {
      console.error("[Google SSO] Error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to authenticate with Google",
      });
    }
  });

  // ============================================================
  // AUTHENTICATED API ENDPOINTS - /api/v1/a/
  // All endpoints require JWT authentication
  // ============================================================

  // Mobile JWT middleware - validates token and checks expiry (used for all mobile endpoints except login)
  async function mobileAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please provide a valid token.",
      });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
        userId: string;
        username: string;
        email?: string;
        role?: UserRole;
        sessionId?: string;
        exp?: number;
      };
      req.jwtUser = decoded;

      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        return res.status(401).json({
          success: false,
          error: "Token has expired. Please login again.",
        });
      }

      if (decoded.sessionId && decoded.userId) {
        const isValidSession = await validateSessionId(decoded.userId, decoded.sessionId);
        if (!isValidSession) {
          return res.status(401).json({
            success: false,
            error: "SESSION_REPLACED",
            message: "Your account has been logged in on another device. You have been logged out from this device.",
          });
        }
      }

      next();
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: "Token has expired. Please login again.",
        });
      }
      return res.status(401).json({
        success: false,
        error: "Invalid token. Please login again.",
      });
    }
  }

  // Mobile Auth: Logout (client-side token removal, server just acknowledges)
  app.post("/api/v1/a/auth/logout", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (userId) {
        await db.update(users).set({ activeSessionId: null }).where(eq(users.id, userId));
      }
    } catch (err) {
      console.error("[Logout] Error clearing session:", err);
    }
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  });

  // Mobile Auth: Verify token and get user info (with live role refresh)
  app.get("/api/v1/a/auth/me", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const currentRole = await refreshUserRole(userId);
      res.json({
        success: true,
        user: {
          id: req.jwtUser?.userId,
          email: req.jwtUser?.email,
          username: req.jwtUser?.username,
          role: currentRole,
        },
      });
    } catch (error: any) {
      console.error("[Auth Me] Error refreshing role:", error);
      res.json({
        success: true,
        user: {
          id: req.jwtUser?.userId,
          email: req.jwtUser?.email,
          username: req.jwtUser?.username,
          role: req.jwtUser?.role || "GUEST",
        },
      });
    }
  });

  // Mobile: Transcribe audio -- language-agnostic (auto-detect ALL speech regardless of language)
  app.post("/api/v1/a/transcribe", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        mimeType: z.string().optional().default("audio/mp4"),
        durationSeconds: z.number().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, durationSeconds } = parseResult.data;
      const audioBuffer = Buffer.from(audio, "base64");

      console.log(
        `[Mobile Transcribe Auto] User: ${userId}, Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}, durationSeconds: ${durationSeconds}`,
      );

      const { text: originalText, detectedLanguage } = await transcribeAudioAuto(audioBuffer, mimeType);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Mobile Transcribe Auto] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        ...(detectedLanguage ? { detectedLanguage } : {}),
      });
    } catch (error: any) {
      console.error("[Mobile Transcribe Auto] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Mobile: Transcribe audio -- language-specific (returns ONLY speech in the given language)
  app.post("/api/v1/a/transcribe_l", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        mimeType: z.string().optional().default("audio/mp4"),
        language: z.string().min(1, "Language is required"),
        durationSeconds: z.number().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, language, durationSeconds } = parseResult.data;
      const audioBuffer = Buffer.from(audio, "base64");

      console.log(
        `[Mobile Transcribe Lang] User: ${userId}, Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}, language: ${language}, durationSeconds: ${durationSeconds}`,
      );

      const originalText = await transcribeAudio(audioBuffer, mimeType, language);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Mobile Transcribe Lang] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        language,
      });
    } catch (error: any) {
      console.error("[Mobile Transcribe Lang] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Mobile: Multipart transcribe — accepts up to 6 audio snippets (10s each = 60s batch)
  // Fields: snippet_0 … snippet_N (files), mimeType (optional string body field)
  app.post("/api/v1/a/mp/transcribe", mobileAuthMiddleware, upload.any(), async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({ success: false, error: "Gemini AI integration not configured" });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ success: false, error: "At least one audio snippet is required" });
      }

      const mimeType = (req.body.mimeType as string | undefined) || "audio/mp4";

      // Sort files by fieldname (snippet_0, snippet_1, …) for chronological order
      const sorted = [...files].sort((a, b) => {
        const ai = parseInt(a.fieldname.replace(/\D/g, '') || '0', 10);
        const bi = parseInt(b.fieldname.replace(/\D/g, '') || '0', 10);
        return ai - bi;
      });

      console.log(`[MP Transcribe Auto] User: ${userId}, snippets: ${sorted.length}, mimeType: ${mimeType}`);

      const parts: string[] = [];
      for (const file of sorted) {
        const text = await transcribeAudioAuto(file.buffer, mimeType);
        if (text.text && text.text.trim()) parts.push(text.text.trim());
      }

      const originalText = parts.join(' ');

      if (!originalText) {
        return res.status(400).json({ success: false, error: "Could not transcribe audio. Please try speaking more clearly." });
      }

      console.log(`[MP Transcribe Auto] Success: ${parts.length} snippets, ${originalText.length} chars`);

      return res.json({ success: true, originalText });
    } catch (error: any) {
      console.error("[MP Transcribe Auto] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to transcribe audio" });
    }
  });

  // Mobile: Multipart language-specific transcribe
  // Fields: snippet_0 … snippet_N (files), language (required string body field), mimeType (optional)
  app.post("/api/v1/a/mp/transcribe_l", mobileAuthMiddleware, upload.any(), async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({ success: false, error: "Gemini AI integration not configured" });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ success: false, error: "At least one audio snippet is required" });
      }

      const language = req.body.language as string | undefined;
      if (!language) {
        return res.status(400).json({ success: false, error: "language is required" });
      }
      const mimeType = (req.body.mimeType as string | undefined) || "audio/mp4";

      // Sort files by fieldname for chronological order
      const sorted = [...files].sort((a, b) => {
        const ai = parseInt(a.fieldname.replace(/\D/g, '') || '0', 10);
        const bi = parseInt(b.fieldname.replace(/\D/g, '') || '0', 10);
        return ai - bi;
      });

      console.log(`[MP Transcribe Lang] User: ${userId}, snippets: ${sorted.length}, language: ${language}, mimeType: ${mimeType}`);

      const parts: string[] = [];
      for (const file of sorted) {
        const text = await transcribeAudio(file.buffer, mimeType, language);
        if (text && text.trim()) parts.push(text.trim());
      }

      const originalText = parts.join(' ');

      if (!originalText) {
        return res.status(400).json({ success: false, error: "Could not transcribe audio. Please try speaking more clearly." });
      }

      console.log(`[MP Transcribe Lang] Success: ${parts.length} snippets, ${originalText.length} chars`);

      return res.json({ success: true, originalText, language });
    } catch (error: any) {
      console.error("[MP Transcribe Lang] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to transcribe audio" });
    }
  });

  // Mobile: Polish text
  app.post("/api/v1/a/polish", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        originalText: z.string().min(1, "Original text is required"),
        language: z.string().optional().default("en"),
        outputFormat: z.string().optional().default("paragraph"),
        outputType: z.string().optional().default("general"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { originalText, language, outputFormat, outputType } =
        parseResult.data;

      console.log(
        `[Mobile Polish] User: ${userId}, Text length: ${originalText.length}, Lang: ${language}`,
      );

      const polishedText = await polishText(
        originalText,
        language,
        outputFormat,
        outputType,
      );

      console.log(
        `[Mobile Polish] Success: "${polishedText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        polishedText,
        language,
        outputFormat,
        outputType,
      });
    } catch (error: any) {
      console.error("[Mobile Polish] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to polish text",
      });
    }
  });

  // Mobile: Translate text
  app.post("/api/v1/a/translate", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        originalText: z.string().min(1, "Original text is required"),
        sourceLanguage: z.string().optional().default("en"),
        targetLanguage: z.string().min(1, "Target language is required"),
        outputFormat: z.string().optional().default("paragraph"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { originalText, sourceLanguage, targetLanguage, outputFormat } =
        parseResult.data;

      console.log(
        `[Mobile Translate] User: ${userId}, ${sourceLanguage} -> ${targetLanguage}`,
      );

      const { translatedText, polishedText } = await translateAndPolish(
        originalText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      );

      console.log(
        `[Mobile Translate] Success: "${translatedText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        translatedText,
        polishedText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });
    } catch (error: any) {
      console.error("[Mobile Translate] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to translate text",
      });
    }
  });

  // Process: Get available tone categories
  app.get("/api/v1/a/tone-categories", (req, res) => {
    res.json({ success: true, categories: toneCategories });
  });

  // === YouTube + Webpage URL Processing ===

  function extractYouTubeVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("/")[0] || null;
      if (parsed.hostname.includes("youtube.com")) {
        const v = parsed.searchParams.get("v");
        if (v) return v;
        const pathMatch = parsed.pathname.match(/\/(?:embed|v|shorts)\/([^/?]+)/);
        if (pathMatch) return pathMatch[1];
      }
      return null;
    } catch { return null; }
  }

  async function transcribeYouTubeViaGemini(videoId: string): Promise<string> {
    console.log(`[YouTube] Transcribing video via Gemini AI for: ${videoId}`);
    const { GoogleGenAI } = await import("@google/genai");
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!geminiKey) throw new Error("No Gemini API key configured for YouTube transcription");
    const youtubeAi = new GoogleGenAI({
      apiKey: geminiKey,
    });

    const response = await youtubeAi.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: `https://www.youtube.com/watch?v=${videoId}`,
                mimeType: "video/mp4",
              },
            },
            {
              text: "Transcribe ALL the spoken words in this video. Return ONLY the raw transcript text. Do not include timestamps, speaker labels, descriptions of sounds, or any commentary. Just the spoken words.",
            },
          ],
        },
      ],
    });

    const text = response.text?.trim();
    if (!text) throw new Error("Gemini returned empty transcription");
    console.log(`[YouTube] Gemini transcribed ${text.length} chars for video: ${videoId}`);
    return text;
  }

  async function extractYouTubeTranscript(url: string): Promise<{ text: string; detectedLanguage: string }> {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    try {
      const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
      if (!transcriptItems || transcriptItems.length === 0) throw new Error("No transcript available");
      const text = transcriptItems.map((item: any) => item.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("Transcript is empty");
      console.log(`[YouTube] Got transcript via caption API for video: ${videoId}`);
      return { text, detectedLanguage: "auto" };
    } catch (transcriptError: any) {
      console.log(`[YouTube] Caption API failed for ${videoId}: ${transcriptError.message}`);
      console.log(`[YouTube] Falling back to Gemini AI direct video transcription...`);
      try {
        const transcribedText = await transcribeYouTubeViaGemini(videoId);
        return { text: transcribedText, detectedLanguage: "auto" };
      } catch (geminiError: any) {
        console.error(`[YouTube] Gemini transcription also failed for ${videoId}:`, geminiError.message);
        throw new Error(`Could not process this YouTube video. Captions are not available and AI transcription failed: ${geminiError.message}`);
      }
    }
  }

  async function extractWebpageText(url: string): Promise<{ text: string; detectedLanguage: string }> {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MyVoicePost/1.0)", "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, iframe, noscript, .sidebar, .menu, .nav, .footer, .header, .ad, .advertisement, [role='navigation'], [role='banner'], [role='contentinfo']").remove();
    let mainText = "";
    const mainSelectors = ["article", "main", '[role="main"]', ".post-content", ".entry-content", ".article-body", ".story-body"];
    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 100) { mainText = el.text().trim(); break; }
    }
    if (!mainText) mainText = $("body").text().trim();
    mainText = mainText.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (mainText.length > 15000) mainText = mainText.substring(0, 15000);
    if (!mainText || mainText.length < 20) throw new Error("Could not extract meaningful text from the URL");
    const htmlLang = $("html").attr("lang") || "";
    const detectedLanguage = htmlLang ? htmlLang.substring(0, 2).toLowerCase() : "auto";
    return { text: mainText, detectedLanguage };
  }

  async function detectTextLanguage(text: string): Promise<string> {
    if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY) return "en";
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
        httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
      });
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Detect the language of this text and return the ISO 639-1 two-letter language code only (e.g. "en", "es", "fr"). Text: "${text.substring(0, 500)}"`,
        config: { temperature: 0 },
      });
      const code = (response.text || "en").trim().toLowerCase().replace(/[^a-z]/g, "").substring(0, 2);
      return code || "en";
    } catch { return "en"; }
  }

  // Process URL (YouTube + Webpage) - Public
  app.post("/api/v1/p/process-url", async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().url("Valid URL is required"),
        targetLanguage: z.string().min(1, "Target language is required"),
      });
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, error: "Invalid request", details: parseResult.error.errors });
      }
      const { url, targetLanguage } = parseResult.data;
      console.log(`[Process-URL Public] url=${url}, targetLanguage=${targetLanguage}`);

      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      let extracted: { text: string; detectedLanguage: string };
      if (isYouTube) {
        extracted = await extractYouTubeTranscript(url);
      } else {
        extracted = await extractWebpageText(url);
      }

      let sourceLanguage = extracted.detectedLanguage;
      if (sourceLanguage === "auto") {
        sourceLanguage = await detectTextLanguage(extracted.text);
      }

      let translatedText = extracted.text;
      if (sourceLanguage !== targetLanguage) {
        const result = await translateAndPolish(extracted.text, sourceLanguage, targetLanguage, "professional");
        translatedText = result.polishedText || result.translatedText || extracted.text;
      }

      res.json({
        success: true,
        sourceText: extracted.text,
        targetText: translatedText,
        sourceLanguage,
        targetLanguage,
        sourceType: isYouTube ? "youtube" : "webpage",
      });
    } catch (error: any) {
      console.error("[Process-URL Public] Error:", error.message);
      res.status(500).json({ success: false, error: error.message || "Failed to process URL" });
    }
  });

  // Process URL (YouTube + Webpage) - Mobile authenticated
  app.post("/api/v1/a/process-url", mobileAuthMiddleware, async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().url("Valid URL is required"),
        targetLanguage: z.string().min(1, "Target language is required"),
      });
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, error: "Invalid request", details: parseResult.error.errors });
      }
      const { url, targetLanguage } = parseResult.data;
      const userId = req.jwtUser?.userId;
      console.log(`[Process-URL Mobile] userId=${userId}, url=${url}, targetLanguage=${targetLanguage}`);

      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      let extracted: { text: string; detectedLanguage: string };
      if (isYouTube) {
        extracted = await extractYouTubeTranscript(url);
      } else {
        extracted = await extractWebpageText(url);
      }

      let sourceLanguage = extracted.detectedLanguage;
      if (sourceLanguage === "auto") {
        sourceLanguage = await detectTextLanguage(extracted.text);
      }

      let translatedText = extracted.text;
      if (sourceLanguage !== targetLanguage) {
        const result = await translateAndPolish(extracted.text, sourceLanguage, targetLanguage, "professional");
        translatedText = result.polishedText || result.translatedText || extracted.text;
      }

      res.json({
        success: true,
        sourceText: extracted.text,
        targetText: translatedText,
        sourceLanguage,
        targetLanguage,
        sourceType: isYouTube ? "youtube" : "webpage",
      });
    } catch (error: any) {
      console.error("[Process-URL Mobile] Error:", error.message);
      res.status(500).json({ success: false, error: error.message || "Failed to process URL" });
    }
  });

  // Process: Transcribe audio from URL
  app.post("/api/v1/a/transcribe-url", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        url: z.string().url("Please provide a valid URL"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { url } = parseResult.data;
      console.log(`[Process Transcribe-URL] Fetching audio from: ${url}`);

      const transcribedText = await transcribeAudioFromUrl(url);

      if (!transcribedText || transcribedText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio from the provided URL. The file may not contain speech.",
        });
      }

      console.log(`[Process Transcribe-URL] Success: "${transcribedText.substring(0, 100)}..."`);

      res.json({
        success: true,
        transcribedText: transcribedText.trim(),
      });
    } catch (error: any) {
      console.error("[Process Transcribe-URL] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio from URL",
      });
    }
  });

  // Process: Transcribe uploaded audio file
  app.post("/api/v1/a/transcribe-file", upload.single("audio"), async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No audio file provided",
        });
      }

      const fileLanguage = (req.body?.language as string) || "en";
      console.log(`[Process Transcribe-File] File: ${req.file.originalname}, Size: ${req.file.size} bytes, MIME: ${req.file.mimetype}, lang: ${fileLanguage}`);

      const transcribedText = await transcribeAudio(req.file.buffer, req.file.mimetype, fileLanguage);

      if (!transcribedText || transcribedText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. The file may not contain speech.",
        });
      }

      console.log(`[Process Transcribe-File] Success: "${transcribedText.substring(0, 100)}..."`);

      res.json({
        success: true,
        transcribedText: transcribedText.trim(),
      });
    } catch (error: any) {
      console.error("[Process Transcribe-File] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio file",
      });
    }
  });

  // Image Generation: Generate image from text content
  app.post("/api/v1/a/generate-image", mobileAuthMiddleware, async (req, res) => {
    try {
      const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return res.status(500).json({ success: false, error: "Gemini API key not configured" });
      }

      const schema = z.object({
        prompt: z.string().min(1, "Image description is required").max(4000, "Description too long"),
        size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).optional().default("1024x1024"),
        quality: z.enum(["standard", "hd"]).optional().default("standard"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, error: "Invalid request", details: parseResult.error.errors });
      }

      const { prompt, size, quality } = parseResult.data;
      const userId = req.jwtUser?.userId;
      console.log(`[IMAGE GEN] userId=${userId}, size=${size}, quality=${quality}, promptLength=${prompt.length}`);

      const UNSAFE_KEYWORDS = [
        "nude", "nudity", "naked", "topless", "nsfw", "porn", "pornography", "explicit",
        "sex", "sexual", "erotic", "hentai", "xxx",
        "kill", "killing", "murder", "stab", "stabbing", "shoot", "shooting", "decapitate",
        "gore", "gory", "bloody", "blood", "dismember", "mutilate", "torture", "beheading",
        "gun", "rifle", "pistol", "shotgun", "firearm", "assault rifle", "machine gun",
        "bomb", "grenade", "explosive", "missile", "knife attack",
        "drug", "drugs", "cocaine", "heroin", "meth", "marijuana", "cannabis", "weed",
        "smoking", "cigarette", "vaping", "alcohol", "drunk", "beer", "wine", "whiskey",
        "horror", "scary", "terrifying", "nightmare", "demon", "demonic", "satan", "satanic",
        "zombie", "undead", "corpse", "dead body", "skull", "skeleton",
        "racist", "racism", "hate", "nazi", "swastika", "terrorist", "terrorism",
        "suicide", "self-harm", "cutting", "hanging",
        "child abuse", "abuse", "assault", "kidnap", "trafficking",
        "bikini", "lingerie", "underwear", "bra", "panties", "thong",
        "strip", "stripper", "prostitute", "escort",
      ];

      const promptLower = prompt.toLowerCase();
      const detectedUnsafe = UNSAFE_KEYWORDS.filter(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(promptLower);
      });

      if (detectedUnsafe.length > 0) {
        console.log(`[IMAGE GEN] BLOCKED - unsafe keywords for user ${userId}: ${detectedUnsafe.join(', ')}`);
        return res.status(400).json({
          success: false,
          error: "Your image description contains content that is not allowed. Please keep it family-friendly.",
        });
      }

      const SAFETY_PREFIX = "IMPORTANT: This image must be completely safe, family-friendly, and appropriate for all ages including children. " +
        "Do not include any violence, gore, weapons, nudity, sexual content, drugs, alcohol, tobacco, " +
        "scary or disturbing imagery, hateful symbols, or any content inappropriate for minors. " +
        "The image should be clean, wholesome, and suitable for a general audience. " +
        "Now generate the following: ";

      const { GoogleGenAI } = await import("@google/genai");
      const geminiAi = new GoogleGenAI({ apiKey: geminiKey });

      const response = await geminiAi.models.generateContent({
        model: "gemini-2.0-flash-exp-image-generation",
        contents: [SAFETY_PREFIX + prompt],
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });

      let imageBase64 = "";
      let responseText = "";

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            imageBase64 = part.inlineData.data;
          }
          if (part.text) {
            responseText = part.text;
          }
        }
      }

      if (!imageBase64) {
        throw new Error("No image data received from Gemini");
      }

      console.log(`[IMAGE GEN] Success for user ${userId}`);
      res.json({ success: true, imageBase64, revisedPrompt: responseText || prompt });
    } catch (error: any) {
      console.error("[IMAGE GEN] Error:", error.message);
      const errorMsg = (error.message || "").toLowerCase();
      if (errorMsg.includes("safety") || errorMsg.includes("blocked") || errorMsg.includes("policy")) {
        return res.status(400).json({ success: false, error: "Image rejected by safety filter. Please modify your description." });
      }
      if (errorMsg.includes("quota") || errorMsg.includes("rate") || error?.status === 429) {
        return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
      }
      res.status(500).json({ success: false, error: error.message || "Failed to generate image" });
    }
  });

  // Process: Transform text with selected tone
  app.post("/api/v1/a/transform-tone", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        text: z.string().min(1, "Text is required"),
        toneId: z.string().min(1, "Tone selection is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, toneId } = parseResult.data;

      console.log(`[Process Transform-Tone] Tone: ${toneId}, Text length: ${text.length}`);

      const transformedText = await transformTextWithTone(text, toneId);

      console.log(`[Process Transform-Tone] Success: "${transformedText.substring(0, 100)}..."`);

      res.json({
        success: true,
        originalText: text,
        transformedText,
        toneId,
      });
    } catch (error: any) {
      console.error("[Process Transform-Tone] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transform text with tone",
      });
    }
  });

  // Public: Get tone categories (also available at /api/v1/p/)
  app.get("/api/v1/p/tone-categories", (req, res) => {
    res.json({ success: true, categories: toneCategories });
  });

  // Public: Transform text with selected tone (also available at /api/v1/p/)
  app.post("/api/v1/p/transform-tone", async (req, res) => {
    try {
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          success: false,
          error: "Gemini AI integration not configured",
        });
      }

      const schema = z.object({
        text: z.string().min(1, "Text is required"),
        toneId: z.string().min(1, "Tone selection is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, toneId } = parseResult.data;

      console.log(`[Process Public Transform-Tone] Tone: ${toneId}, Text length: ${text.length}`);

      const transformedText = await transformTextWithTone(text, toneId);

      res.json({
        success: true,
        originalText: text,
        transformedText,
        toneId,
      });
    } catch (error: any) {
      console.error("[Process Public Transform-Tone] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transform text with tone",
      });
    }
  });

  // Mobile: Save text to database
  app.post("/api/v1/a/saved-texts", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId!;

      const schema = z.object({
        type: z.enum(["polish", "translate"]),
        originalText: z.string().min(1, "Original text is required"),
        polishedText: z.string().min(1, "Polished text is required"),
        translatedText: z.string().nullable().optional(),
        sourceLanguage: z.string().min(1, "Source language is required"),
        targetLanguage: z.string().nullable().optional(),
        outputFormat: z.string().min(1, "Output format is required"),
        outputType: z.string().nullable().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const savedText = await storage.createSavedText({
        userId,
        ...parseResult.data,
      });

      console.log(
        `[Mobile Save] User: ${userId}, Type: ${parseResult.data.type}, ID: ${savedText.id}`,
      );

      res.json({
        success: true,
        savedText,
      });
    } catch (error: any) {
      console.error("[Mobile Save] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to save text",
      });
    }
  });

  // Mobile: Get saved texts for logged user
  app.get("/api/v1/a/saved-texts", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId!;

      const type = req.query.type as string | undefined;
      const savedTexts = await storage.getSavedTextsByUser(userId, type);

      res.json({
        success: true,
        savedTexts,
        count: savedTexts.length,
      });
    } catch (error: any) {
      console.error("[Mobile Get Saved] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to get saved texts",
      });
    }
  });

  // Mobile: Get single saved text by ID
  app.get(
    "/api/v1/a/saved-texts/:id",
    mobileAuthMiddleware,
    async (req, res) => {
      try {
        const userId = req.jwtUser?.userId!;

        const savedText = await storage.getSavedText(req.params.id);

        if (!savedText || savedText.userId !== userId) {
          return res.status(404).json({
            success: false,
            error: "Saved text not found",
          });
        }

        res.json({
          success: true,
          savedText,
        });
      } catch (error: any) {
        console.error("[Mobile Get Single] Error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to get saved text",
        });
      }
    },
  );

  // Mobile: Update saved text by ID
  app.put(
    "/api/v1/a/saved-texts/:id",
    mobileAuthMiddleware,
    async (req, res) => {
      try {
        const userId = req.jwtUser?.userId!;

        const { id } = req.params;

        const schema = z.object({
          type: z.enum(["polish", "translate"]).optional(),
          originalText: z.string().optional(),
          polishedText: z.string().optional(),
          translatedText: z.string().nullable().optional(),
          sourceLanguage: z.string().optional(),
          targetLanguage: z.string().nullable().optional(),
          outputFormat: z.string().optional(),
          outputType: z.string().nullable().optional(),
        });

        const parseResult = schema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: "Invalid request",
            details: parseResult.error.errors,
          });
        }

        const updatedText = await storage.updateSavedText(
          id,
          userId,
          parseResult.data,
        );

        if (!updatedText) {
          return res.status(404).json({
            success: false,
            error:
              "Saved text not found or you do not have permission to edit it",
          });
        }

        console.log(`[Mobile Update] User: ${userId}, ID: ${id}`);

        res.json({
          success: true,
          savedText: updatedText,
        });
      } catch (error: any) {
        console.error("[Mobile Update] Error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to update saved text",
        });
      }
    },
  );

  // Mobile: Delete saved text by ID
  app.delete(
    "/api/v1/a/saved-texts/:id",
    mobileAuthMiddleware,
    async (req, res) => {
      try {
        const userId = req.jwtUser?.userId!;

        const deleted = await storage.deleteSavedText(req.params.id, userId);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: "Saved text not found",
          });
        }

        console.log(`[Mobile Delete] User: ${userId}, ID: ${req.params.id}`);

        res.json({
          success: true,
          message: "Saved text deleted",
        });
      } catch (error: any) {
        console.error("[Mobile Delete] Error:", error);
        res.status(500).json({
          success: false,
          error: error.message || "Failed to delete saved text",
        });
      }
    },
  );

  // ============================================================
  // SUBSCRIPTION ENDPOINTS (shared by web & mobile)
  // ============================================================

  // GET /api/v1/p/plans - List all available plans (public, filtered by is_visible)
  app.get("/api/v1/p/plans", async (req, res) => {
    try {
      const showAll = req.query.all === "true";
      let plans;
      if (showAll) {
        plans = await db.select().from(subscriptionPlans);
      } else {
        plans = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.isVisible, true));
      }

      const formattedPlans = plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        valid_total_minutes: plan.validTotalMinutes,
        valid_date_upto_days: plan.validDays,
        recordings_available_days: plan.recordingsAvailableDays,
        chunks_count: plan.chunksCount,
        offline_recording: plan.offlineRecording,
        price_monthly: plan.priceMonthly,
        stripe_price_id: plan.stripePriceId,
        is_default: plan.isDefault,
        is_visible: plan.isVisible,
      }));

      res.json({
        success: true,
        plans: formattedPlans,
      });
    } catch (error: any) {
      console.error("[Plans] Error fetching plans:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch plans",
      });
    }
  });

  // POST /api/v1/a/subscribe - Handle subscription purchase (requires auth)
  app.post("/api/v1/a/subscribe", mobileAuthMiddleware, async (req, res) => {
    try {
      const schema = z.object({
        plan_id: z.string().uuid("Invalid plan ID"),
        payment_token: z.string().min(1, "Payment token is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { plan_id, payment_token } = parseResult.data;
      const userId = req.jwtUser?.userId!;

      const planResult = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, plan_id))
        .limit(1);
      const plan = planResult[0];

      if (!plan) {
        return res.status(404).json({
          success: false,
          error: "Plan not found",
        });
      }

      if (plan.name === "Free") {
        return res.status(400).json({
          success: false,
          error: "Free plan does not require payment. It is assigned automatically.",
        });
      }

      const paymentSuccess =
        payment_token.startsWith("tok_") && payment_token.length >= 8;
      if (!paymentSuccess) {
        return res.status(402).json({
          success: false,
          error: "Payment failed. Invalid payment token.",
        });
      }

      const validDateUpto = new Date();
      validDateUpto.setDate(validDateUpto.getDate() + plan.validDays);

      // Check for trial minutes to carry forward
      let carryoverMinutes = 0;
      const trial = await getTrialInfo(userId);
      if (trial && trial.is_active && trial.minutes_remaining > 0) {
        carryoverMinutes = trial.minutes_remaining;
      }

      // Mark trial as used (converted)
      await db
        .update(users)
        .set({ trialUsed: true, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Supersede any existing active subscriptions
      const existingActive = await db
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "active"),
            gte(userSubscriptions.validDateUpto, new Date()),
          ),
        )
        .limit(1);

      if (existingActive.length > 0) {
        await db
          .update(userSubscriptions)
          .set({ status: "superseded" })
          .where(eq(userSubscriptions.id, existingActive[0].id));
      }

      // Also supersede any pending_payment subscriptions
      await db
        .update(userSubscriptions)
        .set({ status: "superseded" })
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "pending_payment"),
          ),
        );

      const totalMinutesAvailable = (plan.validTotalMinutes || 0) + carryoverMinutes;

      const [subscription] = await db
        .insert(userSubscriptions)
        .values({
          userId,
          planId: plan_id,
          validDateUpto,
          minutesUsed: 0,
          chunksUsed: 0,
          minutesRemaining: String(totalMinutesAvailable),
          paymentToken: payment_token,
          status: "active",
        })
        .returning();

      const updatedRole = await refreshUserRole(userId);

      console.log(
        `[Subscribe] User ${userId} subscribed to ${plan.name} plan until ${validDateUpto.toISOString()} (carryover: ${carryoverMinutes} mins, role: ${updatedRole})`,
      );

      res.json({
        success: true,
        message: `Successfully subscribed to ${plan.name} plan`,
        subscription: {
          id: subscription.id,
          plan_name: plan.name,
          valid_date_upto: validDateUpto.toISOString(),
          valid_total_minutes: plan.validTotalMinutes,
          minutes_remaining: totalMinutesAvailable,
          carryover_minutes: carryoverMinutes,
          recordings_available_days: plan.recordingsAvailableDays,
          chunks_count: plan.chunksCount,
          offline_recording: plan.offlineRecording,
          status: "active",
        },
        role: updatedRole,
      });
    } catch (error: any) {
      console.error("[Subscribe] Error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process subscription",
      });
    }
  });

  // Helper: Get trial info for a user
  async function getTrialInfo(userId: string) {
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userResult[0];
    if (!user || !user.trialStartsAt || !user.trialEndsAt) {
      return null;
    }

    const now = new Date();
    const trialMinutesUsed = parseFloat(user.trialMinutesUsed || "0");
    const trialMinutesTotal = user.trialMinutesTotal || 90;
    const trialMinutesRemaining = Math.max(0, trialMinutesTotal - trialMinutesUsed);
    const timeExpired = now > user.trialEndsAt;
    const minutesExpired = trialMinutesRemaining <= 0;
    const isActive = !user.trialUsed && !timeExpired && !minutesExpired;

    let status: string;
    if (user.trialUsed) {
      status = "converted";
    } else if (timeExpired || minutesExpired) {
      status = "expired";
    } else {
      status = "active";
    }

    const timeRemainingMs = Math.max(0, user.trialEndsAt.getTime() - now.getTime());
    const daysRemaining = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.ceil(timeRemainingMs / (1000 * 60 * 60));

    return {
      status,
      is_active: isActive,
      starts_at: user.trialStartsAt.toISOString(),
      ends_at: user.trialEndsAt.toISOString(),
      minutes_total: trialMinutesTotal,
      minutes_used: trialMinutesUsed,
      minutes_remaining: trialMinutesRemaining,
      days_remaining: isActive ? daysRemaining : 0,
      hours_remaining: isActive ? hoursRemaining : 0,
    };
  }

  // Helper: Check if user has access (trial OR active subscription with minutes)
  async function checkUserAccess(userId: string) {
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userRecord = userResult[0];

    if (userRecord?.role === "ADMIN") {
      const trial = await getTrialInfo(userId);
      return {
        access_granted: true,
        access_source: "admin",
        trial,
        subscription: null,
      };
    }

    const trial = await getTrialInfo(userId);

    const activeSubResult = await db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
          gte(userSubscriptions.validDateUpto, new Date()),
        ),
      )
      .limit(1);

    let subscription = null;
    if (activeSubResult.length > 0) {
      const sub = activeSubResult[0];
      const planResult = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, sub.planId))
        .limit(1);
      const plan = planResult[0];
      if (plan) {
        const totalMinutes = plan.validTotalMinutes || 0;
        const subMinutesRemaining = parseFloat(sub.minutesRemaining || "0");
        subscription = {
          id: sub.id,
          plan_name: plan.name,
          valid_total_minutes: totalMinutes,
          minutes_used: sub.minutesUsed,
          minutes_remaining: subMinutesRemaining,
          valid_date_upto: sub.validDateUpto.toISOString(),
          status: sub.status,
        };
      }
    }

    const trialGrantsAccess = trial !== null && trial.is_active && trial.minutes_remaining > 0;
    const subGrantsAccess = subscription !== null && subscription.status === "active" && subscription.minutes_remaining > 0;
    const accessGranted = trialGrantsAccess || subGrantsAccess;

    let accessSource: string;
    if (trialGrantsAccess) {
      accessSource = "trial";
    } else if (subGrantsAccess) {
      accessSource = "subscription";
    } else {
      accessSource = "none";
    }

    return {
      access_granted: accessGranted,
      access_source: accessSource,
      trial,
      subscription,
    };
  }

  // POST /api/v1/a/check-access - Check if user has recording access
  app.post("/api/v1/a/check-access", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId!;
      const accessInfo = await checkUserAccess(userId);

      res.json({
        success: true,
        ...accessInfo,
      });
    } catch (error: any) {
      console.error("[Check Access] Error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check access",
      });
    }
  });

  // GET /api/v1/a/subscription - Get active subscription for logged-in user (with trial info)
  app.get("/api/v1/a/subscription", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId!;
      const trial = await getTrialInfo(userId);

      const activeSubResult = await db
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "active"),
            gte(userSubscriptions.validDateUpto, new Date()),
          ),
        )
        .limit(1);

      if (activeSubResult.length > 0) {
        const sub = activeSubResult[0];
        const planResult = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, sub.planId))
          .limit(1);
        const plan = planResult[0];

        if (plan) {
          return res.json({
            success: true,
            subscription: {
              id: sub.id,
              plan_name: plan.name,
              valid_total_minutes: plan.validTotalMinutes,
              minutes_used: sub.minutesUsed,
              minutes_remaining: parseFloat(sub.minutesRemaining || "0"),
              valid_date_upto: sub.validDateUpto.toISOString(),
              recordings_available_days: plan.recordingsAvailableDays,
              chunks_count: plan.chunksCount,
              chunks_used: sub.chunksUsed,
              offline_recording: plan.offlineRecording,
              status: sub.status,
            },
            trial,
          });
        }
      }

      // No active subscription - check for pending_payment subscription
      const pendingSubResult = await db
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.status, "pending_payment"),
          ),
        )
        .limit(1);

      if (pendingSubResult.length > 0) {
        const sub = pendingSubResult[0];
        const planResult = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, sub.planId))
          .limit(1);
        const plan = planResult[0];

        if (plan) {
          return res.json({
            success: true,
            subscription: {
              id: sub.id,
              plan_name: plan.name,
              valid_total_minutes: plan.validTotalMinutes,
              minutes_used: 0,
              minutes_remaining: 0,
              valid_date_upto: null,
              recordings_available_days: plan.recordingsAvailableDays,
              chunks_count: plan.chunksCount,
              chunks_used: 0,
              offline_recording: plan.offlineRecording,
              status: "pending_payment",
            },
            trial,
          });
        }
      }

      // No subscription at all
      res.json({
        success: true,
        subscription: null,
        trial,
      });
    } catch (error: any) {
      console.error("[Subscription] Error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subscription",
      });
    }
  });

  // GET /api/v1/a/settings - Get all settings for logged-in user
  app.get("/api/v1/a/settings", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const result = settings.map((s) => ({
        id: s.id,
        setting_key: s.settingKey,
        setting_value: s.settingValue,
        updated_at: s.updatedAt,
      }));

      res.json({ success: true, settings: result });
    } catch (error: any) {
      console.error("[Settings GET] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch settings" });
    }
  });

  // PUT /api/v1/a/settings - Upsert settings for logged-in user (accepts array of settings)
  app.put("/api/v1/a/settings", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const settingsSchema = z.array(
        z.object({
          setting_key: z.string().min(1).max(100),
          setting_value: z.string(),
        })
      );

      const parseResult = settingsSchema.safeParse(req.body.settings);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid settings format",
          details: parseResult.error.errors,
        });
      }

      const settingsToSave = parseResult.data;
      const saved: any[] = [];

      for (const setting of settingsToSave) {
        const existing = await db
          .select()
          .from(userSettings)
          .where(
            and(
              eq(userSettings.userId, userId),
              eq(userSettings.settingKey, setting.setting_key)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          const updated = await db
            .update(userSettings)
            .set({
              settingValue: setting.setting_value,
              updatedAt: new Date(),
            })
            .where(eq(userSettings.id, existing[0].id))
            .returning();
          saved.push({
            id: updated[0].id,
            setting_key: updated[0].settingKey,
            setting_value: updated[0].settingValue,
            updated_at: updated[0].updatedAt,
          });
        } else {
          const inserted = await db
            .insert(userSettings)
            .values({
              userId,
              settingKey: setting.setting_key,
              settingValue: setting.setting_value,
            })
            .returning();
          saved.push({
            id: inserted[0].id,
            setting_key: inserted[0].settingKey,
            setting_value: inserted[0].settingValue,
            updated_at: inserted[0].updatedAt,
          });
        }
      }

      res.json({ success: true, settings: saved });
    } catch (error: any) {
      console.error("[Settings PUT] Error:", error);
      res.status(500).json({ success: false, error: "Failed to save settings" });
    }
  });

  // DELETE /api/v1/a/settings/:key - Delete a specific setting
  app.delete("/api/v1/a/settings/:key", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { key } = req.params;

      const deleted = await db
        .delete(userSettings)
        .where(
          and(
            eq(userSettings.userId, userId),
            eq(userSettings.settingKey, key)
          )
        )
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ success: false, error: "Setting not found" });
      }

      res.json({ success: true, message: "Setting deleted" });
    } catch (error: any) {
      console.error("[Settings DELETE] Error:", error);
      res.status(500).json({ success: false, error: "Failed to delete setting" });
    }
  });

  // ============================================================
  // STRIPE SUBSCRIPTION ENDPOINTS (Web + Mobile)
  // ============================================================

  // GET /api/stripe-config + /api/v1/p/stripe-config - Get Stripe publishable key
  async function handleStripeConfig(_req: Request, res: Response) {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ success: true, publishableKey });
    } catch (error: any) {
      console.error("[Stripe Config] Error:", error.message);
      res.status(500).json({ success: false, error: "Failed to get Stripe configuration" });
    }
  }

  app.get("/api/v1/p/stripe-config", handleStripeConfig);

  // GET /api/subscription-status + /api/v1/a/subscription-status - Get current subscription status
  async function handleSubscriptionStatus(_req: Request, res: Response, userId: string) {
    try {
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const trial = await getTrialInfo(userId);

      if (user.stripeCustomerId) {
        cleanupStalePayments(user.stripeCustomerId).catch(err =>
          console.warn("[Subscription Status] Background cleanup error:", err.message)
        );
      }

      const activeSubResult = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
        ))
        .limit(1);

      const activeSub = activeSubResult[0];
      let plan = null;
      if (activeSub) {
        const planResult = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, activeSub.planId))
          .limit(1);
        plan = planResult[0] || null;
      }

      let stripeStatus: string | null = null;
      let cancelAtPeriodEnd = false;
      let currentPeriodEnd: string | null = null;

      if (user.stripeSubscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();
          const stripeSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          stripeStatus = stripeSub.status;
          cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
          const periodEndTs = (stripeSub as any).current_period_end;
          currentPeriodEnd = periodEndTs
            ? new Date(periodEndTs * 1000).toISOString()
            : null;
        } catch (err: any) {
          console.warn("[Subscription Status] Stripe retrieval failed:", err.message);
        }
      }

      res.json({
        success: true,
        trial: trial ? {
          is_active: trial.is_active,
          days_remaining: trial.days_remaining,
          minutes_remaining: trial.minutes_remaining,
          minutes_used: trial.minutes_used,
          trial_ends_at: trial.ends_at,
        } : null,
        subscription: activeSub ? {
          id: activeSub.id,
          plan_name: plan?.name || "Unknown",
          plan_id: activeSub.planId,
          status: activeSub.status,
          valid_date_upto: activeSub.validDateUpto,
          minutes_used: activeSub.minutesUsed,
          minutes_remaining: activeSub.minutesRemaining,
          stripe_subscription_id: user.stripeSubscriptionId,
          stripe_status: stripeStatus,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: currentPeriodEnd,
        } : null,
        has_active_subscription: !!activeSub,
        has_active_trial: trial?.is_active || false,
      });
    } catch (error: any) {
      console.error("[Subscription Status] Error:", error);
      res.status(500).json({ success: false, error: "Failed to get subscription status" });
    }
  }

  app.get("/api/v1/a/subscription-status", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    await handleSubscriptionStatus(req, res, userId);
  });

  const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000;

  async function cleanupStalePayments(customerId: string) {
    try {
      const stripe = await getUncachableStripeClient();
      const cutoffTime = Math.floor((Date.now() - PAYMENT_TIMEOUT_MS) / 1000);

      for (const status of ["incomplete", "incomplete_expired"] as const) {
        let hasMore = true;
        let startingAfter: string | undefined;
        while (hasMore) {
          const params: any = { customer: customerId, status, limit: 100 };
          if (startingAfter) params.starting_after = startingAfter;
          const staleSubs = await stripe.subscriptions.list(params);
          for (const sub of staleSubs.data) {
            if (sub.created < cutoffTime) {
              try {
                await stripe.subscriptions.cancel(sub.id);
                console.log(`[Stripe Cleanup] Cancelled stale ${status} subscription ${sub.id} (created ${new Date(sub.created * 1000).toISOString()})`);
              } catch (cancelErr: any) {
                console.warn(`[Stripe Cleanup] Could not cancel sub ${sub.id}:`, cancelErr.message);
              }
            }
          }
          hasMore = staleSubs.has_more;
          if (staleSubs.data.length > 0) {
            startingAfter = staleSubs.data[staleSubs.data.length - 1].id;
          }
        }
      }

      let hasMore = true;
      let startingAfter: string | undefined;
      const cancelableStatuses = ["requires_payment_method", "requires_confirmation", "requires_action"];
      while (hasMore) {
        const params: any = { customer: customerId, limit: 100 };
        if (startingAfter) params.starting_after = startingAfter;
        const pendingPIs = await stripe.paymentIntents.list(params);
        for (const pi of pendingPIs.data) {
          if (pi.created >= cutoffTime) continue;
          if (cancelableStatuses.includes(pi.status)) {
            try {
              await stripe.paymentIntents.cancel(pi.id);
              console.log(`[Stripe Cleanup] Cancelled stale PaymentIntent ${pi.id} (status: ${pi.status}, created ${new Date(pi.created * 1000).toISOString()})`);
            } catch (cancelErr: any) {
              console.warn(`[Stripe Cleanup] Could not cancel PI ${pi.id}:`, cancelErr.message);
            }
          }
        }
        hasMore = pendingPIs.has_more;
        if (pendingPIs.data.length > 0) {
          startingAfter = pendingPIs.data[pendingPIs.data.length - 1].id;
        }
      }
    } catch (error: any) {
      console.error("[Stripe Cleanup] Error cleaning up stale payments:", error.message);
    }
  }

  // POST /api/create-subscription (Web) + POST /api/v1/a/create-subscription (Mobile)
  async function handleCreateSubscription(req: Request, res: Response, userId: string, userEmail: string) {
    try {
      console.log("[Stripe Create Subscription] Raw body:", JSON.stringify(req.body));

      const body = req.body || {};
      const normalizedBody = {
        email: body.email,
        priceId: body.priceId || body.price_id || body.stripePriceId || body.stripe_price_id,
      };

      const schema = z.object({
        email: z.string().email("Valid email is required"),
        priceId: z.string().min(1, "Price ID is required"),
      });

      const parseResult = schema.safeParse(normalizedBody);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { email, priceId } = parseResult.data;
      const stripe = await getUncachableStripeClient();

      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      let customerId = user.stripeCustomerId;
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (custErr: any) {
          console.log("[Stripe] Stored customer not found in current mode, creating new:", custErr.message);
          customerId = null;
        }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({
          email,
          metadata: { userId },
        });
        customerId = customer.id;
        await db.update(users)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      await cleanupStalePayments(customerId);

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      });

      const invoice = subscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent as any;
      const setupIntent = subscription.pending_setup_intent as any;

      let clientSecret: string | null = null;
      let type: "payment" | "setup" = "payment";

      if (paymentIntent?.client_secret) {
        clientSecret = paymentIntent.client_secret;
        type = "payment";
      } else if (setupIntent?.client_secret) {
        clientSecret = setupIntent.client_secret;
        type = "setup";
      } else {
        const si = await stripe.setupIntents.create({
          customer: customerId,
          payment_method_types: ["card"],
          metadata: { subscription_id: subscription.id },
        });
        clientSecret = si.client_secret;
        type = "setup";
      }

      await db.update(users)
        .set({ stripeSubscriptionId: subscription.id, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        subscriptionId: subscription.id,
        clientSecret,
        type,
      });
    } catch (error: any) {
      console.error("[Stripe Create Subscription] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create subscription",
      });
    }
  }

  app.post("/api/v1/a/create-subscription", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    const email = req.body.email;
    await handleCreateSubscription(req, res, userId, email);
  });

  // POST /api/cancel-subscription (Web) + POST /api/v1/a/cancel-subscription (Mobile)
  async function handleCancelSubscription(req: Request, res: Response, userId: string) {
    try {
      const schema = z.object({
        subscriptionId: z.string().min(1, "Subscription ID is required"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { subscriptionId } = parseResult.data;

      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.stripeSubscriptionId !== subscriptionId) {
        return res.status(403).json({ success: false, error: "You can only cancel your own subscription" });
      }

      const stripe = await getUncachableStripeClient();

      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      const cancelAt = (subscription as any).cancel_at;
      const periodEnd = (subscription as any).current_period_end;

      res.json({
        success: true,
        message: "Subscription will be cancelled at the end of the current billing period",
        cancel_at: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      });
    } catch (error: any) {
      console.error("[Stripe Cancel Subscription] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to cancel subscription",
      });
    }
  }

  app.post("/api/v1/a/cancel-subscription", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    await handleCancelSubscription(req, res, userId);
  });

  // POST /api/stripe-webhook + /api/v1/a/stripe-webhook - Stripe webhook handler
  async function handleStripeWebhook(req: Request, res: Response) {
    try {
      const stripe = await getUncachableStripeClient();
      const sig = req.headers["stripe-signature"];

      if (!sig) {
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error("[Stripe Webhook] rawBody not available");
        return res.status(400).json({ error: "Raw body not available" });
      }

      const event = stripe.webhooks.constructEvent(
        rawBody,
        Array.isArray(sig) ? sig[0] : sig,
        webhookSecret,
      );

      switch (event.type) {
        case "invoice.paid": {
          const invoice = event.data.object as any;
          const customerId = invoice.customer;
          const subscriptionId = invoice.subscription;

          if (customerId && subscriptionId) {
            const userResult = await db.select().from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);

            if (userResult.length > 0) {
              const user = userResult[0];
              await db.update(users)
                .set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
                .where(eq(users.id, user.id));

              const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
              const priceId = stripeSubscription.items.data[0]?.price?.id;

              if (priceId) {
                let planResult = await db.select().from(subscriptionPlans)
                  .where(eq(subscriptionPlans.stripePriceId, priceId))
                  .limit(1);
                if (planResult.length === 0) {
                  planResult = await db.select().from(subscriptionPlans)
                    .where(gte(subscriptionPlans.priceMonthly, 1))
                    .limit(1);
                }
                const matchedPlan = planResult[0];

                if (matchedPlan) {
                  let carryoverMinutes = 0;
                  const trial = await getTrialInfo(user.id);
                  if (trial && trial.is_active && trial.minutes_remaining > 0) {
                    carryoverMinutes = trial.minutes_remaining;
                  }

                  await db.update(users)
                    .set({ trialUsed: true, updatedAt: new Date() })
                    .where(eq(users.id, user.id));

                  const existingActive = await db.select().from(userSubscriptions)
                    .where(and(
                      eq(userSubscriptions.userId, user.id),
                      eq(userSubscriptions.status, "active"),
                    )).limit(1);

                  if (existingActive.length > 0) {
                    await db.update(userSubscriptions)
                      .set({ status: "superseded" })
                      .where(eq(userSubscriptions.id, existingActive[0].id));
                  }

                  const validDateUpto = new Date();
                  validDateUpto.setDate(validDateUpto.getDate() + matchedPlan.validDays);
                  const totalMinutes = (matchedPlan.validTotalMinutes || 0) + carryoverMinutes;

                  await db.insert(userSubscriptions).values({
                    userId: user.id,
                    planId: matchedPlan.id,
                    validDateUpto,
                    minutesUsed: 0,
                    chunksUsed: 0,
                    minutesRemaining: String(totalMinutes),
                    paymentToken: subscriptionId,
                    status: "active",
                  });

                  await refreshUserRole(user.id);
                  console.log(`[Stripe Webhook] invoice.paid: User ${user.id} activated plan ${matchedPlan.name}`);
                }
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as any;
          const customerId = invoice.customer;
          const subscriptionId = invoice.subscription;

          if (customerId) {
            const userResult = await db.select().from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);

            if (userResult.length > 0) {
              const user = userResult[0];

              if (subscriptionId) {
                const activeSubResult = await db.select().from(userSubscriptions)
                  .where(and(
                    eq(userSubscriptions.userId, user.id),
                    eq(userSubscriptions.status, "active"),
                    eq(userSubscriptions.paymentToken, subscriptionId),
                  )).limit(1);

                if (activeSubResult.length > 0) {
                  await db.update(userSubscriptions)
                    .set({ status: "payment_failed" })
                    .where(eq(userSubscriptions.id, activeSubResult[0].id));
                }
              }

              await refreshUserRole(user.id);
              console.log(`[Stripe Webhook] invoice.payment_failed: User ${user.id} payment failed for subscription ${subscriptionId}`);
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as any;
          const customerId = subscription.customer;
          const subscriptionId = subscription.id;
          const newStatus = subscription.status;

          if (customerId && subscriptionId) {
            const userResult = await db.select().from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);

            if (userResult.length > 0) {
              const user = userResult[0];

              if (newStatus === "active") {
                const priceId = subscription.items?.data?.[0]?.price?.id;
                if (priceId) {
                  let planResult = await db.select().from(subscriptionPlans)
                    .where(eq(subscriptionPlans.stripePriceId, priceId))
                    .limit(1);
                  if (planResult.length === 0) {
                    planResult = await db.select().from(subscriptionPlans)
                      .where(gte(subscriptionPlans.priceMonthly, 1))
                      .limit(1);
                  }
                  const matchedPlan = planResult[0];

                  if (matchedPlan) {
                    const activeSubResult = await db.select().from(userSubscriptions)
                      .where(and(
                        eq(userSubscriptions.userId, user.id),
                        eq(userSubscriptions.paymentToken, subscriptionId),
                      )).limit(1);

                    if (activeSubResult.length > 0) {
                      await db.update(userSubscriptions)
                        .set({ status: "active", planId: matchedPlan.id })
                        .where(eq(userSubscriptions.id, activeSubResult[0].id));
                    }
                  }
                }

                await db.update(users)
                  .set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
                  .where(eq(users.id, user.id));

              } else if (newStatus === "past_due" || newStatus === "unpaid") {
                const activeSubResult = await db.select().from(userSubscriptions)
                  .where(and(
                    eq(userSubscriptions.userId, user.id),
                    eq(userSubscriptions.status, "active"),
                    eq(userSubscriptions.paymentToken, subscriptionId),
                  )).limit(1);

                if (activeSubResult.length > 0) {
                  await db.update(userSubscriptions)
                    .set({ status: "payment_failed" })
                    .where(eq(userSubscriptions.id, activeSubResult[0].id));
                }
              }

              await refreshUserRole(user.id);
              console.log(`[Stripe Webhook] subscription.updated: User ${user.id} status=${newStatus}`);
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          const customerId = subscription.customer;

          if (customerId) {
            const userResult = await db.select().from(users)
              .where(eq(users.stripeCustomerId, customerId))
              .limit(1);

            if (userResult.length > 0) {
              const user = userResult[0];

              await db.update(users)
                .set({ stripeSubscriptionId: null, updatedAt: new Date() })
                .where(eq(users.id, user.id));

              const activeSubResult = await db.select().from(userSubscriptions)
                .where(and(
                  eq(userSubscriptions.userId, user.id),
                  eq(userSubscriptions.status, "active"),
                )).limit(1);

              if (activeSubResult.length > 0) {
                await db.update(userSubscriptions)
                  .set({ status: "cancelled" })
                  .where(eq(userSubscriptions.id, activeSubResult[0].id));
              }

              await refreshUserRole(user.id);
              console.log(`[Stripe Webhook] subscription.deleted: User ${user.id} subscription cancelled`);
            }
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error:", error.message);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  }

  app.post("/api/v1/a/stripe-webhook", handleStripeWebhook);

  // Stripe Sync: Initialize Stripe schema and sync data
  async function initStripeSync() {
    try {
      const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
      if (!databaseUrl) {
        console.warn("[Stripe] No database URL found, skipping Stripe initialization");
        return;
      }

      console.log("[Stripe] Initializing schema...");
      await runMigrations({ databaseUrl } as any);
      console.log("[Stripe] Schema ready");

      const stripeSync = await getStripeSync();

      const replitDomains = process.env.REPLIT_DOMAINS;
      if (replitDomains) {
        try {
          const webhookBaseUrl = `https://${replitDomains.split(",")[0]}`;
          const result = await stripeSync.findOrCreateManagedWebhook(
            `${webhookBaseUrl}/api/stripe-webhook`,
          );
          console.log(`[Stripe] Webhook configured: ${result?.webhook?.url || 'managed'}`);
        } catch (webhookErr: any) {
          console.warn("[Stripe] Managed webhook setup skipped:", webhookErr.message);
        }
      }

      stripeSync.syncBackfill()
        .then(() => console.log("[Stripe] Data synced"))
        .catch((err: any) => console.error("[Stripe] Sync error:", err));
    } catch (error: any) {
      console.error("[Stripe] Init error:", error.message);
    }
  }

  initStripeSync();

  // ============ RBAC: Admin Bootstrap ============
  // Set ADMIN_EMAILS env var (comma-separated) to auto-promote users to ADMIN on startup
  async function bootstrapAdminRoles() {
    const adminEmails = process.env.ADMIN_EMAILS;
    if (!adminEmails) return;

    const emails = adminEmails.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    for (const email of emails) {
      try {
        const userResult = await db.select().from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (userResult.length > 0 && userResult[0].role !== "ADMIN") {
          await storage.updateUserRole(userResult[0].id, "ADMIN");
          console.log(`[RBAC] Bootstrapped ADMIN role for ${email}`);
        }
      } catch (err: any) {
        console.warn(`[RBAC] Failed to bootstrap admin for ${email}:`, err.message);
      }
    }
  }

  bootstrapAdminRoles();

  // GET /api/v1/a/user-role - Get current user role (refreshed from DB)
  app.get("/api/v1/a/user-role", mobileAuthMiddleware, async (req, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }
      const role = await refreshUserRole(userId);
      res.json({ success: true, role });
    } catch (error: any) {
      console.error("[User Role] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch user role" });
    }
  });

  // ==========================================
  // ADMIN DASHBOARD API ENDPOINTS
  // ==========================================

  // GET /api/v1/a/admin/stats - Dashboard summary stats
  app.get("/api/v1/a/admin/stats", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const [userCount] = await db.select({ value: count() }).from(users);
      const [subCount] = await db.select({ value: count() }).from(userSubscriptions).where(eq(userSubscriptions.status, "active"));
      const [supportCount] = await db.select({ value: count() }).from(supportRequests).where(eq(supportRequests.status, "open"));
      const [errorCount] = await db.select({ value: count() }).from(errorLogs);

      res.json({
        success: true,
        stats: {
          totalUsers: userCount.value,
          activeSubscriptions: subCount.value,
          openSupportRequests: supportCount.value,
          totalErrors: errorCount.value,
        },
      });
    } catch (error: any) {
      console.error("[Admin Stats] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  });

  // GET /api/v1/a/admin/users - List all users
  app.get("/api/v1/a/admin/users", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        trialStartsAt: users.trialStartsAt,
        trialEndsAt: users.trialEndsAt,
        trialUsed: users.trialUsed,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);

      const [totalResult] = await db.select({ value: count() }).from(users);

      res.json({
        success: true,
        users: allUsers,
        pagination: { page, limit, total: totalResult.value },
      });
    } catch (error: any) {
      console.error("[Admin Users] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch users" });
    }
  });

  // GET /api/v1/a/admin/subscriptions - List all subscriptions
  app.get("/api/v1/a/admin/subscriptions", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const allSubs = await db.select({
        id: userSubscriptions.id,
        userId: userSubscriptions.userId,
        planId: userSubscriptions.planId,
        validDateUpto: userSubscriptions.validDateUpto,
        minutesUsed: userSubscriptions.minutesUsed,
        minutesRemaining: userSubscriptions.minutesRemaining,
        status: userSubscriptions.status,
        createdAt: userSubscriptions.createdAt,
      }).from(userSubscriptions).orderBy(desc(userSubscriptions.createdAt)).limit(limit).offset(offset);

      const [totalResult] = await db.select({ value: count() }).from(userSubscriptions);

      const plans = await db.select().from(subscriptionPlans);
      const planMap = Object.fromEntries(plans.map(p => [p.id, p]));

      const subsWithUser = await Promise.all(allSubs.map(async (sub) => {
        const userResult = await db.select({ username: users.username, email: users.email }).from(users).where(eq(users.id, sub.userId)).limit(1);
        return {
          ...sub,
          username: userResult[0]?.username || "Unknown",
          email: userResult[0]?.email || "Unknown",
          planName: planMap[sub.planId]?.name || "Unknown",
        };
      }));

      res.json({
        success: true,
        subscriptions: subsWithUser,
        pagination: { page, limit, total: totalResult.value },
      });
    } catch (error: any) {
      console.error("[Admin Subscriptions] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch subscriptions" });
    }
  });

  // GET /api/v1/a/admin/payments - List Stripe payment history
  app.get("/api/v1/a/admin/payments", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const startingAfter = req.query.starting_after as string | undefined;

      const stripe = await getUncachableStripeClient();
      const params: any = { limit, expand: ["data.customer"] };
      if (startingAfter) params.starting_after = startingAfter;

      const charges = await stripe.charges.list(params);

      const payments = charges.data.map((charge: any) => ({
        id: charge.id,
        amount: charge.amount / 100,
        currency: charge.currency,
        status: charge.status,
        customerEmail: charge.customer?.email || charge.billing_details?.email || "N/A",
        customerName: charge.customer?.name || charge.billing_details?.name || "N/A",
        description: charge.description || "Subscription payment",
        created: new Date(charge.created * 1000).toISOString(),
        receiptUrl: charge.receipt_url,
      }));

      res.json({
        success: true,
        payments,
        hasMore: charges.has_more,
        lastId: charges.data.length > 0 ? charges.data[charges.data.length - 1].id : null,
      });
    } catch (error: any) {
      console.error("[Admin Payments] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch payments" });
    }
  });

  // GET /api/v1/a/admin/support - List support requests
  app.get("/api/v1/a/admin/support", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;

      let query = db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt)).limit(limit).offset(offset);

      const allRequests = status
        ? await db.select().from(supportRequests).where(eq(supportRequests.status, status)).orderBy(desc(supportRequests.createdAt)).limit(limit).offset(offset)
        : await db.select().from(supportRequests).orderBy(desc(supportRequests.createdAt)).limit(limit).offset(offset);

      const totalQuery = status
        ? await db.select({ value: count() }).from(supportRequests).where(eq(supportRequests.status, status))
        : await db.select({ value: count() }).from(supportRequests);

      res.json({
        success: true,
        requests: allRequests,
        pagination: { page, limit, total: totalQuery[0].value },
      });
    } catch (error: any) {
      console.error("[Admin Support] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch support requests" });
    }
  });

  // PATCH /api/v1/a/admin/support/:id - Update support request status
  app.patch("/api/v1/a/admin/support/:id", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status" });
      }
      await db.update(supportRequests).set({ status, updatedAt: new Date() }).where(eq(supportRequests.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Admin Support Update] Error:", error);
      res.status(500).json({ success: false, error: "Failed to update support request" });
    }
  });

  // GET /api/v1/a/admin/errors - List error logs
  app.get("/api/v1/a/admin/errors", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const allErrors = await db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(limit).offset(offset);
      const [totalResult] = await db.select({ value: count() }).from(errorLogs);

      const errorsWithUser = await Promise.all(allErrors.map(async (err) => {
        if (err.userId) {
          const userResult = await db.select({ username: users.username, email: users.email }).from(users).where(eq(users.id, err.userId)).limit(1);
          return { ...err, username: userResult[0]?.username, email: userResult[0]?.email };
        }
        return { ...err, username: null, email: null };
      }));

      res.json({
        success: true,
        errors: errorsWithUser,
        pagination: { page, limit, total: totalResult.value },
      });
    } catch (error: any) {
      console.error("[Admin Errors] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch error logs" });
    }
  });

  // POST /api/v1/a/support - Submit a support request (any authenticated user)
  app.post("/api/v1/a/support", jwtAuthMiddleware, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { subject, message, email, platform } = req.body;
      if (!subject || !message || !email) {
        return res.status(400).json({ success: false, error: "Subject, message, and email are required" });
      }
      await db.insert(supportRequests).values({
        userId: userId || undefined,
        email,
        subject,
        message,
        platform: platform || "web",
      });
      res.json({ success: true, message: "Support request submitted" });
    } catch (error: any) {
      console.error("[Support] Error:", error);
      res.status(500).json({ success: false, error: "Failed to submit support request" });
    }
  });

  // POST /api/v1/a/error-log - Log an error from client (any authenticated user)
  app.post("/api/v1/a/error-log", jwtAuthMiddleware, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { errorMessage, errorStack, errorCode, platform, endpoint, metadata } = req.body;
      if (!errorMessage) {
        return res.status(400).json({ success: false, error: "errorMessage is required" });
      }
      await db.insert(errorLogs).values({
        userId: userId || undefined,
        errorMessage,
        errorStack: errorStack || null,
        errorCode: errorCode || null,
        platform: platform || "web",
        endpoint: endpoint || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Error Log] Error:", error);
      res.status(500).json({ success: false, error: "Failed to log error" });
    }
  });

  // ============================================================
  // HELPER FUNCTIONS (push notifications, renewal emails, password reset, crash reporting, admin)
  // ============================================================

  async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: any) {
    const messages = tokens.map((token) => ({
      to: token,
      sound: "default" as const,
      title,
      body,
      data: data || {},
    }));

    const BATCH_SIZE = 100;
    const results: any[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        const result = await response.json();
        results.push(result);

        if (result.data) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
              const badToken = batch[j].to;
              console.log(`[Push] Deactivating invalid token: ${badToken.substring(0, 20)}...`);
              await db.update(pushTokens).set({ isActive: false, updatedAt: new Date() }).where(eq(pushTokens.pushToken, badToken));
            }
          }
        }
      } catch (err: any) {
        console.error(`[Push] Batch send failed:`, err.message);
      }
    }
    return results;
  }

  async function sendRenewalReminderEmail(email: string, planName: string, renewalDate: Date, amount: string) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn("[RENEWAL EMAIL] SMTP configuration missing - skipping reminder email");
      return;
    }

    try {
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpSecure = process.env.SMTP_SECURE === "true";
      const emailFrom = process.env.EMAIL_FROM || smtpUser;

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        ...(smtpPort === 587 && !smtpSecure && { requireTLS: true, tls: { ciphers: "SSLv3", rejectUnauthorized: false } }),
      });
      await transporter.verify();

      const formattedDate = renewalDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Renewal Reminder</title></head>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;">MyVoicePost</h1><p style="color:rgba(255,255,255,0.9);margin:10px 0 0;">Upcoming Renewal</p></div>
          <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
            <h2>Your subscription renews soon</h2>
            <p>Your <strong>${planName}</strong> subscription will automatically renew in 3 days.</p>
            <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:bold;text-align:right;">${planName}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Renewal Amount</td><td style="padding:8px 0;font-weight:bold;text-align:right;">${amount}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Renewal Date</td><td style="padding:8px 0;font-weight:bold;text-align:right;">${formattedDate}</td></tr>
              </table>
            </div>
            <p style="color:#666;font-size:14px;">To cancel auto-renewal, visit your Account Settings in the app before the renewal date.</p>
            <hr style="border:none;border-top:1px solid #e0e0e0;margin:25px 0;">
            <p style="color:#888;font-size:13px;margin-bottom:0;">-- The MyVoicePost Team</p>
          </div>
        </body></html>`;

      await transporter.sendMail({
        from: emailFrom,
        to: email,
        subject: `MyVoicePost - Your ${planName} subscription renews on ${formattedDate}`,
        text: `Your MyVoicePost ${planName} subscription will renew on ${formattedDate} for ${amount}. To cancel auto-renewal, visit your Account Settings in the app.`,
        html: htmlContent,
      });

      console.log(`[RENEWAL EMAIL] Reminder email sent to ${email}`);
    } catch (emailError: any) {
      console.error(`[RENEWAL EMAIL] Failed to send reminder email: ${emailError.message}`);
    }
  }

  // ============================================================
  // CRON: Subscription expiry notifications + cleanup
  // ============================================================

  app.get("/api/cron/subscription-expiry-notifications", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[Cron] CRON_SECRET environment variable is not configured");
      return res.status(500).json({ error: "Cron not configured" });
    }
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      console.log("[Cron] Starting subscription expiry notification check...");
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const oneDayMs = 24 * 60 * 60 * 1000;

      const activeSubscriptions = await db.select({
        subId: userSubscriptions.id,
        userId: userSubscriptions.userId,
        planId: userSubscriptions.planId,
        validDateUpto: userSubscriptions.validDateUpto,
        planName: subscriptionPlans.name,
      }).from(userSubscriptions)
        .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
        .where(eq(userSubscriptions.status, "active"));

      let sentCount = 0;
      let skippedCount = 0;

      for (const sub of activeSubscriptions) {
        if (!sub.validDateUpto) continue;
        const expiryDate = new Date(sub.validDateUpto);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / oneDayMs);

        let notificationType: string | null = null;
        let notificationTitle = "";
        let notificationBody = "";

        if (daysUntilExpiry <= 2 && daysUntilExpiry > 0) {
          notificationType = "expiry_2days";
          notificationTitle = "Subscription Expiring Soon";
          notificationBody = `Your ${sub.planName || "subscription"} plan expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Renew now to keep your recording minutes!`;
        } else if (daysUntilExpiry <= 7 && daysUntilExpiry > 2) {
          notificationType = "expiry_7days";
          notificationTitle = "Subscription Reminder";
          notificationBody = `Your ${sub.planName || "subscription"} plan expires in ${daysUntilExpiry} days. Consider renewing to continue enjoying extended recording time.`;
        }

        if (!notificationType) continue;

        const alreadySent = await db.select().from(notificationLog)
          .where(and(
            eq(notificationLog.userId, sub.userId),
            eq(notificationLog.notificationType, notificationType),
            eq(notificationLog.subscriptionId, sub.subId),
          )).limit(1);

        if (alreadySent.length > 0) { skippedCount++; continue; }

        const userTokens = await db.select().from(pushTokens)
          .where(and(eq(pushTokens.userId, sub.userId), eq(pushTokens.isActive, true)));

        if (userTokens.length === 0) { skippedCount++; continue; }

        await sendExpoPushNotifications(userTokens.map((t) => t.pushToken), notificationTitle, notificationBody, {
          type: "subscription_expiry", subscriptionId: sub.subId, daysRemaining: daysUntilExpiry,
        });

        await db.insert(notificationLog).values({
          userId: sub.userId, notificationType, subscriptionId: sub.subId, status: "sent", message: notificationBody,
        });

        sentCount++;
        console.log(`[Cron] Sent ${notificationType} notification to user ${sub.userId} (expires in ${daysUntilExpiry} days)`);
      }

      const usersWithTrials = await db.select().from(users)
        .where(and(eq(users.trialUsed, false), gte(users.trialEndsAt, now), sql`${users.trialEndsAt} <= ${sevenDaysFromNow}`));

      for (const user of usersWithTrials) {
        if (!user.trialEndsAt) continue;
        const trialExpiry = new Date(user.trialEndsAt);
        const daysUntilExpiry = Math.ceil((trialExpiry.getTime() - now.getTime()) / oneDayMs);

        let notificationType: string | null = null;
        let notificationTitle = "";
        let notificationBody = "";

        if (daysUntilExpiry <= 2 && daysUntilExpiry > 0) {
          notificationType = "trial_expiry_2days";
          notificationTitle = "Trial Ending Soon";
          notificationBody = `Your free trial expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Subscribe now to keep recording!`;
        } else if (daysUntilExpiry <= 7 && daysUntilExpiry > 2) {
          notificationType = "trial_expiry_7days";
          notificationTitle = "Trial Reminder";
          notificationBody = `Your free trial expires in ${daysUntilExpiry} days. Subscribe to continue enjoying MyVoicePost.`;
        }

        if (!notificationType) continue;

        const alreadySent = await db.select().from(notificationLog)
          .where(and(eq(notificationLog.userId, user.id), eq(notificationLog.notificationType, notificationType)))
          .limit(1);

        if (alreadySent.length > 0) { skippedCount++; continue; }

        const userTokens = await db.select().from(pushTokens)
          .where(and(eq(pushTokens.userId, user.id), eq(pushTokens.isActive, true)));

        if (userTokens.length === 0) { skippedCount++; continue; }

        await sendExpoPushNotifications(userTokens.map((t) => t.pushToken), notificationTitle, notificationBody, {
          type: "trial_expiry", daysRemaining: daysUntilExpiry,
        });

        await db.insert(notificationLog).values({ userId: user.id, notificationType, status: "sent", message: notificationBody });
        sentCount++;
        console.log(`[Cron] Sent ${notificationType} notification to user ${user.id} (trial expires in ${daysUntilExpiry} days)`);
      }

      console.log(`[Cron] Notifications done. Sent: ${sentCount}, Skipped: ${skippedCount}`);

      let renewalRemindersSent = 0;
      try {
        const stripeClient = await getUncachableStripeClient();
        const usersWithSubs = await db.select({
          userId: users.id,
          email: users.email,
          stripeSubscriptionId: users.stripeSubscriptionId,
        }).from(users).where(and(sql`${users.stripeSubscriptionId} IS NOT NULL`, sql`${users.stripeSubscriptionId} != ''`));

        for (const u of usersWithSubs) {
          if (!u.stripeSubscriptionId || !u.email) continue;
          try {
            const stripeSub = await stripeClient.subscriptions.retrieve(u.stripeSubscriptionId);
            if ((stripeSub.status !== "active" && stripeSub.status !== "trialing") || stripeSub.cancel_at_period_end) continue;

            const periodEnd = new Date((stripeSub as any).current_period_end * 1000);
            const daysUntilRenewal = Math.ceil((periodEnd.getTime() - now.getTime()) / oneDayMs);

            if (daysUntilRenewal === 3) {
              const renewalKey = `renewal_${u.stripeSubscriptionId}_${periodEnd.toISOString().split("T")[0]}`;
              const existingLog = await db.select().from(notificationLog)
                .where(and(
                  eq(notificationLog.userId, u.userId),
                  eq(notificationLog.notificationType, "renewal_reminder_3days"),
                  eq(notificationLog.message, renewalKey),
                )).limit(1);

              if (existingLog.length === 0) {
                const priceItem = stripeSub.items?.data?.[0];
                const amount = priceItem?.price?.unit_amount ? `$${(priceItem.price.unit_amount / 100).toFixed(2)}` : "your subscription fee";
                const planName = priceItem?.price?.nickname || "Starter";

                await sendRenewalReminderEmail(u.email, planName, periodEnd, amount);
                await db.insert(notificationLog).values({
                  userId: u.userId, notificationType: "renewal_reminder_3days", status: "sent", message: renewalKey,
                });
                renewalRemindersSent++;
                console.log(`[Cron] Sent renewal reminder to user ${u.userId} (renews in ${daysUntilRenewal} days)`);
              }
            }
          } catch (subErr: any) {
            console.warn(`[Cron] Could not check Stripe sub for user ${u.userId}: ${subErr.message}`);
          }
        }
        console.log(`[Cron] Renewal reminders sent: ${renewalRemindersSent}`);
      } catch (renewalErr: any) {
        console.error(`[Cron] Renewal reminder check error: ${renewalErr.message}`);
      }

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expiredTokensResult = await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now));
      const expiredTokensCount = (expiredTokensResult as any).count ?? 0;
      const oldAudioResult = await db.delete(audioLogs).where(lt(audioLogs.createdAt, thirtyDaysAgo));
      const oldAudioCount = (oldAudioResult as any).count ?? 0;
      const oldTextsResult = await db.delete(savedTexts).where(lt(savedTexts.createdAt, thirtyDaysAgo));
      const oldTextsCount = (oldTextsResult as any).count ?? 0;

      console.log(`[Cron] All tasks complete.`);
      res.json({
        success: true,
        notifications: { sent: sentCount, skipped: skippedCount },
        renewalReminders: renewalRemindersSent,
        cleanup: { expiredTokens: expiredTokensCount, oldAudioLogs: oldAudioCount, oldSavedTexts: oldTextsCount },
      });
    } catch (error: any) {
      console.error("[Cron] Notification check error:", error.message);
      res.status(500).json({ success: false, error: "Notification check failed" });
    }
  });

  async function sendPasswordResetEmail(email: string, resetLink: string, isDeepLink = false): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) throw new Error("Email service not configured properly");

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

    await transporter.verify();

    const linkType = isDeepLink ? "mobile app" : "web browser";
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reset Your Password</title></head>
      <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
          <h1 style="color:white;margin:0;">MyVoicePost</h1></div>
        <div style="background:#fff;padding:30px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
          <h2>Reset Your Password</h2><p>We received a request to reset your password.</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${resetLink}" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Reset Password</a>
          </div>
          <p style="color:#666;font-size:14px;">Or copy and paste this link into your ${linkType}:</p>
          <p style="background:#f5f5f5;padding:12px;border-radius:6px;word-break:break-all;font-size:13px;">${resetLink}</p>
          <p style="color:#888;font-size:13px;"><strong>This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).</strong></p>
          <p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </body></html>`;

    await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: "Reset Your MyVoicePost Password",
      text: `Reset your MyVoicePost password: ${resetLink}\n\nThis link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).`,
      html: htmlContent,
    });

    console.log("[EMAIL SERVICE] Password reset email sent to", email);
  }

  function generateErrorPage(title: string, message: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} - MyVoicePost</title>
      <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
      .container{background:white;padding:40px;border-radius:12px;text-align:center;max-width:400px}h1{color:#e74c3c}p{color:#666}
      .btn{display:inline-block;padding:14px 30px;margin-top:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;border-radius:8px;font-weight:bold}</style>
      </head><body><div class="container"><h1>${title}</h1><p>${message}</p>
      <a href="${WEB_APP_URL}" class="btn">Go to MyVoicePost</a></div></body></html>`;
  }

  async function getAdminEmails(): Promise<string[]> {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.settingKey, "admin_mail")).limit(1);
      if (result.length > 0 && result[0].settingValue) {
        return result[0].settingValue.split(",").map((e) => e.trim()).filter(Boolean);
      }
    } catch (err: any) {
      console.warn("[CRASH REPORT] Could not fetch admin emails:", err.message);
    }
    return [];
  }

  async function sendCrashReportEmail(opts: {
    source: string;
    errorMessage: string;
    stackTrace?: string;
    userId?: string;
    deviceInfo?: string;
    appVersion?: string;
    endpoint?: string;
  }) {
    const throttleKey = `${opts.source}:${opts.errorMessage.substring(0, 100)}`;
    const now = Date.now();
    if (crashEmailThrottle[throttleKey] && (now - crashEmailThrottle[throttleKey]) < CRASH_EMAIL_COOLDOWN_MS) {
      console.log("[CRASH REPORT] Throttled - same error reported recently");
      return;
    }
    crashEmailThrottle[throttleKey] = now;

    try {
      await db.insert(crashReports).values({
        source: opts.source,
        errorMessage: opts.errorMessage,
        stackTrace: opts.stackTrace || null,
        userId: opts.userId || null,
        deviceInfo: opts.deviceInfo || null,
        appVersion: opts.appVersion || null,
        endpoint: opts.endpoint || null,
        emailSent: false,
      });
    } catch (dbErr: any) {
      console.error("[CRASH REPORT] DB insert failed:", dbErr.message);
    }

    const adminEmails = await getAdminEmails();
    if (adminEmails.length === 0) return;

    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      if (!smtpHost || !smtpUser || !smtpPass) return;

      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpSecure = process.env.SMTP_SECURE === "true";
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || smtpUser,
        to: adminEmails.join(","),
        subject: `[${opts.source.toUpperCase()}] Crash Report: ${opts.errorMessage.substring(0, 80)}`,
        text: `Source: ${opts.source}\nError: ${opts.errorMessage}\nStack: ${opts.stackTrace || "N/A"}\nUser: ${opts.userId || "N/A"}\nDevice: ${opts.deviceInfo || "N/A"}\nVersion: ${opts.appVersion || "N/A"}\nEndpoint: ${opts.endpoint || "N/A"}`,
      });

      await db.update(crashReports).set({ emailSent: true }).where(eq(crashReports.errorMessage, opts.errorMessage));
    } catch (emailErr: any) {
      console.error("[CRASH REPORT] Email send failed:", emailErr.message);
    }
  }

  async function logUsageAndGetTrialInfo(userId: string, durationSeconds: number, language: string, tag: string) {
    if (userId && durationSeconds > 0) {
      try {
        const totalSec = Math.round(durationSeconds);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        const usageTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        await db.insert(audioLogs).values({ userId, usageTime, usageSeconds: totalSec, sourceLanguage: language || "auto" });

        const usageMinutes = totalSec / 60;
        await db.update(users)
          .set({ trialMinutesUsed: sql`COALESCE(${users.trialMinutesUsed}, '0')::numeric + ${usageMinutes}`, updatedAt: new Date() })
          .where(eq(users.id, userId));

        console.log(`[${tag}] USAGE LOGGED: ${usageTime} (${usageMinutes.toFixed(2)} mins) for user ${userId}`);
      } catch (logError: any) {
        console.error(`[${tag}] USAGE LOG FAILED:`, logError.message);
      }
    }

    if (!userId) return null;

    try {
      const updatedUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (updatedUser.length > 0) {
        const u = updatedUser[0];
        const minutesTotal = u.trialMinutesTotal || 90;
        const minutesUsed = parseFloat(String(u.trialMinutesUsed || "0")) || 0;
        const hasActiveSub = await db.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
          .limit(1);
        return { trial_minutes_total: minutesTotal, trial_minutes_used: minutesUsed, is_subscribed: hasActiveSub.length > 0 };
      }
    } catch (err: any) {
      console.error(`[${tag}] TRIAL INFO FAILED:`, err.message);
    }
    return null;
  }

  async function adminCheckMiddleware(req: any, res: any, next: any) {
    try {
      const adminEmails = await getAdminEmails();
      const userEmail = req.jwtUser?.email || req.user?.email;
      if (!userEmail || !adminEmails.map((e: string) => e.toLowerCase()).includes(userEmail.toLowerCase())) {
        return res.status(403).json({ success: false, error: "Admin access required" });
      }
      next();
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Authorization check failed" });
    }
  }

  // ============================================================
  // AUTH SHORTCUT ALIASES (mobile-compatible endpoints)
  // ============================================================

  app.post("/api/v1/p/login", async (req, res, next) => {
    req.url = "/api/v1/p/auth/login";
    (app as any).handle(req, res, next);
  });

  app.post("/api/v1/p/register", async (req, res, next) => {
    req.url = "/api/v1/p/auth/signup";
    (app as any).handle(req, res, next);
  });

  app.post("/api/v1/a/logout", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId;
      if (userId) {
        await db.update(users).set({ activeSessionId: null }).where(eq(users.id, userId));
      }
    } catch (err) {
      console.error("[Logout] Error clearing session:", err);
    }
    res.json({ success: true, message: "Logged out successfully" });
  });

  app.get("/api/v1/a/me", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });

      const userResult = await db.select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        trialMinutesTotal: users.trialMinutesTotal,
        trialMinutesUsed: users.trialMinutesUsed,
        trialStartsAt: users.trialStartsAt,
        trialEndsAt: users.trialEndsAt,
        trialUsed: users.trialUsed,
      }).from(users).where(eq(users.id, userId)).limit(1);

      if (userResult.length === 0) return res.status(404).json({ success: false, error: "User not found" });

      const u = userResult[0];
      const minutesTotal = u.trialMinutesTotal || 90;
      const minutesUsed = parseFloat(String(u.trialMinutesUsed || "0"));

      res.json({
        success: true,
        user: { id: u.id, email: u.email, username: u.username, role: u.role },
        trial: {
          minutes_total: minutesTotal,
          minutes_used: minutesUsed,
          minutes_remaining: Math.max(0, minutesTotal - minutesUsed),
          starts_at: u.trialStartsAt,
          ends_at: u.trialEndsAt,
          trial_used: u.trialUsed,
        },
      });
    } catch (error: any) {
      console.error("[GET /api/v1/a/me] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch user data" });
    }
  });

  // ============================================================
  // PASSWORD RESET (mobile — 6-char code based)
  // ============================================================

  app.post("/api/v1/p/forgot-password", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email("Valid email is required") });
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) return res.status(400).json({ success: false, error: "Invalid email", details: parseResult.error.errors });

      const { email } = parseResult.data;
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = result[0];

      if (!user) {
        return res.json({ success: true, message: "If an account with that email exists, a password reset code has been sent." });
      }

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      const randomBytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) code += chars[randomBytes[i] % chars.length];

      const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(passwordResetTokens).values({ userId: user.id, token: hashedCode, expiresAt });

      await sendPasswordResetEmail(
        user.email!,
        `Your password reset code is: ${code}\n\nThis code will expire in 15 minutes.`,
        true
      );

      const response: any = { success: true, message: "If an account with that email exists, a password reset code has been sent." };
      if (process.env.NODE_ENV !== "production") response.code = code;

      res.json(response);
    } catch (error: any) {
      console.error("[Forgot Password] Error:", error);
      res.status(500).json({ success: false, error: "Failed to process password reset request" });
    }
  });

  app.post("/api/v1/p/reset-password", async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email("Must be a valid email format"),
        code: z.string().length(6, "Code must be exactly 6 characters"),
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
        confirmPassword: z.string(),
      }).refine((data) => data.newPassword === data.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) return res.status(400).json({ success: false, error: "Validation failed", details: parseResult.error.errors });

      const { email, code, newPassword } = parseResult.data;

      const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (userResult.length === 0) return res.status(400).json({ success: false, error: "Invalid email or code" });

      const user = userResult[0];
      const hashedCode = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");

      const tokenResult = await db.select().from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.token, hashedCode)))
        .limit(1);

      if (tokenResult.length === 0) return res.status(400).json({ success: false, error: "Invalid or expired reset code. Please request a new one." });

      const tokenRecord = tokenResult[0];
      if (new Date() > tokenRecord.expiresAt) return res.status(400).json({ success: false, error: "This reset code has expired. Please request a new one." });
      if (tokenRecord.used) return res.status(400).json({ success: false, error: "This reset code has already been used." });

      const bcryptjs = await import("bcryptjs");
      const hashedPassword = await bcryptjs.default.hash(newPassword, 10);

      await db.update(users).set({ passwordHash: hashedPassword, updatedAt: new Date() }).where(eq(users.id, user.id));
      await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, tokenRecord.id));

      res.json({ success: true, message: "Password has been reset successfully. You can now log in with your new password." });
    } catch (error: any) {
      console.error("[Reset Password] Error:", error);
      res.status(500).json({ success: false, error: "Failed to reset password" });
    }
  });

  // Web deep-link redirect page for password reset
  app.get("/api/v1/auth/reset-password", async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invalid Link - MyVoicePost</title>
        <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
        .container{background:white;padding:40px;border-radius:12px;text-align:center;max-width:400px}h1{color:#e74c3c}p{color:#666}</style></head>
        <body><div class="container"><h1>Invalid Link</h1><p>This password reset link is invalid or missing the token.</p></div></body></html>`);
    }

    try {
      const tokenResult = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
      const resetTokenRecord = tokenResult[0];
      if (!resetTokenRecord) return res.status(400).send(generateErrorPage("Invalid Link", "This password reset link is invalid."));
      if (new Date() > resetTokenRecord.expiresAt) return res.status(400).send(generateErrorPage("Link Expired", "This password reset link has expired."));
      if (resetTokenRecord.used) return res.status(400).send(generateErrorPage("Link Already Used", "This password reset link has already been used."));
    } catch (error) {
      console.error("[Deep Link] Error validating token:", error);
    }

    const customSchemeUrl = `${APP_SCHEME}://reset-password?token=${token}`;
    const webFallbackUrl = `${WEB_APP_URL}/reset-password?token=${token}`;
    const androidIntentUrl = `intent://reset-password?token=${token}#Intent;scheme=${APP_SCHEME};package=com.myvoicepost.app;S.browser_fallback_url=${encodeURIComponent(webFallbackUrl)};end`;

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reset Password - MyVoicePost</title>
      <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
      .container{background:white;padding:40px;border-radius:12px;text-align:center;max-width:400px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
      h1{color:#333;margin-bottom:10px}p{color:#666;margin-bottom:20px}
      .spinner{width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #667eea;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
      @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
      .btn{display:inline-block;padding:14px 30px;margin:10px 5px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;border-radius:8px;font-weight:bold}
      .btn-secondary{background:#f5f5f5;color:#333}.hidden{display:none}</style></head>
      <body><div class="container"><h1>Reset Password</h1>
      <div id="loading"><p>Opening MyVoicePost app...</p><div class="spinner"></div></div>
      <div id="fallback" class="hidden"><p>If the app didn't open automatically:</p>
      <a href="${customSchemeUrl}" class="btn">Open in App</a>
      <a href="${webFallbackUrl}" class="btn btn-secondary">Continue on Web</a></div></div>
      <script>(function(){var isAndroid=/android/i.test(navigator.userAgent);var appOpened=false;
      function tryOpenApp(){window.location.href=isAndroid?"${androidIntentUrl}":"${customSchemeUrl}";}
      function showFallback(){if(!appOpened){document.getElementById('loading').classList.add('hidden');document.getElementById('fallback').classList.remove('hidden');}}
      document.addEventListener('visibilitychange',function(){if(document.hidden)appOpened=true;});
      tryOpenApp();setTimeout(showFallback,2500);})();</script></body></html>`);
  });

  // ============================================================
  // GOOGLE OAUTH (start / callback)
  // ============================================================

  app.get("/api/v1/p/auth/google/start", (req, res) => {
    const { clientId, redirectUri } = GOOGLE_SSO_CONFIG;
    if (!clientId) return res.status(500).send("Google SSO is not configured.");

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state,
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/v1/p/auth/google/callback", async (req, res) => {
    try {
      const { code, error: oauthError } = req.query;
      if (oauthError || !code) {
        return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=${encodeURIComponent(String(oauthError || "no_code"))}`);
      }

      const { clientId, clientSecret, redirectUri } = GOOGLE_SSO_CONFIG;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=token_exchange_failed`);
      }

      const tokenData: any = await tokenResponse.json();
      const idToken = tokenData.id_token;
      if (!idToken) return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=no_id_token`);

      const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (!googleResponse.ok) return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=token_verify_failed`);

      const googleUser: any = await googleResponse.json();
      if (!googleUser.email || googleUser.email_verified !== "true") {
        return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=email_not_verified`);
      }

      const normalizedEmail = googleUser.email.toLowerCase().trim();
      const googleId = googleUser.sub;

      const existingSso = await db.select().from(userSsoAccounts)
        .where(and(eq(userSsoAccounts.provider, "google"), eq(userSsoAccounts.providerUserId, googleId)))
        .limit(1);

      let jwtToken: string;

      if (existingSso.length > 0) {
        const userRows = await db.select().from(users).where(eq(users.id, existingSso[0].userId)).limit(1);
        if (userRows.length === 0) return res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=user_not_found`);
        const user = userRows[0];
        const ssoSessionId = generateSessionId();
        await storeSessionId(user.id, ssoSessionId);
        jwtToken = jwt.sign({ userId: user.id, email: user.email, username: user.username, sessionId: ssoSessionId }, JWT_SECRET, { expiresIn: "60d" });
        await db.update(userSsoAccounts).set({ updatedAt: new Date() }).where(eq(userSsoAccounts.id, existingSso[0].id));
      } else {
        const existingByEmail = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
        let user: typeof users.$inferSelect;

        if (existingByEmail.length > 0) {
          user = existingByEmail[0];
          await db.insert(userSsoAccounts).values({
            userId: user.id, provider: "google", providerUserId: googleId,
            providerEmail: normalizedEmail, providerName: googleUser.name, providerAvatar: googleUser.picture,
          });
        } else {
          const usernameBase = (googleUser.name || normalizedEmail.split("@")[0]).replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 20);
          let finalUsername = usernameBase;
          let attempt = 0;
          while (true) {
            const existing = await db.select().from(users).where(eq(users.username, finalUsername)).limit(1);
            if (existing.length === 0) break;
            attempt++;
            finalUsername = `${usernameBase}_${attempt}`;
          }

          const [newUser] = await db.insert(users).values({
            username: finalUsername, email: normalizedEmail,
            passwordHash: crypto.randomUUID(),
            role: "USER" as const,
            trialStartsAt: new Date(),
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            trialMinutesTotal: 90,
          }).returning();
          user = newUser;

          await db.insert(userSsoAccounts).values({
            userId: user.id, provider: "google", providerUserId: googleId,
            providerEmail: normalizedEmail, providerName: googleUser.name, providerAvatar: googleUser.picture,
          });
        }

        const ssoSessionId = generateSessionId();
        await storeSessionId(user.id, ssoSessionId);
        jwtToken = jwt.sign({ userId: user.id, email: user.email, username: user.username, sessionId: ssoSessionId }, JWT_SECRET, { expiresIn: "60d" });
      }

      res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?token=${jwtToken}`);
    } catch (error: any) {
      console.error("[Google SSO Callback] Error:", error);
      res.redirect(`${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=internal_error`);
    }
  });

  // ============================================================
  // USAGE STATS & AUDIO LOGS
  // ============================================================

  app.get("/api/v1/a/usage-stats", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      if (!userId) return res.status(401).json({ success: false, error: "User not found" });

      const userResult = await db.select({
        trialMinutesTotal: users.trialMinutesTotal,
        trialMinutesUsed: users.trialMinutesUsed,
        trialStartsAt: users.trialStartsAt,
        trialEndsAt: users.trialEndsAt,
        trialUsed: users.trialUsed,
      }).from(users).where(eq(users.id, userId)).limit(1);

      if (userResult.length === 0) return res.status(404).json({ success: false, error: "User not found" });

      const u = userResult[0];
      const totalLogs = await db.select({
        count: sql<number>`count(*)::int`,
        totalSeconds: sql<number>`COALESCE(sum(${audioLogs.usageSeconds}), 0)::int`,
      }).from(audioLogs).where(eq(audioLogs.userId, userId));

      res.json({
        success: true,
        stats: {
          trialMinutesTotal: u.trialMinutesTotal || 90,
          trialMinutesUsed: parseFloat(String(u.trialMinutesUsed || "0")),
          trialStartsAt: u.trialStartsAt,
          trialEndsAt: u.trialEndsAt,
          trialUsed: u.trialUsed,
          totalTranscriptions: totalLogs[0]?.count || 0,
          totalUsageSeconds: totalLogs[0]?.totalSeconds || 0,
        },
      });
    } catch (error: any) {
      console.error("[Usage Stats] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch usage stats" });
    }
  });

  app.get("/api/v1/a/audio-logs", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      if (!userId) return res.status(401).json({ success: false, error: "User not found" });

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;

      const logs = await db.select().from(audioLogs)
        .where(eq(audioLogs.userId, userId))
        .orderBy(desc(audioLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(audioLogs).where(eq(audioLogs.userId, userId));

      res.json({ success: true, logs, total: countResult[0]?.count || 0, page, limit });
    } catch (error: any) {
      console.error("[Audio Logs] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch audio logs" });
    }
  });

  // ============================================================
  // SAVED TEXTS — individual record CRUD
  // ============================================================

  app.get("/api/v1/a/saved-texts/:id", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId;
      const result = await db.select().from(savedTexts).where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));
      if (result.length === 0) return res.status(404).json({ success: false, error: "Saved text not found" });
      res.json({ success: true, savedText: result[0] });
    } catch (error: any) {
      console.error("[Get Saved Text] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch saved text" });
    }
  });

  app.put("/api/v1/a/saved-texts/:id", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId;
      const { id } = req.params;

      const existing = await db.select().from(savedTexts).where(and(eq(savedTexts.id, id), eq(savedTexts.userId, userId)));
      if (existing.length === 0) return res.status(404).json({ success: false, error: "Saved text not found" });

      const schema = z.object({
        type: z.enum(["polish", "translate"]).optional(),
        originalText: z.string().optional(),
        polishedText: z.string().optional(),
        translatedText: z.string().nullable().optional(),
        sourceLanguage: z.string().optional(),
        targetLanguage: z.string().nullable().optional(),
        outputFormat: z.string().optional(),
        outputType: z.string().nullable().optional(),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) return res.status(400).json({ success: false, error: "Invalid request" });

      const updates: any = {};
      const data = parseResult.data;
      if (data.type) updates.type = data.type;
      if (data.originalText) updates.originalText = data.originalText;
      if (data.polishedText) updates.polishedText = data.polishedText;
      if (data.translatedText !== undefined) updates.translatedText = data.translatedText;
      if (data.sourceLanguage) updates.sourceLanguage = data.sourceLanguage;
      if (data.targetLanguage !== undefined) updates.targetLanguage = data.targetLanguage;
      if (data.outputFormat) updates.outputFormat = data.outputFormat;
      if (data.outputType !== undefined) updates.outputType = data.outputType;

      const result = await db.update(savedTexts).set(updates).where(eq(savedTexts.id, id)).returning();
      res.json({ success: true, savedText: result[0] });
    } catch (error: any) {
      console.error("[Update Saved Text] Error:", error);
      res.status(500).json({ success: false, error: "Failed to update saved text" });
    }
  });

  app.delete("/api/v1/a/saved-texts/:id", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId;
      const existing = await db.select().from(savedTexts).where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));
      if (existing.length === 0) return res.status(404).json({ success: false, error: "Saved text not found" });
      await db.delete(savedTexts).where(eq(savedTexts.id, req.params.id));
      res.json({ success: true, message: "Saved text deleted successfully" });
    } catch (error: any) {
      console.error("[Delete Saved Text] Error:", error);
      res.status(500).json({ success: false, error: "Failed to delete saved text" });
    }
  });

  // ============================================================
  // SUBSCRIPTION: PRE-SUBSCRIBE CHECK, TOPUP, CONFIRM, REACTIVATE, UPDATE PAYMENT
  // ============================================================

  app.post("/api/v1/a/pre-subscribe-check", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      const trial = await getTrialInfo(userId);
      const now = new Date();
      const activeSubResult = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active"), gte(userSubscriptions.validDateUpto, now)))
        .limit(1);

      let currentPlanName: string | null = null;
      let currentValidUntil: string | null = null;
      let currentMinutesRemaining = 0;
      let currentDaysRemaining = 0;

      if (activeSubResult.length > 0) {
        const sub = activeSubResult[0];
        const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
        if (planResult.length > 0) currentPlanName = planResult[0].name;
        currentValidUntil = sub.validDateUpto.toISOString();
        currentMinutesRemaining = parseFloat(String(sub.minutesRemaining || "0"));
        const remainMs = Math.max(0, sub.validDateUpto.getTime() - Date.now());
        currentDaysRemaining = Math.ceil(remainMs / (1000 * 60 * 60 * 24));
      }

      const hasActiveAccess = (trial !== null && trial.is_active && trial.minutes_remaining > 0) || activeSubResult.length > 0;

      res.json({
        success: true,
        has_active_access: hasActiveAccess,
        is_subscribed: activeSubResult.length > 0,
        current_plan_name: currentPlanName,
        current_valid_until: currentValidUntil,
        current_minutes_remaining: trial?.minutes_remaining ?? currentMinutesRemaining,
        current_days_remaining: trial?.days_remaining ?? currentDaysRemaining,
        trial_status: trial?.status || null,
      });
    } catch (error: any) {
      console.error("[Pre-Subscribe Check] Error:", error);
      res.status(500).json({ success: false, error: "Failed to check subscription status" });
    }
  });

  async function handleCreateTopupCheckout(req: Request, res: Response, userId: string) {
    try {
      const priceId = process.env.STRIPE_TOPUP_PRICE_ID;
      if (!priceId) return res.status(500).json({ success: false, error: "Top-up is not configured. Please contact support." });

      const stripe = await getUncachableStripeClient();
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) return res.status(404).json({ success: false, error: "User not found" });

      const now = new Date();
      const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
      const hasTimeRemaining = trialEndsAt && trialEndsAt > now;
      if (!hasTimeRemaining) {
        const activeSub = await db.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active"), gte(userSubscriptions.validDateUpto, now)))
          .limit(1);
        if (activeSub.length === 0) {
          return res.status(400).json({ success: false, error: "Top-up requires an active trial or subscription period. Please subscribe first." });
        }
      }

      let customerId = user.stripeCustomerId;
      if (customerId) {
        try { await stripe.customers.retrieve(customerId); } catch { customerId = null; }
      }
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email || undefined, metadata: { userId } });
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(users.id, userId));
      }

      const price = await stripe.prices.retrieve(priceId);
      if (!price.unit_amount) return res.status(500).json({ success: false, error: "Invalid price configuration" });

      await cleanupStalePayments(customerId);

      const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: "2024-06-20" as any });
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price.unit_amount,
        currency: price.currency,
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: { userId, type: "topup", topup_minutes: String(TOPUP_MINUTES) },
      });

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customerId,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      console.error("[Create Topup Checkout] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to create top-up checkout" });
    }
  }

  app.post("/api/v1/a/create-topup-checkout", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId || req.jwtUser?.id;
    await handleCreateTopupCheckout(req, res, userId);
  });

  async function handleConfirmTopup(req: Request, res: Response, userId: string) {
    try {
      const { paymentIntentId } = req.body;
      if (!paymentIntentId) return res.status(400).json({ success: false, error: "paymentIntentId is required" });

      const stripe = await getUncachableStripeClient();
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ success: false, error: `Payment not completed. Status: ${paymentIntent.status}` });
      }

      const piMetadata = paymentIntent.metadata || {};
      if (piMetadata.type !== "topup" || piMetadata.userId !== userId) {
        return res.status(400).json({ success: false, error: "Invalid payment intent for this user" });
      }

      const topupMinutes = parseInt(piMetadata.topup_minutes || "60", 10);

      const existingTopup = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, paymentIntentId)))
        .limit(1);
      if (existingTopup.length > 0) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        return res.json({ success: true, message: "Top-up already applied", trialMinutesTotal: user[0]?.trialMinutesTotal || 90 });
      }

      const result = await db.transaction(async (tx) => {
        const lockKey = paymentIntentId.split("").reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

        const doubleCheck = await tx.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, paymentIntentId)))
          .limit(1);
        if (doubleCheck.length > 0) return { alreadyApplied: true };

        const userResult = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (userResult.length === 0) throw new Error("User not found");
        const user = userResult[0];
        const newMinutesTotal = (user.trialMinutesTotal || 90) + topupMinutes;

        await tx.update(users).set({ trialMinutesTotal: newMinutesTotal, updatedAt: new Date() }).where(eq(users.id, userId));

        const activeSub = await tx.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
          .limit(1);
        if (activeSub.length > 0) {
          const existingRemaining = parseFloat(String(activeSub[0].minutesRemaining || "0"));
          await tx.update(userSubscriptions)
            .set({ minutesRemaining: String(existingRemaining + topupMinutes) })
            .where(eq(userSubscriptions.id, activeSub[0].id));
        }

        let topupPlanId: string;
        const topupPlanResult = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "Top-Up")).limit(1);
        if (topupPlanResult.length > 0) {
          topupPlanId = topupPlanResult[0].id;
        } else {
          const [newPlan] = await tx.insert(subscriptionPlans).values({
            name: "Top-Up", validTotalMinutes: 60, validDays: 0, recordingsAvailableDays: 0,
            chunksCount: 0, offlineRecording: false, priceMonthly: 500, isVisible: false,
          }).returning();
          topupPlanId = newPlan.id;
        }

        await tx.insert(userSubscriptions).values({
          userId, planId: topupPlanId, status: "completed",
          minutesRemaining: String(topupMinutes), paymentToken: paymentIntentId, validDateUpto: new Date(),
        });

        const newRemaining = newMinutesTotal - parseFloat(String(user.trialMinutesUsed || "0"));
        return { alreadyApplied: false, newMinutesTotal, newRemaining };
      });

      if (result.alreadyApplied) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        return res.json({ success: true, message: "Top-up already applied", trialMinutesTotal: user[0]?.trialMinutesTotal || 90 });
      }

      res.json({
        success: true,
        message: `Top-up of ${topupMinutes} minutes applied successfully`,
        trialMinutesTotal: result.newMinutesTotal,
        minutesRemaining: parseFloat(result.newRemaining!.toFixed(2)),
      });
    } catch (error: any) {
      console.error("[Confirm Topup] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to confirm top-up" });
    }
  }

  app.post("/api/v1/a/confirm-topup", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId || req.jwtUser?.id;
    await handleConfirmTopup(req, res, userId);
  });

  async function handlePaymentHistory(_req: Request, res: Response, userId: string) {
    try {
      const subRecords = await db.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(50);

      const planIds = Array.from(new Set(subRecords.map((s) => s.planId)));
      const plans: Record<string, any> = {};
      for (const planId of planIds) {
        const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
        if (planResult.length > 0) plans[planId] = planResult[0];
      }

      const userResult = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
      const stripeCustomerId = userResult[0]?.stripeCustomerId;

      let stripePayments: any[] = [];
      if (stripeCustomerId) {
        try {
          const stripe = await getUncachableStripeClient();
          const charges = await stripe.charges.list({ customer: stripeCustomerId, limit: 50 });
          stripePayments = charges.data.map((ch) => ({
            id: ch.payment_intent,
            chargeId: ch.id,
            amount: ch.amount,
            currency: ch.currency,
            status: ch.status,
            created: ch.created,
            description: ch.description,
            metadata: ch.metadata,
            cardBrand: ch.payment_method_details?.card?.brand || null,
            cardLast4: ch.payment_method_details?.card?.last4 || null,
            receiptUrl: ch.receipt_url,
            refunded: ch.refunded,
          }));
        } catch (stripeErr: any) {
          console.warn("[Payment History] Stripe error:", stripeErr.message);
        }
      }

      const matchedChargeIds = new Set<any>();
      const payments = subRecords.map((sub) => {
        const plan = plans[sub.planId];
        let stripeCharge: any = null;
        if (sub.paymentToken) {
          stripeCharge = stripePayments.find((sp) => sp.id === sub.paymentToken || sp.chargeId === sub.paymentToken);
          if (stripeCharge) matchedChargeIds.add(stripeCharge.id);
        }
        return {
          id: sub.id,
          type: plan?.name === "Top-Up" ? "topup" : "subscription",
          planName: plan?.name || "Unknown",
          amount: stripeCharge?.amount || null,
          currency: stripeCharge?.currency || "usd",
          status: sub.status,
          minutesAdded: plan?.validTotalMinutes || null,
          date: sub.createdAt,
          validUntil: sub.validDateUpto,
          cardBrand: stripeCharge?.cardBrand || null,
          cardLast4: stripeCharge?.cardLast4 || null,
          receiptUrl: stripeCharge?.receiptUrl || null,
          refunded: stripeCharge?.refunded || false,
        };
      });

      const unmatchedCharges = stripePayments
        .filter((sp) => !matchedChargeIds.has(sp.id))
        .map((sp) => ({
          id: sp.id,
          type: sp.metadata?.type === "topup" ? "topup" : "stripe_charge",
          planName: sp.description || "Stripe Payment",
          amount: sp.amount,
          currency: sp.currency,
          status: sp.status,
          minutesAdded: sp.metadata?.topup_minutes ? parseInt(sp.metadata.topup_minutes) : null,
          date: sp.created,
          validUntil: null,
          cardBrand: sp.cardBrand,
          cardLast4: sp.cardLast4,
          receiptUrl: sp.receiptUrl,
          refunded: sp.refunded,
        }));

      const allPayments = [...payments, ...unmatchedCharges].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db_ = b.date ? new Date(b.date).getTime() : 0;
        return db_ - da;
      });

      res.json({ success: true, payments: allPayments, total: allPayments.length });
    } catch (error: any) {
      console.error("[Payment History] Error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch payment history" });
    }
  }

  app.get("/api/v1/a/payment-history", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId || req.jwtUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
    await handlePaymentHistory(req, res, userId);
  });

  app.post("/api/v1/a/confirm-subscription", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId;
    try {
      const { subscriptionId } = req.body;
      if (!subscriptionId) return res.status(400).json({ success: false, error: "subscriptionId is required" });

      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) return res.status(404).json({ success: false, error: "User not found" });

      const stripe = await getUncachableStripeClient();
      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

      const stripeCustomerId = typeof stripeSub.customer === "string" ? stripeSub.customer : (stripeSub.customer as any)?.id;
      if (!user.stripeCustomerId || stripeCustomerId !== user.stripeCustomerId) {
        return res.status(403).json({ success: false, error: "This subscription does not belong to your account" });
      }

      if (user.stripeSubscriptionId !== subscriptionId) {
        await db.update(users).set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() }).where(eq(users.id, userId));
      }

      if (stripeSub.status === "active" || stripeSub.status === "trialing") {
        const existingForThisSub = await db.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, subscriptionId), eq(userSubscriptions.status, "active")))
          .limit(1);
        if (existingForThisSub.length > 0) {
          return res.json({ success: true, message: "Subscription is active", status: stripeSub.status });
        }

        const existingActive = await db.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
          .limit(1);
        if (existingActive.length > 0) {
          const role = await refreshUserRole(userId);
          const accessInfo = await checkUserAccess(userId);
          return res.json({ success: true, message: "Subscription is active", status: stripeSub.status, role, ...accessInfo });
        }

        const priceId = stripeSub.items.data[0]?.price?.id;
        let matchedPlan: any = null;
        if (priceId) {
          const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.stripePriceId, priceId)).limit(1);
          matchedPlan = planResult[0] || null;
        }
        if (!matchedPlan) {
          const fallbackResult = await db.select().from(subscriptionPlans).where(gte(subscriptionPlans.priceMonthly, 1)).limit(1);
          matchedPlan = fallbackResult[0] || null;
        }

        if (matchedPlan) {
          const now = new Date();
          const planMinutes = matchedPlan.validTotalMinutes || 0;
          const planDays = matchedPlan.validDays || 30;
          const newTrialEndsAt = new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);

          const [newSubRecord] = await db.insert(userSubscriptions).values({
            userId, planId: matchedPlan.id, validDateUpto: newTrialEndsAt,
            minutesUsed: 0, chunksUsed: 0, minutesRemaining: String(planMinutes),
            paymentToken: subscriptionId, status: "active",
          }).returning();

          if (newSubRecord) {
            await db.update(users).set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() }).where(eq(users.id, userId));
          }
        }
      }

      const role = await refreshUserRole(userId);
      const accessInfo = await checkUserAccess(userId);
      res.json({ success: true, message: "Subscription confirmed", status: stripeSub.status, role, ...accessInfo });
    } catch (error: any) {
      console.error("[Confirm Subscription] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to confirm subscription" });
    }
  });

  async function handleReactivateSubscription(_req: Request, res: Response, userId: string) {
    try {
      const schema = z.object({ subscriptionId: z.string().min(1, "Subscription ID is required") });
      const parseResult = schema.safeParse(_req.body);
      if (!parseResult.success) return res.status(400).json({ success: false, error: "Validation failed", details: parseResult.error.errors });

      const { subscriptionId } = parseResult.data;
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      if (user.stripeSubscriptionId !== subscriptionId) return res.status(403).json({ success: false, error: "You can only reactivate your own subscription" });

      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      const periodEnd = (subscription as any).current_period_end;

      res.json({
        success: true,
        message: "Auto-renewal has been turned back on",
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      });
    } catch (error: any) {
      console.error("[Reactivate Subscription] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to reactivate subscription" });
    }
  }

  app.post("/api/v1/a/reactivate-subscription", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId;
    await handleReactivateSubscription(req, res, userId);
  });

  async function handleUpdatePaymentMethod(_req: Request, res: Response, userId: string) {
    try {
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      if (!user.stripeCustomerId) return res.status(400).json({ success: false, error: "No Stripe customer found. Please subscribe first." });

      const stripe = await getUncachableStripeClient();
      try { await stripe.customers.retrieve(user.stripeCustomerId); } catch {
        return res.status(400).json({ success: false, error: "Stripe customer not found" });
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: user.stripeCustomerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { userId, purpose: "update_payment_method" },
      });

      const ephemeralKey = await stripe.ephemeralKeys.create({ customer: user.stripeCustomerId }, { apiVersion: "2024-06-20" as any });

      res.json({
        success: true,
        clientSecret: setupIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customerId: user.stripeCustomerId,
        setupIntentId: setupIntent.id,
      });
    } catch (error: any) {
      console.error("[Update Payment Method] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to create setup intent" });
    }
  }

  app.post("/api/v1/a/update-payment-method", mobileAuthMiddleware, async (req: any, res) => {
    const userId = req.jwtUser?.userId;
    await handleUpdatePaymentMethod(req, res, userId);
  });

  // ============================================================
  // PUSH TOKENS
  // ============================================================

  app.post("/api/v1/a/push-token", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });

      const { pushToken, platform, deviceId } = req.body;
      if (!pushToken) return res.status(400).json({ success: false, error: "Push token is required" });

      const existing = await db.select().from(pushTokens)
        .where(and(eq(pushTokens.userId, userId), eq(pushTokens.pushToken, pushToken)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(pushTokens)
          .set({ isActive: true, platform: platform || "expo", deviceId: deviceId || null, updatedAt: new Date() })
          .where(eq(pushTokens.id, existing[0].id));
      } else {
        await db.insert(pushTokens).values({ userId, pushToken, platform: platform || "expo", deviceId: deviceId || null });
      }

      res.json({ success: true, message: "Push token registered" });
    } catch (error: any) {
      console.error("[Push Token] Error:", error.message);
      res.status(500).json({ success: false, error: "Failed to register push token" });
    }
  });

  app.delete("/api/v1/a/push-token", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      const { pushToken } = req.body;
      if (!pushToken) return res.status(400).json({ success: false, error: "Push token is required" });

      await db.update(pushTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(pushTokens.userId, userId), eq(pushTokens.pushToken, pushToken)));

      res.json({ success: true, message: "Push token unregistered" });
    } catch (error: any) {
      console.error("[Push Token Unregister] Error:", error.message);
      res.status(500).json({ success: false, error: "Failed to unregister push token" });
    }
  });

  // ============================================================
  // CRASH REPORTS
  // ============================================================

  app.post("/api/v1/a/crash-report", async (req: any, res) => {
    try {
      const clientIp = String(req.headers["x-forwarded-for"] || req.ip || "unknown");
      const now = Date.now();
      if (!crashReportRateLimit[clientIp] || crashReportRateLimit[clientIp].resetAt < now) {
        crashReportRateLimit[clientIp] = { count: 0, resetAt: now + CRASH_RATE_LIMIT_WINDOW_MS };
      }
      crashReportRateLimit[clientIp].count++;
      if (crashReportRateLimit[clientIp].count > CRASH_RATE_LIMIT_MAX) {
        return res.status(429).json({ success: false, error: "Too many crash reports. Please try again later." });
      }

      const { errorMessage, stackTrace, deviceInfo, appVersion, userId } = req.body;
      if (!errorMessage || typeof errorMessage !== "string") {
        return res.status(400).json({ success: false, error: "errorMessage is required" });
      }

      const safeErrorMessage = errorMessage.substring(0, 2000);
      const safeStackTrace = typeof stackTrace === "string" ? stackTrace.substring(0, 10000) : undefined;
      const safeDeviceInfo = typeof deviceInfo === "string" ? deviceInfo.substring(0, 500) : undefined;
      const safeAppVersion = typeof appVersion === "string" ? appVersion.substring(0, 20) : undefined;

      console.error(`[MOBILE CRASH] ${safeErrorMessage}`);

      sendCrashReportEmail({
        source: "mobile",
        errorMessage: safeErrorMessage,
        stackTrace: safeStackTrace,
        deviceInfo: safeDeviceInfo,
        appVersion: safeAppVersion,
        userId: typeof userId === "string" ? userId : undefined,
      }).catch((err: any) => console.error("[MOBILE CRASH] Email error:", err.message));

      res.json({ success: true, message: "Crash report received" });
    } catch (error: any) {
      console.error("[MOBILE CRASH] Error processing report:", error.message);
      res.status(500).json({ success: false, error: "Failed to process crash report" });
    }
  });

  app.get("/api/v1/a/crash-reports", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
    try {
      const reports = await db.select().from(crashReports).orderBy(desc(crashReports.createdAt)).limit(50);
      res.json({ success: true, reports });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // APP SETTINGS (admin only)
  // ============================================================

  app.get("/api/v1/a/app-settings/admin-mail", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.settingKey, "admin_mail")).limit(1);
      const emails = result.length > 0 ? result[0].settingValue : "";
      res.json({ success: true, adminMail: emails });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/v1/a/app-settings/admin-mail", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
    try {
      const { adminMail } = req.body;
      if (typeof adminMail !== "string") {
        return res.status(400).json({ success: false, error: "adminMail must be a string of comma-separated emails" });
      }

      const emails = adminMail.split(",").map((e: string) => e.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of emails) {
        if (!emailRegex.test(email)) return res.status(400).json({ success: false, error: `Invalid email address: ${email}` });
      }

      const existing = await db.select().from(appSettings).where(eq(appSettings.settingKey, "admin_mail")).limit(1);
      if (existing.length > 0) {
        await db.update(appSettings).set({ settingValue: emails.join(","), updatedAt: new Date() }).where(eq(appSettings.settingKey, "admin_mail"));
      } else {
        await db.insert(appSettings).values({ settingKey: "admin_mail", settingValue: emails.join(",") });
      }

      res.json({ success: true, adminMail: emails.join(",") });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // PROCESS AUDIO (transcribe + translate in one call)
  // ============================================================

  app.post("/api/v1/a/process-audio", mobileAuthMiddleware, async (req: any, res) => {
    try {
      const { audioBase64, mimeType, targetLanguage } = req.body || {};
      if (!targetLanguage) return res.status(400).json({ success: false, error: "Target language is required" });
      if (!audioBase64) return res.status(400).json({ success: false, error: "Audio data is required" });

      const audioMimeType = mimeType || "audio/webm";
      if (!PROCESS_AUDIO_CFG.isAudioTypeSupported(audioMimeType)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported audio type: ${audioMimeType}. Supported: ${PROCESS_AUDIO_CFG.PROCESS_AUDIO_SUPPORTED_TYPES.join(", ")}`,
        });
      }

      const rawByteLength = Math.ceil(audioBase64.length * 3 / 4);
      if (rawByteLength > PROCESS_AUDIO_CFG.PROCESS_AUDIO_MAX_SIZE_BYTES) {
        return res.status(400).json({ success: false, error: `Audio file too large. Maximum size is ${PROCESS_AUDIO_CFG.formatMaxSize()}.` });
      }

      const userId = req.jwtUser?.userId || req.jwtUser?.id;
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const transcribedText = await transcribeAudio(audioBuffer, audioMimeType);
      const sourceLanguage = await detectTextLanguage(transcribedText);

      let translatedText = transcribedText;
      if (sourceLanguage !== targetLanguage) {
        const result = await translateAndPolish(transcribedText, sourceLanguage, targetLanguage, "professional");
        translatedText = result.polishedText || result.translatedText || transcribedText;
      }

      res.json({
        success: true,
        sourceText: transcribedText,
        targetText: translatedText,
        sourceLanguage,
        targetLanguage,
        sourceType: "audio",
      });
    } catch (error: any) {
      console.error("[Process Audio] Error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to process audio" });
    }
  });

  return httpServer;
}
