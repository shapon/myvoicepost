import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseStorage } from "./supabase-storage";
import {
  translateRequestSchema,
  polishRequestSchema,
  insertUserSchema,
  insertSavedTextSchema,
  subscriptionPlans,
  userSubscriptions,
  users,
  userSettings,
  emailOtps,
} from "@shared/schema";
import nodemailer from "nodemailer";
import { transcribeAudio, translateAndPolish, polishText } from "./gemini";
import { db } from "./supabase-db";
import { eq, and, gte } from "drizzle-orm";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Audio hash tracking for duplicate detection (in-memory, clears on restart)
const recentAudioHashes = new Map<
  string,
  { timestamp: number; result: string; userId?: string }
>();
const HASH_CACHE_TTL = 60000; // 1 minute TTL for duplicate detection

// Generate SHA-256 hash of audio data
function generateAudioHash(audioBuffer: Buffer): string {
  return crypto
    .createHash("sha256")
    .update(audioBuffer)
    .digest("hex")
    .substring(0, 16);
}

// Clean old hashes periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(recentAudioHashes.entries());
  for (let i = 0; i < entries.length; i++) {
    const [hash, data] = entries[i];
    if (now - data.timestamp > HASH_CACHE_TTL) {
      recentAudioHashes.delete(hash);
    }
  }
}, 30000); // Clean every 30 seconds

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
  // First check JWT token
  if (req.jwtUser?.userId) {
    return req.jwtUser.userId;
  }
  // Fallback to session for web compatibility
  if ((req.session as any)?.userId) {
    return (req.session as any).userId;
  }
  return null;
}

// Helper to generate JWT token
function generateToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// Use supabase storage for database operations
const storage = supabaseStorage;

