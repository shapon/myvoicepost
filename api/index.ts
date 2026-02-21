import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import multer, { FileFilterCallback } from "multer";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc, gte, lt, lte, sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { GoogleGenAI, Type } from "@google/genai";
import pRetry, { AbortError } from "p-retry";
import pLimit from "p-limit";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { YoutubeTranscript } from "youtube-transcript";

const PROCESS_AUDIO_CFG = {
  PROCESS_AUDIO_MAX_SIZE_MB: 5,
  PROCESS_AUDIO_MAX_SIZE_BYTES: 5 * 1024 * 1024,
  PROCESS_AUDIO_SUPPORTED_TYPES: [
    'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/webm', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/flac',
  ] as const,
  PROCESS_AUDIO_SUPPORTED_EXTENSIONS: [
    'mp4', 'mp3', 'mpeg', 'wav', 'webm', 'ogg', 'aac', 'm4a', 'flac',
  ] as const,
  isAudioTypeSupported(mimeType: string): boolean {
    return (this.PROCESS_AUDIO_SUPPORTED_TYPES as readonly string[]).includes(mimeType);
  },
  formatMaxSize(): string {
    return `${this.PROCESS_AUDIO_MAX_SIZE_MB}MB`;
  },
};

// Concurrency limiter for AI requests - prevents rate limiting under high load
const aiRequestLimiter = pLimit(5);

// ============ DATABASE SCHEMA ============
const users = pgTable("mvp_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  trialStartsAt: timestamp("trial_starts_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialUsed: boolean("trial_used").default(false),
  trialMinutesTotal: integer("trial_minutes_total").default(90),
  trialMinutesUsed: numeric("trial_minutes_used", { precision: 10, scale: 2 }).default("0"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionId: uuid("subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const savedTexts = pgTable("mvp_saved_texts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  originalText: text("original_text").notNull(),
  polishedText: text("polished_text").notNull(),
  translatedText: text("translated_text"),
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  targetLanguage: varchar("target_language", { length: 10 }),
  outputFormat: varchar("output_format", { length: 50 }).notNull(),
  outputType: varchar("output_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Password reset tokens table
const passwordResetTokens = pgTable("mvp_password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

const subscriptionPlans = pgTable("mvp_subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  validTotalMinutes: integer("valid_total_minutes"),
  validDays: integer("valid_days").notNull(),
  recordingsAvailableDays: integer("recordings_available_days").notNull(),
  chunksCount: integer("chunks_count").notNull(),
  offlineRecording: boolean("offline_recording").notNull().default(false),
  priceMonthly: integer("price_monthly").notNull().default(0),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  isDefault: boolean("is_default").default(false),
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

const userSubscriptions = pgTable("mvp_user_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
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

const userSettings = pgTable("mvp_user_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  settingKey: varchar("setting_key", { length: 100 }).notNull(),
  settingValue: text("setting_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const audioLogs = pgTable("mvp_audio_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  usageTime: varchar("usage_time", { length: 20 }).notNull(),
  usageSeconds: integer("usage_seconds").notNull().default(0),
  sourceLanguage: varchar("source_language", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

const emailOtps = pgTable("mvp_email_otps", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  otp: varchar("otp", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

const pushTokens = pgTable("mvp_push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  pushToken: varchar("push_token", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull().default("expo"),
  deviceId: varchar("device_id", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const appSettings = pgTable("mvp_app_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const userSsoAccounts = pgTable("mvp_user_sso_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
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

const crashReports = pgTable("mvp_crash_reports", {
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

const notificationLog = pgTable("mvp_notification_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  subscriptionId: uuid("subscription_id"),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"),
  message: text("message"),
});

type User = typeof users.$inferSelect;
type SavedText = typeof savedTexts.$inferSelect;
type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
type UserSubscription = typeof userSubscriptions.$inferSelect;
type UserSetting = typeof userSettings.$inferSelect;

// ============ DATABASE CONNECTION ============
const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  prepare: false,
  max: 20,                    // Maximum pool size for high concurrency
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout in seconds
  max_lifetime: 60 * 30,      // Max connection lifetime (30 min)
});
const db = drizzle(client);

// ============ STRIPE CLIENT ============
async function getStripeClient() {
  if (process.env.STRIPE_SECRET_KEY) {
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover' as any,
    });
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('Stripe credentials not available. Set STRIPE_SECRET_KEY env var or run on Replit.');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken,
    },
  });

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn || !conn.settings.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return new Stripe(conn.settings.secret, {
    apiVersion: '2025-11-17.clover' as any,
  });
}

async function getStripePublishableKey(): Promise<string> {
  if (process.env.STRIPE_PUBLISHABLE_KEY) {
    return process.env.STRIPE_PUBLISHABLE_KEY;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('Stripe credentials not available. Set STRIPE_PUBLISHABLE_KEY env var or run on Replit.');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken,
    },
  });

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn || !conn.settings.publishable) {
    throw new Error(`Stripe ${targetEnvironment} publishable key not found`);
  }

  return conn.settings.publishable;
}

// ============ JWT CONFIG ============
const JWT_SECRET = process.env.SESSION_SECRET || "myvoicepost-jwt-secret-key";
const JWT_EXPIRES_IN = "7d";

interface JwtPayload {
  userId: string;
  username: string;
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ============ SUBSCRIPTION PLAN DEFINITIONS ============
const PLAN_DEFINITIONS = [
  {
    name: "Free",
    validTotalMinutes: 60,
    validDays: 7,
    recordingsAvailableDays: 7,
    chunksCount: 0,
    offlineRecording: false,
    priceMonthly: 0,
  },
  {
    name: "Starter",
    validTotalMinutes: 3000,
    validDays: 30,
    recordingsAvailableDays: 60,
    chunksCount: 10,
    offlineRecording: true,
    priceMonthly: 999,
  },
  {
    name: "Pro",
    validTotalMinutes: null,
    validDays: 30,
    recordingsAvailableDays: 90,
    chunksCount: 90,
    offlineRecording: true,
    priceMonthly: 2499,
  },
  {
    name: "Top-Up",
    validTotalMinutes: 60,
    validDays: 0,
    recordingsAvailableDays: 0,
    chunksCount: 0,
    offlineRecording: false,
    priceMonthly: 500,
    isVisible: false,
  },
];

async function seedSubscriptionPlans() {
  try {
    for (const plan of PLAN_DEFINITIONS) {
      const existing = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, plan.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(subscriptionPlans).values(plan);
        console.log(`[Seed] Plan '${plan.name}' created`);
      } else {
        await db.update(subscriptionPlans)
          .set({
            validTotalMinutes: plan.validTotalMinutes,
            validDays: plan.validDays,
            recordingsAvailableDays: plan.recordingsAvailableDays,
            chunksCount: plan.chunksCount,
            offlineRecording: plan.offlineRecording,
            priceMonthly: plan.priceMonthly,
            ...((plan as any).isVisible !== undefined ? { isVisible: (plan as any).isVisible } : {}),
          })
          .where(eq(subscriptionPlans.name, plan.name));
      }
    }
  } catch (err) {
    console.error("[Seed] Error seeding subscription plans:", err);
  }
}

seedSubscriptionPlans();

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  console.log("[Auth] Authorization header present:", !!authHeader);
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    console.log("[Auth] Token extracted, length:", token.length);
    return token;
  }
  console.log("[Auth] No valid Bearer token found");
  return null;
}

function getUserFromRequest(req: Request): JwtPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    console.log("[Auth] No token in request");
    return null;
  }
  const payload = verifyToken(token);
  console.log("[Auth] Token verification result:", payload ? "valid" : "invalid");
  return payload;
}

// ============ PASSWORD RESET HELPERS ============
const RESET_TOKEN_EXPIRY_HOURS = 1;
const WEB_APP_URL = process.env.WEB_APP_URL || "https://myvoicepost.com";
const DEEP_LINK_BASE_URL = process.env.DEEP_LINK_BASE_URL || "https://www.myvoicepost.com";
const APP_SCHEME = process.env.APP_SCHEME || "myvoicepost";

/**
 * Generate a secure random reset token
 */
function generateResetToken(): string {
  return randomUUID() + "-" + randomUUID();
}

/**
 * Send password reset email using nodemailer
 * Uses SMTP configuration from environment variables
 */
async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  isDeepLink: boolean = false
): Promise<void> {
  // Validate SMTP configuration
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error("[EMAIL SERVICE] SMTP configuration missing. Required: SMTP_HOST, SMTP_USER, SMTP_PASS");
    throw new Error("Email service not configured properly");
  }

  console.log("[EMAIL SERVICE] Sending password reset email...");
  console.log(`[EMAIL SERVICE] To: ${email}, Type: ${isDeepLink ? "Mobile Deep Link" : "Web Link"}`);

  // Create nodemailer transporter with TLS/STARTTLS support for port 587
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // false for port 587 (STARTTLS), true for port 465 (TLS)
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    // Enable STARTTLS for port 587
    ...(smtpPort === 587 && !smtpSecure && {
      requireTLS: true,
      tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false, // Set to true in production with valid certificates
      },
    }),
  });

  // Verify SMTP connection
  try {
    await transporter.verify();
    console.log("[EMAIL SERVICE] SMTP connection verified successfully");
  } catch (verifyError: any) {
    console.error("[EMAIL SERVICE] SMTP connection verification failed:", verifyError.message);
    throw new Error(`SMTP connection failed: ${verifyError.message}`);
  }

  // Email content
  const linkType = isDeepLink ? "mobile app" : "web browser";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password for your MyVoicePost account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your ${linkType}:</p>
        <p style="background: #f5f5f5; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 13px; color: #555;">${resetLink}</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
        <p style="color: #888; font-size: 13px;">
          <strong>This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).</strong>
        </p>
        <p style="color: #888; font-size: 13px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <p style="color: #888; font-size: 13px; margin-bottom: 0;">— The MyVoicePost Team</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>© ${new Date().getFullYear()} MyVoicePost. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Reset Your MyVoicePost Password

Hello,

We received a request to reset your password for your MyVoicePost account.

Click the link below to set a new password:
${resetLink}

This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

— The MyVoicePost Team
  `.trim();

  // Send email
  try {
    const info = await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: "Reset Your MyVoicePost Password",
      text: textContent,
      html: htmlContent,
    });

    console.log("[EMAIL SERVICE] Password reset email sent successfully");
    console.log(`[EMAIL SERVICE] Message ID: ${info.messageId}`);
  } catch (sendError: any) {
    console.error("[EMAIL SERVICE] Failed to send email:", sendError.message);
    throw new Error(`Failed to send password reset email: ${sendError.message}`);
  }
}

async function sendSubscriptionConfirmationEmail(
  email: string,
  planName: string,
  priceMonthly: number,
  totalMinutes: number,
  validUntil: Date,
  carryoverMinutes: number
) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[SUB EMAIL] SMTP configuration missing - skipping confirmation email");
    return;
  }

  try {
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

    const formattedDate = validUntil.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedPrice = `$${(priceMonthly / 100).toFixed(2)}`;
    const carryoverNote = carryoverMinutes > 0
      ? `<p style="color: #4CAF50; font-size: 14px;">Includes <strong>${carryoverMinutes} bonus minutes</strong> carried over from your trial!</p>`
      : "";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Subscription Confirmed</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Subscription Confirmed</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Thank you for subscribing!</h2>
          <p>Your subscription is now active. Here are the details:</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Plan</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Monthly Price</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${formattedPrice}/mo</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Recording Minutes</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalMinutes} min</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Valid Until</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${formattedDate}</td></tr>
            </table>
          </div>
          ${carryoverNote}
          <p style="color: #666; font-size: 14px;">You can manage your subscription anytime from the app settings.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
          <p style="color: #888; font-size: 13px; margin-bottom: 0;">-- The MyVoicePost Team</p>
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
      subject: `MyVoicePost - Subscription Confirmed: ${planName}`,
      text: `Your MyVoicePost ${planName} subscription is now active. Monthly price: ${formattedPrice}. Recording minutes: ${totalMinutes}. Valid until: ${formattedDate}.`,
      html: htmlContent,
    });

    console.log(`[SUB EMAIL] Confirmation email sent to ${email}`);
  } catch (emailError: any) {
    console.error(`[SUB EMAIL] Failed to send confirmation email: ${emailError.message}`);
  }
}

async function sendPaymentFailedEmail(
  email: string,
  failureReason: string,
  amountDue: number,
  planName: string
) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[FAIL EMAIL] SMTP configuration missing - skipping failure email");
    return;
  }

  try {
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

    const formattedAmount = `$${(amountDue / 100).toFixed(2)}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Payment Failed</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #e53935 0%, #c62828 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Payment Failed</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">We could not process your payment</h2>
          <p>Unfortunately, we were unable to charge your payment method for your <strong>${planName}</strong> subscription.</p>
          <div style="background: #fff3f3; border-left: 4px solid #e53935; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0;">
            <p style="margin: 0; color: #333; font-weight: 600;">Failure Reason</p>
            <p style="margin: 8px 0 0 0; color: #555;">${failureReason}</p>
          </div>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666;">Amount Due</td><td style="padding: 6px 0; font-weight: bold; text-align: right;">${formattedAmount}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Plan</td><td style="padding: 6px 0; font-weight: bold; text-align: right;">${planName}</td></tr>
            </table>
          </div>
          <p style="color: #666; font-size: 14px;">To keep your subscription active, please update your payment method in the app and try again. Stripe will automatically retry the charge in a few days.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
          <p style="color: #888; font-size: 13px; margin-bottom: 0;">-- The MyVoicePost Team</p>
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
      subject: `MyVoicePost - Payment Failed for ${planName}`,
      text: `Your payment of ${formattedAmount} for MyVoicePost ${planName} has failed. Reason: ${failureReason}. Please update your payment method in the app.`,
      html: htmlContent,
    });

    console.log(`[FAIL EMAIL] Payment failure email sent to ${email}`);
  } catch (emailError: any) {
    console.error(`[FAIL EMAIL] Failed to send payment failure email: ${emailError.message}`);
  }
}

async function sendRenewalReminderEmail(
  email: string,
  planName: string,
  renewalDate: Date,
  amount: string
) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[RENEWAL EMAIL] SMTP configuration missing - skipping reminder email");
    return;
  }

  try {
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

    const formattedDate = renewalDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Renewal Reminder</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">MyVoicePost</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Upcoming Renewal</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Your subscription renews soon</h2>
          <p>Your <strong>${planName}</strong> subscription will automatically renew in 3 days. Here are the details:</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Plan</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${planName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Renewal Amount</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${amount}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Renewal Date</td><td style="padding: 8px 0; font-weight: bold; text-align: right;">${formattedDate}</td></tr>
            </table>
          </div>
          <p style="color: #666; font-size: 14px;">If you wish to cancel auto-renewal, you can do so from your Account Settings in the app before the renewal date.</p>
          <p style="color: #666; font-size: 14px;">If your payment method has changed, please update your card details in the app to avoid any interruption.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
          <p style="color: #888; font-size: 13px; margin-bottom: 0;">-- The MyVoicePost Team</p>
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
      subject: `MyVoicePost - Your ${planName} subscription renews on ${formattedDate}`,
      text: `Your MyVoicePost ${planName} subscription will renew on ${formattedDate} for ${amount}. To cancel auto-renewal, visit your Account Settings in the app.`,
      html: htmlContent,
    });

    console.log(`[RENEWAL EMAIL] Reminder email sent to ${email}`);
  } catch (emailError: any) {
    console.error(`[RENEWAL EMAIL] Failed to send reminder email: ${emailError.message}`);
  }
}

// ============ CRASH REPORT EMAIL ============
let crashEmailThrottle: Record<string, number> = {};
const CRASH_EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

async function getAdminEmails(): Promise<string[]> {
  try {
    const result = await db.select().from(appSettings)
      .where(eq(appSettings.settingKey, "admin_mail"))
      .limit(1);
    if (result.length > 0 && result[0].settingValue) {
      return result[0].settingValue.split(",").map(e => e.trim()).filter(Boolean);
    }
  } catch (err: any) {
    console.warn("[CRASH REPORT] Could not fetch admin emails:", err.message);
  }
  return [];
}

