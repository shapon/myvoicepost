import { db } from "./supabase-db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { User, TranslationResult, InsertTranslation } from "@shared/schema";
import type { IStorage, CreateUserInput } from "./storage";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export class SupabaseStorage implements IStorage {
  private translations: Map<string, TranslationResult>;

  constructor() {
    this.translations = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const hashedPassword = await bcrypt.hash(input.password, 10);
    const result = await db.insert(users).values({
      username: input.username,
      email: input.email || null,
      passwordHash: hashedPassword,
    }).returning();
    return result[0];
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
}

export const supabaseStorage = new SupabaseStorage();
