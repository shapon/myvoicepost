import { type User, type InsertUser, type TranslationResult, type InsertTranslation } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Translation operations
  createTranslation(translation: InsertTranslation): Promise<TranslationResult>;
  getTranslation(id: string): Promise<TranslationResult | undefined>;
  getRecentTranslations(limit?: number): Promise<TranslationResult[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private translations: Map<string, TranslationResult>;

  constructor() {
    this.users = new Map();
    this.translations = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
}

export const storage = new MemStorage();