async function sendCrashReportEmail(opts: {
  source: string;
  errorMessage: string;
  stackTrace?: string;
  userId?: string;
  deviceInfo?: string;
  appVersion?: string;
  endpoint?: string;
}) {
  const throttleKey = `${opts.source}:${opts.errorMessage.substring(0, 100)}`;
  const now = Date.now();
  if (crashEmailThrottle[throttleKey] && (now - crashEmailThrottle[throttleKey]) < CRASH_EMAIL_COOLDOWN_MS) {
    console.log("[CRASH REPORT] Throttled - same error reported recently");
    return;
  }
  crashEmailThrottle[throttleKey] = now;

  try {
    await db.insert(crashReports).values({
      source: opts.source,
      errorMessage: opts.errorMessage,
      stackTrace: opts.stackTrace || null,
      userId: opts.userId || null,
      deviceInfo: opts.deviceInfo || null,
      appVersion: opts.appVersion || null,
      endpoint: opts.endpoint || null,
      emailSent: false,
    });
  } catch (dbErr: any) {
    console.warn("[CRASH REPORT] Could not log to DB:", dbErr.message);
  }

  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) {
    console.warn("[CRASH REPORT] No admin emails configured - skipping email notification");
    return;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[CRASH REPORT] SMTP not configured - skipping email");
    return;
  }

  try {
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

    const timestamp = new Date().toISOString();
    const sourceLabel = opts.source === "mobile" ? "Mobile App" : "Backend Server";
    const stackHtml = opts.stackTrace
      ? `<pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto;font-size:12px;max-height:400px;overflow-y:auto;">${opts.stackTrace.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
      : '<p style="color:#999;">No stack trace available</p>';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:700px;margin:0 auto;padding:20px;">
        <div style="background:#dc2626;padding:20px;text-align:center;border-radius:10px 10px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">MyVoicePost - Crash Report</h1>
          <p style="color:rgba(255,255,255,0.9);margin:8px 0 0 0;font-size:14px;">${sourceLabel} Error Detected</p>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr><td style="padding:6px 8px;color:#666;font-size:13px;width:120px;">Timestamp</td><td style="padding:6px 8px;font-size:13px;">${timestamp}</td></tr>
            <tr><td style="padding:6px 8px;color:#666;font-size:13px;">Source</td><td style="padding:6px 8px;font-size:13px;">${sourceLabel}</td></tr>
            ${opts.endpoint ? `<tr><td style="padding:6px 8px;color:#666;font-size:13px;">Endpoint</td><td style="padding:6px 8px;font-size:13px;">${opts.endpoint}</td></tr>` : ''}
            ${opts.userId ? `<tr><td style="padding:6px 8px;color:#666;font-size:13px;">User ID</td><td style="padding:6px 8px;font-size:13px;">${opts.userId}</td></tr>` : ''}
            ${opts.appVersion ? `<tr><td style="padding:6px 8px;color:#666;font-size:13px;">App Version</td><td style="padding:6px 8px;font-size:13px;">${opts.appVersion}</td></tr>` : ''}
            ${opts.deviceInfo ? `<tr><td style="padding:6px 8px;color:#666;font-size:13px;">Device</td><td style="padding:6px 8px;font-size:13px;">${opts.deviceInfo}</td></tr>` : ''}
          </table>
          <h3 style="color:#dc2626;margin:16px 0 8px 0;font-size:15px;">Error Message</h3>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;margin-bottom:16px;">
            <code style="color:#991b1b;font-size:13px;word-break:break-all;">${opts.errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>
          </div>
          <h3 style="color:#333;margin:16px 0 8px 0;font-size:15px;">Stack Trace</h3>
          ${stackHtml}
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: emailFrom,
      to: adminEmails.join(","),
      subject: `[CRASH] MyVoicePost ${sourceLabel}: ${opts.errorMessage.substring(0, 80)}`,
      text: `Crash Report\nSource: ${sourceLabel}\nTime: ${timestamp}\nError: ${opts.errorMessage}\n\nStack Trace:\n${opts.stackTrace || 'N/A'}`,
      html: htmlContent,
    });

    try {
      await db.update(crashReports)
        .set({ emailSent: true })
        .where(and(
          eq(crashReports.source, opts.source),
          eq(crashReports.errorMessage, opts.errorMessage),
          eq(crashReports.emailSent, false),
        ));
    } catch (_) {}

    console.log(`[CRASH REPORT] Email sent to ${adminEmails.join(", ")}`);
  } catch (emailErr: any) {
    console.error(`[CRASH REPORT] Failed to send email: ${emailErr.message}`);
  }
}

// ============ GEMINI AI SETUP ============
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const languageNames: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", ru: "Russian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", hi: "Hindi", tr: "Turkish", pl: "Polish",
  vi: "Vietnamese", th: "Thai", id: "Indonesian",
};

const toneInstructions: Record<string, string> = {
  professional: "Use a professional, business-appropriate tone.",
  casual: "Use a casual, friendly tone.",
  formal: "Use a formal, official tone.",
  friendly: "Use a warm, friendly tone.",
};

const outputTypeInstructions: Record<string, string> = {
  message: "Format as a well-structured message.",
  note: "Format as a concise, organized note.",
  email: "Format as a professional email.",
  post: "Format as an engaging social media post.",
  journal: "Format as a reflective journal entry.",
};

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return errorMsg.includes("429") || errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("rate limit");
}

function safeJsonParse(text: string, fallback: any = {}): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", e, "Text:", text?.substring(0, 200));
    return fallback;
  }
}

async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  // Validate audio buffer - must have reasonable size for actual audio
  if (!audioBuffer || audioBuffer.length < 1000) {
    console.error('[Transcribe] Invalid audio: buffer too small', audioBuffer?.length);
    throw new Error('Invalid audio data - file too small');
  }

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          temperature: 0,  // Make output deterministic - reduces hallucination
          topK: 1,         // Only consider most likely token
          topP: 1,         // No nucleus sampling
        },
        contents: [{
          role: "user",
          parts: [
            { 
              text: `You are a precise speech-to-text transcription system. Your ONLY job is to transcribe the exact words spoken in this audio.

STRICT RULES - FAILURE TO FOLLOW WILL RESULT IN ERROR:
1. Listen carefully to the audio and transcribe ONLY the exact words spoken
2. If you cannot clearly hear speech, respond with exactly: [NO_SPEECH_DETECTED]
3. NEVER generate, invent, create, or imagine any text
4. NEVER add words that were not spoken
5. NEVER describe or summarize - just transcribe word-for-word
6. If audio quality is poor, transcribe what you CAN hear, even if incomplete

This is a transcription task, NOT a creative writing task. Output ONLY the spoken words:` 
            },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
          ]
        }]
      });
      
      const transcribedText = response.text?.trim() || "";
      
      // Check for no speech detected
      if (transcribedText === "[NO_SPEECH_DETECTED]" || 
          transcribedText.includes("[NO_SPEECH_DETECTED]") ||
          transcribedText === "") {
        console.log('[Transcribe] No speech detected in audio');
        throw new Error('No speech detected in the audio. Please try speaking more clearly.');
      }
      
      return transcribedText;
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

async function transcribeAudioLanguageOnly(audioBuffer: Buffer, mimeType: string, language: string): Promise<string> {
  if (!audioBuffer || audioBuffer.length < 1000) {
    console.error('[TranscribeLang] Invalid audio: buffer too small', audioBuffer?.length);
    throw new Error('Invalid audio data - file too small');
  }

  const langName = languageNames[language] || language;

  return aiRequestLimiter(() => pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          temperature: 0,
          topK: 1,
          topP: 1,
        },
        contents: [{
          role: "user",
          parts: [
            { 
              text: `You are a precise speech-to-text transcription system. Your ONLY job is to transcribe words spoken in ${langName} from this audio.

STRICT RULES - FAILURE TO FOLLOW WILL RESULT IN ERROR:
1. Listen carefully and transcribe ONLY the words spoken in ${langName}
2. IGNORE any words or sentences spoken in other languages - do NOT include them
3. If no ${langName} speech is detected, respond with exactly: [NO_SPEECH_DETECTED]
4. NEVER generate, invent, create, or imagine any text
5. NEVER add words that were not spoken in ${langName}
6. NEVER describe or summarize - just transcribe word-for-word
7. If audio quality is poor, transcribe what you CAN hear in ${langName}, even if incomplete

This is a transcription task for ${langName} ONLY. Output ONLY the ${langName} spoken words:` 
            },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
          ]
        }]
      });
      
      const transcribedText = response.text?.trim() || "";
      
      if (transcribedText === "[NO_SPEECH_DETECTED]" || 
          transcribedText.includes("[NO_SPEECH_DETECTED]") ||
          transcribedText === "") {
        console.log(`[TranscribeLang] No ${langName} speech detected in audio`);
        throw new Error(`No ${langName} speech detected in the audio. Please try speaking more clearly.`);
      }
      
      return transcribedText;
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

async function polishText(text: string, language: string, outputFormat: string, outputType: string): Promise<string> {
  const langName = languageNames[language] || language;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Transform this speech transcription into well-written ${outputType}.
Language: ${langName}, Tone: ${toneGuide}, Format: ${typeGuide}
Return JSON: {"polishedText": "the polished text"}
Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { polishedText: { type: Type.STRING } },
            required: ["polishedText"]
          }
        }
      });
      const result = safeJsonParse(response.text || "{}", { polishedText: text });
      return result.polishedText || text;
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

async function translateAndPolish(text: string, sourceLanguage: string, targetLanguage: string, outputFormat: string) {
  const sourceLang = languageNames[sourceLanguage] || sourceLanguage;
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  // Use concurrency limiter to prevent overwhelming the AI API under high load
  return aiRequestLimiter(() => pRetry(async () => {
    try {
      if (sourceLanguage === targetLanguage) {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Polish this text. ${toneGuide}
Return JSON: {"polishedText": "the polished text"}
Text: ${text}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: { polishedText: { type: Type.STRING } },
              required: ["polishedText"]
            }
          }
        });
        const result = safeJsonParse(response.text || "{}", { polishedText: text });
        return { translatedText: text, polishedText: result.polishedText || text };
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Translate from ${sourceLang} to ${targetLang} and polish. ${toneGuide}
Return JSON: {"translatedText": "direct translation", "polishedText": "polished version"}
Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { translatedText: { type: Type.STRING }, polishedText: { type: Type.STRING } },
            required: ["translatedText", "polishedText"]
          }
        }
      });
      const result = safeJsonParse(response.text || "{}", { translatedText: text, polishedText: text });
      return { translatedText: result.translatedText || text, polishedText: result.polishedText || result.translatedText || text };
    } catch (error: any) {
      if (isRateLimitError(error)) throw error;
      throw new AbortError(error);
    }
  }, { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }));
}

// ============ VALIDATION SCHEMAS ============
const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

const signupSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  otp: z.string().length(6, "6-digit verification code is required"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const polishRequestSchema = z.object({
  language: z.string(),
  outputFormat: z.string(),
  outputType: z.string(),
});

const translateRequestSchema = z.object({
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  outputFormat: z.string(),
});

// ============ EXPRESS APP ============
import compression from "compression";

const app = express();

// Performance: Enable gzip compression for responses
app.use(compression());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('[CORS] Allowing request with no origin (mobile app)');
      return callback(null, true);
    }
    // Allow specific web origins
    const allowedOrigins = ['https://myvoicepost.com', 'https://www.myvoicepost.com', 'https://myvoicepost.vercel.app'];
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    console.log('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
});

// In-memory translations storage (for serverless)
const translations = new Map<string, any>();

// ============ ROUTES ============

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/polish-speech", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = polishRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { language, outputFormat, outputType } = parseResult.data;

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const originalText = await transcribeAudio(req.file.buffer, req.file.mimetype);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const polishedText = await polishText(originalText, language, outputFormat, outputType);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText: originalText,
      polishedText,
      sourceLanguage: language,
      targetLanguage: language,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Polish error:", error);
    res.status(500).json({ error: error.message || "Failed to process speech polishing" });
  }
});

app.post("/api/translate-speech", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = translateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { sourceLanguage, targetLanguage, outputFormat } = parseResult.data;

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const originalText = await transcribeAudio(req.file.buffer, req.file.mimetype);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const { translatedText, polishedText } = await translateAndPolish(originalText, sourceLanguage, targetLanguage, outputFormat);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText,
      polishedText,
      sourceLanguage,
      targetLanguage,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to process translation" });
  }
});

// Base64 endpoints for mobile app
const base64PolishSchema = z.object({
  audio: z.string(),
  language: z.string(),
  outputFormat: z.string().default("professional"),
  outputType: z.string().default("message"),
  mimeType: z.string().default("audio/m4a"),
});

const base64TranslateSchema = z.object({
  audio: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  outputFormat: z.string().default("professional"),
  mimeType: z.string().default("audio/m4a"),
});

app.post("/api/polish-speech-base64", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = base64PolishSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { audio, language, outputFormat, outputType, mimeType } = parseResult.data;

    const audioBuffer = Buffer.from(audio, "base64");
    const originalText = await transcribeAudio(audioBuffer, mimeType);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const polishedText = await polishText(originalText, language, outputFormat, outputType);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText: originalText,
      polishedText,
      sourceLanguage: language,
      targetLanguage: language,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Polish base64 error:", error);
    res.status(500).json({ error: error.message || "Failed to process speech polishing" });
  }
});

app.post("/api/translate-speech-base64", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured." });
    }

    const parseResult = base64TranslateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request", details: parseResult.error.errors });
    }

    const { audio, sourceLanguage, targetLanguage, outputFormat, mimeType } = parseResult.data;

    const audioBuffer = Buffer.from(audio, "base64");
    const originalText = await transcribeAudio(audioBuffer, mimeType);
    if (!originalText || originalText.trim() === "") {
      return res.status(400).json({ error: "Could not transcribe audio." });
    }

    const { translatedText, polishedText } = await translateAndPolish(originalText, sourceLanguage, targetLanguage, outputFormat);

    const id = randomUUID();
    const translation = {
      id,
      originalText,
      translatedText,
      polishedText,
      sourceLanguage,
      targetLanguage,
      outputFormat,
      createdAt: new Date(),
    };
    translations.set(id, translation);

    res.json(translation);
  } catch (error: any) {
    console.error("Translation base64 error:", error);
    res.status(500).json({ error: error.message || "Failed to process translation" });
  }
});

app.get("/api/translations", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const allTranslations = Array.from(translations.values());
    const sorted = allTranslations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
    res.json(sorted);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch translations" });
  }
});

app.get("/api/translations/:id", async (req, res) => {
  try {
    const translation = translations.get(req.params.id);
    if (!translation) return res.status(404).json({ error: "Translation not found" });
    res.json(translation);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch translation" });
  }
});

// Auth routes with JWT
app.post("/api/auth/signup", async (req, res) => {
  try {
    const parseResult = signupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { username, email, password, otp } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`[DEBUG /p/register] INPUT: username=${username}, email=${normalizedEmail}`);

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

    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const existingEmail = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({ error: "Email already exists" });
    }

    await db.delete(emailOtps).where(eq(emailOtps.email, normalizedEmail));

    const hashedPassword = await bcrypt.hash(password, 10);

    const trialStartsAt = new Date();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const result = await db.insert(users).values({
      username,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      trialStartsAt,
      trialEndsAt,
      trialUsed: false,
      trialMinutesTotal: 90,
      trialMinutesUsed: "0",
    }).returning();

    const user = result[0];
    const token = generateToken({ userId: user.id, username: user.username });

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { username, password } = parseResult.data;

    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = result[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = generateToken({ userId: user.id, username: user.username });
    console.log("[Login] Login successful for:", username, "| Token generated, length:", token.length);

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", (req, res) => {
  const payload = getUserFromRequest(req);
  if (payload) {
    res.json({
      user: {
        id: payload.userId,
        username: payload.username,
      },
    });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

// ============ WEB FORGOT PASSWORD ENDPOINTS ============

// Forgot Password - Request password reset link (Web)
app.post("/api/forgot-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Valid email is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.errors
      });
    }

    const { email } = parseResult.data;

    // Find user by email
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];

    if (!user) {
      // Return success even if user not found (security best practice - prevents email enumeration)
      console.log(`[Forgot Password] Email not found: ${email}`);
      return res.json({
        message: "If an account with that email exists, a password reset link has been sent."
      });
    }

    // Generate secure reset token
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store reset token in database
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });

    // Generate web reset link
    const resetLink = `${WEB_APP_URL}/reset-password?token=${resetToken}`;

    // Send email (mocked)
    await sendPasswordResetEmail(user.email!, resetLink, false);

    console.log(`[Forgot Password] Reset token generated for user: ${user.username}`);

    res.json({
      message: "If an account with that email exists, a password reset link has been sent."
    });
  } catch (error: any) {
    console.error("[Forgot Password] Error:", error);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// Reset Password - Set new password using token (Web)
app.post("/api/reset-password", async (req, res) => {
  try {
    const schema = z.object({
      token: z.string().min(1, "Reset token is required"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.errors
      });
    }

    const { token, newPassword } = parseResult.data;

    // Find valid reset token
    const tokenResult = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    const resetTokenRecord = tokenResult[0];

    if (!resetTokenRecord) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Check if token is expired
    if (new Date() > resetTokenRecord.expiresAt) {
      return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    }

    // Check if token was already used
    if (resetTokenRecord.usedAt) {
      return res.status(400).json({ error: "This reset token has already been used." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await db.update(users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, resetTokenRecord.userId));

    // Mark token as used (invalidate it)
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetTokenRecord.id));

    console.log(`[Reset Password] Password successfully reset for userId: ${resetTokenRecord.userId}`);

    res.json({ message: "Password has been reset successfully. You can now login with your new password." });
  } catch (error: any) {
    console.error("[Reset Password] Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ============ SAVED TEXTS ENDPOINTS ============
app.post("/api/saved-texts", async (req, res) => {
  try {
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { type, originalText, polishedText, translatedText, sourceLanguage, targetLanguage, outputFormat, outputType } = req.body;

    if (!type || !originalText || !polishedText || !sourceLanguage || !outputFormat) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await db.insert(savedTexts).values({
      userId: payload.userId,
      type,
      originalText,
      polishedText,
      translatedText: translatedText || null,
      sourceLanguage,
      targetLanguage: targetLanguage || null,
      outputFormat,
      outputType: outputType || null,
    }).returning();

    res.json(result[0]);
  } catch (error: any) {
    console.error("Save text error:", error);
    res.status(500).json({ error: "Failed to save text" });
  }
});

app.get("/api/saved-texts/:type", async (req, res) => {
  try {
    // Disable caching for authenticated endpoints
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    // Log all headers for debugging
    console.log("[Debug] GET /api/saved-texts - Authorization:", req.headers.authorization ? 'present' : 'missing');
    console.log("[Debug] All headers:", JSON.stringify(req.headers));
    
    const payload = getUserFromRequest(req);
    
    // Allow guest access - return empty array for unauthenticated users
    if (!payload) {
      console.log("[Auth] Guest access to saved-texts - returning empty array");
      return res.json([]);
    }

    const { type } = req.params;
    let result;
    
    if (type === 'all') {
      result = await db.select().from(savedTexts)
        .where(eq(savedTexts.userId, payload.userId))
        .orderBy(desc(savedTexts.createdAt));
    } else {
      result = await db.select().from(savedTexts)
        .where(and(eq(savedTexts.userId, payload.userId), eq(savedTexts.type, type)))
        .orderBy(desc(savedTexts.createdAt));
    }

    res.json(result);
  } catch (error: any) {
    console.error("Get saved text error:", error);
    res.status(500).json({ error: "Failed to get saved text" });
  }
});

app.delete("/api/saved-texts/:id", async (req, res) => {
  try {
    const payload = getUserFromRequest(req);
    if (!payload) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { id } = req.params;
    const result = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, id), eq(savedTexts.userId, payload.userId)));

    if (result.length === 0) {
      return res.status(404).json({ error: "Saved text not found" });
    }

    await db.delete(savedTexts).where(eq(savedTexts.id, id));
    res.json({ message: "Deleted successfully" });
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
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini AI integration not configured",
      });
    }

    const GUEST_MAX_DURATION_SECONDS = 55;
    const GUEST_MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;

    const schema = z.object({
      audio: z.string().min(1, "Audio data is required"),
      mimeType: z.string().optional().default("audio/mp4"),
      language: z.string().optional().default("en"),
      durationSeconds: z.number().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { audio, mimeType, language, durationSeconds } = parseResult.data;
    console.log(`[DEBUG /p/transcribe] INPUT: language=${language}, mimeType=${mimeType}, durationSeconds=${durationSeconds}, audioBase64Length=${audio?.length}`);

    if (durationSeconds !== undefined && durationSeconds > GUEST_MAX_DURATION_SECONDS) {
      return res.status(400).json({
        success: false,
        error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. Please register for a free account to record longer.`,
      });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    if (audioBuffer.length > GUEST_MAX_AUDIO_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. The uploaded audio file is too large. Please register for a free account to record longer.`,
      });
    }

    const originalText = await transcribeAudio(audioBuffer, mimeType);

    console.log(`[DEBUG /p/transcribe] TRANSCRIBE RESULT: text="${originalText?.substring(0, 100)}...", length=${originalText?.length || 0}`);

    if (!originalText || originalText.trim() === "") {
      console.log(`[DEBUG /p/transcribe] OUTPUT: FAILED - empty transcription`);
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

    console.log(`[DEBUG /p/transcribe] OUTPUT: success=true, textLength=${originalText.length}`);
    res.json({
      success: true,
      originalText,
      language,
    });
  } catch (error: any) {
    console.error("[DEBUG /p/transcribe] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to transcribe audio",
    });
  }
});

// Public: Transcribe audio - language-specific (extracts only the specified language)
app.post("/api/v1/p/transcribe-language", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini AI integration not configured",
      });
    }

    const GUEST_MAX_DURATION_SECONDS = 55;
    const GUEST_MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024;

    const schema = z.object({
      audio: z.string().min(1, "Audio data is required"),
      mimeType: z.string().optional().default("audio/mp4"),
      language: z.string().min(1, "Language is required"),
      durationSeconds: z.number().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { audio, mimeType, language, durationSeconds } = parseResult.data;
    console.log(`[DEBUG /p/transcribe-language] INPUT: language=${language}, mimeType=${mimeType}, durationSeconds=${durationSeconds}, audioBase64Length=${audio?.length}`);

    if (durationSeconds !== undefined && durationSeconds > GUEST_MAX_DURATION_SECONDS) {
      return res.status(400).json({
        success: false,
        error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. Please register for a free account to record longer.`,
      });
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    if (audioBuffer.length > GUEST_MAX_AUDIO_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Guest recordings are limited to ${GUEST_MAX_DURATION_SECONDS} seconds. The uploaded audio file is too large. Please register for a free account to record longer.`,
      });
    }

    const originalText = await transcribeAudioLanguageOnly(audioBuffer, mimeType, language);

    console.log(`[DEBUG /p/transcribe-language] TRANSCRIBE RESULT: text="${originalText?.substring(0, 100)}...", length=${originalText?.length || 0}`);

    if (!originalText || originalText.trim() === "") {
      console.log(`[DEBUG /p/transcribe-language] OUTPUT: FAILED - empty transcription`);
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

    console.log(`[DEBUG /p/transcribe-language] OUTPUT: success=true, textLength=${originalText.length}`);
    res.json({
      success: true,
      originalText,
      language,
    });
  } catch (error: any) {
    console.error("[DEBUG /p/transcribe-language] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to transcribe audio",
    });
  }
});

// Public: Polish text
app.post("/api/v1/p/polish", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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
    console.log(`[DEBUG /p/polish] INPUT: language=${language}, outputFormat=${outputFormat}, outputType=${outputType}, textLength=${text.length}, text="${text.substring(0, 100)}..."`);

    const polishedText = await polishText(text, language, outputFormat, outputType);

    console.log(`[DEBUG /p/polish] OUTPUT: success=true, polishedTextLength=${polishedText?.length || 0}`);
    res.json({
      success: true,
      originalText: text,
      polishedText,
      language,
      outputFormat,
      outputType,
    });
  } catch (error: any) {
    console.error("[DEBUG /p/polish] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to polish text",
    });
  }
});

// Public: Translate text
app.post("/api/v1/p/translate", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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

    const { text, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;
    console.log(`[DEBUG /p/translate] INPUT: sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, outputFormat=${outputFormat}, textLength=${text.length}`);

    const result = await translateAndPolish(text, sourceLanguage, targetLanguage, outputFormat);

    console.log(`[DEBUG /p/translate] OUTPUT: success=true, translatedLength=${result.translatedText?.length || 0}, polishedLength=${result.polishedText?.length || 0}`);
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
    console.error("[DEBUG /p/translate] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to translate text",
    });
  }
});

// ============================================================
// EMAIL OTP ENDPOINTS
// ============================================================

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
    console.log(`[DEBUG /p/mail_otp] INPUT: email=${normalizedEmail}`);

    const existingEmail = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingEmail.length > 0) {
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

// ============================================================
// PUBLIC AUTH ENDPOINTS - /api/v1/p/login and /api/v1/p/register
// (No authentication required - for mobile app login/signup)
// ============================================================

// Public Login (accepts username OR email)
app.post("/api/v1/p/login", async (req, res) => {
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
    console.log(`[DEBUG /p/login] INPUT: identifier=${identifier}, isEmail=${identifier.includes("@")}`);
    const isEmail = identifier.includes('@');
    
    let result;
    if (isEmail) {
      result = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
    } else {
      result = await db.select().from(users).where(eq(users.username, identifier)).limit(1);
    }
    
    const user = result[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "No account found with this email. Please check your email or sign up.",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Incorrect password. Please try again or reset your password.",
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    let trialExpired = false;
    if (user && user.trialEndsAt) {
      const now = new Date();
      const trialMinutesUsed = parseFloat(user.trialMinutesUsed || "0");
      const trialMinutesTotal = user.trialMinutesTotal || 90;
      const trialMinutesRemaining = trialMinutesTotal - trialMinutesUsed;

      if (now > user.trialEndsAt || trialMinutesRemaining <= 0) {
        trialExpired = true;
      }
    }

    console.log(`[DEBUG /p/login] OUTPUT: success=true, userId=${user.id}, username=${user.username}, trialExpired=${trialExpired}`);

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
    console.error("[Public] Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

// Public Register shortcut
app.post("/api/v1/p/register", async (req, res) => {
  try {
    const registerSchema = z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      email: z.string().email("Valid email is required"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
      otp: z.string().length(6, "6-digit verification code is required"),
    }).refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = registerSchema.safeParse(req.body);
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

    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Username already exists",
      });
    }

    const existingEmail = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }

    await db.delete(emailOtps).where(eq(emailOtps.email, normalizedEmail));

    const hashedPassword = await bcrypt.hash(password, 10);

    const trialStartsAt = new Date();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const result = await db.insert(users).values({
      username,
      email,
      passwordHash: hashedPassword,
      trialStartsAt,
      trialEndsAt,
      trialUsed: false,
      trialMinutesTotal: 90,
      trialMinutesUsed: "0",
    }).returning();

    const user = result[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "3d" }
    );

    console.log(`[DEBUG /p/register] OUTPUT: success=true, userId=${user.id}, username=${user.username}, trialEnds=${trialEndsAt.toISOString()}`);

    res.status(201).json({
      success: true,
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
    console.error("[Public] Register error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create account",
    });
  }
});

// ============================================================
// GOOGLE SSO ENDPOINTS - /api/v1/p/auth/google
// Aggregator approach: Backend handles full OAuth flow
// Mobile opens /start in browser, backend redirects back to app
// ============================================================

const GOOGLE_SSO_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: "https://www.myvoicepost.com/api/v1/p/auth/google/callback",
  appScheme: "myvoicepost",
};

app.get("/api/v1/p/auth/google/start", (req, res) => {
  const { clientId, redirectUri } = GOOGLE_SSO_CONFIG;

  if (!clientId) {
    return res.status(500).send("Google SSO is not configured. Please set GOOGLE_CLIENT_ID.");
  }

  const state = randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log(`[Google SSO] Redirecting to Google OAuth, state=${state}`);
  res.redirect(googleAuthUrl);
});

app.get("/api/v1/p/auth/google/callback", async (req, res) => {
  try {
    const { code, error: oauthError } = req.query;

    if (oauthError || !code) {
      console.error("[Google SSO] OAuth error:", oauthError);
      const errorRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=${encodeURIComponent(String(oauthError || "no_code"))}`;
      return res.redirect(errorRedirect);
    }

    const { clientId, clientSecret, redirectUri } = GOOGLE_SSO_CONFIG;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error("[Google SSO] Token exchange failed:", errBody);
      const errorRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=token_exchange_failed`;
      return res.redirect(errorRedirect);
    }

    const tokenData = await tokenResponse.json() as { id_token: string; access_token: string };

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error("[Google SSO] User info fetch failed");
      const errorRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=userinfo_failed`;
      return res.redirect(errorRedirect);
    }

    const googleUser = await userInfoResponse.json() as {
      id: string;
      email: string;
      verified_email: boolean;
      name: string;
      picture: string;
    };

    if (!googleUser.email || !googleUser.verified_email) {
      const errorRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=email_not_verified`;
      return res.redirect(errorRedirect);
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();
    const googleId = googleUser.id;

    console.log(`[Google SSO] Verified Google user: email=${normalizedEmail}, googleId=${googleId}`);

    const existingSso = await db.select().from(userSsoAccounts)
      .where(and(eq(userSsoAccounts.provider, "google"), eq(userSsoAccounts.providerUserId, googleId)))
      .limit(1);

    if (existingSso.length > 0) {
      const sso = existingSso[0];
      const userRows = await db.select().from(users).where(eq(users.id, sso.userId)).limit(1);
      if (userRows.length > 0) {
        const user = userRows[0];
        const appToken = jwt.sign(
          { userId: user.id, email: user.email, username: user.username },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        await db.update(userSsoAccounts)
          .set({ providerEmail: normalizedEmail, providerName: googleUser.name, providerAvatar: googleUser.picture, updatedAt: new Date() })
          .where(eq(userSsoAccounts.id, sso.id));

        console.log(`[Google SSO] Existing SSO user login: userId=${user.id}`);
        const successRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?token=${appToken}&userId=${user.id}&username=${encodeURIComponent(user.username || "")}&email=${encodeURIComponent(user.email || "")}`;
        return res.redirect(successRedirect);
      }
    }

    const existingEmailUser = await db.select().from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingEmailUser.length > 0) {
      const user = existingEmailUser[0];

      await db.insert(userSsoAccounts).values({
        userId: user.id,
        provider: "google",
        providerUserId: googleId,
        providerEmail: normalizedEmail,
        providerName: googleUser.name,
        providerAvatar: googleUser.picture,
      }).onConflictDoNothing();

      const appToken = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      console.log(`[Google SSO] Linked Google SSO to existing email user: userId=${user.id}`);
      const successRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?token=${appToken}&userId=${user.id}&username=${encodeURIComponent(user.username || "")}&email=${encodeURIComponent(user.email || "")}`;
      return res.redirect(successRedirect);
    }

    const googleName = googleUser.name || normalizedEmail.split("@")[0];
    let baseUsername = googleName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    if (baseUsername.length < 3) baseUsername = "user" + baseUsername;

    let finalUsername = baseUsername;
    let suffix = 1;
    while (true) {
      const existing = await db.select().from(users)
        .where(eq(users.username, finalUsername))
        .limit(1);
      if (existing.length === 0) break;
      finalUsername = `${baseUsername}${suffix}`;
      suffix++;
      if (suffix > 100) {
        finalUsername = `user_${randomUUID().substring(0, 8)}`;
        break;
      }
    }

    const randomPassword = randomUUID();
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const trialStartsAt = new Date();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const result = await db.insert(users).values({
      username: finalUsername,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      trialStartsAt,
      trialEndsAt,
      trialUsed: false,
      trialMinutesTotal: 90,
      trialMinutesUsed: "0",
    }).returning();

    const newUser = result[0];

    await db.insert(userSsoAccounts).values({
      userId: newUser.id,
      provider: "google",
      providerUserId: googleId,
      providerEmail: normalizedEmail,
      providerName: googleUser.name,
      providerAvatar: googleUser.picture,
    });

    const appToken = jwt.sign(
      { userId: newUser.id, email: newUser.email, username: newUser.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`[Google SSO] New user created: userId=${newUser.id}, username=${newUser.username}`);
    const successRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?token=${appToken}&userId=${newUser.id}&username=${encodeURIComponent(newUser.username)}&email=${encodeURIComponent(newUser.email || "")}`;
    return res.redirect(successRedirect);
  } catch (error: any) {
    console.error("[Google SSO] Callback error:", error);
    const errorRedirect = `${GOOGLE_SSO_CONFIG.appScheme}://auth/google?error=server_error`;
    return res.redirect(errorRedirect);
  }
});

