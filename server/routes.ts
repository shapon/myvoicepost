import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseStorage } from "./supabase-storage";
import { translateRequestSchema, polishRequestSchema, insertUserSchema, insertSavedTextSchema } from "@shared/schema";
import { transcribeAudio, translateAndPolish, polishText } from "./gemini";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import jwt from "jsonwebtoken";

// JWT configuration - JWT_SECRET is required for security
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
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
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
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

  // Polish speech base64 endpoint - accepts base64 audio for mobile apps
  app.post("/api/polish-speech-base64", async (req, res) => {
    // Generate unique server request ID for tracking
    const serverRequestId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const requestTimestamp = new Date().toISOString();
    
    try {
      console.log(`\n========== [Polish-Base64] NEW REQUEST ==========`);
      console.log(`[Polish-Base64] Server Request ID: ${serverRequestId}`);
      console.log(`[Polish-Base64] Timestamp: ${requestTimestamp}`);
      
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
        mimeType: z.string().optional().default("audio/m4a"),
        clientRequestId: z.string().optional(), // Track client request ID if provided
      });

      const parseResult = base64Schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
          serverRequestId,
        });
      }

      const { audio, language, outputFormat, outputType, mimeType, clientRequestId } = parseResult.data;

      // Log client request ID if provided
      if (clientRequestId) {
        console.log(`[Polish-Base64] Client Request ID: ${clientRequestId}`);
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      
      // Generate audio fingerprint for verification
      const audioFirst100 = audio.substring(0, 100);
      const audioLast50 = audio.substring(audio.length - 50);
      const audioHash = `${audioFirst100}...${audioLast50}`;
      
      console.log(`[Polish-Base64] Audio size: ${audio.length} chars (base64), ${audioBuffer.length} bytes (buffer)`);
      console.log(`[Polish-Base64] Audio fingerprint start: ${audioFirst100}`);
      console.log(`[Polish-Base64] Audio fingerprint end: ${audioLast50}`);
      console.log(`[Polish-Base64] MIME type: ${mimeType}`);
      console.log(`[Polish-Base64] Language: ${language}, Format: ${outputFormat}, Type: ${outputType}`);
      
      // Verify audio buffer integrity
      const bufferFirst20 = audioBuffer.slice(0, 20).toString('hex');
      const bufferLast20 = audioBuffer.slice(-20).toString('hex');
      console.log(`[Polish-Base64] Buffer HEX start: ${bufferFirst20}`);
      console.log(`[Polish-Base64] Buffer HEX end: ${bufferLast20}`);

      console.log(`[Polish-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(audioBuffer, mimeType);
      const transcribeTime = Date.now() - transcribeStart;
      
      console.log(`[Polish-Base64] Transcription completed in ${transcribeTime}ms`);
      console.log(`[Polish-Base64] Transcribed text (${originalText.length} chars): "${originalText}"`);

      if (!originalText || originalText.trim() === "") {
        console.log(`[Polish-Base64] ERROR: Empty transcription for request ${serverRequestId}`);
        return res.status(400).json({ 
          error: "Could not transcribe audio. Please try speaking more clearly.",
          serverRequestId,
        });
      }

      console.log(`[Polish-Base64] Calling polishText...`);
      const polishStart = Date.now();
      const polishedText = await polishText(originalText, language, outputFormat, outputType);
      const polishTime = Date.now() - polishStart;
      
      console.log(`[Polish-Base64] Polish completed in ${polishTime}ms`);
      console.log(`[Polish-Base64] Polished text (${polishedText.length} chars): "${polishedText.substring(0, 200)}..."`);

      const translation = await storage.createTranslation({
        originalText,
        translatedText: originalText,
        polishedText,
        sourceLanguage: language,
        targetLanguage: language,
        outputFormat,
      });

      console.log(`[Polish-Base64] Request ${serverRequestId} completed successfully`);
      console.log(`========== [Polish-Base64] END REQUEST ==========\n`);

      res.json({
        ...translation,
        serverRequestId, // Include for debugging
      });
    } catch (error: any) {
      console.error(`[Polish-Base64] ERROR for request ${serverRequestId}:`, error);
      console.log(`========== [Polish-Base64] END REQUEST (ERROR) ==========\n`);
      res.status(500).json({
        error: error.message || "Failed to process speech polishing",
        serverRequestId,
      });
    }
  });

  // Translate speech base64 endpoint - accepts base64 audio for mobile apps
  app.post("/api/translate-speech-base64", async (req, res) => {
    // Generate unique server request ID for tracking
    const serverRequestId = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const requestTimestamp = new Date().toISOString();
    
    try {
      console.log(`\n========== [Translate-Base64] NEW REQUEST ==========`);
      console.log(`[Translate-Base64] Server Request ID: ${serverRequestId}`);
      console.log(`[Translate-Base64] Timestamp: ${requestTimestamp}`);
      
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
        mimeType: z.string().optional().default("audio/m4a"),
        clientRequestId: z.string().optional(), // Track client request ID if provided
      });

      const parseResult = base64Schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors,
          serverRequestId,
        });
      }

      const { audio, sourceLanguage, targetLanguage, outputFormat, mimeType, clientRequestId } = parseResult.data;

      // Log client request ID if provided
      if (clientRequestId) {
        console.log(`[Translate-Base64] Client Request ID: ${clientRequestId}`);
      }

      const audioBuffer = Buffer.from(audio, 'base64');
      
      // Generate audio fingerprint for verification
      const audioFirst100 = audio.substring(0, 100);
      const audioLast50 = audio.substring(audio.length - 50);
      
      console.log(`[Translate-Base64] Audio size: ${audio.length} chars (base64), ${audioBuffer.length} bytes (buffer)`);
      console.log(`[Translate-Base64] Audio fingerprint start: ${audioFirst100}`);
      console.log(`[Translate-Base64] Audio fingerprint end: ${audioLast50}`);
      console.log(`[Translate-Base64] MIME type: ${mimeType}`);
      console.log(`[Translate-Base64] Source: ${sourceLanguage}, Target: ${targetLanguage}, Format: ${outputFormat}`);
      
      // Verify audio buffer integrity
      const bufferFirst20 = audioBuffer.slice(0, 20).toString('hex');
      const bufferLast20 = audioBuffer.slice(-20).toString('hex');
      console.log(`[Translate-Base64] Buffer HEX start: ${bufferFirst20}`);
      console.log(`[Translate-Base64] Buffer HEX end: ${bufferLast20}`);

      console.log(`[Translate-Base64] Calling Gemini transcribeAudio...`);
      const transcribeStart = Date.now();
      const originalText = await transcribeAudio(audioBuffer, mimeType);
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

  return httpServer;
}
