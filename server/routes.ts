import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { translateRequestSchema, polishRequestSchema } from "@shared/schema";
import { transcribeAudio, translateAndPolish, polishText } from "./gemini";
import multer, { FileFilterCallback } from "multer";

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
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Translation endpoint - accepts audio file and returns transcription + translation
  app.post("/api/translate-speech", upload.single("audio"), async (req, res) => {
    try {
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          error: "OpenAI API key not configured. Please add your API key to use this feature.",
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

      // Step 1: Transcribe audio using OpenAI Whisper
      const originalText = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype
      );

      if (!originalText || originalText.trim() === "") {
        return res.status(400).json({ error: "Could not transcribe audio. Please try speaking more clearly." });
      }

      // Step 2: Translate and polish using GPT
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

  return httpServer;
}