app.post("/api/v1/p/auth/google", async (req, res) => {
  try {
    const schema = z.object({
      idToken: z.string().min(1, "Google ID token is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { idToken } = parseResult.data;

    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!googleResponse.ok) {
      console.error("[Google SSO] Token verification failed:", googleResponse.status);
      return res.status(401).json({
        success: false,
        error: "Invalid Google token. Please try again.",
      });
    }

    const googleUser = await googleResponse.json() as {
      sub: string;
      email: string;
      email_verified: string;
      name: string;
      picture: string;
    };

    if (!googleUser.email || googleUser.email_verified !== "true") {
      return res.status(401).json({
        success: false,
        error: "Google account email is not verified.",
      });
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();
    const googleId = googleUser.sub;

    console.log(`[Google SSO] POST Verified Google user: email=${normalizedEmail}, googleId=${googleId}`);

    const existingSso = await db.select().from(userSsoAccounts)
      .where(and(eq(userSsoAccounts.provider, "google"), eq(userSsoAccounts.providerUserId, googleId)))
      .limit(1);

    if (existingSso.length > 0) {
      const sso = existingSso[0];
      const userRows = await db.select().from(users).where(eq(users.id, sso.userId)).limit(1);
      if (userRows.length > 0) {
        const user = userRows[0];
        const token = jwt.sign(
          { userId: user.id, email: user.email, username: user.username },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        await db.update(userSsoAccounts)
          .set({ providerEmail: normalizedEmail, providerName: googleUser.name, updatedAt: new Date() })
          .where(eq(userSsoAccounts.id, sso.id));

        return res.json({
          success: true,
          token,
          expiresIn: 7 * 24 * 60 * 60,
          user: { id: user.id, email: user.email, username: user.username },
          isNewUser: false,
        });
      }
    }

    const existingEmailUser = await db.select().from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingEmailUser.length > 0) {
      const user = existingEmailUser[0];

      await db.insert(userSsoAccounts).values({
        userId: user.id,
        provider: "google",
        providerUserId: googleId,
        providerEmail: normalizedEmail,
        providerName: googleUser.name,
      }).onConflictDoNothing();

      const token = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        expiresIn: 7 * 24 * 60 * 60,
        user: { id: user.id, email: user.email, username: user.username },
        isNewUser: false,
      });
    }

    const googleName = googleUser.name || normalizedEmail.split("@")[0];
    let baseUsername = googleName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    if (baseUsername.length < 3) baseUsername = "user" + baseUsername;

    let finalUsername = baseUsername;
    let suffix = 1;
    while (true) {
      const existing = await db.select().from(users)
        .where(eq(users.username, finalUsername))
        .limit(1);
      if (existing.length === 0) break;
      finalUsername = `${baseUsername}${suffix}`;
      suffix++;
      if (suffix > 100) {
        finalUsername = `user_${randomUUID().substring(0, 8)}`;
        break;
      }
    }

    const randomPassword = randomUUID();
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const trialStartsAt = new Date();
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const result = await db.insert(users).values({
      username: finalUsername,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      trialStartsAt,
      trialEndsAt,
      trialUsed: false,
      trialMinutesTotal: 90,
      trialMinutesUsed: "0",
    }).returning();

    const newUser = result[0];

    await db.insert(userSsoAccounts).values({
      userId: newUser.id,
      provider: "google",
      providerUserId: googleId,
      providerEmail: normalizedEmail,
      providerName: googleUser.name,
    });

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, username: newUser.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`[Google SSO] POST New user created: userId=${newUser.id}, username=${newUser.username}`);

    res.status(201).json({
      success: true,
      token,
      expiresIn: 7 * 24 * 60 * 60,
      user: { id: newUser.id, email: newUser.email, username: newUser.username },
      isNewUser: true,
    });
  } catch (error: any) {
    console.error("[Google SSO] POST Error:", error);
    res.status(500).json({
      success: false,
      error: "Google sign-in failed. Please try again.",
    });
  }
});

// ============================================================
// MOBILE FORGOT PASSWORD ENDPOINTS - /api/v1/p/
// (No authentication required - for mobile app password reset)
// ============================================================

// Mobile: Forgot Password - Request password reset with 6-character code
app.post("/api/v1/p/forgot-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Valid email is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { email } = parseResult.data;

    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];

    if (!user) {
      console.log(`[DEBUG /p/forgot-password] INPUT: email=${email}, userFound=false`);
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset code has been sent.",
      });
    }

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    const randomBytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[randomBytes[i] % chars.length];
    }

    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: hashedCode,
      expiresAt,
    });

    await sendPasswordResetEmail(
      user.email!,
      `Your password reset code is: ${code}\n\nThis code will expire in 15 minutes.`,
      true
    );

    console.log(`[DEBUG /p/forgot-password] OUTPUT: success=true, userId=${user.id}, username=${user.username}`);

    const response: any = {
      success: true,
      message: "If an account with that email exists, a password reset code has been sent.",
    };
    if (process.env.NODE_ENV !== "production") {
      response.code = code;
    }

    res.json(response);
  } catch (error: any) {
    console.error("[Mobile Forgot Password] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request",
    });
  }
});

// Mobile: Reset Password - Set new password using email + 6-character code
app.post("/api/v1/p/reset-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email("Must be a valid email format"),
      code: z.string().length(6, "Code must be exactly 6 characters"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string(),
    }).refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { email, code, newPassword } = parseResult.data;
    console.log(`[DEBUG /p/reset-password] INPUT: email=${email}`);

    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    const hashedCode = crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");

    const tokenResult = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.token, hashedCode),
      ))
      .limit(1);

    const resetRecord = tokenResult[0];

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    if (resetRecord.usedAt) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.update(users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetRecord.id));

    console.log(`[DEBUG /p/reset-password] OUTPUT: success=true, userId=${user.id}`);

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error: any) {
    console.error("[Mobile Reset Password] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
    });
  }
});

// ============================================================
// DEEP LINK REDIRECT ENDPOINT - /api/v1/auth/reset-password
// This endpoint handles Universal Links (iOS) and App Links (Android)
// When clicked from email, it redirects to the mobile app or web fallback
// ============================================================

// GET /api/v1/auth/reset-password?token=XYZ
// This endpoint is called when user clicks the reset password link from email
// It attempts to open the mobile app, falls back to web if app not installed
app.get("/api/v1/auth/reset-password", async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invalid Link - MyVoicePost</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                 display: flex; justify-content: center; align-items: center; min-height: 100vh;
                 margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .container { background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
          h1 { color: #e74c3c; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Invalid Link</h1>
          <p>This password reset link is invalid or missing the token. Please request a new password reset.</p>
        </div>
      </body>
      </html>
    `);
  }

  console.log(`[Deep Link] Password reset link accessed with token: ${token.substring(0, 8)}...`);

  // Validate token exists and is not expired (optional - provides better UX)
  try {
    const tokenResult = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    const resetTokenRecord = tokenResult[0];

    if (!resetTokenRecord) {
      return res.status(400).send(generateErrorPage("Invalid Link", "This password reset link is invalid. Please request a new password reset."));
    }

    if (new Date() > resetTokenRecord.expiresAt) {
      return res.status(400).send(generateErrorPage("Link Expired", "This password reset link has expired. Please request a new password reset."));
    }

    if (resetTokenRecord.usedAt) {
      return res.status(400).send(generateErrorPage("Link Already Used", "This password reset link has already been used. Please request a new password reset if needed."));
    }
  } catch (error) {
    console.error("[Deep Link] Error validating token:", error);
    // Continue anyway - let the mobile app handle validation
  }

  // Generate app deep link URLs
  const customSchemeUrl = `${APP_SCHEME}://reset-password?token=${token}`;
  const webFallbackUrl = `${WEB_APP_URL}/reset-password?token=${token}`;

  // Android App Link intent URL
  const androidIntentUrl = `intent://reset-password?token=${token}#Intent;scheme=${APP_SCHEME};package=com.myvoicepost.app;S.browser_fallback_url=${encodeURIComponent(webFallbackUrl)};end`;

  // Serve a smart redirect page that:
  // 1. Tries to open the mobile app via custom scheme
  // 2. Falls back to web if app is not installed
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - MyVoicePost</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex; justify-content: center; align-items: center; min-height: 100vh;
          margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white; padding: 40px; border-radius: 12px; text-align: center;
          max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .spinner {
          width: 40px; height: 40px; border: 4px solid #f3f3f3;
          border-top: 4px solid #667eea; border-radius: 50%;
          animation: spin 1s linear infinite; margin: 20px auto;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .btn {
          display: inline-block; padding: 14px 30px; margin: 10px 5px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; text-decoration: none; border-radius: 8px; font-weight: bold;
        }
        .btn-secondary { background: #f5f5f5; color: #333; }
        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reset Password</h1>
        <div id="loading">
          <p>Opening MyVoicePost app...</p>
          <div class="spinner"></div>
        </div>
        <div id="fallback" class="hidden">
          <p>If the app didn't open automatically, use one of the options below:</p>
          <a href="${customSchemeUrl}" class="btn">Open in App</a>
          <a href="${webFallbackUrl}" class="btn btn-secondary">Continue on Web</a>
        </div>
      </div>
      <script>
        (function() {
          var isAndroid = /android/i.test(navigator.userAgent);
          var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
          var appOpened = false;

          // Try to open the app
          function tryOpenApp() {
            if (isAndroid) {
              // Use Android Intent URL for better app detection
              window.location.href = "${androidIntentUrl}";
            } else {
              // Use custom scheme for iOS and other platforms
              window.location.href = "${customSchemeUrl}";
            }
          }

          // Show fallback after timeout
          function showFallback() {
            if (!appOpened) {
              document.getElementById('loading').classList.add('hidden');
              document.getElementById('fallback').classList.remove('hidden');
            }
          }

          // Detect if app was opened (page becomes hidden)
          document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
              appOpened = true;
            }
          });

          // Try to open app immediately
          tryOpenApp();

          // Show fallback after 2.5 seconds if app didn't open
          setTimeout(showFallback, 2500);
        })();
      </script>
    </body>
    </html>
  `);
});

// Helper function to generate error pages
function generateErrorPage(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - MyVoicePost</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center; min-height: 100vh;
               margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .container { background: white; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; }
        h1 { color: #e74c3c; }
        p { color: #666; }
        .btn { display: inline-block; padding: 14px 30px; margin-top: 20px;
               background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
               color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="${WEB_APP_URL}" class="btn">Go to MyVoicePost</a>
      </div>
    </body>
    </html>
  `;
}

// ============================================================
// MOBILE API ENDPOINTS - /api/v1/m/
// ============================================================

// Mobile JWT middleware
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).jwtUser = decoded;
    
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

