import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, timestamp, boolean, integer, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const USER_ROLES = ["GUEST", "USER", "ADMIN", "TRIAL"] as const;
export type UserRole = typeof USER_ROLES[number];

export const users = pgTable("mvp_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("GUEST"),
  trialStartsAt: timestamp("trial_starts_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialUsed: boolean("trial_used").default(false),
  trialMinutesTotal: integer("trial_minutes_total").default(90),
  trialMinutesUsed: numeric("trial_minutes_used", { precision: 10, scale: 2 }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  activeSessionId: varchar("active_session_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  passwordHash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const userSsoAccounts = pgTable("mvp_user_sso_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
  providerEmail: varchar("provider_email", { length: 255 }),
  providerName: varchar("provider_name", { length: 255 }),
  providerAvatar: varchar("provider_avatar", { length: 500 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSsoAccountSchema = createInsertSchema(userSsoAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSsoAccount = z.infer<typeof insertUserSsoAccountSchema>;
export type UserSsoAccount = typeof userSsoAccounts.$inferSelect;

// Supported languages for translation
export const supportedLanguages = [
  { code: "en", name: "English", flag: "US" },
  { code: "es", name: "Spanish", flag: "ES" },
  { code: "fr", name: "French", flag: "FR" },
  { code: "de", name: "German", flag: "DE" },
  { code: "it", name: "Italian", flag: "IT" },
  { code: "pt", name: "Portuguese", flag: "PT" },
  { code: "nl", name: "Dutch", flag: "NL" },
  { code: "ru", name: "Russian", flag: "RU" },
  { code: "zh", name: "Chinese", flag: "CN" },
  { code: "ja", name: "Japanese", flag: "JP" },
  { code: "ko", name: "Korean", flag: "KR" },
  { code: "ar", name: "Arabic", flag: "SA" },
  { code: "hi", name: "Hindi", flag: "IN" },
  { code: "tr", name: "Turkish", flag: "TR" },
  { code: "pl", name: "Polish", flag: "PL" },
  { code: "vi", name: "Vietnamese", flag: "VN" },
  { code: "th", name: "Thai", flag: "TH" },
  { code: "id", name: "Indonesian", flag: "ID" },
] as const;

export type LanguageCode = typeof supportedLanguages[number]["code"];

export const OUTPUT_FORMATS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
] as const;

export const OUTPUT_TYPES = [
  { value: "message", label: "Message" },
  { value: "note", label: "Note" },
  { value: "email", label: "Email" },
  { value: "post", label: "Post" },
  { value: "journal", label: "Journal" },
] as const;

export function getLanguageName(code: string): string {
  return supportedLanguages.find((l) => l.code === code)?.name || code;
}

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

// Saved texts table for logged-in users
export const savedTexts = pgTable("mvp_saved_texts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(), // "polish" or "translate"
  originalText: text("original_text").notNull(),
  polishedText: text("polished_text").notNull(),
  translatedText: text("translated_text"), // only for translate type
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  targetLanguage: varchar("target_language", { length: 10 }), // only for translate type
  outputFormat: varchar("output_format", { length: 50 }).notNull(),
  outputType: varchar("output_type", { length: 50 }), // only for polish type
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedTextSchema = createInsertSchema(savedTexts).omit({
  id: true,
  createdAt: true,
});

export type InsertSavedText = z.infer<typeof insertSavedTextSchema>;
export type SavedText = typeof savedTexts.$inferSelect;

export const passwordResetTokens = pgTable("mvp_password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const subscriptionPlans = pgTable("mvp_subscription_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull().unique(),
  validTotalMinutes: integer("valid_total_minutes"),
  validDays: integer("valid_days").notNull(),
  recordingsAvailableDays: integer("recordings_available_days").notNull(),
  chunksCount: integer("chunks_count").notNull(),
  offlineRecording: boolean("offline_recording").notNull().default(false),
  priceMonthly: integer("price_monthly").notNull().default(0),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  rcProductIdentifier: varchar("rc_product_identifier", { length: 100 }),
  isDefault: boolean("is_default").default(false),
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export const userSubscriptions = pgTable("mvp_user_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull(),
  planId: uuid("plan_id").notNull(),
  validDateUpto: timestamp("valid_date_upto").notNull(),
  minutesUsed: integer("minutes_used").notNull().default(0),
  chunksUsed: integer("chunks_used").notNull().default(0),
  minutesRemaining: numeric("minutes_remaining", { precision: 10, scale: 2 }).default("0"),
  paymentToken: varchar("payment_token", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserSubscription = typeof userSubscriptions.$inferSelect;

export const userSettings = pgTable("mvp_user_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSettingSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSetting = z.infer<typeof insertUserSettingSchema>;
export type UserSetting = typeof userSettings.$inferSelect;

export const audioLogs = pgTable("mvp_audio_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  usageTime: varchar("usage_time", { length: 20 }).notNull(),
  usageSeconds: integer("usage_seconds").notNull().default(0),
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AudioLog = typeof audioLogs.$inferSelect;

export const emailOtps = pgTable("mvp_email_otps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull(),
  otp: varchar("otp", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type EmailOtp = typeof emailOtps.$inferSelect;

export const supportRequests = pgTable("mvp_support_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  email: varchar("email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  platform: varchar("platform", { length: 20 }).notNull().default("web"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportRequestSchema = createInsertSchema(supportRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
export type SupportRequest = typeof supportRequests.$inferSelect;

export const errorLogs = pgTable("mvp_error_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  errorCode: varchar("error_code", { length: 50 }),
  platform: varchar("platform", { length: 20 }).notNull().default("web"),
  endpoint: varchar("endpoint", { length: 500 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertErrorLogSchema = createInsertSchema(errorLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;
export type ErrorLog = typeof errorLogs.$inferSelect;

export const pushTokens = pgTable("mvp_push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  pushToken: varchar("push_token", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull().default("expo"),
  deviceId: varchar("device_id", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PushToken = typeof pushTokens.$inferSelect;

export const appSettings = pgTable("mvp_app_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;

export const crashReports = pgTable("mvp_crash_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: varchar("source", { length: 20 }).notNull(),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  userId: uuid("user_id"),
  deviceInfo: text("device_info"),
  appVersion: varchar("app_version", { length: 20 }),
  endpoint: varchar("endpoint", { length: 255 }),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CrashReport = typeof crashReports.$inferSelect;

export const notificationLog = pgTable("mvp_notification_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  subscriptionId: uuid("subscription_id"),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"),
  message: text("message"),
  title: varchar("title", { length: 100 }),
  readAt: timestamp("read_at"),
});

export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit({
  id: true,
  sentAt: true,
  readAt: true,
});
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLog.$inferSelect;

export const NOTIFICATION_TYPES = [
  "subscription_renewed",
  "payment_failed",
  "subscription_expired",
  "topup_credited",
  "low_minutes",
  "expiry_3days_manual",
] as const;
export type NotificationTypeKey = typeof NOTIFICATION_TYPES[number];

export const notificationPreferences = pgTable("mvp_notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  userTypeUnique: unique().on(t.userId, t.notificationType),
}));

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  updatedAt: true,
});
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