// Login schema
const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Signup schema
const signupSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    otp: z.string().length(6, "6-digit verification code is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

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

  // Transcribe-only endpoint - converts audio to text without polishing/translation
  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
        });
      }

      // Check if audio file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Transcribe audio using Gemini
      const text = await transcribeAudio(req.file.buffer, req.file.mimetype);

      if (!text || text.trim() === "") {
        return res
          .status(400)
          .json({
            error:
              "Could not transcribe audio. Please try speaking more clearly.",
          });
      }

      res.json({ text: text.trim() });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({
        error: error.message || "Failed to transcribe audio",
      });
    }
  });

  // Translation endpoint - accepts audio file and returns transcription + translation
  app.post(
    "/api/translate-speech",
    upload.single("audio"),
    async (req, res) => {
      try {
        // Check if Gemini AI integration is configured
        if (
          !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
          !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
        ) {
          return res.status(500).json({
            error:
              "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
          });
        }

        // Validate request body
        const parseResult = translateRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "Invalid request",
            details: parseResult.error.errors,
          });
        }

        const { sourceLanguage, targetLanguage, outputFormat } =
          parseResult.data;

        // Check if audio file was uploaded
        if (!req.file) {
          return res.status(400).json({ error: "No audio file provided" });
        }

        // Step 1: Transcribe audio using Gemini
        const originalText = await transcribeAudio(
          req.file.buffer,
          req.file.mimetype,
        );

        if (!originalText || originalText.trim() === "") {
          return res
            .status(400)
            .json({
              error:
                "Could not transcribe audio. Please try speaking more clearly.",
            });
        }

        // Step 2: Translate and polish using Gemini
        const { translatedText, polishedText } = await translateAndPolish(
          originalText,
          sourceLanguage,
          targetLanguage,
          outputFormat,
        );

        // Step 3: Save to storage
        const translation = await storage.createTranslation({
          originalText,
          translatedText,
          polishedText,
          sourceLanguage,
          targetLanguage,
          outputFormat,
        });

        res.json(translation);
      } catch (error: any) {
        console.error("Translation error:", error);
        res.status(500).json({
          error: error.message || "Failed to process translation",
        });
      }
    },
  );

  // Polish speech endpoint - converts speech to polished text (same language)
  app.post("/api/polish-speech", upload.single("audio"), async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
        });
      }

      // Validate request body
      const parseResult = polishRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { language, outputFormat, outputType } = parseResult.data;

      // Check if audio file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Step 1: Transcribe audio using Gemini
      const originalText = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype,
      );

      if (!originalText || originalText.trim() === "") {
        return res
          .status(400)
          .json({
            error:
              "Could not transcribe audio. Please try speaking more clearly.",
          });
      }

      // Step 2: Polish the text using Gemini
      const polishedText = await polishText(
        originalText,
        language,
        outputFormat,
        outputType,
      );

      // Step 3: Save to storage (using same language for source and target)
      const translation = await storage.createTranslation({
        originalText,
        translatedText: originalText, // Same as original for polish-only
        polishedText,
        sourceLanguage: language,
        targetLanguage: language,
        outputFormat,
      });

      res.json(translation);
    } catch (error: any) {
      console.error("Polish error:", error);
      res.status(500).json({
        error: error.message || "Failed to process speech polishing",
      });
    }
  });

  // Supported audio formats mapping
  const audioFormatMimeTypes: Record<string, string> = {
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    mpeg: "audio/mpeg",
    aac: "audio/aac",
    flac: "audio/flac",
  };

  // Helper function to get MIME type from format
  function getMimeTypeFromFormat(
    format: string | undefined,
    defaultMime: string = "audio/mp4",
  ): string {
    if (!format) return defaultMime;
    const cleanFormat = format.toLowerCase().replace(".", "");
    return audioFormatMimeTypes[cleanFormat] || defaultMime;
  }

  // Polish speech base64 endpoint - accepts base64 audio for mobile apps
  // Supports both /api/polish-speech-base64 and /api/polish-speech-base64/:format
  app.post("/api/polish-speech-base64/:format?", async (req, res) => {
    const formatParam = req.params.format;
    // Generate unique server request ID for tracking
    const serverRequestId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const requestTimestamp = new Date().toISOString();

    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`[Polish-Base64] NEW REQUEST`);
      console.log(`${"=".repeat(60)}`);
      console.log(`[Polish-Base64] Server Request ID: ${serverRequestId}`);
      console.log(`[Polish-Base64] Timestamp: ${requestTimestamp}`);
      console.log(`[Polish-Base64] User Agent: ${req.headers["user-agent"]}`);

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
          serverRequestId,
        });
      }

      const base64Schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        language: z.string(),
        outputFormat: z.string(),
        outputType: z.string(),
        mimeType: z.string().optional().default("audio/mp4"),
        audioFormat: z.string().optional(), // Format hint from client (mp4, wav, etc.)
        clientRequestId: z.string().optional(), // Track client request ID if provided
        requestId: z.string().optional(), // Alternative name for client request ID
        clientChecksum: z.number().optional(), // Checksum from client for verification
      });

      const parseResult = base64Schema.safeParse(req.body);
      if (!parseResult.success) {
        console.log(
          `[Polish-Base64] Validation failed:`,
          parseResult.error.errors,
        );
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
          serverRequestId,
        });
      }

      const {
        audio,
        language,
        outputFormat,
        outputType,
        mimeType: bodyMimeType,
        clientRequestId,
        requestId,
        clientChecksum,
      } = parseResult.data;

      // Determine MIME type: URL format param takes priority, then body mimeType, then default
      const effectiveMimeType = formatParam
        ? getMimeTypeFromFormat(formatParam)
        : bodyMimeType;

      console.log(
        `[Polish-Base64] URL format param: ${formatParam || "not provided"}`,
      );
      console.log(`[Polish-Base64] Body mimeType: ${bodyMimeType}`);
      console.log(`[Polish-Base64] Effective MIME type: ${effectiveMimeType}`);

      // Log client request ID if provided
      const clientReqId = clientRequestId || requestId;
      if (clientReqId) {
        console.log(`[Polish-Base64] Client Request ID: ${clientReqId}`);
      }

      const audioBuffer = Buffer.from(audio, "base64");

      // Generate SHA-256 hash for unique audio identification
      const audioHash = generateAudioHash(audioBuffer);
      const userId = req.jwtUser?.userId || "anonymous";

      console.log(`[Polish-Base64] ---- AUDIO HASH VERIFICATION ----`);
      console.log(`[Polish-Base64] Audio SHA-256 hash: ${audioHash}`);
      console.log(`[Polish-Base64] User ID: ${userId}`);

      // Check for duplicate audio (same hash sent recently)
      const existingEntry = recentAudioHashes.get(audioHash);
      if (existingEntry) {
        const ageSeconds = Math.round(
          (Date.now() - existingEntry.timestamp) / 1000,
        );
        console.log(`[Polish-Base64] WARNING: DUPLICATE AUDIO DETECTED!`);
        console.log(`[Polish-Base64] Same audio was sent ${ageSeconds}s ago`);
        console.log(
          `[Polish-Base64] Previous result: "${existingEntry.result.substring(0, 100)}..."`,
        );
        // Don't return cached result - process fresh but log the duplicate
      } else {
        console.log(`[Polish-Base64] New unique audio (not seen in last 60s)`);
      }

      // Generate checksum for audio verification (from base64, same as client)
      let base64Checksum = 0;
      const sample = audio.substring(0, Math.min(1000, audio.length));
      for (let i = 0; i < sample.length; i++) {
        base64Checksum = (base64Checksum + sample.charCodeAt(i)) % 65536;
      }

      // Also generate checksum from buffer for extra verification
      let bufferChecksum = 0;
      for (let i = 0; i < Math.min(audioBuffer.length, 1000); i++) {
        bufferChecksum = (bufferChecksum + audioBuffer[i]) % 65536;
      }

      // Verify checksum matches client
      const checksumMatch =
        clientChecksum !== undefined
          ? clientChecksum === base64Checksum
          : "N/A";
      console.log(`[Polish-Base64] ---- CHECKSUM VERIFICATION ----`);
      console.log(
        `[Polish-Base64] Client checksum: ${clientChecksum || "not provided"}`,
      );
      console.log(`[Polish-Base64] Server base64 checksum: ${base64Checksum}`);
      console.log(`[Polish-Base64] Server buffer checksum: ${bufferChecksum}`);
      console.log(`[Polish-Base64] Checksum match: ${checksumMatch}`);

      // Generate audio fingerprint for verification
      const audioFirst100 = audio.substring(0, 100);
      const audioLast50 = audio.substring(audio.length - 50);

      console.log(`[Polish-Base64] ---- AUDIO DETAILS ----`);
      console.log(`[Polish-Base64] Base64 length: ${audio.length} chars`);
      console.log(`[Polish-Base64] Buffer size: ${audioBuffer.length} bytes`);
      console.log(`[Polish-Base64] MIME type: ${effectiveMimeType}`);
      console.log(`[Polish-Base64] Base64 START: ${audioFirst100}`);
      console.log(`[Polish-Base64] Base64 END: ${audioLast50}`);

      // Verify audio buffer integrity with hex dump
      const bufferFirst32 = audioBuffer.slice(0, 32).toString("hex");
      const bufferLast32 = audioBuffer.slice(-32).toString("hex");
      console.log(`[Polish-Base64] HEX first 32 bytes: ${bufferFirst32}`);
      console.log(`[Polish-Base64] HEX last 32 bytes: ${bufferLast32}`);

      // Check for M4A/MP4 signature (ftyp)
      const hasFtyp = bufferFirst32.includes("66747970");
      console.log(`[Polish-Base64] Has M4A/MP4 ftyp header: ${hasFtyp}`);

      console.log(`[Polish-Base64] ---- SETTINGS ----`);
      console.log(`[Polish-Base64] Language: ${language}`);
      console.log(`[Polish-Base64] Output Format: ${outputFormat}`);
      console.log(`[Polish-Base64] Output Type: ${outputType}`);

      console.log(`[Polish-Base64] ---- TRANSCRIPTION ----`);
      console.log(`[Polish-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(
        audioBuffer,
        effectiveMimeType,
      );
      const transcribeTime = Date.now() - transcribeStart;

      console.log(`[Polish-Base64] Transcription time: ${transcribeTime}ms`);
      console.log(
        `[Polish-Base64] Transcribed length: ${originalText.length} chars`,
      );
      console.log(`[Polish-Base64] TRANSCRIBED TEXT: "${originalText}"`);

      if (!originalText || originalText.trim() === "") {
        console.log(
          `[Polish-Base64] ERROR: Empty transcription for request ${serverRequestId}`,
        );
        console.log(`${"=".repeat(60)}`);
        console.log(`[Polish-Base64] END REQUEST (EMPTY TRANSCRIPTION)`);
        console.log(`${"=".repeat(60)}\n`);
        return res.status(400).json({
          error:
            "Could not transcribe audio. Please try speaking more clearly.",
          serverRequestId,
        });
      }

      console.log(`[Polish-Base64] ---- POLISHING ----`);
      console.log(`[Polish-Base64] Calling polishText...`);
      const polishStart = Date.now();
      const polishedText = await polishText(
        originalText,
        language,
        outputFormat,
        outputType,
      );
      const polishTime = Date.now() - polishStart;

      console.log(`[Polish-Base64] Polish time: ${polishTime}ms`);
      console.log(
        `[Polish-Base64] Polished length: ${polishedText.length} chars`,
      );
      console.log(`[Polish-Base64] POLISHED TEXT: "${polishedText}"`);

      const translation = await storage.createTranslation({
        originalText,
        translatedText: originalText,
        polishedText,
        sourceLanguage: language,
        targetLanguage: language,
        outputFormat,
      });

      // Store audio hash for duplicate detection
      recentAudioHashes.set(audioHash, {
        timestamp: Date.now(),
        result: polishedText,
        userId,
      });
      console.log(
        `[Polish-Base64] Stored audio hash: ${audioHash} for duplicate detection`,
      );

      console.log(`[Polish-Base64] ---- RESULT ----`);
      console.log(
        `[Polish-Base64] Saved to storage with ID: ${translation.id}`,
      );
      console.log(
        `[Polish-Base64] Total time: ${Date.now() - new Date(requestTimestamp).getTime()}ms`,
      );
      console.log(`${"=".repeat(60)}`);
      console.log(`[Polish-Base64] END REQUEST (SUCCESS)`);
      console.log(`${"=".repeat(60)}\n`);

      res.json({
        ...translation,
        serverRequestId, // Include for debugging
      });
    } catch (error: any) {
      console.error(
        `[Polish-Base64] ERROR for request ${serverRequestId}:`,
        error,
      );
      console.log(`${"=".repeat(60)}`);
      console.log(`[Polish-Base64] END REQUEST (ERROR)`);
      console.log(`${"=".repeat(60)}\n`);
      res.status(500).json({
        error: error.message || "Failed to process speech polishing",
        serverRequestId,
      });
    }
  });

  // Translate speech base64 endpoint - accepts base64 audio for mobile apps
  // Supports both /api/translate-speech-base64 and /api/translate-speech-base64/:format
  app.post("/api/translate-speech-base64/:format?", async (req, res) => {
    const formatParam = req.params.format;
    // Generate unique server request ID for tracking
    const serverRequestId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const requestTimestamp = new Date().toISOString();

    try {
      console.log(`\n========== [Translate-Base64] NEW REQUEST ==========`);
      console.log(`[Translate-Base64] Server Request ID: ${serverRequestId}`);
      console.log(`[Translate-Base64] Timestamp: ${requestTimestamp}`);
      console.log(
        `[Translate-Base64] URL format param: ${formatParam || "not provided"}`,
      );

      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
          serverRequestId,
        });
      }

      const base64Schema = z.object({
        audio: z.string().min(1, "Audio data is required"),
        sourceLanguage: z.string(),
        targetLanguage: z.string(),
        outputFormat: z.string(),
        mimeType: z.string().optional().default("audio/mp4"),
        audioFormat: z.string().optional(), // Format hint from client (mp4, wav, etc.)
        clientRequestId: z.string().optional(), // Track client request ID if provided
        requestId: z.string().optional(), // Alternative name for client request ID
        clientChecksum: z.number().optional(), // Checksum from client for verification
      });

      const parseResult = base64Schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
          serverRequestId,
        });
      }

      const {
        audio,
        sourceLanguage,
        targetLanguage,
        outputFormat,
        mimeType: bodyMimeType,
        clientRequestId,
      } = parseResult.data;

      // Determine MIME type: URL format param takes priority, then body mimeType, then default
      const effectiveMimeType = formatParam
        ? getMimeTypeFromFormat(formatParam)
        : bodyMimeType;

      // Log client request ID if provided
      if (clientRequestId) {
        console.log(`[Translate-Base64] Client Request ID: ${clientRequestId}`);
      }

      const audioBuffer = Buffer.from(audio, "base64");

      // Generate SHA-256 hash for unique audio identification
      const audioHash = generateAudioHash(audioBuffer);
      const userId = req.jwtUser?.userId || "anonymous";

      console.log(`[Translate-Base64] ---- AUDIO HASH VERIFICATION ----`);
      console.log(`[Translate-Base64] Audio SHA-256 hash: ${audioHash}`);
      console.log(`[Translate-Base64] User ID: ${userId}`);

      // Check for duplicate audio (same hash sent recently)
      const existingEntry = recentAudioHashes.get(audioHash);
      if (existingEntry) {
        const ageSeconds = Math.round(
          (Date.now() - existingEntry.timestamp) / 1000,
        );
        console.log(`[Translate-Base64] WARNING: DUPLICATE AUDIO DETECTED!`);
        console.log(
          `[Translate-Base64] Same audio was sent ${ageSeconds}s ago`,
        );
        console.log(
          `[Translate-Base64] Previous result: "${existingEntry.result.substring(0, 100)}..."`,
        );
      } else {
        console.log(
          `[Translate-Base64] New unique audio (not seen in last 60s)`,
        );
      }

      // Generate audio fingerprint for verification
      const audioFirst100 = audio.substring(0, 100);
      const audioLast50 = audio.substring(audio.length - 50);

      console.log(
        `[Translate-Base64] Audio size: ${audio.length} chars (base64), ${audioBuffer.length} bytes (buffer)`,
      );
      console.log(
        `[Translate-Base64] Audio fingerprint start: ${audioFirst100}`,
      );
      console.log(`[Translate-Base64] Audio fingerprint end: ${audioLast50}`);
      console.log(`[Translate-Base64] Body mimeType: ${bodyMimeType}`);
      console.log(
        `[Translate-Base64] Effective MIME type: ${effectiveMimeType}`,
      );
      console.log(
        `[Translate-Base64] Source: ${sourceLanguage}, Target: ${targetLanguage}, Format: ${outputFormat}`,
      );

      // Verify audio buffer integrity
      const bufferFirst20 = audioBuffer.slice(0, 20).toString("hex");
      const bufferLast20 = audioBuffer.slice(-20).toString("hex");
      console.log(`[Translate-Base64] Buffer HEX start: ${bufferFirst20}`);
      console.log(`[Translate-Base64] Buffer HEX end: ${bufferLast20}`);

      console.log(`[Translate-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(
        audioBuffer,
        effectiveMimeType,
      );
      const transcribeTime = Date.now() - transcribeStart;

      console.log(
        `[Translate-Base64] Transcription completed in ${transcribeTime}ms`,
      );
      console.log(
        `[Translate-Base64] Transcribed text (${originalText.length} chars): "${originalText}"`,
      );

      if (!originalText || originalText.trim() === "") {
        console.log(
          `[Translate-Base64] ERROR: Empty transcription for request ${serverRequestId}`,
        );
        return res.status(400).json({
          error:
            "Could not transcribe audio. Please try speaking more clearly.",
          serverRequestId,
        });
      }

      console.log(`[Translate-Base64] Calling translateAndPolish...`);
      const translateStart = Date.now();
      const { translatedText, polishedText } = await translateAndPolish(
        originalText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      );
      const translateTime = Date.now() - translateStart;

      console.log(
        `[Translate-Base64] Translation completed in ${translateTime}ms`,
      );
      console.log(
        `[Translate-Base64] Translated text: "${translatedText.substring(0, 200)}..."`,
      );

      const translation = await storage.createTranslation({
        originalText,
        translatedText,
        polishedText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });

      // Store audio hash for duplicate detection
      recentAudioHashes.set(audioHash, {
        timestamp: Date.now(),
        result: polishedText,
        userId,
      });
      console.log(
        `[Translate-Base64] Stored audio hash: ${audioHash} for duplicate detection`,
      );

      console.log(
        `[Translate-Base64] Request ${serverRequestId} completed successfully`,
      );
      console.log(`========== [Translate-Base64] END REQUEST ==========\n`);

      res.json({
        ...translation,
        serverRequestId, // Include for debugging
      });
    } catch (error: any) {
      console.error(
        `[Translate-Base64] ERROR for request ${serverRequestId}:`,
        error,
      );
      console.log(
        `========== [Translate-Base64] END REQUEST (ERROR) ==========\n`,
      );
      res.status(500).json({
        error: error.message || "Failed to process translation",
        serverRequestId,
      });
    }
  });

  // Polish text endpoint - accepts text and returns polished version (no audio)
  app.post("/api/polish-text", async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
        });
      }

      const textPolishSchema = z.object({
        text: z.string().min(1, "Text is required"),
        language: z.string(),
        outputFormat: z.string(),
        outputType: z.string(),
        template: z.string().optional(),
      });

      const parseResult = textPolishSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, language, outputFormat, outputType, template } =
        parseResult.data;

      // Polish the text using Gemini
      const polishedText = await polishText(
        text,
        language,
        outputFormat,
        outputType,
        template,
      );

      // Save to storage
      const translation = await storage.createTranslation({
        originalText: text,
        translatedText: text,
        polishedText,
        sourceLanguage: language,
        targetLanguage: language,
        outputFormat,
      });

      res.json(translation);
    } catch (error: any) {
      console.error("Text polish error:", error);
      res.status(500).json({
        error: error.message || "Failed to polish text",
      });
    }
  });

  // Translate text endpoint - accepts text and returns translated + polished version (no audio)
  app.post("/api/translate-text", async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (
        !process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
        !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
      ) {
        return res.status(500).json({
          error:
            "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
        });
      }

      const textTranslateSchema = z.object({
        text: z.string().min(1, "Text is required"),
        sourceLanguage: z.string(),
        targetLanguage: z.string(),
        outputFormat: z.string(),
      });

      const parseResult = textTranslateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const { text, sourceLanguage, targetLanguage, outputFormat } =
        parseResult.data;

      // Translate and polish the text using Gemini
      const { translatedText, polishedText } = await translateAndPolish(
        text,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      );

      // Save to storage
      const translation = await storage.createTranslation({
        originalText: text,
        translatedText,
        polishedText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });

      res.json(translation);
    } catch (error: any) {
      console.error("Text translate error:", error);
      res.status(500).json({
        error: error.message || "Failed to translate text",
      });
    }
  });

  // Get recent translations
  app.get("/api/translations", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const translations = await storage.getRecentTranslations(limit);
      res.json(translations);
    } catch (error: any) {
      console.error("Error fetching translations:", error);
      res.status(500).json({ error: "Failed to fetch translations" });
    }
  });

  // Get single translation by ID
  app.get("/api/translations/:id", async (req, res) => {
    try {
      const translation = await storage.getTranslation(req.params.id);
      if (!translation) {
        return res.status(404).json({ error: "Translation not found" });
      }
      res.json(translation);
    } catch (error: any) {
      console.error("Error fetching translation:", error);
      res.status(500).json({ error: "Failed to fetch translation" });
    }
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

  // ============ AUTHENTICATION ROUTES ============

  // Signup endpoint
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const parseResult = signupSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
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
        return res.status(400).json({ error: "Invalid verification code" });
      }

      const otpRecord = otpRecords[0];
      if (new Date() > otpRecord.expiresAt) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const existingEmailUser = await storage.getUserByEmail?.(normalizedEmail);
      if (existingEmailUser) {
        return res.status(409).json({ error: "Email already exists" });
      }

      await db.delete(emailOtps).where(eq(emailOtps.email, normalizedEmail));

      // Create new user
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

      // Generate JWT token
      const token = generateToken(user.id, user.username);

      // Also set session for web compatibility
      (req.session as any).userId = user.id;
      (req.session as any).username = user.username;

      res.status(201).json({
        message: "Account created successfully",
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { username, password } = parseResult.data;

      // Find user
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Validate password
      const isValidPassword = await storage.validatePassword(user, password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Generate JWT token
      const token = generateToken(user.id, user.username);

      // Also set session for web compatibility
      (req.session as any).userId = user.id;
      (req.session as any).username = user.username;

      res.json({
        message: "Login successful",
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user endpoint
  app.get("/api/auth/me", async (req, res) => {
    const userId = getUserId(req);

    if (userId) {
      // If we have JWT user info, use it directly
      if (req.jwtUser) {
        res.json({
          user: {
            id: req.jwtUser.userId,
            username: req.jwtUser.username,
          },
        });
      } else if ((req.session as any).userId) {
        // Fallback to session
        res.json({
          user: {
            id: (req.session as any).userId,
            username: (req.session as any).username,
          },
        });
      } else {
        res.status(401).json({ error: "Not authenticated" });
      }
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Save text endpoint (requires authentication)
  app.post("/api/saved-texts", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const savedTextData = {
        ...req.body,
        userId,
      };

      const parseResult = insertSavedTextSchema.safeParse(savedTextData);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
        });
      }

      const savedText = await storage.createSavedText(parseResult.data);
      res.status(201).json(savedText);
    } catch (error: any) {
      console.error("Save text error:", error);
      res.status(500).json({ error: "Failed to save text" });
    }
  });

  // Get saved texts for current user (allows guest access - returns empty array)
  app.get("/api/saved-texts", async (req, res) => {
    try {
      const userId = getUserId(req);

      // Allow guest access - return empty array for unauthenticated users
      if (!userId) {
        return res.json([]);
      }

      const type = req.query.type as string | undefined;
      const savedTexts = await storage.getSavedTextsByUser(userId, type);
      res.json(savedTexts);
    } catch (error: any) {
      console.error("Get saved texts error:", error);
      res.status(500).json({ error: "Failed to get saved texts" });
    }
  });

  // Get saved texts by type or single saved text by ID (allows guest access - returns empty array)
  app.get("/api/saved-texts/:param", async (req, res) => {
    try {
      const userId = getUserId(req);

      // Allow guest access - return empty array for unauthenticated users
      if (!userId) {
        return res.json([]);
      }

      const { param } = req.params;
      const validTypes = ["all", "polish", "translate"];

      if (validTypes.includes(param)) {
        // It's a type filter
        const filterType = param === "all" ? undefined : param;
        const savedTexts = await storage.getSavedTextsByUser(
          userId,
          filterType,
        );
        res.json(savedTexts);
      } else {
        // It's an ID
        const savedText = await storage.getSavedText(param);
        if (!savedText || savedText.userId !== userId) {
          return res.status(404).json({ error: "Saved text not found" });
        }
        res.json(savedText);
      }
    } catch (error: any) {
      console.error("Get saved text error:", error);
      res.status(500).json({ error: "Failed to get saved text" });
    }
  });

  // Update saved text
  app.put("/api/saved-texts/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const updateData = {
        type: req.body.type,
        originalText: req.body.originalText,
        polishedText: req.body.polishedText,
        translatedText: req.body.translatedText,
        sourceLanguage: req.body.sourceLanguage,
        targetLanguage: req.body.targetLanguage,
        outputFormat: req.body.outputFormat,
        outputType: req.body.outputType,
      };

      const updatedText = await storage.updateSavedText(id, userId, updateData);

      if (!updatedText) {
        return res
          .status(404)
          .json({
            error:
              "Saved text not found or you do not have permission to edit it",
          });
      }

      res.json(updatedText);
    } catch (error: any) {
      console.error("Update saved text error:", error);
      res.status(500).json({ error: "Failed to update saved text" });
    }
  });

  // Delete saved text
  app.delete("/api/saved-texts/:id", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const deleted = await storage.deleteSavedText(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Saved text not found" });
      }

      res.json({ message: "Saved text deleted" });
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
          error: "Invalid credentials",
        });
      }

      // Validate password
      const isValidPassword = await storage.validatePassword?.(user, password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
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

  // ============================================================
  // MOBILE API ENDPOINTS - /api/v1/m/
  // All mobile endpoints require JWT authentication
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

  // Mobile Auth: Verify token and get user info
  app.get("/api/v1/m/auth/me", mobileAuthMiddleware, (req, res) => {
    res.json({
      success: true,
      user: {
        id: req.jwtUser?.userId,
        email: req.jwtUser?.email,
        username: req.jwtUser?.username,
      },
    });
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

  return httpServer;
}
