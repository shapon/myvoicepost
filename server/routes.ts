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
} from "@shared/schema";
import type { UserRole } from "@shared/schema";
import nodemailer from "nodemailer";
import { transcribeAudio, translateAndPolish, polishText, transformTextWithTone, transcribeAudioFromUrl, toneCategories } from "./gemini";
import { db } from "./supabase-db";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
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
const JWT_EXPIRES_IN = "7d";

// Extend Express Request to include user from JWT
declare global {
  namespace Express {
    interface Request {
      jwtUser?: {
        userId: string;
        username: string;
        email?: string;
        role?: UserRole;
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

// Helper to generate JWT token
function generateToken(userId: string, username: string, role: UserRole = "GUEST"): string {
  return jwt.sign({ userId, username, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
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
    newRole = "GUEST";
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
          <p style="color: #888; font-size: 13px; margin-bottom: 0;">— The MyVoicePost Team</p>
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

  // Public: Transcribe audio to text
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

      const schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        mimeType: z.string().optional().default("audio/mp4"),
        language: z.string().optional().default("en"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, language } = parseResult.data;
      const audioBuffer = Buffer.from(audio, "base64");

      console.log(
        `[Public Transcribe] Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}`,
      );

      const originalText = await transcribeAudio(audioBuffer, mimeType);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error:
            "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Public Transcribe] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        language,
      });
    } catch (error: any) {
      console.error("[Public Transcribe] Error:", error);
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

      // Generate JWT token (valid for 7 days)
      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" },
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

      console.log(`[Public Login] User ${user.username} logged in successfully`);

      res.json({
        success: true,
        token,
        expiresIn: 7 * 24 * 60 * 60,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
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

      // Generate JWT token (valid for 3 days)
      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: "3d" },
      );

      console.log(`[Public Signup] User ${user.username} created successfully with 7-day trial`);

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        token,
        expiresIn: 3 * 24 * 60 * 60,
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
          const token = generateToken(user.id, user.username, currentRole);

          await db.update(userSsoAccounts)
            .set({ providerEmail: normalizedEmail, providerName: googleUser.name, providerAvatar: googleUser.picture, updatedAt: new Date() })
            .where(eq(userSsoAccounts.id, sso.id));

          return res.json({
            success: true,
            token,
            expiresIn: 7 * 24 * 60 * 60,
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
        const token = generateToken(user.id, user.username, currentRole);

        return res.json({
          success: true,
          token,
          expiresIn: 7 * 24 * 60 * 60,
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

      const token = generateToken(user.id, user.username, "GUEST");

      console.log(`[Google SSO] New user created: userId=${user.id}, username=${user.username}`);

      res.status(201).json({
        success: true,
        token,
        expiresIn: 7 * 24 * 60 * 60,
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
  // AUTHENTICATED API ENDPOINTS - /api/v1/m/
  // All endpoints require JWT authentication
  // ============================================================

  // Mobile JWT middleware - validates token and checks expiry (used for all mobile endpoints except login)
  function mobileAuthMiddleware(
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
        exp?: number;
      };
      req.jwtUser = decoded;

      // Check if token is expired (jwt.verify already does this, but we log it)
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        return res.status(401).json({
          success: false,
          error: "Token has expired. Please login again.",
        });
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
  app.post("/api/v1/m/auth/logout", mobileAuthMiddleware, (req, res) => {
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  });

  // Mobile Auth: Verify token and get user info (with live role refresh)
  app.get("/api/v1/m/auth/me", mobileAuthMiddleware, async (req, res) => {
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

  // Mobile: Transcribe audio to text (get original text)
  app.post("/api/v1/m/transcribe", mobileAuthMiddleware, async (req, res) => {
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
        language: z.string().optional().default("en"),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { audio, mimeType, language } = parseResult.data;
      const audioBuffer = Buffer.from(audio, "base64");

      console.log(
        `[Mobile Transcribe] User: ${userId}, Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}`,
      );

      const originalText = await transcribeAudio(audioBuffer, mimeType);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error:
            "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(
        `[Mobile Transcribe] Success: "${originalText.substring(0, 100)}..."`,
      );

      res.json({
        success: true,
        originalText,
        language,
      });
    } catch (error: any) {
      console.error("[Mobile Transcribe] Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Mobile: Polish text
  app.post("/api/v1/m/polish", mobileAuthMiddleware, async (req, res) => {
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
  app.post("/api/v1/m/translate", mobileAuthMiddleware, async (req, res) => {
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
  app.get("/api/v1/m/tone-categories", (req, res) => {
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
  app.post("/api/v1/m/process-url", mobileAuthMiddleware, async (req, res) => {
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
  app.post("/api/v1/m/transcribe-url", async (req, res) => {
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
  app.post("/api/v1/m/transcribe-file", upload.single("audio"), async (req, res) => {
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

      console.log(`[Process Transcribe-File] File: ${req.file.originalname}, Size: ${req.file.size} bytes, MIME: ${req.file.mimetype}`);

      const transcribedText = await transcribeAudio(req.file.buffer, req.file.mimetype);

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

  // Process: Transform text with selected tone
  app.post("/api/v1/m/transform-tone", async (req, res) => {
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
  app.post("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
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
  app.get("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
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
    "/api/v1/m/saved-texts/:id",
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
    "/api/v1/m/saved-texts/:id",
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
    "/api/v1/m/saved-texts/:id",
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

  // POST /api/v1/m/subscribe - Handle subscription purchase (requires auth)
  app.post("/api/v1/m/subscribe", mobileAuthMiddleware, async (req, res) => {
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

      // Promote role to USER on subscription activation (skip if ADMIN)
      const currentUserResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const currentUserRole = currentUserResult[0]?.role || "GUEST";
      let updatedRole: UserRole = currentUserRole as UserRole;
      if (currentUserRole !== "ADMIN") {
        await storage.updateUserRole(userId, "USER");
        updatedRole = "USER";
        console.log(`[RBAC] User ${userId} promoted to USER via subscription`);
      }

      console.log(
        `[Subscribe] User ${userId} subscribed to ${plan.name} plan until ${validDateUpto.toISOString()} (carryover: ${carryoverMinutes} mins)`,
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

  // POST /api/v1/m/check-access - Check if user has recording access
  app.post("/api/v1/m/check-access", mobileAuthMiddleware, async (req, res) => {
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

  // GET /api/v1/m/subscription - Get active subscription for logged-in user (with trial info)
  app.get("/api/v1/m/subscription", mobileAuthMiddleware, async (req, res) => {
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

  // GET /api/v1/m/settings - Get all settings for logged-in user
  app.get("/api/v1/m/settings", mobileAuthMiddleware, async (req, res) => {
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

  // PUT /api/v1/m/settings - Upsert settings for logged-in user (accepts array of settings)
  app.put("/api/v1/m/settings", mobileAuthMiddleware, async (req, res) => {
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

  // DELETE /api/v1/m/settings/:key - Delete a specific setting
  app.delete("/api/v1/m/settings/:key", mobileAuthMiddleware, async (req, res) => {
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

  // GET /api/subscription-status + /api/v1/m/subscription-status - Get current subscription status
  async function handleSubscriptionStatus(_req: Request, res: Response, userId: string) {
    try {
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userResult[0];
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const trial = await getTrialInfo(userId);

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

  app.get("/api/v1/m/subscription-status", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    await handleSubscriptionStatus(req, res, userId);
  });

  // POST /api/create-subscription (Web) + POST /api/v1/m/create-subscription (Mobile)
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

  app.post("/api/v1/m/create-subscription", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    const email = req.body.email;
    await handleCreateSubscription(req, res, userId, email);
  });

  // POST /api/cancel-subscription (Web) + POST /api/v1/m/cancel-subscription (Mobile)
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

  app.post("/api/v1/m/cancel-subscription", mobileAuthMiddleware, async (req, res) => {
    const userId = req.jwtUser?.userId!;
    await handleCancelSubscription(req, res, userId);
  });

  // POST /api/stripe-webhook + /api/v1/m/stripe-webhook - Stripe webhook handler
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

                  // Promote role to USER on successful payment (skip if ADMIN)
                  const currentUser = userResult[0];
                  if (currentUser.role !== "ADMIN") {
                    await storage.updateUserRole(user.id, "USER");
                    console.log(`[RBAC] User ${user.id} promoted to USER via invoice.paid`);
                  }

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

              // Demote role to GUEST on payment failure (skip if ADMIN)
              if (user.role !== "ADMIN") {
                await storage.updateUserRole(user.id, "GUEST");
                console.log(`[RBAC] User ${user.id} demoted to GUEST via payment failure`);
              }

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

                // Promote role to USER when subscription becomes active (skip if ADMIN)
                if (user.role !== "ADMIN") {
                  await storage.updateUserRole(user.id, "USER");
                  console.log(`[RBAC] User ${user.id} promoted to USER via subscription.updated(active)`);
                }
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

                // Demote role to GUEST on past_due/unpaid (skip if ADMIN)
                if (user.role !== "ADMIN") {
                  await storage.updateUserRole(user.id, "GUEST");
                  console.log(`[RBAC] User ${user.id} demoted to GUEST via subscription.updated(${newStatus})`);
                }
              }

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

              // Demote role to GUEST on subscription deletion (skip if ADMIN)
              if (user.role !== "ADMIN") {
                await storage.updateUserRole(user.id, "GUEST");
                console.log(`[RBAC] User ${user.id} demoted to GUEST via subscription.deleted`);
              }

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

  app.post("/api/v1/m/stripe-webhook", handleStripeWebhook);

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

  // GET /api/v1/m/user-role - Get current user role (refreshed from DB)
  app.get("/api/v1/m/user-role", mobileAuthMiddleware, async (req, res) => {
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

  // GET /api/v1/m/admin/stats - Dashboard summary stats
  app.get("/api/v1/m/admin/stats", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // GET /api/v1/m/admin/users - List all users
  app.get("/api/v1/m/admin/users", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // GET /api/v1/m/admin/subscriptions - List all subscriptions
  app.get("/api/v1/m/admin/subscriptions", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // GET /api/v1/m/admin/payments - List Stripe payment history
  app.get("/api/v1/m/admin/payments", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // GET /api/v1/m/admin/support - List support requests
  app.get("/api/v1/m/admin/support", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // PATCH /api/v1/m/admin/support/:id - Update support request status
  app.patch("/api/v1/m/admin/support/:id", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // GET /api/v1/m/admin/errors - List error logs
  app.get("/api/v1/m/admin/errors", jwtAuthMiddleware, checkRole("ADMIN"), async (req, res) => {
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

  // POST /api/v1/m/support - Submit a support request (any authenticated user)
  app.post("/api/v1/m/support", jwtAuthMiddleware, async (req, res) => {
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

  // POST /api/v1/m/error-log - Log an error from client (any authenticated user)
  app.post("/api/v1/m/error-log", jwtAuthMiddleware, async (req, res) => {
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

  return httpServer;
}