// Mobile Auth: Logout (use /api/v1/p/login and /api/v1/p/register for login/signup)
app.post("/api/v1/m/logout", mobileAuthMiddleware, (req, res) => {
  const jwtUser = (req as any).jwtUser;
  console.log(`[DEBUG /m/logout] userId=${jwtUser?.userId || jwtUser?.id}`);
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

// Mobile Auth: Get current user
app.get("/api/v1/m/me", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;

    console.log(`[DEBUG /m/me] INPUT: userId=${userId}`);
    let trialData: any = {};
    if (userId) {
      const userResult = await db.select({
        trialMinutesTotal: users.trialMinutesTotal,
        trialMinutesUsed: users.trialMinutesUsed,
        trialStartsAt: users.trialStartsAt,
        trialEndsAt: users.trialEndsAt,
        trialUsed: users.trialUsed,
      }).from(users).where(eq(users.id, userId)).limit(1);

      if (userResult.length > 0) {
        const u = userResult[0];
        trialData = {
          trialMinutesTotal: u.trialMinutesTotal || 90,
          trialMinutesUsed: parseFloat(String(u.trialMinutesUsed || "0")),
          trialStartsAt: u.trialStartsAt,
          trialEndsAt: u.trialEndsAt,
          trialUsed: u.trialUsed,
        };
      }
    }

    console.log(`[DEBUG /m/me] OUTPUT: success=true, userId=${userId}, trialMinutesUsed=${trialData.trialMinutesUsed}, trialMinutesTotal=${trialData.trialMinutesTotal}`);
    res.json({
      success: true,
      user: {
        id: userId,
        email: jwtUser?.email,
        username: jwtUser?.username,
        ...trialData,
      },
    });
  } catch (error: any) {
    console.error("[DEBUG /m/me] ERROR:", error);
    const jwtUser = (req as any).jwtUser;
    res.json({
      success: true,
      user: {
        id: jwtUser?.userId || jwtUser?.id,
        email: jwtUser?.email,
        username: jwtUser?.username,
      },
    });
  }
});

// Mobile: Transcribe audio
app.post("/api/v1/m/transcribe", mobileAuthMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini AI integration not configured",
      });
    }

    const schema = z.object({
      audio: z.string().min(1, "Audio data is required"),
      mimeType: z.string().optional().default("audio/mp4"),
      language: z.string().optional().default("en"),
      durationSeconds: z.number().optional().default(0),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { audio, mimeType, language, durationSeconds } = parseResult.data;
    const audioBuffer = Buffer.from(audio, 'base64');

    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/transcribe] INPUT: userId=${userId}, language=${language}, mimeType=${mimeType}, durationSeconds=${durationSeconds}, audioSize=${audioBuffer.length} bytes`);

    const originalText = await transcribeAudio(audioBuffer, mimeType);

    console.log(`[DEBUG /m/transcribe] TRANSCRIBE RESULT: text="${originalText?.substring(0, 100)}...", length=${originalText?.length || 0}`);

    if (!originalText || originalText.trim() === "") {
      console.log(`[DEBUG /m/transcribe] OUTPUT: FAILED - empty transcription`);
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

    if (userId && durationSeconds > 0) {
      try {
        const totalSec = Math.round(durationSeconds);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        const usageTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        await db.insert(audioLogs).values({
          userId,
          usageTime,
          usageSeconds: totalSec,
          sourceLanguage: language,
        });

        const usageMinutes = totalSec / 60;
        await db.update(users)
          .set({
            trialMinutesUsed: sql`COALESCE(${users.trialMinutesUsed}, '0')::numeric + ${usageMinutes}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        console.log(`[DEBUG /m/transcribe] USAGE LOGGED: ${usageTime} (${usageMinutes.toFixed(2)} mins) for user ${userId}`);
      } catch (logError: any) {
        console.error("[DEBUG /m/transcribe] USAGE LOG FAILED:", logError.message);
      }
    } else {
      console.log(`[DEBUG /m/transcribe] USAGE NOT LOGGED: userId=${userId}, durationSeconds=${durationSeconds} (need both userId and durationSeconds>0)`);
    }

    // Fetch updated trial info to return with response
    let trialInfo: { trial_minutes_total: number; trial_minutes_used: number; is_subscribed: boolean } | null = null;
    if (userId) {
      try {
        const updatedUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (updatedUser.length > 0) {
          const u = updatedUser[0];
          const minutesTotal = u.trialMinutesTotal || 90;
          const minutesUsed = parseFloat(u.trialMinutesUsed || "0") || 0;
          const hasActiveSub = await db.select().from(userSubscriptions)
            .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
            .limit(1);
          trialInfo = {
            trial_minutes_total: minutesTotal,
            trial_minutes_used: Math.round(minutesUsed * 100) / 100,
            is_subscribed: hasActiveSub.length > 0,
          };
        }
      } catch (trialErr: any) {
        console.error("[DEBUG /m/transcribe] TRIAL INFO FETCH FAILED:", trialErr.message);
      }
    }

    console.log(`[DEBUG /m/transcribe] OUTPUT: success=true, textLength=${originalText.length}, trialInfo=${JSON.stringify(trialInfo)}`);
    res.json({
      success: true,
      originalText,
      language,
      ...(trialInfo ? trialInfo : {}),
    });
  } catch (error: any) {
    console.error("[Mobile Transcribe] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to transcribe audio",
    });
  }
});

// Mobile: Transcribe audio - language-specific (extracts only the specified language)
app.post("/api/v1/m/transcribe-language", mobileAuthMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini AI integration not configured",
      });
    }

    const schema = z.object({
      audio: z.string().min(1, "Audio data is required"),
      mimeType: z.string().optional().default("audio/mp4"),
      language: z.string().min(1, "Language is required"),
      durationSeconds: z.number().optional().default(0),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { audio, mimeType, language, durationSeconds } = parseResult.data;
    const audioBuffer = Buffer.from(audio, 'base64');

    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/transcribe-language] INPUT: userId=${userId}, language=${language}, mimeType=${mimeType}, durationSeconds=${durationSeconds}, audioSize=${audioBuffer.length} bytes`);

    const originalText = await transcribeAudioLanguageOnly(audioBuffer, mimeType, language);

    console.log(`[DEBUG /m/transcribe-language] TRANSCRIBE RESULT: text="${originalText?.substring(0, 100)}...", length=${originalText?.length || 0}`);

    if (!originalText || originalText.trim() === "") {
      console.log(`[DEBUG /m/transcribe-language] OUTPUT: FAILED - empty transcription`);
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio. Please try speaking more clearly.",
      });
    }

    if (userId && durationSeconds > 0) {
      try {
        const totalSec = Math.round(durationSeconds);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        const usageTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        await db.insert(audioLogs).values({
          userId,
          usageTime,
          usageSeconds: totalSec,
          sourceLanguage: language,
        });

        const usageMinutes = totalSec / 60;
        await db.update(users)
          .set({
            trialMinutesUsed: sql`COALESCE(${users.trialMinutesUsed}, '0')::numeric + ${usageMinutes}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        console.log(`[DEBUG /m/transcribe-language] USAGE LOGGED: ${usageTime} (${usageMinutes.toFixed(2)} mins) for user ${userId}`);
      } catch (logError: any) {
        console.error("[DEBUG /m/transcribe-language] USAGE LOG FAILED:", logError.message);
      }
    }

    let trialInfo: { trial_minutes_total: number; trial_minutes_used: number; is_subscribed: boolean } | null = null;
    if (userId) {
      try {
        const updatedUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (updatedUser.length > 0) {
          const u = updatedUser[0];
          const minutesTotal = u.trialMinutesTotal || 90;
          const minutesUsed = parseFloat(u.trialMinutesUsed || "0") || 0;
          const hasActiveSub = await db.select().from(userSubscriptions)
            .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
            .limit(1);
          trialInfo = {
            trial_minutes_total: minutesTotal,
            trial_minutes_used: Math.round(minutesUsed * 100) / 100,
            is_subscribed: hasActiveSub.length > 0,
          };
        }
      } catch (trialErr: any) {
        console.error("[DEBUG /m/transcribe-language] TRIAL INFO FETCH FAILED:", trialErr.message);
      }
    }

    console.log(`[DEBUG /m/transcribe-language] OUTPUT: success=true, textLength=${originalText.length}, trialInfo=${JSON.stringify(trialInfo)}`);
    res.json({
      success: true,
      originalText,
      language,
      ...(trialInfo ? trialInfo : {}),
    });
  } catch (error: any) {
    console.error("[Mobile Transcribe-Language] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to transcribe audio",
    });
  }
});

// Mobile: Polish text
app.post("/api/v1/m/polish", mobileAuthMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/polish] INPUT: userId=${userId}, language=${language}, outputFormat=${outputFormat}, outputType=${outputType}, textLength=${text.length}, text="${text.substring(0, 100)}..."`);

    const polishedText = await polishText(text, language, outputFormat, outputType);

    console.log(`[DEBUG /m/polish] OUTPUT: success=true, polishedTextLength=${polishedText?.length || 0}, polishedText="${polishedText?.substring(0, 100)}..."`);
    res.json({
      success: true,
      originalText: text,
      polishedText,
      language,
      outputFormat,
      outputType,
    });
  } catch (error: any) {
    console.error("[DEBUG /m/polish] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to polish text",
    });
  }
});

// Mobile: Translate text
app.post("/api/v1/m/translate", mobileAuthMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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

    const { text, sourceLanguage, targetLanguage, outputFormat } = parseResult.data;
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/translate] INPUT: userId=${userId}, sourceLanguage=${sourceLanguage}, targetLanguage=${targetLanguage}, outputFormat=${outputFormat}, textLength=${text.length}, text="${text.substring(0, 100)}..."`);

    const result = await translateAndPolish(text, sourceLanguage, targetLanguage, outputFormat);

    console.log(`[DEBUG /m/translate] OUTPUT: success=true, translatedLength=${result.translatedText?.length || 0}, polishedLength=${result.polishedText?.length || 0}`);
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
    console.error("[DEBUG /m/translate] ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to translate text",
    });
  }
});

// Mobile: Generate image from text description using Gemini
app.post("/api/v1/m/generate-image", mobileAuthMiddleware, async (req, res) => {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key not configured",
      });
    }

    const schema = z.object({
      prompt: z.string().min(1, "Image description is required").max(4000, "Description too long"),
      size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).optional().default("1024x1024"),
      quality: z.enum(["standard", "hd"]).optional().default("standard"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { prompt, size, quality } = parseResult.data;
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[IMAGE GEN] userId=${userId}, size=${size}, quality=${quality}, promptLength=${prompt.length}`);

    const UNSAFE_KEYWORDS = [
      "nude", "nudity", "naked", "topless", "nsfw", "porn", "pornography", "explicit",
      "sex", "sexual", "erotic", "hentai", "xxx",
      "kill", "killing", "murder", "stab", "stabbing", "shoot", "shooting", "decapitate",
      "gore", "gory", "bloody", "blood", "dismember", "mutilate", "torture", "beheading",
      "gun", "rifle", "pistol", "shotgun", "firearm", "assault rifle", "machine gun",
      "bomb", "grenade", "explosive", "missile", "knife attack",
      "drug", "drugs", "cocaine", "heroin", "meth", "marijuana", "cannabis", "weed",
      "smoking", "cigarette", "vaping", "alcohol", "drunk", "beer", "wine", "whiskey",
      "horror", "scary", "terrifying", "nightmare", "demon", "demonic", "satan", "satanic",
      "zombie", "undead", "corpse", "dead body", "skull", "skeleton",
      "racist", "racism", "hate", "nazi", "swastika", "terrorist", "terrorism",
      "suicide", "self-harm", "cutting", "hanging",
      "child abuse", "abuse", "assault", "kidnap", "trafficking",
      "bikini", "lingerie", "underwear", "bra", "panties", "thong",
      "strip", "stripper", "prostitute", "escort",
    ];

    const promptLower = prompt.toLowerCase();
    const detectedUnsafe = UNSAFE_KEYWORDS.filter(keyword => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(promptLower);
    });

    if (detectedUnsafe.length > 0) {
      console.log(`[IMAGE GEN] BLOCKED - unsafe keywords detected for user ${userId}: ${detectedUnsafe.join(', ')}`);
      return res.status(400).json({
        success: false,
        error: "Your image description contains content that is not allowed. Please keep your descriptions family-friendly and appropriate for all ages. Remove any references to violence, weapons, nudity, drugs, scary imagery, or other inappropriate content and try again.",
      });
    }

    const SAFETY_PREFIX = "IMPORTANT: This image must be completely safe, family-friendly, and appropriate for all ages including children. " +
      "Do not include any violence, gore, weapons, nudity, sexual content, drugs, alcohol, tobacco, " +
      "scary or disturbing imagery, hateful symbols, or any content inappropriate for minors. " +
      "The image should be clean, wholesome, and suitable for a general audience. " +
      "Now generate the following: ";

    const safePrompt = SAFETY_PREFIX + prompt;

    const geminiAi = new GoogleGenAI({ apiKey: geminiKey });

    const response = await geminiAi.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: [safePrompt],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    let imageBase64 = "";
    let responseText = "";

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          imageBase64 = part.inlineData.data;
        }
        if (part.text) {
          responseText = part.text;
        }
      }
    }

    if (!imageBase64) {
      throw new Error("No image data received from Gemini");
    }

    console.log(`[IMAGE GEN] Image generated successfully for user ${userId}`);

    res.json({
      success: true,
      imageBase64: imageBase64,
      revisedPrompt: responseText || prompt,
    });
  } catch (error: any) {
    console.error("[IMAGE GEN] Error:", error.message);

    const errorMsg = (error.message || "").toLowerCase();

    if (errorMsg.includes("safety") || errorMsg.includes("blocked") || errorMsg.includes("policy")) {
      return res.status(400).json({
        success: false,
        error: "Your image description was rejected by the safety filter. Please modify your description and try again.",
      });
    }

    if (errorMsg.includes("quota") || errorMsg.includes("rate") || error?.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Too many image generation requests. Please wait a moment and try again.",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate image",
    });
  }
});

// Mobile: Save text
app.post("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    const schema = z.object({
      type: z.enum(["polish", "translate"]),
      originalText: z.string().min(1),
      polishedText: z.string().min(1),
      translatedText: z.string().nullable().optional(),
      sourceLanguage: z.string().min(1),
      targetLanguage: z.string().nullable().optional(),
      outputFormat: z.string().min(1),
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

    const data = parseResult.data;
    console.log(`[DEBUG /m/saved-texts POST] INPUT: userId=${userId}, type=${data.type}, sourceLanguage=${data.sourceLanguage}, originalTextLength=${data.originalText?.length}`);
    const result = await db.insert(savedTexts).values({
      userId,
      type: data.type,
      originalText: data.originalText,
      polishedText: data.polishedText,
      translatedText: data.translatedText || null,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage || null,
      outputFormat: data.outputFormat,
      outputType: data.outputType || null,
    }).returning();

    console.log(`[DEBUG /m/saved-texts POST] OUTPUT: success=true, savedTextId=${result[0]?.id}`);
    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[DEBUG /m/saved-texts POST] ERROR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save text",
    });
  }
});

// Mobile: Get saved texts
app.get("/api/v1/m/saved-texts", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;
    const type = req.query.type as string | undefined;
    console.log(`[DEBUG /m/saved-texts GET] INPUT: userId=${userId}, type=${type || "all"}`);

    let result;
    if (type) {
      result = await db.select().from(savedTexts)
        .where(and(eq(savedTexts.userId, userId), eq(savedTexts.type, type)))
        .orderBy(desc(savedTexts.createdAt));
    } else {
      result = await db.select().from(savedTexts)
        .where(eq(savedTexts.userId, userId))
        .orderBy(desc(savedTexts.createdAt));
    }

    console.log(`[DEBUG /m/saved-texts GET] OUTPUT: success=true, count=${result.length}`);
    res.json({
      success: true,
      savedTexts: result,
      count: result.length,
    });
  } catch (error: any) {
    console.error("[DEBUG /m/saved-texts GET] ERROR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch saved texts",
    });
  }
});

// Mobile: Get single saved text
app.get("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    console.log(`[DEBUG /m/saved-texts/:id GET] INPUT: userId=${userId}, id=${req.params.id}`);
    const result = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[Mobile Get Single] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch saved text",
    });
  }
});

// Mobile: Update saved text
app.put("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;
    const { id } = req.params;
    console.log(`[DEBUG /m/saved-texts/:id PUT] INPUT: userId=${userId}, id=${id}`);

    const existing = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, id), eq(savedTexts.userId, userId)));

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

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
      });
    }

    const updates: any = {};
    const data = parseResult.data;
    if (data.type) updates.type = data.type;
    if (data.originalText) updates.originalText = data.originalText;
    if (data.polishedText) updates.polishedText = data.polishedText;
    if (data.translatedText !== undefined) updates.translatedText = data.translatedText;
    if (data.sourceLanguage) updates.sourceLanguage = data.sourceLanguage;
    if (data.targetLanguage !== undefined) updates.targetLanguage = data.targetLanguage;
    if (data.outputFormat) updates.outputFormat = data.outputFormat;
    if (data.outputType !== undefined) updates.outputType = data.outputType;

    const result = await db.update(savedTexts)
      .set(updates)
      .where(eq(savedTexts.id, id))
      .returning();

    res.json({
      success: true,
      savedText: result[0],
    });
  } catch (error: any) {
    console.error("[Mobile Update] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update saved text",
    });
  }
});

// Mobile: Delete saved text
app.delete("/api/v1/m/saved-texts/:id", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId;

    console.log(`[DEBUG /m/saved-texts/:id DELETE] INPUT: userId=${userId}, id=${req.params.id}`);
    const existing = await db.select().from(savedTexts)
      .where(and(eq(savedTexts.id, req.params.id), eq(savedTexts.userId, userId)));

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Saved text not found",
      });
    }

    await db.delete(savedTexts).where(eq(savedTexts.id, req.params.id));

    res.json({
      success: true,
      message: "Saved text deleted successfully",
    });
  } catch (error: any) {
    console.error("[Mobile Delete] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete saved text",
    });
  }
});

// ============================================================
// SUBSCRIPTION ENDPOINTS
// ============================================================

async function getTrialInfo(userId: string) {
  const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userResult[0];
  if (!user || !user.trialStartsAt || !user.trialEndsAt) return null;

  const now = new Date();
  const trialMinutesUsed = parseFloat(user.trialMinutesUsed || "0");
  const trialMinutesTotal = user.trialMinutesTotal || 90;
  const trialMinutesRemaining = Math.max(0, trialMinutesTotal - trialMinutesUsed);
  const timeExpired = now > user.trialEndsAt;
  const minutesExpired = trialMinutesRemaining <= 0;
  const isActive = !timeExpired && !minutesExpired;

  const hasActiveSubscription = await db.select().from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);
  const isSubscribed = hasActiveSubscription.length > 0;

  let status: string;
  if (timeExpired || minutesExpired) status = "expired";
  else if (isSubscribed) status = "subscribed";
  else status = "active";

  const timeRemainingMs = Math.max(0, user.trialEndsAt.getTime() - now.getTime());
  const daysRemaining = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.ceil(timeRemainingMs / (1000 * 60 * 60));

  return {
    status,
    is_active: isActive,
    is_subscribed: isSubscribed,
    starts_at: user.trialStartsAt.toISOString(),
    ends_at: user.trialEndsAt.toISOString(),
    minutes_total: trialMinutesTotal,
    minutes_used: trialMinutesUsed,
    minutes_remaining: trialMinutesRemaining,
    days_remaining: isActive ? daysRemaining : 0,
    hours_remaining: isActive ? hoursRemaining : 0,
  };
}

async function checkUserAccess(userId: string) {
  const trial = await getTrialInfo(userId);

  const activeSubResult = await db.select().from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active"), gte(userSubscriptions.validDateUpto, new Date())))
    .limit(1);

  let subscription: any = null;
  if (activeSubResult.length > 0) {
    const sub = activeSubResult[0];
    const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    const plan = planResult[0];
    if (plan) {
      subscription = {
        id: sub.id,
        plan_name: plan.name,
        valid_total_minutes: plan.validTotalMinutes || 0,
        minutes_used: sub.minutesUsed,
        minutes_remaining: parseFloat(sub.minutesRemaining || "0"),
        valid_date_upto: sub.validDateUpto.toISOString(),
        status: sub.status,
      };
    }
  }

  const accessGranted = trial !== null && trial.is_active && trial.minutes_remaining > 0;
  let accessSource = "none";
  if (accessGranted && trial?.is_subscribed) accessSource = "subscription";
  else if (accessGranted) accessSource = "trial";

  return {
    access_granted: accessGranted,
    access_source: accessSource,
    trial,
    subscription,
  };
}

// GET /api/v1/p/plans - List all available plans (public, filtered by is_visible)
app.get("/api/v1/p/plans", async (req, res) => {
  try {
    const showAll = req.query.all === "true";
    console.log(`[DEBUG /p/plans] INPUT: showAll=${showAll}`);
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
      stripe_price_id: plan.stripePriceId,
      is_default: plan.isDefault,
      is_visible: plan.isVisible,
    }));

    console.log(`[DEBUG /p/plans] OUTPUT: success=true, planCount=${formattedPlans.length}`);
    res.json({
      success: true,
      plans: formattedPlans,
    });
  } catch (error: any) {
    console.error("[DEBUG /p/plans] ERROR:", error);
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
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/subscribe] INPUT: userId=${userId}, planId=${plan_id}`);

    const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, plan_id)).limit(1);
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

    const paymentSuccess = payment_token.startsWith("tok_") && payment_token.length >= 8;
    if (!paymentSuccess) {
      return res.status(402).json({
        success: false,
        error: "Payment failed. Invalid payment token.",
      });
    }

    const validDateUpto = new Date();
    validDateUpto.setDate(validDateUpto.getDate() + plan.validDays);

    let carryoverMinutes = 0;
    const trialInfo = await getTrialInfo(userId);
    if (trialInfo && trialInfo.is_active && trialInfo.minutes_remaining > 0) {
      carryoverMinutes = trialInfo.minutes_remaining;
    }

    await db.update(users)
      .set({ trialUsed: true, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const existingActive = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, "active"),
        gte(userSubscriptions.validDateUpto, new Date()),
      ))
      .limit(1);

    if (existingActive.length > 0) {
      await db.update(userSubscriptions)
        .set({ status: "superseded" })
        .where(eq(userSubscriptions.id, existingActive[0].id));
    }

    const existingPending = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, "pending_payment"),
      ));

    for (const pending of existingPending) {
      await db.update(userSubscriptions)
        .set({ status: "superseded" })
        .where(eq(userSubscriptions.id, pending.id));
    }

    const totalMinutesAvailable = (plan.validTotalMinutes || 0) + carryoverMinutes;

    const [subscription] = await db.insert(userSubscriptions).values({
      userId,
      planId: plan_id,
      validDateUpto,
      minutesUsed: 0,
      chunksUsed: 0,
      minutesRemaining: String(totalMinutesAvailable),
      paymentToken: payment_token,
      status: "active",
    }).returning();

    await db.update(users)
      .set({ subscriptionId: subscription.id, updatedAt: new Date() })
      .where(eq(users.id, userId));

    console.log(`[DEBUG /m/subscribe] OUTPUT: success=true, userId=${userId}, plan=${plan.name}, validUntil=${validDateUpto.toISOString()}, carryover=${carryoverMinutes}min, totalMinutes=${totalMinutesAvailable}`);

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

