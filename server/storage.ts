import { type User, type UserRole, type TranslationResult, type InsertTranslation, type SavedText, type InsertSavedText } from "@shared/schema";
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
  updateUserRole(userId: string, role: UserRole): Promise<void>;
  
  // Translation operations
  createTranslation(translation: InsertTranslation): Promise<TranslationResult>;
  getTranslation(id: string): Promise<TranslationResult | undefined>;
  getRecentTranslations(limit?: number): Promise<TranslationResult[]>;
  
  // Saved text operations
  createSavedText(savedText: InsertSavedText): Promise<SavedText>;
  getSavedTextsByUser(userId: string, type?: string): Promise<SavedText[]>;
  getSavedText(id: string): Promise<SavedText | undefined>;
  deleteSavedText(id: string, userId: string): Promise<boolean>;
  updateSavedText(id: string, userId: string, data: Partial<Omit<SavedText, 'id' | 'userId' | 'createdAt'>>): Promise<SavedText | null>;
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
      role: "GUEST",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.role = role;
      user.updatedAt = new Date();
      this.users.set(userId, user);
    }
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

  async updateSavedText(id: string, userId: string, data: Partial<Omit<SavedText, 'id' | 'userId' | 'createdAt'>>): Promise<SavedText | null> {
    const text = this.savedTexts.get(id);
    if (!text || text.userId !== userId) {
      return null;
    }
    
    const updated: SavedText = {
      ...text,
      type: data.type ?? text.type,
      originalText: data.originalText ?? text.originalText,
      polishedText: data.polishedText ?? text.polishedText,
      translatedText: data.translatedText !== undefined ? data.translatedText : text.translatedText,
      sourceLanguage: data.sourceLanguage ?? text.sourceLanguage,
      targetLanguage: data.targetLanguage !== undefined ? data.targetLanguage : text.targetLanguage,
      outputFormat: data.outputFormat ?? text.outputFormat,
      outputType: data.outputType !== undefined ? data.outputType : text.outputType,
    };
    
    this.savedTexts.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
