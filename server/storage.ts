import { type User, type TranslationResult, type InsertTranslation, type SavedText, type InsertSavedText } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail?(email: string): Promise<User | undefined>;
  createUser(user: CreateUserInput): Promise<User>;
  validatePassword?(user: User, password: string): Promise<boolean>;
  
  // Translation operations
  createTranslation(translation: InsertTranslation): Promise<TranslationResult>;
  getTranslation(id: string): Promise<TranslationResult | undefined>;
  getRecentTranslations(limit?: number): Promise<TranslationResult[]>;
  
  // Saved text operations
  createSavedText(savedText: InsertSavedText): Promise<SavedText>;
  getSavedTextsByUser(userId: string, type?: string): Promise<SavedText[]>;
  getSavedText(id: string): Promise<SavedText | undefined>;
  deleteSavedText(id: string, userId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private translations: Map<string, TranslationResult>;
  private savedTexts: Map<string, SavedText>;

  constructor() {
    this.users = new Map();
    this.translations = new Map();
    this.savedTexts = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(input.password, 10);
    const user: User = { 
      id, 
      username: input.username, 
      email: input.email || null,
      passwordHash: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async createTranslation(insertTranslation: InsertTranslation): Promise<TranslationResult> {
    const id = randomUUID();
    const translation: TranslationResult = {
      ...insertTranslation,
      id,
      createdAt: new Date(),
    };
    this.translations.set(id, translation);
    return translation;
  }

  async getTranslation(id: string): Promise<TranslationResult | undefined> {
    return this.translations.get(id);
  }

  async getRecentTranslations(limit: number = 10): Promise<TranslationResult[]> {
    const translations = Array.from(this.translations.values());
    return translations
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async createSavedText(savedText: InsertSavedText): Promise<SavedText> {
    const id = randomUUID();
    const saved: SavedText = {
      id,
      userId: savedText.userId,
      type: savedText.type,
      originalText: savedText.originalText,
      polishedText: savedText.polishedText,
      translatedText: savedText.translatedText ?? null,
      sourceLanguage: savedText.sourceLanguage,
      targetLanguage: savedText.targetLanguage ?? null,
      outputFormat: savedText.outputFormat,
      outputType: savedText.outputType ?? null,
      createdAt: new Date(),
    };
    this.savedTexts.set(id, saved);
    return saved;
  }

  async getSavedTextsByUser(userId: string, type?: string): Promise<SavedText[]> {
    const texts = Array.from(this.savedTexts.values())
      .filter(t => t.userId === userId && (!type || t.type === type))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return texts;
  }

  async getSavedText(id: string): Promise<SavedText | undefined> {
    return this.savedTexts.get(id);
  }

  async deleteSavedText(id: string, userId: string): Promise<boolean> {
    const text = this.savedTexts.get(id);
    if (text && text.userId === userId) {
      this.savedTexts.delete(id);
      return true;
    }
    return false;
  }
}

export const storage = new MemStorage();