// POST /api/v1/m/check-access - Check user access (trial + subscription)
app.post("/api/v1/m/check-access", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    if (!userId) {
      console.error("[Check Access] No userId in JWT token:", jwtUser);
      return res.status(401).json({ success: false, error: "User not found in token" });
    }

    const accessInfo = await checkUserAccess(userId);

    console.log(`[DEBUG /m/check-access] OUTPUT: userId=${userId}, granted=${accessInfo.access_granted}, source=${accessInfo.access_source}, trialActive=${accessInfo.trial?.is_active}, trialStatus=${accessInfo.trial?.status}, minutesRemaining=${accessInfo.trial?.minutes_remaining}, minutesUsed=${accessInfo.trial?.minutes_used}`);

    res.json({
      success: true,
      access_granted: accessInfo.access_granted,
      access_source: accessInfo.access_source,
      trial: accessInfo.trial,
      subscription: accessInfo.subscription,
    });
  } catch (error: any) {
    console.error("[Check Access] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check access",
    });
  }
});

// GET /api/v1/m/subscription - Get active subscription for logged-in user
app.get("/api/v1/m/subscription", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/subscription GET] INPUT: userId=${userId}`);
    const trial = await getTrialInfo(userId);

    const activeSubResult = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, "active"),
        gte(userSubscriptions.validDateUpto, new Date()),
      ))
      .limit(1);

    if (activeSubResult.length > 0) {
      const sub = activeSubResult[0];
      const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
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

    const pendingSubResult = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, "pending_payment"),
      ))
      .limit(1);

    if (pendingSubResult.length > 0) {
      const sub = pendingSubResult[0];
      const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
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
    const userId = (req as any).jwtUser?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    console.log(`[DEBUG /m/settings GET] INPUT: userId=${userId}`);
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
    const userId = (req as any).jwtUser?.userId;
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
    console.log(`[DEBUG /m/settings PUT] INPUT: userId=${userId}, settingsCount=${settingsToSave.length}, keys=${settingsToSave.map(s => s.setting_key).join(",")}`);
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
    const userId = (req as any).jwtUser?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { key } = req.params;
    console.log(`[DEBUG /m/settings DELETE] INPUT: userId=${userId}, key=${key}`);

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

// ============================================================
// USAGE STATS & AUDIO LOG ENDPOINTS (Mobile)
// ============================================================

app.get("/api/v1/m/usage-stats", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    console.log(`[DEBUG /m/usage-stats] INPUT: userId=${userId}`);
    const userResult = await db.select({
      trialMinutesTotal: users.trialMinutesTotal,
      trialMinutesUsed: users.trialMinutesUsed,
      trialStartsAt: users.trialStartsAt,
      trialEndsAt: users.trialEndsAt,
      trialUsed: users.trialUsed,
    }).from(users).where(eq(users.id, userId)).limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const user = userResult[0];
    const totalLogs = await db.select({
      count: sql<number>`count(*)::int`,
      totalSeconds: sql<number>`COALESCE(sum(${audioLogs.usageSeconds}), 0)::int`,
    }).from(audioLogs).where(eq(audioLogs.userId, userId));

    console.log(`[DEBUG /m/usage-stats] OUTPUT: userId=${userId}, trialMinutesTotal=${user.trialMinutesTotal || 90}, trialMinutesUsed=${parseFloat(String(user.trialMinutesUsed || "0"))}, totalTranscriptions=${totalLogs[0]?.count || 0}, totalUsageSeconds=${totalLogs[0]?.totalSeconds || 0}`);
    res.json({
      success: true,
      stats: {
        trialMinutesTotal: user.trialMinutesTotal || 90,
        trialMinutesUsed: parseFloat(String(user.trialMinutesUsed || "0")),
        trialStartsAt: user.trialStartsAt,
        trialEndsAt: user.trialEndsAt,
        trialUsed: user.trialUsed,
        totalTranscriptions: totalLogs[0]?.count || 0,
        totalUsageSeconds: totalLogs[0]?.totalSeconds || 0,
      },
    });
  } catch (error: any) {
    console.error("[Usage Stats] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch usage stats" });
  }
});

app.get("/api/v1/m/audio-logs", mobileAuthMiddleware, async (req, res) => {
  try {
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    console.log(`[DEBUG /m/audio-logs] INPUT: userId=${userId}`);
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const logs = await db.select().from(audioLogs)
      .where(eq(audioLogs.userId, userId))
      .orderBy(desc(audioLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(audioLogs).where(eq(audioLogs.userId, userId));

    console.log(`[DEBUG /m/audio-logs] OUTPUT: userId=${userId}, logsCount=${logs.length}, total=${countResult[0]?.count || 0}, page=${page}`);
    res.json({
      success: true,
      logs,
      total: countResult[0]?.count || 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[DEBUG /m/audio-logs] ERROR:", error);
    res.status(500).json({ success: false, error: "Failed to fetch audio logs" });
  }
});

// ============================================================
// STRIPE SUBSCRIPTION ENDPOINTS (Web + Mobile)
// ============================================================

// GET /api/stripe-config + /api/v1/p/stripe-config - Get Stripe publishable key
async function handleStripeConfig(_req: Request, res: Response) {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ success: true, publishableKey });
  } catch (error: any) {
    console.error("[Stripe Config] Error:", error.message);
    res.status(500).json({ success: false, error: "Failed to get Stripe configuration" });
  }
}

app.get("/api/stripe-config", handleStripeConfig);
app.get("/api/v1/p/stripe-config", handleStripeConfig);

// GET /api/subscription-status + /api/v1/m/subscription-status - Get current subscription status
async function recoverPendingTopups(userId: string, stripeCustomerId: string | null) {
  if (!stripeCustomerId) return;
  try {
    const stripe = await getStripeClient();
    const paymentIntents = await stripe.paymentIntents.list({
      customer: stripeCustomerId,
      limit: 10,
    });

    for (const pi of paymentIntents.data) {
      if (pi.status !== "succeeded") continue;
      const meta = pi.metadata || {};
      if (meta.type !== "topup" || meta.userId !== userId) continue;

      // Skip if already processed
      const existing = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, pi.id)))
        .limit(1);
      if (existing.length > 0) continue;

      // Skip if refunded or disputed
      const latestChargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge as any)?.id;
      if (latestChargeId) {
        try {
          const charge = await stripe.charges.retrieve(latestChargeId);
          if (charge.refunded || charge.disputed) {
            console.log(`[Recovery] Skipping refunded/disputed PI ${pi.id}`);
            continue;
          }
        } catch (chargeErr: any) {
          console.warn(`[Recovery] Could not verify charge for PI ${pi.id}: ${chargeErr.message}`);
          continue;
        }
      }

      // Only process recent top-ups (within last 7 days)
      const piCreated = new Date((pi.created || 0) * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (piCreated < sevenDaysAgo) continue;

      console.log(`[Recovery] Found unprocessed top-up PI ${pi.id} for user ${userId}`);
      const topupMinutes = parseInt(meta.topup_minutes || "60", 10);

      await db.transaction(async (tx) => {
        const lockKey = pi.id.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

        const doubleCheck = await tx.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, pi.id)))
          .limit(1);
        if (doubleCheck.length > 0) return;

        const userResult = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (userResult.length === 0) return;

        const user = userResult[0];
        const currentMinutesTotal = user.trialMinutesTotal || 90;
        const newMinutesTotal = currentMinutesTotal + topupMinutes;

        await tx.update(users)
          .set({ trialMinutesTotal: newMinutesTotal, updatedAt: new Date() })
          .where(eq(users.id, userId));

        const activeSub = await tx.select().from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
          .limit(1);
        if (activeSub.length > 0) {
          const existingRemaining = parseFloat(activeSub[0].minutesRemaining || "0");
          await tx.update(userSubscriptions)
            .set({ minutesRemaining: String(existingRemaining + topupMinutes) })
            .where(eq(userSubscriptions.id, activeSub[0].id));
        }

        let topupPlanId: string;
        const topupPlanResult = await tx.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.name, "Top-Up")).limit(1);
        if (topupPlanResult.length > 0) {
          topupPlanId = topupPlanResult[0].id;
        } else {
          const [newPlan] = await tx.insert(subscriptionPlans).values({
            name: "Top-Up",
            validTotalMinutes: 60,
            validDays: 0,
            recordingsAvailableDays: 0,
            chunksCount: 0,
            offlineRecording: false,
            priceMonthly: 500,
            isVisible: false,
          }).returning();
          topupPlanId = newPlan.id;
        }

        await tx.insert(userSubscriptions).values({
          userId,
          planId: topupPlanId,
          status: "completed",
          minutesRemaining: String(topupMinutes),
          paymentToken: pi.id,
          validDateUpto: new Date(),
        });

        console.log(`[Recovery] Applied top-up: userId=${userId}, +${topupMinutes} mins, newTotal=${newMinutesTotal}`);
      });
    }
  } catch (err: any) {
    console.error("[Recovery] Error recovering pending top-ups:", err.message);
  }
}

async function handleSubscriptionStatus(_req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /subscription-status] INPUT: userId=${userId}`);
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Recover any pending top-ups that weren't confirmed
    await recoverPendingTopups(userId, user.stripeCustomerId);

    // Re-fetch user after potential recovery
    const updatedUserResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const updatedUser = updatedUserResult[0] || user;

    const trial = await getTrialInfo(userId);

    const activeSubResult = await db.select().from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, "active"),
      ))
      .limit(1);

    const activeSub = activeSubResult[0];
    let plan: any = null;
    if (activeSub) {
      const planResult = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, activeSub.planId))
        .limit(1);
      plan = planResult[0] || null;
    }

    let stripeStatus: string | null = null;
    let cancelAtPeriodEnd = false;
    let currentPeriodEnd: string | null = null;
    let stripePriceId: string | null = null;

    if (updatedUser.stripeSubscriptionId) {
      try {
        const stripe = await getStripeClient();
        const stripeSub = await stripe.subscriptions.retrieve(updatedUser.stripeSubscriptionId);
        stripeStatus = stripeSub.status;
        cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
        const periodEndTs = (stripeSub as any).current_period_end;
        currentPeriodEnd = periodEndTs
          ? new Date(periodEndTs * 1000).toISOString()
          : null;
        stripePriceId = stripeSub.items?.data?.[0]?.price?.id || null;
      } catch (err: any) {
        console.warn("[Subscription Status] Stripe retrieval failed:", err.message);
      }
    }

    let subscriptionData: any = null;

    if (activeSub) {
      subscriptionData = {
        id: activeSub.id,
        plan_name: plan?.name || "Unknown",
        plan_id: activeSub.planId,
        status: activeSub.status,
        valid_date_upto: activeSub.validDateUpto,
        minutes_used: activeSub.minutesUsed,
        minutes_remaining: activeSub.minutesRemaining,
        stripe_subscription_id: updatedUser.stripeSubscriptionId,
        stripe_status: stripeStatus,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: currentPeriodEnd,
      };
    } else if (updatedUser.stripeSubscriptionId && stripeStatus) {
      let stripePlan: any = null;
      if (stripePriceId) {
        const stripePlanResult = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, stripePriceId))
          .limit(1);
        stripePlan = stripePlanResult[0] || null;
      }

      subscriptionData = {
        id: null,
        plan_name: stripePlan?.name || "Subscription",
        plan_id: stripePlan?.id || null,
        status: stripeStatus === "active" || stripeStatus === "trialing" ? "active" : stripeStatus,
        valid_date_upto: currentPeriodEnd,
        minutes_used: 0,
        minutes_remaining: stripePlan?.validTotalMinutes ? String(stripePlan.validTotalMinutes) : "0",
        stripe_subscription_id: updatedUser.stripeSubscriptionId,
        stripe_status: stripeStatus,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: currentPeriodEnd,
      };
      console.log(`[Subscription Status] No active DB record but Stripe sub exists: ${updatedUser.stripeSubscriptionId}, status=${stripeStatus}, plan=${stripePlan?.name || 'unknown'}`);
    }

    res.json({
      success: true,
      trial: trial ? {
        is_active: trial.is_active,
        days_remaining: trial.days_remaining,
        minutes_remaining: trial.minutes_remaining,
        minutes_used: trial.minutes_used,
        trial_ends_at: trial.ends_at,
      } : null,
      subscription: subscriptionData,
      has_active_subscription: !!subscriptionData,
      has_active_trial: trial?.is_active || false,
    });
  } catch (error: any) {
    console.error("[Subscription Status] Error:", error);
    res.status(500).json({ success: false, error: "Failed to get subscription status" });
  }
}

app.get("/api/subscription-status", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  await handleSubscriptionStatus(req, res, userId);
});

app.get("/api/v1/m/subscription-status", mobileAuthMiddleware, async (req, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  await handleSubscriptionStatus(req, res, userId);
});

async function handleCreateSubscription(req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /create-subscription] INPUT: userId=${userId}, body=${JSON.stringify(req.body)}`);

    const body = req.body || {};
    const normalizedBody = {
      email: body.email,
      priceId: body.priceId || body.price_id || body.stripePriceId || body.stripe_price_id,
    };

    const schema = z.object({
      email: z.string().email("Valid email is required"),
      priceId: z.string().min(1, "Price ID is required"),
    });

    const parseResult = schema.safeParse(normalizedBody);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { email, priceId } = parseResult.data;
    const stripe = await getStripeClient();

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    let customerId = user.stripeCustomerId;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (custErr: any) {
        console.log("[Stripe] Stored customer not found in current mode, creating new:", custErr.message);
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
      await db.update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    // Cancel any existing incomplete/incomplete_expired subscriptions for this customer to avoid duplicates
    try {
      for (const status of ["incomplete", "incomplete_expired"] as const) {
        const existingSubs = await stripe.subscriptions.list({
          customer: customerId,
          status,
        });
        for (const sub of existingSubs.data) {
          try {
            await stripe.subscriptions.cancel(sub.id);
            console.log(`[Stripe] Cancelled ${status} subscription: ${sub.id}`);
          } catch (innerErr: any) {
            console.warn(`[Stripe] Could not cancel sub ${sub.id}:`, innerErr.message);
          }
        }
      }
    } catch (cancelErr: any) {
      console.warn("[Stripe] Could not clean up incomplete subscriptions:", cancelErr.message);
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent as any;
    const setupIntent = subscription.pending_setup_intent as any;

    let clientSecret: string | null = null;
    let type: "payment" | "setup" = "payment";

    if (paymentIntent?.client_secret) {
      clientSecret = paymentIntent.client_secret;
      type = "payment";
    } else if (setupIntent?.client_secret) {
      clientSecret = setupIntent.client_secret;
      type = "setup";
    } else {
      const si = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        metadata: { subscription_id: subscription.id },
      });
      clientSecret = si.client_secret;
      type = "setup";
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" }
    );

    await db.update(users)
      .set({ stripeSubscriptionId: subscription.id, updatedAt: new Date() })
      .where(eq(users.id, userId));

    console.log(`[Stripe Create Subscription] Success: subId=${subscription.id}, type=${type}, hasSecret=${!!clientSecret}, customerId=${customerId}`);

    res.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret,
      type,
      ephemeralKey: ephemeralKey.secret,
      customerId,
    });
  } catch (error: any) {
    console.error("[Stripe Create Subscription] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create subscription",
    });
  }
}

// Pre-subscribe check - returns current access info so user can confirm extension
async function handlePreSubscribeCheck(req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /pre-subscribe-check] INPUT: userId=${userId}`);
    const trial = await getTrialInfo(userId);
    const activeSubResult = await db.select().from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active"), gte(userSubscriptions.validDateUpto, new Date())))
      .limit(1);

    let currentPlanName: string | null = null;
    let currentValidUntil: string | null = null;
    let currentMinutesRemaining = 0;
    let currentDaysRemaining = 0;

    if (activeSubResult.length > 0) {
      const sub = activeSubResult[0];
      const planResult = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      if (planResult.length > 0) currentPlanName = planResult[0].name;
      currentValidUntil = sub.validDateUpto.toISOString();
      currentMinutesRemaining = parseFloat(sub.minutesRemaining || "0");
      const remainMs = Math.max(0, sub.validDateUpto.getTime() - Date.now());
      currentDaysRemaining = Math.ceil(remainMs / (1000 * 60 * 60 * 24));
    }

    const hasActiveAccess = (trial !== null && trial.is_active && trial.minutes_remaining > 0) || activeSubResult.length > 0;

    res.json({
      success: true,
      has_active_access: hasActiveAccess,
      is_subscribed: activeSubResult.length > 0,
      current_plan_name: currentPlanName,
      current_valid_until: currentValidUntil,
      current_minutes_remaining: trial?.minutes_remaining ?? currentMinutesRemaining,
      current_days_remaining: trial?.days_remaining ?? currentDaysRemaining,
      trial_status: trial?.status || null,
    });
  } catch (error: any) {
    console.error("[Pre-Subscribe Check] Error:", error);
    res.status(500).json({ success: false, error: "Failed to check subscription status" });
  }
}

