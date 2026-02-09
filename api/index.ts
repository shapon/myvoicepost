import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { GoogleGenAI, Type } from "@google/genai";
import pRetry, { AbortError } from "p-retry";
import pLimit from "p-limit";
import nodemailer from "nodemailer";

// Concurrency limiter for AI requests - prevents rate limiting under high load
const aiRequestLimiter = pLimit(5);

// ============ DATABASE SCHEMA ============
const users = pgTable("mvp_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const savedTexts = pgTable("mvp_saved_texts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  originalText: text("original_text").notNull(),
  polishedText: text("polished_text").notNull(),
  translatedText: text("translated_text"),
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  targetLanguage: varchar("target_language", { length: 10 }),
  outputFormat: varchar("output_format", { length: 50 }).notNull(),
  outputType: varchar("output_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Password reset tokens table
const passwordResetTokens = pgTable("mvp_password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

type User = typeof users.$inferSelect;
type SavedText = typeof savedTexts.$inferSelect;
type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ============ DATABASE CONNECTION ============
const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  prepare: false,
  max: 20,                    // Maximum pool size for high concurrency
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout in seconds
  max_lifetime: 60 * 30,      // Max connection lifetime (30 min)
});
const db = drizzle(client);

// ============ JWT CONFIG ============
const JWT_SECRET = process.env.SESSION_SECRET || "myvoicepost-jwt-secret-key";
const JWT_EXPIRES_IN = "7d";

interface JwtPayload {
  userId: string;
  username: string;
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  console.log("[Auth] Authorization header present:", !!authHeader);
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    console.log("[Auth] Token extracted, length:", token.length);
    return token;
  }
  console.log("[Auth] No valid Bearer token found");
  return null;
}

function getUserFromRequest(req: Request): JwtPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    console.log("[Auth] No token in request");
    return null;
  }
  const payload = verifyToken(token);
  console.log("[Auth] Token verification result:", payload ? "valid" : "invalid");
  return payload;
}

// ============ PASSWORD RESET HELPERS ============
const RESET_TOKEN_EXPIRY_HOURS = 1;
const WEB_APP_URL = process.env.WEB_APP_URL || "https://myvoicepost.com";
const DEEP_LINK_BASE_URL = process.env.DEEP_LINK_BASE_URL || "https://www.myvoicepost.com";
const APP_SCHEME = process.env.APP_SCHEME || "myvoicepost";

/**
 * Generate a secure random reset token
 */
function generateResetToken(): string {
  return randomUUID() + "-" + randomUUID();
}

/**
 * Send password reset email using nodemailer
 * Uses SMTP configuration from environment variables
 */
async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  isDeepLink: boolean = false
): Promise<void> {
  // Validate SMTP configuration
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("[EMAIL SERVICE] SMTP configuration missing. Required: SMTP_HOST, SMTP_USER, SMTP_PASS");
    throw new Error("Email service not configured properly");
  }

  console.log("[EMAIL SERVICE] Sending password reset email...");
  console.log(`[EMAIL SERVICE] To: ${email}, Type: ${isDeepLink ? "Mobile Deep Link" : "Web Link"}`);

  // Create nodemailer transporter with TLS/STARTTLS support for port 587
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // false for port 587 (STARTTLS), true for port 465 (TLS)
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    // Enable STARTTLS for port 587
    ...(smtpPort === 587 && !smtpSecure && {
      requireTLS: true,
      tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false, // Set to true in production with valid certificates
      },
    }),
  });

  // Verify SMTP connection
  try {
    await transporter.verify();
    console.log("[EMAIL SERVICE] SMTP connection verified successfully");
  } catch (verifyError: any) {
    console.error("[EMAIL SERVICE] SMTP connection verification failed:", verifyError.message);
    throw new Error(`SMTP connection failed: ${verifyError.message}`);
  }

  // Email content
  const linkType = isDeepLink ? "mobile app" : "web browser";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password for your MyVoicePost account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your ${linkType}:</p>
        <p style="background: #f5f5f5; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 13px; color: #555;">${resetLink}</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        <p style="color: #888; font-size: 13px;">
          <strong>This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).</strong>
        </p>
        <p style="color: #888; font-size: 13px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <p style="color: #888; font-size: 13px; margin-bottom: 0;">— The MyVoicePost Team</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>© ${new Date().getFullYear()} MyVoicePost. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Reset Your MyVoicePost Password

