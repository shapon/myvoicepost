import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Supported languages for translation
export const supportedLanguages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
] as const;

export type LanguageCode = typeof supportedLanguages[number]["code"];

// Translation request schema for API validation
export const translateRequestSchema = z.object({
  sourceLanguage: z.string().min(2).max(5),
  targetLanguage: z.string().min(2).max(5),
  outputFormat: z.enum(["professional", "casual", "formal", "friendly"]).default("professional"),
});

export type TranslateRequest = z.infer<typeof translateRequestSchema>;

// Polish request schema for API validation (same language polishing)
export const polishRequestSchema = z.object({
  language: z.string().min(2).max(5),
  outputFormat: z.enum(["professional", "casual", "formal", "friendly"]).default("professional"),
  outputType: z.enum(["message", "note", "email", "post", "journal"]).default("message"),
});

export type PolishRequest = z.infer<typeof polishRequestSchema>;

// Translation response type
export interface TranslationResult {
  id: string;
  originalText: string;
  translatedText: string;
  polishedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  outputFormat: string;
  createdAt: Date;
}

// Insert translation type for storage
export interface InsertTranslation {
  originalText: string;
  translatedText: string;
  polishedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  outputFormat: string;
}