app.post("/api/v1/m/pre-subscribe-check", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  await handlePreSubscribeCheck(req, res, userId);
});

app.post("/api/pre-subscribe-check", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handlePreSubscribeCheck(req, res, userId);
});

// ============================================
// TOP-UP: $5 for 60 minutes (one-time purchase via PaymentIntent / Payment Sheet)
// ============================================
const TOPUP_MINUTES = 60;

async function handleCreateTopupCheckout(req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /create-topup-checkout] INPUT: userId=${userId}, body=${JSON.stringify(req.body)}`);

    const priceId = process.env.STRIPE_TOPUP_PRICE_ID;

    if (!priceId) {
      console.error("[Stripe Top-up] STRIPE_TOPUP_PRICE_ID environment variable is not set");
      return res.status(500).json({ success: false, error: "Top-up is not configured. Please contact support." });
    }

    const stripe = await getStripeClient();

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Check that user has active trial or subscription period
    const now = new Date();
    const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    const hasTimeRemaining = trialEndsAt && trialEndsAt > now;

    if (!hasTimeRemaining) {
      const activeSub = await db.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active"), gte(userSubscriptions.validDateUpto, now)))
        .limit(1);
      if (activeSub.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Top-up requires an active trial or subscription period. Please subscribe first.",
        });
      }
    }

    // Reuse or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (custErr: any) {
        console.log("[Stripe Top-up] Stored customer not found, creating new:", custErr.message);
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await db.update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    // Look up price to get the amount
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount;
    const currency = price.currency;

    if (!amount) {
      return res.status(500).json({ success: false, error: "Invalid price configuration" });
    }

    // Create ephemeral key for the customer (needed for Payment Sheet)
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" }
    );

    // Create PaymentIntent for one-time payment (in-app Payment Sheet)
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
        type: "topup",
        topup_minutes: String(TOPUP_MINUTES),
      },
    });

    console.log(`[DEBUG /create-topup-checkout] OUTPUT: paymentIntentId=${paymentIntent.id}, clientSecret=${paymentIntent.client_secret ? 'present' : 'missing'}`);
    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error("[Stripe Top-up Checkout] Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to create top-up checkout" });
  }
}

app.post("/api/v1/m/create-topup-checkout", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  await handleCreateTopupCheckout(req, res, userId);
});

app.post("/api/create-topup-checkout", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handleCreateTopupCheckout(req, res, userId);
});

// ============ CONFIRM TOP-UP (called after Payment Sheet succeeds) ============
async function handleConfirmTopup(req: Request, res: Response, userId: string) {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, error: "paymentIntentId is required" });
    }

    console.log(`[Confirm Top-up] userId=${userId}, piId=${paymentIntentId}`);

    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      console.log(`[Confirm Top-up] Payment not succeeded: status=${paymentIntent.status}`);
      return res.status(400).json({ success: false, error: `Payment not completed. Status: ${paymentIntent.status}` });
    }

    const piMetadata = paymentIntent.metadata || {};
    if (piMetadata.type !== "topup" || piMetadata.userId !== userId) {
      console.log(`[Confirm Top-up] Metadata mismatch: type=${piMetadata.type}, metaUserId=${piMetadata.userId}, reqUserId=${userId}`);
      return res.status(400).json({ success: false, error: "Invalid payment intent for this user" });
    }

    const topupMinutes = parseInt(piMetadata.topup_minutes || "60", 10);

    // Idempotency check: skip if already processed
    const existingTopup = await db.select().from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, paymentIntentId)))
      .limit(1);
    if (existingTopup.length > 0) {
      console.log(`[Confirm Top-up] Already processed for PI ${paymentIntentId}`);
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return res.json({
        success: true,
        message: "Top-up already applied",
        trialMinutesTotal: user[0]?.trialMinutesTotal || 90,
      });
    }

    // Use a transaction with advisory lock for atomic credit application
    const result = await db.transaction(async (tx) => {
      // Advisory lock on hash of paymentIntentId to prevent concurrent processing
      const lockKey = paymentIntentId.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      // Double-check idempotency inside transaction (now serialized by lock)
      const doubleCheck = await tx.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.paymentToken, paymentIntentId)))
        .limit(1);
      if (doubleCheck.length > 0) {
        return { alreadyApplied: true };
      }

      const userResult = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (userResult.length === 0) {
        throw new Error("User not found");
      }

      const user = userResult[0];
      const currentMinutesTotal = user.trialMinutesTotal || 90;
      const newMinutesTotal = currentMinutesTotal + topupMinutes;

      await tx.update(users)
        .set({ trialMinutesTotal: newMinutesTotal, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Also update active subscription record minutes_remaining if exists
      const activeSub = await tx.select().from(userSubscriptions)
        .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
        .limit(1);
      if (activeSub.length > 0) {
        const existingRemaining = parseFloat(activeSub[0].minutesRemaining || "0");
        await tx.update(userSubscriptions)
          .set({ minutesRemaining: String(existingRemaining + topupMinutes) })
          .where(eq(userSubscriptions.id, activeSub[0].id));
      }

      // Look up the Top-Up plan
      let topupPlanId: string;
      const topupPlanResult = await tx.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, "Top-Up")).limit(1);
      if (topupPlanResult.length > 0) {
        topupPlanId = topupPlanResult[0].id;
      } else {
        const [newPlan] = await tx.insert(subscriptionPlans).values({
          name: "Top-Up",
          validTotalMinutes: 60,
          validDays: 0,
          recordingsAvailableDays: 0,
          chunksCount: 0,
          offlineRecording: false,
          priceMonthly: 500,
          isVisible: false,
        }).returning();
        topupPlanId = newPlan.id;
      }

      // Record the top-up purchase in mvp_user_subscriptions
      await tx.insert(userSubscriptions).values({
        userId,
        planId: topupPlanId,
        status: "completed",
        minutesRemaining: String(topupMinutes),
        paymentToken: paymentIntentId,
        validDateUpto: new Date(),
      });

      const newRemaining = newMinutesTotal - parseFloat(user.trialMinutesUsed || "0");
      return { alreadyApplied: false, newMinutesTotal, newRemaining };
    });

    if (result.alreadyApplied) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return res.json({
        success: true,
        message: "Top-up already applied",
        trialMinutesTotal: user[0]?.trialMinutesTotal || 90,
      });
    }

    console.log(`[Confirm Top-up] Applied: userId=${userId}, +${topupMinutes} mins, newTotal=${result.newMinutesTotal}, remaining=${result.newRemaining!.toFixed(2)}`);

    res.json({
      success: true,
      message: `Top-up of ${topupMinutes} minutes applied successfully`,
      trialMinutesTotal: result.newMinutesTotal,
      minutesRemaining: parseFloat(result.newRemaining!.toFixed(2)),
    });
  } catch (error: any) {
    console.error("[Confirm Top-up] Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to confirm top-up" });
  }
}

app.post("/api/v1/m/confirm-topup", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  await handleConfirmTopup(req, res, userId);
});

app.post("/api/confirm-topup", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handleConfirmTopup(req, res, userId);
});

// ============ PAYMENT HISTORY ============
async function handlePaymentHistory(_req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /payment-history] INPUT: userId=${userId}`);

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Get subscription records from DB with plan info
    const subRecords = await db
      .select({
        id: userSubscriptions.id,
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        minutesRemaining: userSubscriptions.minutesRemaining,
        paymentToken: userSubscriptions.paymentToken,
        validDateUpto: userSubscriptions.validDateUpto,
        createdAt: userSubscriptions.createdAt,
        planName: subscriptionPlans.name,
        planPrice: subscriptionPlans.priceMonthly,
        planMinutes: subscriptionPlans.validTotalMinutes,
      })
      .from(userSubscriptions)
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt));

    // Try to get Stripe charges for richer payment info
    let stripePayments: any[] = [];
    if (user.stripeCustomerId) {
      try {
        const stripe = await getStripeClient();
        const charges = await stripe.charges.list({
          customer: user.stripeCustomerId,
          limit: 50,
        });
        stripePayments = charges.data.map((charge) => ({
          id: charge.id,
          paymentIntent: charge.payment_intent || null,
          amount: charge.amount,
          currency: charge.currency,
          status: charge.status,
          description: charge.description,
          created: new Date(charge.created * 1000).toISOString(),
          paymentMethod: charge.payment_method_details?.type || "card",
          cardBrand: charge.payment_method_details?.card?.brand || null,
          cardLast4: charge.payment_method_details?.card?.last4 || null,
          receiptUrl: charge.receipt_url || null,
          refunded: charge.refunded,
          metadata: charge.metadata || {},
        }));
      } catch (stripeErr: any) {
        console.warn("[Payment History] Stripe charges fetch failed:", stripeErr.message);
      }
    }

    const matchStripeCharge = (paymentToken: string | null, sp: any): boolean => {
      if (!paymentToken) return false;
      if (sp.paymentIntent === paymentToken) return true;
      if (sp.id === paymentToken) return true;
      if (sp.metadata?.payment_intent === paymentToken) return true;
      return false;
    };

    // Merge: combine DB records with Stripe charge details
    const matchedChargeIds = new Set<string>();
    const payments = subRecords.map((sub) => {
      const stripeCharge = stripePayments.find((sp) => matchStripeCharge(sub.paymentToken, sp));
      if (stripeCharge) matchedChargeIds.add(stripeCharge.id);

      return {
        id: sub.id,
        type: sub.planName === "Top-Up" ? "topup" : "subscription",
        planName: sub.planName || "Unknown",
        amount: stripeCharge?.amount || sub.planPrice || 0,
        currency: stripeCharge?.currency || "usd",
        status: sub.status,
        minutesAdded: sub.planName === "Top-Up" ? parseInt(sub.minutesRemaining || "60") : sub.planMinutes,
        date: sub.createdAt ? new Date(sub.createdAt).toISOString() : null,
        validUntil: sub.validDateUpto ? new Date(sub.validDateUpto).toISOString() : null,
        cardBrand: stripeCharge?.cardBrand || null,
        cardLast4: stripeCharge?.cardLast4 || null,
        receiptUrl: stripeCharge?.receiptUrl || null,
        refunded: stripeCharge?.refunded || false,
      };
    });

    // Also include Stripe charges not matched to DB records (e.g. direct Stripe payments)
    const unmatchedCharges = stripePayments
      .filter((sp) => !matchedChargeIds.has(sp.id))
      .map((sp) => ({
        id: sp.id,
        type: sp.metadata?.type === "topup" ? "topup" : "stripe_charge",
        planName: sp.description || "Stripe Payment",
        amount: sp.amount,
        currency: sp.currency,
        status: sp.status,
        minutesAdded: sp.metadata?.topup_minutes ? parseInt(sp.metadata.topup_minutes) : null,
        date: sp.created,
        validUntil: null,
        cardBrand: sp.cardBrand,
        cardLast4: sp.cardLast4,
        receiptUrl: sp.receiptUrl,
        refunded: sp.refunded,
      }));

    const allPayments = [...payments, ...unmatchedCharges].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db_ = b.date ? new Date(b.date).getTime() : 0;
      return db_ - da;
    });

    console.log(`[DEBUG /payment-history] OUTPUT: success=true, count=${allPayments.length}`);

    res.json({
      success: true,
      payments: allPayments,
      total: allPayments.length,
    });
  } catch (error: any) {
    console.error("[Payment History] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch payment history" });
  }
}

app.get("/api/v1/m/payment-history", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handlePaymentHistory(req, res, userId);
});

app.get("/api/payment-history", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handlePaymentHistory(req, res, userId);
});

// Web endpoint
app.post("/api/create-subscription", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  await handleCreateSubscription(req, res, userId);
});

// Mobile endpoint
app.post("/api/v1/m/create-subscription", mobileAuthMiddleware, async (req: any, res) => {
  const userId = req.jwtUser?.userId;
  await handleCreateSubscription(req, res, userId);
});

// POST /api/cancel-subscription + /api/v1/m/cancel-subscription
async function handleCancelSubscription(req: Request, res: Response, userId: string) {
  try {
    const schema = z.object({
      subscriptionId: z.string().min(1, "Subscription ID is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { subscriptionId } = parseResult.data;
    console.log(`[DEBUG /cancel-subscription] INPUT: userId=${userId}, subscriptionId=${subscriptionId}`);

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.stripeSubscriptionId !== subscriptionId) {
      return res.status(403).json({ success: false, error: "You can only cancel your own subscription" });
    }

    const stripe = await getStripeClient();

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    const cancelAt = (subscription as any).cancel_at;
    const periodEnd = (subscription as any).current_period_end;

    res.json({
      success: true,
      message: "Subscription will be cancelled at the end of the current billing period",
      cancel_at: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error("[Stripe Cancel Subscription] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel subscription",
    });
  }
}

// Web endpoint
app.post("/api/cancel-subscription", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  await handleCancelSubscription(req, res, userId);
});

// Mobile endpoint
app.post("/api/v1/m/cancel-subscription", mobileAuthMiddleware, async (req: any, res) => {
  const userId = req.jwtUser?.userId;
  await handleCancelSubscription(req, res, userId);
});

// POST /api/v1/m/confirm-subscription - Confirm subscription after mobile PaymentSheet
app.post("/api/v1/m/confirm-subscription", mobileAuthMiddleware, async (req: any, res) => {
  const userId = req.jwtUser?.userId;
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ success: false, error: "subscriptionId is required" });
    }

    console.log(`[Confirm Subscription] userId=${userId}, subscriptionId=${subscriptionId}`);

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const stripe = await getStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    console.log(`[Confirm Subscription] Stripe status: ${stripeSub.status}`);

    const stripeCustomerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : (stripeSub.customer as any)?.id;
    if (!user.stripeCustomerId || stripeCustomerId !== user.stripeCustomerId) {
      console.warn(`[Confirm Subscription] SECURITY: Stripe customer mismatch. User customerId=${user.stripeCustomerId}, sub customerId=${stripeCustomerId}`);
      return res.status(403).json({ success: false, error: "This subscription does not belong to your account" });
    }

    if (user.stripeSubscriptionId !== subscriptionId) {
      await db.update(users)
        .set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
        .where(eq(users.id, userId));
      console.log(`[Confirm Subscription] Updated user stripeSubscriptionId from ${user.stripeSubscriptionId} to ${subscriptionId}`);
    }

    if (stripeSub.status === "active" || stripeSub.status === "trialing") {
      const existingForThisSub = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.paymentToken, subscriptionId),
          eq(userSubscriptions.status, "active"),
        )).limit(1);

      if (existingForThisSub.length > 0) {
        console.log(`[Confirm Subscription] Record already exists for this subscriptionId, skipping creation`);
        return res.json({ success: true, message: "Subscription is active", status: stripeSub.status });
      }

      const existingActive = await db.select().from(userSubscriptions)
        .where(and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
        )).limit(1);

      if (existingActive.length > 0) {
        console.log(`[Confirm Subscription] User already has an active subscription record (possibly from webhook)`);
        return res.json({ success: true, message: "Subscription is active", status: stripeSub.status });
      }

      const priceId = stripeSub.items.data[0]?.price?.id;
      let matchedPlan: any = null;
      if (priceId) {
        const planResult = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.stripePriceId, priceId))
          .limit(1);
        matchedPlan = planResult[0] || null;
      }
      if (!matchedPlan) {
        const fallbackResult = await db.select().from(subscriptionPlans)
          .where(gte(subscriptionPlans.priceMonthly, 1))
          .limit(1);
        matchedPlan = fallbackResult[0] || null;
      }

      if (matchedPlan) {
        const now = new Date();
        const planMinutes = matchedPlan.validTotalMinutes || 0;
        const planDays = matchedPlan.validDays || 30;

        const currentTrialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
        const currentMinutesTotal = user.trialMinutesTotal || 90;
        const isWithinTrial = currentTrialEndsAt && currentTrialEndsAt > now;

        let newTrialEndsAt: Date;
        let newMinutesTotal: number;

        if (isWithinTrial) {
          newTrialEndsAt = new Date(currentTrialEndsAt!);
          newTrialEndsAt.setDate(newTrialEndsAt.getDate() + planDays);
          newMinutesTotal = currentMinutesTotal + planMinutes;
        } else {
          newTrialEndsAt = new Date(now);
          newTrialEndsAt.setDate(newTrialEndsAt.getDate() + planDays);
          newMinutesTotal = currentMinutesTotal + planMinutes;
        }

        await db.update(users)
          .set({
            trialEndsAt: newTrialEndsAt,
            trialMinutesTotal: newMinutesTotal,
            trialUsed: false,
            updatedAt: now,
          })
          .where(eq(users.id, userId));

        const [newSubRecord] = await db.insert(userSubscriptions).values({
          userId: userId,
          planId: matchedPlan.id,
          validDateUpto: newTrialEndsAt,
          minutesUsed: 0,
          chunksUsed: 0,
          minutesRemaining: String(planMinutes),
          paymentToken: subscriptionId,
          status: "active",
        }).returning();

        if (newSubRecord) {
          await db.update(users)
            .set({ subscriptionId: newSubRecord.id, updatedAt: new Date() })
            .where(eq(users.id, userId));
        }

        console.log(`[Confirm Subscription] Created active subscription record for user ${userId}, plan: ${matchedPlan.name}`);
      }

      return res.json({ success: true, message: "Subscription is active", status: stripeSub.status });
    } else if (stripeSub.status === "incomplete") {
      console.log(`[Confirm Subscription] Subscription still incomplete for user ${userId}`);
      return res.json({
        success: true,
        message: "Payment is still being processed. Your subscription will be activated once payment is confirmed.",
        status: stripeSub.status,
      });
    } else {
      return res.json({
        success: true,
        message: `Subscription status: ${stripeSub.status}`,
        status: stripeSub.status,
      });
    }
  } catch (error: any) {
    console.error("[Confirm Subscription] Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to confirm subscription" });
  }
});

// POST /api/reactivate-subscription + /api/v1/m/reactivate-subscription
async function handleReactivateSubscription(req: Request, res: Response, userId: string) {
  try {
    const schema = z.object({
      subscriptionId: z.string().min(1, "Subscription ID is required"),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parseResult.error.errors,
      });
    }

    const { subscriptionId } = parseResult.data;
    console.log(`[DEBUG /reactivate-subscription] INPUT: userId=${userId}, subscriptionId=${subscriptionId}`);

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.stripeSubscriptionId !== subscriptionId) {
      return res.status(403).json({ success: false, error: "You can only reactivate your own subscription" });
    }

    const stripe = await getStripeClient();

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    const periodEnd = (subscription as any).current_period_end;

    res.json({
      success: true,
      message: "Auto-renewal has been turned back on",
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
  } catch (error: any) {
    console.error("[Stripe Reactivate Subscription] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to reactivate subscription",
    });
  }
}

app.post("/api/reactivate-subscription", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  await handleReactivateSubscription(req, res, userId);
});

app.post("/api/v1/m/reactivate-subscription", mobileAuthMiddleware, async (req: any, res) => {
  const userId = req.jwtUser?.userId;
  await handleReactivateSubscription(req, res, userId);
});

// POST /api/update-payment-method + /api/v1/m/update-payment-method
async function handleUpdatePaymentMethod(_req: Request, res: Response, userId: string) {
  try {
    console.log(`[DEBUG /update-payment-method] INPUT: userId=${userId}`);

    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const stripe = await getStripeClient();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({ success: false, error: "No Stripe customer found. Please subscribe first." });
    }

    try {
      await stripe.customers.retrieve(customerId);
    } catch (custErr: any) {
      return res.status(400).json({ success: false, error: "Stripe customer not found" });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        userId,
        purpose: "update_payment_method",
      },
    });

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" as any }
    );

    res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId,
      setupIntentId: setupIntent.id,
    });
  } catch (error: any) {
    console.error("[Stripe Update Payment Method] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create setup intent",
    });
  }
}

