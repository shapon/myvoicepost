import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseStorage } from "./supabase-storage";
import { translateRequestSchema, polishRequestSchema, insertUserSchema, insertSavedTextSchema } from "@shared/schema";
import { transcribeAudio, translateAndPolish, polishText } from "./gemini";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Audio hash tracking for duplicate detection (in-memory, clears on restart)
const recentAudioHashes = new Map<string, { timestamp: number; result: string; userId?: string }>();
const HASH_CACHE_TTL = 60000; // 1 minute TTL for duplicate detection

// Generate SHA-256 hash of audio data
function generateAudioHash(audioBuffer: Buffer): string {
  return crypto.createHash('sha256').update(audioBuffer).digest('hex').substring(0, 16);
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
const JWT_SECRET: string = process.env.JWT_SECRET || process.env.SESSION_SECRET || '';
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET or SESSION_SECRET environment variable must be set");
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
      const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: string; username: string; email?: string };
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
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Use supabase storage for database operations
const storage = supabaseStorage;

// Login schema
const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Signup schema
const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Configure multer for audio file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
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
  app: Express
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
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
        });
      }

      // Check if audio file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Transcribe audio using Gemini
      const text = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype
      );

      if (!text || text.trim() === "") {
        return res.status(400).json({ error: "Could not transcribe audio. Please try speaking more clearly." });
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
  app.post("/api/translate-speech", upload.single("audio"), async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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

      const { sourceLanguage, targetLanguage, outputFormat } = parseResult.data;

      // Check if audio file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Step 1: Transcribe audio using Gemini
      const originalText = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype
      );

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({ error: "Could not transcribe audio. Please try speaking more clearly." });
      }

      // Step 2: Translate and polish using Gemini
      const { translatedText, polishedText } = await translateAndPolish(
        originalText,
        sourceLanguage,
        targetLanguage,
        outputFormat
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
  });

  // Polish speech endpoint - converts speech to polished text (same language)
  app.post("/api/polish-speech", upload.single("audio"), async (req, res) => {
    try {
      // Check if Gemini AI integration is configured
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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
        req.file.mimetype
      );

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({ error: "Could not transcribe audio. Please try speaking more clearly." });
      }

      // Step 2: Polish the text using Gemini
      const polishedText = await polishText(
        originalText,
        language,
        outputFormat,
        outputType
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
    'mp4': 'audio/mp4',
    'm4a': 'audio/mp4',
    'wav': 'audio/wav',
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'mpeg': 'audio/mpeg',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
  };

  // Helper function to get MIME type from format
  function getMimeTypeFromFormat(format: string | undefined, defaultMime: string = 'audio/mp4'): string {
    if (!format) return defaultMime;
    const cleanFormat = format.toLowerCase().replace('.', '');
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
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[Polish-Base64] NEW REQUEST`);
      console.log(`${'='.repeat(60)}`);
      console.log(`[Polish-Base64] Server Request ID: ${serverRequestId}`);
      console.log(`[Polish-Base64] Timestamp: ${requestTimestamp}`);
      console.log(`[Polish-Base64] User Agent: ${req.headers['user-agent']}`);
      
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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
        console.log(`[Polish-Base64] Validation failed:`, parseResult.error.errors);
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
          serverRequestId,
        });
      }

      const { audio, language, outputFormat, outputType, mimeType: bodyMimeType, clientRequestId, requestId, clientChecksum } = parseResult.data;

      // Determine MIME type: URL format param takes priority, then body mimeType, then default
      const effectiveMimeType = formatParam 
        ? getMimeTypeFromFormat(formatParam) 
        : bodyMimeType;
      
      console.log(`[Polish-Base64] URL format param: ${formatParam || 'not provided'}`);
      console.log(`[Polish-Base64] Body mimeType: ${bodyMimeType}`);
      console.log(`[Polish-Base64] Effective MIME type: ${effectiveMimeType}`);

      // Log client request ID if provided
      const clientReqId = clientRequestId || requestId;
      if (clientReqId) {
        console.log(`[Polish-Base64] Client Request ID: ${clientReqId}`);
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      
      // Generate SHA-256 hash for unique audio identification
      const audioHash = generateAudioHash(audioBuffer);
      const userId = req.jwtUser?.userId || 'anonymous';
      
      console.log(`[Polish-Base64] ---- AUDIO HASH VERIFICATION ----`);
      console.log(`[Polish-Base64] Audio SHA-256 hash: ${audioHash}`);
      console.log(`[Polish-Base64] User ID: ${userId}`);
      
      // Check for duplicate audio (same hash sent recently)
      const existingEntry = recentAudioHashes.get(audioHash);
      if (existingEntry) {
        const ageSeconds = Math.round((Date.now() - existingEntry.timestamp) / 1000);
        console.log(`[Polish-Base64] WARNING: DUPLICATE AUDIO DETECTED!`);
        console.log(`[Polish-Base64] Same audio was sent ${ageSeconds}s ago`);
        console.log(`[Polish-Base64] Previous result: "${existingEntry.result.substring(0, 100)}..."`);
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
      const checksumMatch = clientChecksum !== undefined ? (clientChecksum === base64Checksum) : 'N/A';
      console.log(`[Polish-Base64] ---- CHECKSUM VERIFICATION ----`);
      console.log(`[Polish-Base64] Client checksum: ${clientChecksum || 'not provided'}`);
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
      const bufferFirst32 = audioBuffer.slice(0, 32).toString('hex');
      const bufferLast32 = audioBuffer.slice(-32).toString('hex');
      console.log(`[Polish-Base64] HEX first 32 bytes: ${bufferFirst32}`);
      console.log(`[Polish-Base64] HEX last 32 bytes: ${bufferLast32}`);
      
      // Check for M4A/MP4 signature (ftyp)
      const hasFtyp = bufferFirst32.includes('66747970');
      console.log(`[Polish-Base64] Has M4A/MP4 ftyp header: ${hasFtyp}`);
      
      console.log(`[Polish-Base64] ---- SETTINGS ----`);
      console.log(`[Polish-Base64] Language: ${language}`);
      console.log(`[Polish-Base64] Output Format: ${outputFormat}`);
      console.log(`[Polish-Base64] Output Type: ${outputType}`);

      console.log(`[Polish-Base64] ---- TRANSCRIPTION ----`);
      console.log(`[Polish-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(audioBuffer, effectiveMimeType);
      const transcribeTime = Date.now() - transcribeStart;
      
      console.log(`[Polish-Base64] Transcription time: ${transcribeTime}ms`);
      console.log(`[Polish-Base64] Transcribed length: ${originalText.length} chars`);
      console.log(`[Polish-Base64] TRANSCRIBED TEXT: "${originalText}"`);

      if (!originalText || originalText.trim() === "") {
        console.log(`[Polish-Base64] ERROR: Empty transcription for request ${serverRequestId}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`[Polish-Base64] END REQUEST (EMPTY TRANSCRIPTION)`);
        console.log(`${'='.repeat(60)}\n`);
        return res.status(400).json({ 
          error: "Could not transcribe audio. Please try speaking more clearly.",
          serverRequestId,
        });
      }

      console.log(`[Polish-Base64] ---- POLISHING ----`);
      console.log(`[Polish-Base64] Calling polishText...`);
      const polishStart = Date.now();
      const polishedText = await polishText(originalText, language, outputFormat, outputType);
      const polishTime = Date.now() - polishStart;
      
      console.log(`[Polish-Base64] Polish time: ${polishTime}ms`);
      console.log(`[Polish-Base64] Polished length: ${polishedText.length} chars`);
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
      console.log(`[Polish-Base64] Stored audio hash: ${audioHash} for duplicate detection`);

      console.log(`[Polish-Base64] ---- RESULT ----`);
      console.log(`[Polish-Base64] Saved to storage with ID: ${translation.id}`);
      console.log(`[Polish-Base64] Total time: ${Date.now() - new Date(requestTimestamp).getTime()}ms`);
      console.log(`${'='.repeat(60)}`);
      console.log(`[Polish-Base64] END REQUEST (SUCCESS)`);
      console.log(`${'='.repeat(60)}\n`);

      res.json({
        ...translation,
        serverRequestId, // Include for debugging
      });
    } catch (error: any) {
      console.error(`[Polish-Base64] ERROR for request ${serverRequestId}:`, error);
      console.log(`${'='.repeat(60)}`);
      console.log(`[Polish-Base64] END REQUEST (ERROR)`);
      console.log(`${'='.repeat(60)}\n`);
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
      console.log(`[Translate-Base64] URL format param: ${formatParam || 'not provided'}`);
      
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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

      const { audio, sourceLanguage, targetLanguage, outputFormat, mimeType: bodyMimeType, clientRequestId } = parseResult.data;

      // Determine MIME type: URL format param takes priority, then body mimeType, then default
      const effectiveMimeType = formatParam 
        ? getMimeTypeFromFormat(formatParam) 
        : bodyMimeType;

      // Log client request ID if provided
      if (clientRequestId) {
        console.log(`[Translate-Base64] Client Request ID: ${clientRequestId}`);
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      
      // Generate SHA-256 hash for unique audio identification
      const audioHash = generateAudioHash(audioBuffer);
      const userId = req.jwtUser?.userId || 'anonymous';
      
      console.log(`[Translate-Base64] ---- AUDIO HASH VERIFICATION ----`);
      console.log(`[Translate-Base64] Audio SHA-256 hash: ${audioHash}`);
      console.log(`[Translate-Base64] User ID: ${userId}`);
      
      // Check for duplicate audio (same hash sent recently)
      const existingEntry = recentAudioHashes.get(audioHash);
      if (existingEntry) {
        const ageSeconds = Math.round((Date.now() - existingEntry.timestamp) / 1000);
        console.log(`[Translate-Base64] WARNING: DUPLICATE AUDIO DETECTED!`);
        console.log(`[Translate-Base64] Same audio was sent ${ageSeconds}s ago`);
        console.log(`[Translate-Base64] Previous result: "${existingEntry.result.substring(0, 100)}..."`);
      } else {
        console.log(`[Translate-Base64] New unique audio (not seen in last 60s)`);
      }
      
      // Generate audio fingerprint for verification
      const audioFirst100 = audio.substring(0, 100);
      const audioLast50 = audio.substring(audio.length - 50);
      
      console.log(`[Translate-Base64] Audio size: ${audio.length} chars (base64), ${audioBuffer.length} bytes (buffer)`);
      console.log(`[Translate-Base64] Audio fingerprint start: ${audioFirst100}`);
      console.log(`[Translate-Base64] Audio fingerprint end: ${audioLast50}`);
      console.log(`[Translate-Base64] Body mimeType: ${bodyMimeType}`);
      console.log(`[Translate-Base64] Effective MIME type: ${effectiveMimeType}`);
      console.log(`[Translate-Base64] Source: ${sourceLanguage}, Target: ${targetLanguage}, Format: ${outputFormat}`);
      
      // Verify audio buffer integrity
      const bufferFirst20 = audioBuffer.slice(0, 20).toString('hex');
      const bufferLast20 = audioBuffer.slice(-20).toString('hex');
      console.log(`[Translate-Base64] Buffer HEX start: ${bufferFirst20}`);
      console.log(`[Translate-Base64] Buffer HEX end: ${bufferLast20}`);

      console.log(`[Translate-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(audioBuffer, effectiveMimeType);
      const transcribeTime = Date.now() - transcribeStart;
      
      console.log(`[Translate-Base64] Transcription completed in ${transcribeTime}ms`);
      console.log(`[Translate-Base64] Transcribed text (${originalText.length} chars): "${originalText}"`);

      if (!originalText || originalText.trim() === "") {
        console.log(`[Translate-Base64] ERROR: Empty transcription for request ${serverRequestId}`);
        return res.status(400).json({ 
          error: "Could not transcribe audio. Please try speaking more clearly.",
          serverRequestId,
        });
      }

      console.log(`[Translate-Base64] Calling translateAndPolish...`);
      const translateStart = Date.now();
      const { translatedText, polishedText } = await translateAndPolish(
        originalText,
        sourceLanguage,
        targetLanguage,
        outputFormat
      );
      const translateTime = Date.now() - translateStart;
      
      console.log(`[Translate-Base64] Translation completed in ${translateTime}ms`);
      console.log(`[Translate-Base64] Translated text: "${translatedText.substring(0, 200)}..."`);

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
      console.log(`[Translate-Base64] Stored audio hash: ${audioHash} for duplicate detection`);

      console.log(`[Translate-Base64] Request ${serverRequestId} completed successfully`);
      console.log(`========== [Translate-Base64] END REQUEST ==========\n`);

      res.json({
        ...translation,
        serverRequestId, // Include for debugging
      });
    } catch (error: any) {
      console.error(`[Translate-Base64] ERROR for request ${serverRequestId}:`, error);
      console.log(`========== [Translate-Base64] END REQUEST (ERROR) ==========\n`);
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
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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

      const { text, language, outputFormat, outputType, template } = parseResult.data;

      // Polish the text using Gemini
      const polishedText = await polishText(
        text,
        language,
        outputFormat,
        outputType,
        template
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
      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
        return res.status(500).json({
          error: "Gemini AI integration not configured. Please ensure the integration is set up correctly.",
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

      const { text, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;

      // Translate and polish the text using Gemini
      const { translatedText, polishedText } = await translateAndPolish(
        text,
        sourceLanguage,
        targetLanguage,
        outputFormat
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

      const { username, email, password } = parseResult.data;

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail?.(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already exists" });
      }

      // Create new user
      const user = await storage.createUser({ username, email, password });

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
      const validTypes = ['all', 'polish', 'translate'];
      
      if (validTypes.includes(param)) {
        // It's a type filter
        const filterType = param === 'all' ? undefined : param;
        const savedTexts = await storage.getSavedTextsByUser(userId, filterType);
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
        return res.status(404).json({ error: "Saved text not found or you do not have permission to edit it" });
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
  // MOBILE API ENDPOINTS - /api/v1/m/
  // All mobile endpoints require JWT authentication
  // ============================================================

  // Mobile JWT middleware - validates token and checks expiry (used for all mobile endpoints except login)
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
      const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: string; username: string; email?: string; exp?: number };
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

  // Mobile Auth: Login (accepts username OR email)
  app.post("/api/v1/m/auth/login", async (req, res) => {
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
      const isEmail = identifier.includes('@');
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
        { expiresIn: "7d" }
      );

      console.log(`[Mobile Login] User ${user.username} logged in successfully`);

      res.json({
        success: true,
        token,
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      });
    } catch (error: any) {
      console.error("[Mobile] Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed",
      });
    }
  });

  // Mobile Auth: Signup
  app.post("/api/v1/m/auth/signup", async (req, res) => {
    try {
      const signupSchema = z.object({
        username: z.string().min(3, "Username must be at least 3 characters"),
        email: z.string().email("Valid email is required"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        confirmPassword: z.string(),
      }).refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"],
      });

      const parseResult = signupSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parseResult.error.errors,
        });
      }

      const { username, email, password } = parseResult.data;

      // Check if username exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Username already exists",
        });
      }

      // Check if email exists
      const existingEmail = await storage.getUserByEmail?.(email);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: "Email already exists",
        });
      }

      // Create user
      const user = await storage.createUser({ username, email, password });

      // Generate JWT token (valid for 3 days)
      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: "3d" }
      );

      console.log(`[Mobile Signup] User ${user.username} created successfully`);

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
      });
    } catch (error: any) {
      console.error("[Mobile] Signup error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create account",
      });
    }
  });

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

      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
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

      console.log(`[Mobile Transcribe] User: ${userId}, Audio size: ${audioBuffer.length} bytes, MIME: ${mimeType}`);

      const originalText = await transcribeAudio(audioBuffer, mimeType);

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Could not transcribe audio. Please try speaking more clearly.",
        });
      }

      console.log(`[Mobile Transcribe] Success: "${originalText.substring(0, 100)}..."`);

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

      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
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

      const { originalText, language, outputFormat, outputType } = parseResult.data;

      console.log(`[Mobile Polish] User: ${userId}, Text length: ${originalText.length}, Lang: ${language}`);

      const polishedText = await polishText(originalText, language, outputFormat, outputType);

      console.log(`[Mobile Polish] Success: "${polishedText.substring(0, 100)}..."`);

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

      if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
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

      const { originalText, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;

      console.log(`[Mobile Translate] User: ${userId}, ${sourceLanguage} -> ${targetLanguage}`);

      const { translatedText, polishedText } = await translateAndPolish(
        originalText,
        sourceLanguage,
        targetLanguage,
        outputFormat
      );

      console.log(`[Mobile Translate] Success: "${translatedText.substring(0, 100)}..."`);

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

      console.log(`[Mobile Save] User: ${userId}, Type: ${parseResult.data.type}, ID: ${savedText.id}`);

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
  app.get("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
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
  });

  // Mobile: Update saved text by ID
  app.put("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
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

      const updatedText = await storage.updateSavedText(id, userId, parseResult.data);

      if (!updatedText) {
        return res.status(404).json({
          success: false,
          error: "Saved text not found or you do not have permission to edit it",
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
  });

  // Mobile: Delete saved text by ID
  app.delete("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
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
  });

  return httpServer;
}
