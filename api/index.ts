import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid } from "drizzle-orm/pg-core";
import { GoogleGenAI, Type } from "@google/genai";
import pRetry, { AbortError } from "p-retry";

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

type User = typeof users.$inferSelect;
type SavedText = typeof savedTexts.$inferSelect;

// ============ DATABASE CONNECTION ============
const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
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
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

function getUserFromRequest(req: Request): JwtPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
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
  return pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { text: "Please transcribe this audio accurately. Return only the transcribed text." },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
          ]
        }]
      });
      return response.text || "";
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 });
}

async function polishText(text: string, language: string, outputFormat: string, outputType: string): Promise<string> {
  const langName = languageNames[language] || language;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;

  return pRetry(async () => {
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
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 });
}

async function translateAndPolish(text: string, sourceLanguage: string, targetLanguage: string, outputFormat: string) {
  const sourceLang = languageNames[sourceLanguage] || sourceLanguage;
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  return pRetry(async () => {
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
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 });
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
const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://myvoicepost.com', 'https://www.myvoicepost.com', 'https://myvoicepost.vercel.app']
    : true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { type } = req.params;
    const result = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.userId, payload.userId), eq(savedTexts.type, type)))
      .orderBy(desc(savedTexts.createdAt));

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