Hello,

We received a request to reset your password for your MyVoicePost account.

Click the link below to set a new password:
${resetLink}

This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

— The MyVoicePost Team
  `.trim();

  // Send email
  try {
    const info = await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: "Reset Your MyVoicePost Password",
      text: textContent,
      html: htmlContent,
    });

    console.log("[EMAIL SERVICE] Password reset email sent successfully");
    console.log(`[EMAIL SERVICE] Message ID: ${info.messageId}`);
  } catch (sendError: any) {
    console.error("[EMAIL SERVICE] Failed to send email:", sendError.message);
    throw new Error(`Failed to send password reset email: ${sendError.message}`);
  }
}

// ============ GEMINI AI SETUP ============
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const languageNames: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", ru: "Russian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", hi: "Hindi", tr: "Turkish", pl: "Polish",
  vi: "Vietnamese", th: "Thai", id: "Indonesian",
};

const toneInstructions: Record<string, string> = {
  professional: "Use a professional, business-appropriate tone.",
  casual: "Use a casual, friendly tone.",
  formal: "Use a formal, official tone.",
  friendly: "Use a warm, friendly tone.",
};

const outputTypeInstructions: Record<string, string> = {
  message: "Format as a well-structured message.",
  note: "Format as a concise, organized note.",
  email: "Format as a professional email.",
  post: "Format as an engaging social media post.",
  journal: "Format as a reflective journal entry.",
};

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return errorMsg.includes("429") || errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("rate limit");
}

function safeJsonParse(text: string, fallback: any = {}): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", e, "Text:", text?.substring(0, 200));
    return fallback;
  }
}

async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  // Validate audio buffer - must have reasonable size for actual audio
  if (!audioBuffer || audioBuffer.length < 1000) {
    console.error('[Transcribe] Invalid audio: buffer too small', audioBuffer?.length);
    throw new Error('Invalid audio data - file too small');
  }

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          temperature: 0,  // Make output deterministic - reduces hallucination
          topK: 1,         // Only consider most likely token
          topP: 1,         // No nucleus sampling
        },
        contents: [{
          role: "user",
          parts: [
            { 
              text: `You are a precise speech-to-text transcription system. Your ONLY job is to transcribe the exact words spoken in this audio.

STRICT RULES - FAILURE TO FOLLOW WILL RESULT IN ERROR:
1. Listen carefully to the audio and transcribe ONLY the exact words spoken
2. If you cannot clearly hear speech, respond with exactly: [NO_SPEECH_DETECTED]
3. NEVER generate, invent, create, or imagine any text
4. NEVER add words that were not spoken
5. NEVER describe or summarize - just transcribe word-for-word
6. If audio quality is poor, transcribe what you CAN hear, even if incomplete