app.post("/api/update-payment-method", async (req: any, res) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  await handleUpdatePaymentMethod(req, res, userId);
});

app.post("/api/v1/m/update-payment-method", mobileAuthMiddleware, async (req: any, res) => {
  const userId = req.jwtUser?.userId;
  await handleUpdatePaymentMethod(req, res, userId);
});

// POST /api/stripe-webhook + /api/v1/m/stripe-webhook
async function handleStripeWebhook(req: Request, res: Response) {
  try {
    const stripe = await getStripeClient();
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error("[Stripe Webhook] rawBody not available");
      return res.status(400).json({ error: "Raw body not available" });
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      Array.isArray(sig) ? sig[0] : sig,
      webhookSecret,
    );

    console.log(`[DEBUG /stripe-webhook] EVENT: type=${event.type}, id=${event.id}`);

    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const customerId = invoice.customer;
        const subscriptionId = invoice.subscription;

        if (customerId && subscriptionId) {
          const userResult = await db.select().from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);

          if (userResult.length > 0) {
            const user = userResult[0];
            await db.update(users)
              .set({ stripeSubscriptionId: subscriptionId, updatedAt: new Date() })
              .where(eq(users.id, user.id));

            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceId = stripeSubscription.items.data[0]?.price?.id;

            if (priceId) {
              let planResult = await db.select().from(subscriptionPlans)
                .where(eq(subscriptionPlans.stripePriceId, priceId))
                .limit(1);
              if (planResult.length === 0) {
                planResult = await db.select().from(subscriptionPlans)
                  .where(gte(subscriptionPlans.priceMonthly, 1))
                  .limit(1);
              }
              const matchedPlan = planResult[0];

              if (matchedPlan) {
                const now = new Date();
                const planMinutes = matchedPlan.validTotalMinutes || 0;
                const planDays = matchedPlan.validDays || 30;

                const currentTrialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
                const currentMinutesTotal = user.trialMinutesTotal || 90;
                const currentMinutesUsed = parseFloat(user.trialMinutesUsed || "0");
                const currentMinutesRemaining = Math.max(0, currentMinutesTotal - currentMinutesUsed);
                const isWithinTrial = currentTrialEndsAt && currentTrialEndsAt > now;

                let newTrialEndsAt: Date;
                let newMinutesTotal: number;

                if (isWithinTrial) {
                  newTrialEndsAt = new Date(currentTrialEndsAt!);
                  newTrialEndsAt.setDate(newTrialEndsAt.getDate() + planDays);
                  newMinutesTotal = currentMinutesTotal + planMinutes;
                  console.log(`[Stripe Webhook] Within trial: extending trialEndsAt by ${planDays} days, adding ${planMinutes} mins (current remaining: ${currentMinutesRemaining})`);
                } else {
                  newTrialEndsAt = new Date(now);
                  newTrialEndsAt.setDate(newTrialEndsAt.getDate() + planDays);
                  newMinutesTotal = currentMinutesTotal + planMinutes;
                  console.log(`[Stripe Webhook] After trial/expired: setting trialEndsAt to now+${planDays} days, adding ${planMinutes} mins to total ${currentMinutesTotal}`);
                }

                await db.update(users)
                  .set({
                    trialEndsAt: newTrialEndsAt,
                    trialMinutesTotal: newMinutesTotal,
                    trialUsed: false,
                    updatedAt: now,
                  })
                  .where(eq(users.id, user.id));

                const existingActive = await db.select().from(userSubscriptions)
                  .where(and(
                    eq(userSubscriptions.userId, user.id),
                    eq(userSubscriptions.status, "active"),
                  )).limit(1);

                if (existingActive.length > 0) {
                  const existingSub = existingActive[0];
                  const existingValidDate = new Date(existingSub.validDateUpto);
                  const newValidDate = existingValidDate > now
                    ? new Date(existingValidDate.getTime() + planDays * 24 * 60 * 60 * 1000)
                    : new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);
                  const existingRemaining = parseFloat(existingSub.minutesRemaining || "0");
                  const newRemaining = existingRemaining + planMinutes;

                  await db.update(userSubscriptions)
                    .set({
                      validDateUpto: newValidDate,
                      minutesRemaining: String(newRemaining),
                      planId: matchedPlan.id,
                      paymentToken: subscriptionId,
                    })
                    .where(eq(userSubscriptions.id, existingSub.id));

                  await db.update(users)
                    .set({ subscriptionId: existingSub.id, updatedAt: new Date() })
                    .where(eq(users.id, user.id));

                  console.log(`[Stripe Webhook] Extended existing subscription: +${planDays} days, +${planMinutes} mins (new remaining: ${newRemaining})`);
                } else {
                  const [newSubRecord] = await db.insert(userSubscriptions).values({
                    userId: user.id,
                    planId: matchedPlan.id,
                    validDateUpto: newTrialEndsAt,
                    minutesUsed: 0,
                    chunksUsed: 0,
                    minutesRemaining: String(planMinutes),
                    paymentToken: subscriptionId,
                    status: "active",
                  }).returning();

                  if (newSubRecord) {
                    await db.update(users)
                      .set({ subscriptionId: newSubRecord.id, updatedAt: new Date() })
                      .where(eq(users.id, user.id));
                  }
                  console.log(`[Stripe Webhook] Created new subscription record`);
                }

                const totalNewMinutesRemaining = newMinutesTotal - currentMinutesUsed;
                console.log(`[Stripe Webhook] invoice.paid: User ${user.id} activated plan ${matchedPlan.name}, access until ${newTrialEndsAt.toISOString()}, ${totalNewMinutesRemaining} mins remaining`);

                if (user.email) {
                  const carryoverMinutes = isWithinTrial ? currentMinutesRemaining : 0;
                  sendSubscriptionConfirmationEmail(
                    user.email,
                    matchedPlan.name,
                    matchedPlan.priceMonthly,
                    totalNewMinutesRemaining,
                    newTrialEndsAt,
                    carryoverMinutes
                  ).catch(err => console.error("[Stripe Webhook] Email send error:", err.message));
                }
              }
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const failedInvoice = event.data.object as any;
        const failedCustomerId = failedInvoice.customer;
        const failedSubId = failedInvoice.subscription;

        if (failedCustomerId) {
          const userResult = await db.select().from(users)
            .where(eq(users.stripeCustomerId, failedCustomerId))
            .limit(1);

          if (userResult.length > 0) {
            const user = userResult[0];

            if (failedSubId) {
              const activeSubResult = await db.select().from(userSubscriptions)
                .where(and(
                  eq(userSubscriptions.userId, user.id),
                  eq(userSubscriptions.status, "active"),
                  eq(userSubscriptions.paymentToken, failedSubId),
                )).limit(1);

              if (activeSubResult.length > 0) {
                await db.update(userSubscriptions)
                  .set({ status: "payment_failed" })
                  .where(eq(userSubscriptions.id, activeSubResult[0].id));
              }
            }

            console.log(`[Stripe Webhook] invoice.payment_failed: User ${user.id} payment failed for subscription ${failedSubId}`);

            if (user.email) {
              const failureMessage = failedInvoice.last_finalization_error?.message
                || (failedInvoice.attempt_count > 1
                  ? `Payment retry attempt ${failedInvoice.attempt_count} failed. Your card was declined.`
                  : "Your payment method was declined. Please check your card details or try a different payment method.");

              let planName = "Starter";
              if (failedSubId) {
                try {
                  const sub = await stripe.subscriptions.retrieve(failedSubId);
                  const priceId = sub.items.data[0]?.price?.id;
                  if (priceId) {
                    const planResult = await db.select().from(subscriptionPlans)
                      .where(eq(subscriptionPlans.stripePriceId, priceId))
                      .limit(1);
                    if (planResult.length > 0) planName = planResult[0].name;
                  }
                } catch (_) {}
              }

              sendPaymentFailedEmail(
                user.email,
                failureMessage,
                failedInvoice.amount_due || 0,
                planName
              ).catch(err => console.error("[Stripe Webhook] Failure email send error:", err.message));
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const updatedSub = event.data.object as any;
        const updatedCustomerId = updatedSub.customer;
        const updatedSubId = updatedSub.id;
        const newStatus = updatedSub.status;

        if (updatedCustomerId && updatedSubId) {
          const userResult = await db.select().from(users)
            .where(eq(users.stripeCustomerId, updatedCustomerId))
            .limit(1);

          if (userResult.length > 0) {
            const user = userResult[0];

            if (newStatus === "active") {
              const priceId = updatedSub.items?.data?.[0]?.price?.id;
              if (priceId) {
                let planResult = await db.select().from(subscriptionPlans)
                  .where(eq(subscriptionPlans.stripePriceId, priceId))
                  .limit(1);
                if (planResult.length === 0) {
                  planResult = await db.select().from(subscriptionPlans)
                    .where(gte(subscriptionPlans.priceMonthly, 1))
                    .limit(1);
                }
                const matchedPlan = planResult[0];

                if (matchedPlan) {
                  const activeSubResult = await db.select().from(userSubscriptions)
                    .where(and(
                      eq(userSubscriptions.userId, user.id),
                      eq(userSubscriptions.paymentToken, updatedSubId),
                    )).limit(1);

                  if (activeSubResult.length > 0) {
                    await db.update(userSubscriptions)
                      .set({ status: "active", planId: matchedPlan.id })
                      .where(eq(userSubscriptions.id, activeSubResult[0].id));
                  }
                }
              }

              await db.update(users)
                .set({ stripeSubscriptionId: updatedSubId, updatedAt: new Date() })
                .where(eq(users.id, user.id));
            } else if (newStatus === "past_due" || newStatus === "unpaid") {
              const activeSubResult = await db.select().from(userSubscriptions)
                .where(and(
                  eq(userSubscriptions.userId, user.id),
                  eq(userSubscriptions.status, "active"),
                  eq(userSubscriptions.paymentToken, updatedSubId),
                )).limit(1);

              if (activeSubResult.length > 0) {
                await db.update(userSubscriptions)
                  .set({ status: "payment_failed" })
                  .where(eq(userSubscriptions.id, activeSubResult[0].id));
              }
            }

            console.log(`[Stripe Webhook] subscription.updated: User ${user.id} status=${newStatus}`);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const deletedSub = event.data.object as any;
        const deletedCustomerId = deletedSub.customer;

        if (deletedCustomerId) {
          const userResult = await db.select().from(users)
            .where(eq(users.stripeCustomerId, deletedCustomerId))
            .limit(1);

          if (userResult.length > 0) {
            const user = userResult[0];

            await db.update(users)
              .set({ stripeSubscriptionId: null, subscriptionId: null, updatedAt: new Date() })
              .where(eq(users.id, user.id));

            const activeSubResult = await db.select().from(userSubscriptions)
              .where(and(
                eq(userSubscriptions.userId, user.id),
                eq(userSubscriptions.status, "active"),
              )).limit(1);

            if (activeSubResult.length > 0) {
              await db.update(userSubscriptions)
                .set({ status: "cancelled" })
                .where(eq(userSubscriptions.id, activeSubResult[0].id));
            }

            console.log(`[Stripe Webhook] subscription.deleted: User ${user.id} subscription cancelled`);
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as any;
        const piMetadata = paymentIntent.metadata || {};

        if (piMetadata.type === "topup" && piMetadata.userId) {
          const topupUserId = piMetadata.userId;
          const topupMinutes = parseInt(piMetadata.topup_minutes || "60", 10);
          const piId = paymentIntent.id;

          console.log(`[Stripe Webhook] payment_intent.succeeded (topup): userId=${topupUserId}, minutes=${topupMinutes}, piId=${piId}`);

          // Idempotency check outside transaction (fast path)
          const existingTopup = await db.select().from(userSubscriptions)
            .where(and(eq(userSubscriptions.userId, topupUserId), eq(userSubscriptions.paymentToken, piId)))
            .limit(1);
          if (existingTopup.length > 0) {
            console.log(`[Stripe Webhook] Top-up already processed for PI ${piId}, skipping duplicate`);
            break;
          }

          // Use transaction with advisory lock for atomic credit application
          await db.transaction(async (tx) => {
            const lockKey = piId.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
            await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

            const doubleCheck = await tx.select().from(userSubscriptions)
              .where(and(eq(userSubscriptions.userId, topupUserId), eq(userSubscriptions.paymentToken, piId)))
              .limit(1);
            if (doubleCheck.length > 0) return;

            const userResult = await tx.select().from(users).where(eq(users.id, topupUserId)).limit(1);
            if (userResult.length === 0) {
              console.error(`[Stripe Webhook] Top-up: User not found: ${topupUserId}`);
              return;
            }

            const user = userResult[0];
            const currentMinutesTotal = user.trialMinutesTotal || 90;
            const newMinutesTotal = currentMinutesTotal + topupMinutes;

            await tx.update(users)
              .set({ trialMinutesTotal: newMinutesTotal, updatedAt: new Date() })
              .where(eq(users.id, topupUserId));

            const activeSub = await tx.select().from(userSubscriptions)
              .where(and(eq(userSubscriptions.userId, topupUserId), eq(userSubscriptions.status, "active")))
              .limit(1);
            if (activeSub.length > 0) {
              const existingRemaining = parseFloat(activeSub[0].minutesRemaining || "0");
              await tx.update(userSubscriptions)
                .set({ minutesRemaining: String(existingRemaining + topupMinutes) })
                .where(eq(userSubscriptions.id, activeSub[0].id));
            }

            let topupPlanId: string;
            const topupPlanResult = await tx.select().from(subscriptionPlans)
              .where(eq(subscriptionPlans.name, "Top-Up")).limit(1);
            if (topupPlanResult.length > 0) {
              topupPlanId = topupPlanResult[0].id;
            } else {
              const [newPlan] = await tx.insert(subscriptionPlans).values({
                name: "Top-Up",
                validTotalMinutes: 60,
                validDays: 0,
                recordingsAvailableDays: 0,
                chunksCount: 0,
                offlineRecording: false,
                priceMonthly: 500,
                isVisible: false,
              }).returning();
              topupPlanId = newPlan.id;
            }

            await tx.insert(userSubscriptions).values({
              userId: topupUserId,
              planId: topupPlanId,
              status: "completed",
              minutesRemaining: String(topupMinutes),
              paymentToken: piId,
              validDateUpto: new Date(),
            });

            const newRemaining = newMinutesTotal - parseFloat(user.trialMinutesUsed || "0");
            console.log(`[Stripe Webhook] Top-up applied: userId=${topupUserId}, +${topupMinutes} mins, newTotal=${newMinutesTotal}, remaining=${newRemaining.toFixed(2)}`);
          });
        } else {
          console.log(`[Stripe Webhook] payment_intent.succeeded: non-topup PI ${paymentIntent.id}`);
        }
        break;
      }

      case "setup_intent.succeeded": {
        const setupIntentObj = event.data.object as any;
        const siMetadata = setupIntentObj.metadata || {};

        if (siMetadata.purpose === "update_payment_method" && siMetadata.userId) {
          const pmId = setupIntentObj.payment_method;
          const siCustomerId = setupIntentObj.customer;

          if (pmId && siCustomerId) {
            try {
              const stripeClient = await getStripeClient();

              await stripeClient.customers.update(siCustomerId, {
                invoice_settings: { default_payment_method: pmId as string },
              });

              const userResult = await db.select().from(users)
                .where(eq(users.id, siMetadata.userId))
                .limit(1);

              if (userResult.length > 0 && userResult[0].stripeSubscriptionId) {
                await stripeClient.subscriptions.update(userResult[0].stripeSubscriptionId, {
                  default_payment_method: pmId as string,
                });
                console.log(`[Stripe Webhook] setup_intent.succeeded: Updated default payment method for user ${siMetadata.userId}`);
              }
            } catch (pmErr: any) {
              console.error(`[Stripe Webhook] Failed to update payment method: ${pmErr.message}`);
            }
          }
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("[Stripe Webhook] Error:", error.message);
    res.status(400).json({ error: "Webhook processing failed" });
  }
}

app.post("/api/stripe-webhook", handleStripeWebhook);
app.post("/api/v1/m/stripe-webhook", handleStripeWebhook);

// ============ PUSH NOTIFICATIONS ============

// Register push token
async function handleRegisterPushToken(req: Request, res: Response, userId: string) {
  try {
    const { pushToken, platform, deviceId } = req.body;
    if (!pushToken) {
      return res.status(400).json({ success: false, error: "Push token is required" });
    }

    console.log(`[Push Token] Registering token for user ${userId}: ${pushToken.substring(0, 20)}...`);

    // Upsert: deactivate old tokens for this user/device, then insert or reactivate
    const existing = await db.select().from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.pushToken, pushToken)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(pushTokens)
        .set({ isActive: true, platform: platform || "expo", deviceId: deviceId || null, updatedAt: new Date() })
        .where(eq(pushTokens.id, existing[0].id));
    } else {
      await db.insert(pushTokens).values({
        userId,
        pushToken,
        platform: platform || "expo",
        deviceId: deviceId || null,
      });
    }

    res.json({ success: true, message: "Push token registered" });
  } catch (error: any) {
    console.error("[Push Token] Error:", error.message);
    res.status(500).json({ success: false, error: "Failed to register push token" });
  }
}

// Unregister push token (on logout)
async function handleUnregisterPushToken(req: Request, res: Response, userId: string) {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ success: false, error: "Push token is required" });
    }

    await db.update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.pushToken, pushToken)));

    res.json({ success: true, message: "Push token unregistered" });
  } catch (error: any) {
    console.error("[Push Token] Unregister error:", error.message);
    res.status(500).json({ success: false, error: "Failed to unregister push token" });
  }
}

app.post("/api/v1/m/push-token", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handleRegisterPushToken(req, res, userId);
});

app.delete("/api/v1/m/push-token", mobileAuthMiddleware, async (req: any, res) => {
  const jwtUser = (req as any).jwtUser;
  const userId = jwtUser?.userId || jwtUser?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Authentication required" });
  await handleUnregisterPushToken(req, res, userId);
});

// Send Expo push notification
async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: any) {
  const messages = tokens.map((token) => ({
    to: token,
    sound: "default" as const,
    title,
    body,
    data: data || {},
  }));

  // Expo Push API supports batches of up to 100
  const BATCH_SIZE = 100;
  const results: any[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      const result = await response.json();
      results.push(result);

      // Handle invalid tokens
      if (result.data) {
        for (let j = 0; j < result.data.length; j++) {
          const ticket = result.data[j];
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            const badToken = batch[j].to;
            console.log(`[Push] Deactivating invalid token: ${badToken.substring(0, 20)}...`);
            await db.update(pushTokens)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(pushTokens.pushToken, badToken));
          }
        }
      }
    } catch (err: any) {
      console.error(`[Push] Batch send failed:`, err.message);
    }
  }

  return results;
}