This is a transcription task, NOT a creative writing task. Output ONLY the spoken words:` 
            },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
          ]
        }]
      });
      
      const transcribedText = response.text?.trim() || "";
      
      // Check for no speech detected
      if (transcribedText === "[NO_SPEECH_DETECTED]" || 
          transcribedText.includes("[NO_SPEECH_DETECTED]") ||
          transcribedText === "") {
        console.log('[Transcribe] No speech detected in audio');
        throw new Error('No speech detected in the audio. Please try speaking more clearly.');
      }
      
      return transcribedText;
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

async function polishText(text: string, language: string, outputFormat: string, outputType: string): Promise<string> {
  const langName = languageNames[language] || language;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Transform this speech transcription into well-written ${outputType}.
Language: ${langName}, Tone: ${toneGuide}, Format: ${typeGuide}
Return JSON: {"polishedText": "the polished text"}
Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { polishedText: { type: Type.STRING } },
            required: ["polishedText"]
          }
        }
      });
      const result = safeJsonParse(response.text || "{}", { polishedText: text });
      return result.polishedText || text;
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

async function translateAndPolish(text: string, sourceLanguage: string, targetLanguage: string, outputFormat: string) {
  const sourceLang = languageNames[sourceLanguage] || sourceLanguage;
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      if (sourceLanguage === targetLanguage) {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Polish this text. ${toneGuide}
Return JSON: {"polishedText": "the polished text"}
Text: ${text}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: { polishedText: { type: Type.STRING } },
              required: ["polishedText"]
            }
          }
        });
        const result = safeJsonParse(response.text || "{}", { polishedText: text });
        return { translatedText: text, polishedText: result.polishedText || text };
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Translate from ${sourceLang} to ${targetLang} and polish. ${toneGuide}
Return JSON: {"translatedText": "direct translation", "polishedText": "polished version"}
Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { translatedText: { type: Type.STRING }, polishedText: { type: Type.STRING } },
            required: ["translatedText", "polishedText"]
          }
        }
      });
      const result = safeJsonParse(response.text || "{}", { translatedText: text, polishedText: text });
      return { translatedText: result.translatedText || text, polishedText: result.polishedText || result.translatedText || text };
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

// ============ VALIDATION SCHEMAS ============
const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

const signupSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const polishRequestSchema = z.object({
  language: z.string(),
  outputFormat: z.string(),
  outputType: z.string(),
});

const translateRequestSchema = z.object({
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  outputFormat: z.string(),
});

// ============ EXPRESS APP ============
import compression from "compression";

const app = express();

// Performance: Enable gzip compression for responses
app.use(compression());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('[CORS] Allowing request with no origin (mobile app)');
      return callback(null, true);
    }
    // Allow specific web origins
    const allowedOrigins = ['https://myvoicepost.com', 'https://www.myvoicepost.com', 'https://myvoicepost.vercel.app'];
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    console.log('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
});

// In-memory translations storage (for serverless)
const translations = new Map<string, any>();

// ============ ROUTES ============

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/polish-speech", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = polishRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { language, outputFormat, outputType } = parseResult.data;

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const originalText = await transcribeAudio(req.file.buffer, req.file.mimetype);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const polishedText = await polishText(originalText, language, outputFormat, outputType);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText: originalText,
      polishedText,
      sourceLanguage: language,
      targetLanguage: language,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Polish error:", error);
    res.status(500).json({ error: error.message || "Failed to process speech polishing" });
  }
});

app.post("/api/translate-speech", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = translateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { sourceLanguage, targetLanguage, outputFormat } = parseResult.data;

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const originalText = await transcribeAudio(req.file.buffer, req.file.mimetype);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const { translatedText, polishedText } = await translateAndPolish(originalText, sourceLanguage, targetLanguage, outputFormat);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText,
      polishedText,
      sourceLanguage,
      targetLanguage,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to process translation" });
  }
});

// Base64 endpoints for mobile app
const base64PolishSchema = z.object({
  audio: z.string(),
  language: z.string(),
  outputFormat: z.string().default("professional"),
  outputType: z.string().default("message"),
  mimeType: z.string().default("audio/m4a"),
});

const base64TranslateSchema = z.object({
  audio: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  outputFormat: z.string().default("professional"),
  mimeType: z.string().default("audio/m4a"),
});

app.post("/api/polish-speech-base64", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = base64PolishSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { audio, language, outputFormat, outputType, mimeType } = parseResult.data;

    const audioBuffer = Buffer.from(audio, "base64");
    const originalText = await transcribeAudio(audioBuffer, mimeType);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const polishedText = await polishText(originalText, language, outputFormat, outputType);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText: originalText,
      polishedText,
      sourceLanguage: language,
      targetLanguage: language,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Polish base64 error:", error);
    res.status(500).json({ error: error.message || "Failed to process speech polishing" });
  }
});

app.post("/api/translate-speech-base64", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = base64TranslateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { audio, sourceLanguage, targetLanguage, outputFormat, mimeType } = parseResult.data;

    const audioBuffer = Buffer.from(audio, "base64");
    const originalText = await transcribeAudio(audioBuffer, mimeType);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const { translatedText, polishedText } = await translateAndPolish(originalText, sourceLanguage, targetLanguage, outputFormat);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText,
      polishedText,
      sourceLanguage,
      targetLanguage,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Translation base64 error:", error);
    res.status(500).json({ error: error.message || "Failed to process translation" });
  }
});

app.get("/api/translations", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const allTranslations = Array.from(translations.values());
    const sorted = allTranslations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    res.json(sorted);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch translations" });
  }
});

app.get("/api/translations/:id", async (req, res) => {
  try {
    const translation = translations.get(req.params.id);
    if (!translation) return res.status(404).json({ error: "Translation not found" });
    res.json(translation);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch translation" });
  }
});

// Auth routes with JWT
app.post("/api/auth/signup", async (req, res) => {
  try {
    const parseResult = signupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { username, email, password } = parseResult.data;

    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const existingEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.insert(users).values({
      username,
      email,
      passwordHash: hashedPassword,
    }).returning();

    const user = result[0];
    const token = generateToken({ userId: user.id, username: user.username });

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { username, password } = parseResult.data;

    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = result[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = generateToken({ userId: user.id, username: user.username });
    console.log("[Login] Login successful for:", username, "| Token generated, length:", token.length);

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", (req, res) => {
  const payload = getUserFromRequest(req);
  if (payload) {
    res.json({
      user: {
        id: payload.userId,
        username: payload.username,
      },
    });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

// ============ WEB FORGOT PASSWORD ENDPOINTS ============

// Forgot Password - Request password reset link (Web)
app.post("/api/forgot-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Valid email is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.errors
      });
    }

    const { email } = parseResult.data;

    // Find user by email
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];

    if (!user) {
      // Return success even if user not found (security best practice - prevents email enumeration)
      console.log(`[Forgot Password] Email not found: ${email}`);
      return res.json({
        message: "If an account with that email exists, a password reset link has been sent."
      });
    }

    // Generate secure reset token
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store reset token in database
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });

    // Generate web reset link
    const resetLink = `${WEB_APP_URL}/reset-password?token=${resetToken}`;

    // Send email (mocked)
    await sendPasswordResetEmail(user.email!, resetLink, false);

    console.log(`[Forgot Password] Reset token generated for user: ${user.username}`);

    res.json({
      message: "If an account with that email exists, a password reset link has been sent."
    });
  } catch (error: any) {
    console.error("[Forgot Password] Error:", error);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// Reset Password - Set new password using token (Web)
app.post("/api/reset-password", async (req, res) => {
  try {
    const schema = z.object({
      token: z.string().min(1, "Reset token is required"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.errors
      });
    }

    const { token, newPassword } = parseResult.data;

    // Find valid reset token
    const tokenResult = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    const resetTokenRecord = tokenResult[0];

    if (!resetTokenRecord) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Check if token is expired
    if (new Date() > resetTokenRecord.expiresAt) {
      return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    }

    // Check if token was already used
    if (resetTokenRecord.usedAt) {
      return res.status(400).json({ error: "This reset token has already been used." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db.update(users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, resetTokenRecord.userId));

    // Mark token as used (invalidate it)
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetTokenRecord.id));

    console.log(`[Reset Password] Password successfully reset for userId: ${resetTokenRecord.userId}`);

    res.json({ message: "Password has been reset successfully. You can now login with your new password." });
  } catch (error: any) {
    console.error("[Reset Password] Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ============ SAVED TEXTS ENDPOINTS ============
app.post("/api/saved-texts", async (req, res) => {
  try {
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { type, originalText, polishedText, translatedText, sourceLanguage, targetLanguage, outputFormat, outputType } = req.body;

    if (!type || !originalText || !polishedText || !sourceLanguage || !outputFormat) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await db.insert(savedTexts).values({
      userId: payload.userId,
      type,
      originalText,
      polishedText,
      translatedText: translatedText || null,
      sourceLanguage,
      targetLanguage: targetLanguage || null,
      outputFormat,
      outputType: outputType || null,
    }).returning();

    res.json(result[0]);
  } catch (error: any) {
    console.error("Save text error:", error);
    res.status(500).json({ error: "Failed to save text" });
  }
});

app.get("/api/saved-texts/:type", async (req, res) => {
  try {
    // Disable caching for authenticated endpoints
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    // Log all headers for debugging
    console.log("[Debug] GET /api/saved-texts - Authorization:", req.headers.authorization ? 'present' : 'missing');
    console.log("[Debug] All headers:", JSON.stringify(req.headers));
    
    const payload = getUserFromRequest(req);
    
    // Allow guest access - return empty array for unauthenticated users
    if (!payload) {
      console.log("[Auth] Guest access to saved-texts - returning empty array");
      return res.json([]);
    }

    const { type } = req.params;
    let result;
    
    if (type === 'all') {
      result = await db.select().from(savedTexts)
        .where(eq(savedTexts.userId, payload.userId))
        .orderBy(desc(savedTexts.createdAt));
    } else {
      result = await db.select().from(savedTexts)
        .where(and(eq(savedTexts.userId, payload.userId), eq(savedTexts.type, type)))
        .orderBy(desc(savedTexts.createdAt));
    }

    res.json(result);
  } catch (error: any) {
    console.error("Get saved text error:", error);
    res.status(500).json({ error: "Failed to get saved text" });
  }
});

app.delete("/api/saved-texts/:id", async (req, res) => {
  try {
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { id } = req.params;
    const result = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, id), eq(savedTexts.userId, payload.userId)));

    if (result.length === 0) {
      return res.status(404).json({ error: "Saved text not found" });
    }

    await db.delete(savedTexts).where(eq(savedTexts.id, id));
    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Delete saved text error:", error);
    res.status(500).json({ error: "Failed to delete saved text" });
  }
});

// ============================================================
// PUBLIC API ENDPOINTS - /api/v1/p/
// No authentication required
// ============================================================

// Public: Transcribe audio to text
app.post("/api/v1/p/transcribe", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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
    const audioBuffer = Buffer.from(audio, 'base64');

    const originalText = await transcribeAudio(audioBuffer, mimeType);

    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

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
    if (!process.env.GEMINI_API_KEY) {
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
    const polishedText = await polishText(text, language, outputFormat, outputType);

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
    if (!process.env.GEMINI_API_KEY) {
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

    const { text, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;
    const result = await translateAndPolish(text, sourceLanguage, targetLanguage, outputFormat);

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

// ============================================================
// PUBLIC AUTH ENDPOINTS - /api/v1/p/login and /api/v1/p/register
// (No authentication required - for mobile app login/signup)
// ============================================================

// Public Login (accepts username OR email)
app.post("/api/v1/p/login", async (req, res) => {
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
    const isEmail = identifier.includes('@');
    
    let result;
    if (isEmail) {
      result = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
    } else {
      result = await db.select().from(users).where(eq(users.username, identifier)).limit(1);
    }
    
    const user = result[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`[Public Login] User ${user.username} logged in via /api/v1/p/login`);

    res.json({
      success: true,
      token,
      expiresIn: 7 * 24 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error: any) {
    console.error("[Public] Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

// Public Register shortcut
app.post("/api/v1/p/register", async (req, res) => {
  try {
    const registerSchema = z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      email: z.string().email("Valid email is required"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { username, email, password } = parseResult.data;

    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Username already exists",
      });
    }

    const existingEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.insert(users).values({
      username,
      email,
      passwordHash: hashedPassword,
    }).returning();

    const user = result[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "3d" }
    );

    console.log(`[Public Register] User ${user.username} created via /api/v1/p/register`);

    res.status(201).json({
      success: true,
      token,
      expiresIn: 3 * 24 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error: any) {
    console.error("[Public] Register error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create account",
    });
  }
});

// ============================================================
// MOBILE FORGOT PASSWORD ENDPOINTS - /api/v1/p/
// (No authentication required - for mobile app password reset)
// ============================================================

// Mobile: Forgot Password - Request password reset with 6-character code
app.post("/api/v1/p/forgot-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Valid email is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { email } = parseResult.data;

    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];

    if (!user) {
      console.log(`[Mobile Forgot Password] Email not found: ${email}`);
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset code has been sent.",
      });
    }

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    const randomBytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[randomBytes[i] % chars.length];
    }

    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: hashedCode,
      expiresAt,
    });

    await sendPasswordResetEmail(
      user.email!,
      `Your password reset code is: ${code}\n\nThis code will expire in 15 minutes.`,
      true
    );

    console.log(`[Mobile Forgot Password] Reset code generated for user: ${user.username}`);

    const response: any = {
      success: true,
      message: "If an account with that email exists, a password reset code has been sent.",
    };
    if (process.env.NODE_ENV !== "production") {
      response.code = code;
    }

    res.json(response);
  } catch (error: any) {
    console.error("[Mobile Forgot Password] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request",
    });
  }
});

// Mobile: Reset Password - Set new password using email + 6-character code
app.post("/api/v1/p/reset-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Must be a valid email format"),
      code: z.string().length(6, "Code must be exactly 6 characters"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { email, code, newPassword } = parseResult.data;

    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    const hashedCode = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");

    const tokenResult = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.token, hashedCode),
      ))
      .limit(1);

    const resetRecord = tokenResult[0];

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.update(users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetRecord.id));

    console.log(`[Mobile Reset Password] Password successfully reset for userId: ${user.id}`);

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error: any) {
    console.error("[Mobile Reset Password] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
    });
  }
});

// ============================================================
// DEEP LINK REDIRECT ENDPOINT - /api/v1/auth/reset-password
// This endpoint handles Universal Links (iOS) and App Links (Android)
// When clicked from email, it redirects to the mobile app or web fallback
// ============================================================

// GET /api/v1/auth/reset-password?token=XYZ
// This endpoint is called when user clicks the reset password link from email
// It attempts to open the mobile app, falls back to web if app not installed
app.get("/api/v1/auth/reset-password", async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invalid Link - MyVoicePost</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                 display: flex; justify-content: center; align-items: center; min-height: 100vh;
                 margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
          h1 { color: #e74c3c; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Invalid Link</h1>
          <p>This password reset link is invalid or missing the token. Please request a new password reset.</p>
        </div>
      </body>
      </html>
    `);
  }

  console.log(`[Deep Link] Password reset link accessed with token: ${token.substring(0, 8)}...`);

  // Validate token exists and is not expired (optional - provides better UX)
  try {
    const tokenResult = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    const resetTokenRecord = tokenResult[0];

    if (!resetTokenRecord) {
      return res.status(400).send(generateErrorPage("Invalid Link", "This password reset link is invalid. Please request a new password reset."));
    }

    if (new Date() > resetTokenRecord.expiresAt) {
      return res.status(400).send(generateErrorPage("Link Expired", "This password reset link has expired. Please request a new password reset."));
    }

    if (resetTokenRecord.usedAt) {
      return res.status(400).send(generateErrorPage("Link Already Used", "This password reset link has already been used. Please request a new password reset if needed."));
    }
  } catch (error) {
    console.error("[Deep Link] Error validating token:", error);
    // Continue anyway - let the mobile app handle validation
  }

  // Generate app deep link URLs
  const customSchemeUrl = `${APP_SCHEME}://reset-password?token=${token}`;
  const webFallbackUrl = `${WEB_APP_URL}/reset-password?token=${token}`;

  // Android App Link intent URL
  const androidIntentUrl = `intent://reset-password?token=${token}#Intent;scheme=${APP_SCHEME};package=com.myvoicepost.app;S.browser_fallback_url=${encodeURIComponent(webFallbackUrl)};end`;

  // Serve a smart redirect page that:
  // 1. Tries to open the mobile app via custom scheme
  // 2. Falls back to web if app is not installed
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - MyVoicePost</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex; justify-content: center; align-items: center; min-height: 100vh;
          margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white; padding: 40px; border-radius: 12px; text-align: center;
          max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .spinner {
          width: 40px; height: 40px; border: 4px solid #f3f3f3;
          border-top: 4px solid #667eea; border-radius: 50%;
          animation: spin 1s linear infinite; margin: 20px auto;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .btn {
          display: inline-block; padding: 14px 30px; margin: 10px 5px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; text-decoration: none; border-radius: 8px; font-weight: bold;
        }
        .btn-secondary { background: #f5f5f5; color: #333; }
        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reset Password</h1>
        <div id="loading">
          <p>Opening MyVoicePost app...</p>
          <div class="spinner"></div>
        </div>
        <div id="fallback" class="hidden">
          <p>If the app didn't open automatically, use one of the options below:</p>
          <a href="${customSchemeUrl}" class="btn">Open in App</a>
          <a href="${webFallbackUrl}" class="btn btn-secondary">Continue on Web</a>
        </div>
      </div>
      <script>
        (function() {
          var isAndroid = /android/i.test(navigator.userAgent);
          var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
          var appOpened = false;

          // Try to open the app
          function tryOpenApp() {
            if (isAndroid) {
              // Use Android Intent URL for better app detection
              window.location.href = "${androidIntentUrl}";
            } else {
              // Use custom scheme for iOS and other platforms
              window.location.href = "${customSchemeUrl}";
            }
          }

          // Show fallback after timeout
          function showFallback() {
            if (!appOpened) {
              document.getElementById('loading').classList.add('hidden');
              document.getElementById('fallback').classList.remove('hidden');
            }
          }

          // Detect if app was opened (page becomes hidden)
          document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
              appOpened = true;
            }
          });

          // Try to open app immediately
          tryOpenApp();

          // Show fallback after 2.5 seconds if app didn't open
          setTimeout(showFallback, 2500);
        })();
      </script>
    </body>
    </html>
  `);
});

// Helper function to generate error pages
function generateErrorPage(title: string, message: string): string {
  return \`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>\${title} - MyVoicePost</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center; min-height: 100vh;
               margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
        h1 { color: #e74c3c; }
        p { color: #666; }
        .btn { display: inline-block; padding: 14px 30px; margin-top: 20px;
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
               color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>\${title}</h1>
        <p>\${message}</p>
        <a href="\${WEB_APP_URL}" class="btn">Go to MyVoicePost</a>
      </div>
    </body>
    </html>
  \`;
}

// ============================================================
// MOBILE API ENDPOINTS - /api/v1/m/
// ============================================================

// Mobile JWT middleware
function mobileAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please provide a valid token.",
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).jwtUser = decoded;
    
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return res.status(401).json({
        success: false,
        error: "Token has expired. Please login again.",
      });
    }
    
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
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

// Mobile Auth: Logout (use /api/v1/p/login and /api/v1/p/register for login/signup)
app.post("/api/v1/m/logout", mobileAuthMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

// Mobile Auth: Get current user
app.get("/api/v1/m/me", mobileAuthMiddleware, (req, res) => {
  const jwtUser = (req as any).jwtUser;
  res.json({
    success: true,
    user: {
      id: jwtUser?.userId,
      email: jwtUser?.email,
      username: jwtUser?.username,
    },
  });
});

// Mobile: Transcribe audio
app.post("/api/v1/m/transcribe", mobileAuthMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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
    const audioBuffer = Buffer.from(audio, 'base64');

    const originalText = await transcribeAudio(audioBuffer, mimeType);

    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

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
    if (!process.env.GEMINI_API_KEY) {
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
    const polishedText = await polishText(text, language, outputFormat, outputType);

    res.json({
      success: true,
      originalText: text,
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
    if (!process.env.GEMINI_API_KEY) {
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

    const { text, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;
    const result = await translateAndPolish(text, sourceLanguage, targetLanguage, outputFormat);

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
    console.error("[Mobile Translate] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to translate text",
    });
  }
});

// Mobile: Save text
app.post("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    const schema = z.object({
      type: z.enum(["polish", "translate"]),
      originalText: z.string().min(1),
      polishedText: z.string().min(1),
      translatedText: z.string().nullable().optional(),
      sourceLanguage: z.string().min(1),
      targetLanguage: z.string().nullable().optional(),
      outputFormat: z.string().min(1),
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

    const data = parseResult.data;
    const result = await db.insert(savedTexts).values({
      userId,
      type: data.type,
      originalText: data.originalText,
      polishedText: data.polishedText,
      translatedText: data.translatedText || null,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage || null,
      outputFormat: data.outputFormat,
      outputType: data.outputType || null,
    }).returning();

    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[Mobile Save] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save text",
    });
  }
});

// Mobile: Get saved texts
app.get("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;
    const type = req.query.type as string | undefined;

    let result;
    if (type) {
      result = await db.select().from(savedTexts)
        .where(and(eq(savedTexts.userId, userId), eq(savedTexts.type, type)))
        .orderBy(desc(savedTexts.createdAt));
    } else {
      result = await db.select().from(savedTexts)
        .where(eq(savedTexts.userId, userId))
        .orderBy(desc(savedTexts.createdAt));
    }

    res.json({
      success: true,
      savedTexts: result,
      count: result.length,
    });
  } catch (error: any) {
    console.error("[Mobile Get Saved] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch saved texts",
    });
  }
});

// Mobile: Get single saved text
app.get("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    const result = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[Mobile Get Single] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch saved text",
    });
  }
});

// Mobile: Update saved text
app.put("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;
    const { id } = req.params;

    const existing = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, id), eq(savedTexts.userId, userId)));

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

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
      });
    }

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

    const result = await db.update(savedTexts)
      .set(updates)
      .where(eq(savedTexts.id, id))
      .returning();

    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[Mobile Update] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update saved text",
    });
  }
});

// Mobile: Delete saved text
app.delete("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    const existing = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

    await db.delete(savedTexts).where(eq(savedTexts.id, req.params.id));

    res.json({
      success: true,
      message: "Saved text deleted successfully",
    });
  } catch (error: any) {
    console.error("[Mobile Delete] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete saved text",
    });
  }
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// Vercel function config
export const config = {
  maxDuration: 30,
};

// Export for Vercel
export default (req: VercelRequest, res: VercelResponse) => {
  return app(req as any, res as any);
};