// Cron job: Check expiring subscriptions and send notifications
app.get("/api/cron/subscription-expiry-notifications", async (req: Request, res: Response) => {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET environment variable is not configured");
    return res.status(500).json({ error: "Cron not configured" });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("[Cron] Starting subscription expiry notification check...");

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Find all active subscriptions
    const activeSubscriptions = await db
      .select({
        subId: userSubscriptions.id,
        userId: userSubscriptions.userId,
        planId: userSubscriptions.planId,
        validDateUpto: userSubscriptions.validDateUpto,
        planName: subscriptionPlans.name,
      })
      .from(userSubscriptions)
      .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(eq(userSubscriptions.status, "active"));

    let sentCount = 0;
    let skippedCount = 0;

    for (const sub of activeSubscriptions) {
      if (!sub.validDateUpto) continue;

      const expiryDate = new Date(sub.validDateUpto);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / oneDayMs);

      // Determine notification type
      let notificationType: string | null = null;
      let notificationTitle = "";
      let notificationBody = "";

      if (daysUntilExpiry <= 2 && daysUntilExpiry > 0) {
        notificationType = "expiry_2days";
        notificationTitle = "Subscription Expiring Soon";
        notificationBody = `Your ${sub.planName || "subscription"} plan expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Renew now to keep your recording minutes!`;
      } else if (daysUntilExpiry <= 7 && daysUntilExpiry > 2) {
        notificationType = "expiry_7days";
        notificationTitle = "Subscription Reminder";
        notificationBody = `Your ${sub.planName || "subscription"} plan expires in ${daysUntilExpiry} days. Consider renewing to continue enjoying extended recording time.`;
      }

      if (!notificationType) continue;

      // Check if we already sent this notification type for this subscription
      const alreadySent = await db.select().from(notificationLog)
        .where(and(
          eq(notificationLog.userId, sub.userId),
          eq(notificationLog.notificationType, notificationType),
          eq(notificationLog.subscriptionId, sub.subId),
        ))
        .limit(1);

      if (alreadySent.length > 0) {
        skippedCount++;
        continue;
      }

      // Get active push tokens for this user
      const userTokens = await db.select().from(pushTokens)
        .where(and(
          eq(pushTokens.userId, sub.userId),
          eq(pushTokens.isActive, true),
        ));

      if (userTokens.length === 0) {
        console.log(`[Cron] No active push tokens for user ${sub.userId}, skipping`);
        skippedCount++;
        continue;
      }

      const tokenStrings = userTokens.map((t) => t.pushToken);

      // Send push notification
      await sendExpoPushNotifications(tokenStrings, notificationTitle, notificationBody, {
        type: "subscription_expiry",
        subscriptionId: sub.subId,
        daysRemaining: daysUntilExpiry,
      });

      // Log the notification
      await db.insert(notificationLog).values({
        userId: sub.userId,
        notificationType,
        subscriptionId: sub.subId,
        status: "sent",
        message: notificationBody,
      });

      sentCount++;
      console.log(`[Cron] Sent ${notificationType} notification to user ${sub.userId} (expires in ${daysUntilExpiry} days)`);
    }

    // Also check trial expiry (trialEndsAt on user record)
    // Only fetch users with trials expiring within the next 7 days
    const usersWithTrials = await db.select().from(users)
      .where(and(
        eq(users.trialUsed, false),
        gte(users.trialEndsAt, now),
        sql`${users.trialEndsAt} <= ${sevenDaysFromNow}`,
      ));

    for (const user of usersWithTrials) {
      if (!user.trialEndsAt) continue;

      const trialExpiry = new Date(user.trialEndsAt);
      const daysUntilExpiry = Math.ceil((trialExpiry.getTime() - now.getTime()) / oneDayMs);

      let notificationType: string | null = null;
      let notificationTitle = "";
      let notificationBody = "";

      if (daysUntilExpiry <= 2 && daysUntilExpiry > 0) {
        notificationType = "trial_expiry_2days";
        notificationTitle = "Trial Ending Soon";
        notificationBody = `Your free trial expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Subscribe now to keep recording!`;
      } else if (daysUntilExpiry <= 7 && daysUntilExpiry > 2) {
        notificationType = "trial_expiry_7days";
        notificationTitle = "Trial Reminder";
        notificationBody = `Your free trial expires in ${daysUntilExpiry} days. Subscribe to continue enjoying MyVoicePost.`;
      }

      if (!notificationType) continue;

      const alreadySent = await db.select().from(notificationLog)
        .where(and(
          eq(notificationLog.userId, user.id),
          eq(notificationLog.notificationType, notificationType),
        ))
        .limit(1);

      if (alreadySent.length > 0) {
        skippedCount++;
        continue;
      }

      const userTokens = await db.select().from(pushTokens)
        .where(and(
          eq(pushTokens.userId, user.id),
          eq(pushTokens.isActive, true),
        ));

      if (userTokens.length === 0) {
        skippedCount++;
        continue;
      }

      const tokenStrings = userTokens.map((t) => t.pushToken);

      await sendExpoPushNotifications(tokenStrings, notificationTitle, notificationBody, {
        type: "trial_expiry",
        daysRemaining: daysUntilExpiry,
      });

      await db.insert(notificationLog).values({
        userId: user.id,
        notificationType,
        status: "sent",
        message: notificationBody,
      });

      sentCount++;
      console.log(`[Cron] Sent ${notificationType} notification to user ${user.id} (trial expires in ${daysUntilExpiry} days)`);
    }

    console.log(`[Cron] Notifications done. Sent: ${sentCount}, Skipped: ${skippedCount}`);

    // --- Renewal reminder emails (3 days before Stripe charges) ---
    let renewalRemindersSent = 0;
    try {
      const stripeClient = await getStripeClient();
      const usersWithSubs = await db.select({
        userId: users.id,
        email: users.email,
        stripeSubscriptionId: users.stripeSubscriptionId,
      }).from(users)
        .where(and(
          sql`${users.stripeSubscriptionId} IS NOT NULL`,
          sql`${users.stripeSubscriptionId} != ''`,
        ));

      for (const u of usersWithSubs) {
        if (!u.stripeSubscriptionId || !u.email) continue;

        try {
          const stripeSub = await stripeClient.subscriptions.retrieve(u.stripeSubscriptionId);
          if ((stripeSub.status !== "active" && stripeSub.status !== "trialing") || stripeSub.cancel_at_period_end) continue;

          const periodEnd = new Date((stripeSub as any).current_period_end * 1000);
          const daysUntilRenewal = Math.ceil((periodEnd.getTime() - now.getTime()) / oneDayMs);

          if (daysUntilRenewal === 3) {
            const renewalKey = `renewal_${u.stripeSubscriptionId}_${periodEnd.toISOString().split('T')[0]}`;
            const existingLog = await db.select().from(notificationLog)
              .where(and(
                eq(notificationLog.userId, u.userId),
                eq(notificationLog.notificationType, "renewal_reminder_3days"),
                eq(notificationLog.message, renewalKey),
              )).limit(1);

            if (existingLog.length === 0) {
              const priceItem = stripeSub.items?.data?.[0];
              const amount = priceItem?.price?.unit_amount
                ? `$${(priceItem.price.unit_amount / 100).toFixed(2)}`
                : "your subscription fee";
              const planName = priceItem?.price?.nickname || "Starter";

              await sendRenewalReminderEmail(u.email, planName, periodEnd, amount);

              await db.insert(notificationLog).values({
                userId: u.userId,
                notificationType: "renewal_reminder_3days",
                status: "sent",
                message: renewalKey,
              });

              renewalRemindersSent++;
              console.log(`[Cron] Sent renewal reminder to user ${u.userId} (renews in ${daysUntilRenewal} days)`);
            }
          }
        } catch (subErr: any) {
          console.warn(`[Cron] Could not check Stripe sub for user ${u.userId}: ${subErr.message}`);
        }
      }
      console.log(`[Cron] Renewal reminders sent: ${renewalRemindersSent}`);
    } catch (renewalErr: any) {
      console.error(`[Cron] Renewal reminder check error: ${renewalErr.message}`);
    }

    // --- Cleanup tasks ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Remove expired password reset tokens
    const expiredTokensResult = await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, now));
    const expiredTokensCount = expiredTokensResult.count ?? 0;
    console.log(`[Cron] Cleaned up ${expiredTokensCount} expired password reset tokens`);

    // 2. Remove audio log records older than 30 days
    const oldAudioResult = await db.delete(audioLogs)
      .where(lt(audioLogs.createdAt, thirtyDaysAgo));
    const oldAudioCount = oldAudioResult.count ?? 0;
    console.log(`[Cron] Cleaned up ${oldAudioCount} audio log records older than 30 days`);

    // 3. Remove saved texts records older than 30 days
    const oldTextsResult = await db.delete(savedTexts)
      .where(lt(savedTexts.createdAt, thirtyDaysAgo));
    const oldTextsCount = oldTextsResult.count ?? 0;
    console.log(`[Cron] Cleaned up ${oldTextsCount} saved text records older than 30 days`);

    console.log(`[Cron] All tasks complete.`);
    res.json({
      success: true,
      notifications: { sent: sentCount, skipped: skippedCount },
      renewalReminders: renewalRemindersSent,
      cleanup: {
        expiredTokens: expiredTokensCount,
        oldAudioLogs: oldAudioCount,
        oldSavedTexts: oldTextsCount,
      },
    });
  } catch (error: any) {
    console.error("[Cron] Notification check error:", error.message);
    res.status(500).json({ success: false, error: "Notification check failed" });
  }
});

// Admin check middleware - only allows users whose email is in admin_mail list
async function adminCheckMiddleware(req: any, res: any, next: any) {
  try {
    const adminEmails = await getAdminEmails();
    const userEmail = req.user?.email;
    if (!userEmail || !adminEmails.map((e: string) => e.toLowerCase()).includes(userEmail.toLowerCase())) {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }
    next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Authorization check failed" });
  }
}

// GET /api/v1/m/app-settings/admin-mail - Get admin email addresses (admin only)
app.get("/api/v1/m/app-settings/admin-mail", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
  try {
    const result = await db.select().from(appSettings)
      .where(eq(appSettings.settingKey, "admin_mail"))
      .limit(1);
    const emails = result.length > 0 ? result[0].settingValue : "";
    res.json({ success: true, adminMail: emails });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/m/app-settings/admin-mail - Update admin email addresses (admin only)
app.put("/api/v1/m/app-settings/admin-mail", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
  try {
    const { adminMail } = req.body;
    if (typeof adminMail !== "string") {
      return res.status(400).json({ success: false, error: "adminMail must be a string of comma-separated emails" });
    }

    const emails = adminMail.split(",").map((e: string) => e.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of emails) {
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: `Invalid email address: ${email}` });
      }
    }

    const existing = await db.select().from(appSettings)
      .where(eq(appSettings.settingKey, "admin_mail"))
      .limit(1);

    if (existing.length > 0) {
      await db.update(appSettings)
        .set({ settingValue: emails.join(","), updatedAt: new Date() })
        .where(eq(appSettings.settingKey, "admin_mail"));
    } else {
      await db.insert(appSettings).values({
        settingKey: "admin_mail",
        settingValue: emails.join(","),
      });
    }

    res.json({ success: true, adminMail: emails.join(",") });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/m/crash-report - Mobile app crash/error reporting (rate limited)
const crashReportRateLimit: Record<string, { count: number; resetAt: number }> = {};
const CRASH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CRASH_RATE_LIMIT_MAX = 5;

app.post("/api/v1/m/crash-report", async (req: any, res) => {
  try {
    const clientIp = req.headers["x-forwarded-for"] || req.ip || "unknown";
    const now = Date.now();
    if (!crashReportRateLimit[clientIp] || crashReportRateLimit[clientIp].resetAt < now) {
      crashReportRateLimit[clientIp] = { count: 0, resetAt: now + CRASH_RATE_LIMIT_WINDOW_MS };
    }
    crashReportRateLimit[clientIp].count++;
    if (crashReportRateLimit[clientIp].count > CRASH_RATE_LIMIT_MAX) {
      return res.status(429).json({ success: false, error: "Too many crash reports. Please try again later." });
    }

    const { errorMessage, stackTrace, deviceInfo, appVersion, userId } = req.body;
    if (!errorMessage || typeof errorMessage !== "string") {
      return res.status(400).json({ success: false, error: "errorMessage is required" });
    }

    const safeErrorMessage = errorMessage.substring(0, 2000);
    const safeStackTrace = typeof stackTrace === "string" ? stackTrace.substring(0, 10000) : undefined;
    const safeDeviceInfo = typeof deviceInfo === "string" ? deviceInfo.substring(0, 500) : undefined;
    const safeAppVersion = typeof appVersion === "string" ? appVersion.substring(0, 20) : undefined;

    console.error(`[MOBILE CRASH] ${safeErrorMessage}`);

    sendCrashReportEmail({
      source: "mobile",
      errorMessage: safeErrorMessage,
      stackTrace: safeStackTrace,
      deviceInfo: safeDeviceInfo,
      appVersion: safeAppVersion,
    }).catch(err => console.error("[MOBILE CRASH] Email error:", err.message));

    res.json({ success: true, message: "Crash report received" });
  } catch (error: any) {
    console.error("[MOBILE CRASH] Error processing report:", error.message);
    res.status(500).json({ success: false, error: "Failed to process crash report" });
  }
});

// GET /api/v1/m/crash-reports - Get recent crash reports (admin only)
app.get("/api/v1/m/crash-reports", mobileAuthMiddleware, adminCheckMiddleware, async (req: any, res) => {
  try {
    const reports = await db.select().from(crashReports)
      .orderBy(desc(crashReports.createdAt))
      .limit(50);
    res.json({ success: true, reports });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PROCESS ENDPOINTS - URL text extraction & audio transcription + translation
// ============================================================

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function extractYouTubeTranscript(url: string): Promise<{ text: string; detectedLanguage: string }> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error("No transcript available for this video");
    }
    const text = transcriptItems.map((item: any) => item.text).join(" ").replace(/\s+/g, " ").trim();
    if (!text) throw new Error("Transcript is empty");
    return { text, detectedLanguage: "auto" };
  } catch (error: any) {
    if (error.message.includes("No transcript")) throw error;
    throw new Error(`Failed to extract YouTube transcript: ${error.message}`);
  }
}

async function extractWebpageText(url: string): Promise<{ text: string; detectedLanguage: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MyVoicePost/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, iframe, noscript, .sidebar, .menu, .nav, .footer, .header, .ad, .advertisement, [role='navigation'], [role='banner'], [role='contentinfo']").remove();

  let mainText = "";
  const mainSelectors = ["article", "main", '[role="main"]', ".post-content", ".entry-content", ".article-body", ".story-body"];
  for (const sel of mainSelectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 100) {
      mainText = el.text().trim();
      break;
    }
  }
  if (!mainText) {
    mainText = $("body").text().trim();
  }

  mainText = mainText.replace(/\s+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (mainText.length > 15000) mainText = mainText.substring(0, 15000);
  if (!mainText || mainText.length < 20) throw new Error("Could not extract meaningful text from the URL");
  
  const htmlLang = $("html").attr("lang") || "";
  const detectedLanguage = htmlLang ? htmlLang.substring(0, 2).toLowerCase() : "auto";
  return { text: mainText, detectedLanguage };
}

async function detectTextLanguage(text: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return "en";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Detect the language of this text and return the ISO 639-1 two-letter language code only (e.g. "en", "es", "fr"). Text: "${text.substring(0, 500)}"`,
      config: { temperature: 0 },
    });
    const code = (response.text || "en").trim().toLowerCase().replace(/[^a-z]/g, "").substring(0, 2);
    return code || "en";
  } catch { return "en"; }
}

app.post("/api/v1/p/process-url", async (req, res) => {
  try {
    const schema = z.object({
      url: z.string().url("Valid URL is required"),
      targetLanguage: z.string().min(1, "Target language is required"),
    });
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: "Invalid request", details: parseResult.error.errors });
    }
    const { url, targetLanguage } = parseResult.data;
    console.log(`[DEBUG /p/process-url] INPUT: url=${url}, targetLanguage=${targetLanguage}`);

    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
    let extracted: { text: string; detectedLanguage: string };
    
    if (isYouTube) {
      extracted = await extractYouTubeTranscript(url);
    } else {
      extracted = await extractWebpageText(url);
    }

    let sourceLanguage = extracted.detectedLanguage;
    if (sourceLanguage === "auto") {
      sourceLanguage = await detectTextLanguage(extracted.text);
    }

    let translatedText = extracted.text;
    if (sourceLanguage !== targetLanguage) {
      const result = await translateAndPolish(extracted.text, sourceLanguage, targetLanguage, "professional");
      translatedText = result.polishedText || result.translatedText || extracted.text;
    }

    console.log(`[DEBUG /p/process-url] OUTPUT: success=true, sourceLen=${extracted.text.length}, targetLen=${translatedText.length}, sourceLang=${sourceLanguage}`);
    res.json({
      success: true,
      sourceText: extracted.text,
      targetText: translatedText,
      sourceLanguage,
      targetLanguage,
      sourceType: isYouTube ? "youtube" : "webpage",
    });
  } catch (error: any) {
    console.error("[DEBUG /p/process-url] ERROR:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to process URL" });
  }
});

app.post("/api/v1/m/process-url", mobileAuthMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      url: z.string().url("Valid URL is required"),
      targetLanguage: z.string().min(1, "Target language is required"),
    });
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: "Invalid request", details: parseResult.error.errors });
    }
    const { url, targetLanguage } = parseResult.data;
    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/process-url] INPUT: userId=${userId}, url=${url}, targetLanguage=${targetLanguage}`);

    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
    let extracted: { text: string; detectedLanguage: string };
    
    if (isYouTube) {
      extracted = await extractYouTubeTranscript(url);
    } else {
      extracted = await extractWebpageText(url);
    }

    let sourceLanguage = extracted.detectedLanguage;
    if (sourceLanguage === "auto") {
      sourceLanguage = await detectTextLanguage(extracted.text);
    }

    let translatedText = extracted.text;
    if (sourceLanguage !== targetLanguage) {
      const result = await translateAndPolish(extracted.text, sourceLanguage, targetLanguage, "professional");
      translatedText = result.polishedText || result.translatedText || extracted.text;
    }

    console.log(`[DEBUG /m/process-url] OUTPUT: success=true, sourceLen=${extracted.text.length}, targetLen=${translatedText.length}`);
    res.json({
      success: true,
      sourceText: extracted.text,
      targetText: translatedText,
      sourceLanguage,
      targetLanguage,
      sourceType: isYouTube ? "youtube" : "webpage",
    });
  } catch (error: any) {
    console.error("[DEBUG /m/process-url] ERROR:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to process URL" });
  }
});

app.post("/api/v1/m/process-audio", mobileAuthMiddleware, async (req, res) => {
  try {
    const { audioBase64, mimeType, targetLanguage } = req.body || {};
    if (!targetLanguage) {
      return res.status(400).json({ success: false, error: "Target language is required" });
    }
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: "Audio data is required" });
    }

    const audioMimeType = mimeType || "audio/webm";
    if (!PROCESS_AUDIO_CFG.isAudioTypeSupported(audioMimeType)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported audio type: ${audioMimeType}. Supported: ${PROCESS_AUDIO_CFG.PROCESS_AUDIO_SUPPORTED_TYPES.join(", ")}`,
      });
    }

    const rawByteLength = Math.ceil(audioBase64.length * 3 / 4);
    if (rawByteLength > PROCESS_AUDIO_CFG.PROCESS_AUDIO_MAX_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Audio file too large. Maximum size is ${PROCESS_AUDIO_CFG.formatMaxSize()}.`,
      });
    }

    const jwtUser = (req as any).jwtUser;
    const userId = jwtUser?.userId || jwtUser?.id;
    console.log(`[DEBUG /m/process-audio] INPUT: userId=${userId}, targetLanguage=${targetLanguage}, audioLength=${audioBase64.length}, mimeType=${audioMimeType}`);

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const transcribedText = await transcribeAudio(audioBuffer, audioMimeType);
    const sourceLanguage = await detectTextLanguage(transcribedText);

    let translatedText = transcribedText;
    if (sourceLanguage !== targetLanguage) {
      const result = await translateAndPolish(transcribedText, sourceLanguage, targetLanguage, "professional");
      translatedText = result.polishedText || result.translatedText || transcribedText;
    }

    console.log(`[DEBUG /m/process-audio] OUTPUT: success=true, sourceLen=${transcribedText.length}, targetLen=${translatedText.length}`);
    res.json({
      success: true,
      sourceText: transcribedText,
      targetText: translatedText,
      sourceLanguage,
      targetLanguage,
      sourceType: "audio",
    });
  } catch (error: any) {
    console.error("[DEBUG /m/process-audio] ERROR:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to process audio" });
  }
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);

  sendCrashReportEmail({
    source: "backend",
    errorMessage: err.message || "Unknown server error",
    stackTrace: err.stack,
    endpoint: `${req.method} ${req.originalUrl}`,
  }).catch(emailErr => console.error("[CRASH REPORT] Failed to send:", emailErr.message));

  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// Vercel function config
export const config = {
  maxDuration: 30,
};

// Export for Vercel
export default (req: VercelRequest, res: VercelResponse) => {
  return app(req as any, res as any);
};
