# MyVoicePost - Voice-to-Text AI Application

## Overview

MyVoicePost is a voice-to-text AI application that converts spoken words into polished, formatted content. It supports various output formats (messages, notes, emails, posts, journals) and customizable tones (professional, casual, formal, friendly). The application also offers multi-language translation and transcription, aiming to streamline content creation, communication, and note-taking through voice input. It targets users needing quick thought capture, content generation, or cross-language communication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Web)

The web frontend is built with React 18 and TypeScript using Vite, featuring `shadcn/ui` components based on Radix UI, styled with Tailwind CSS, and animated with Framer Motion. Wouter handles client-side routing. The web app mirrors the mobile app's functionality:

**Pages:**
- `/` — Landing page with hero, features, testimonials
- `/polish` — Text polishing with voice recording, language/tone/type selection
- `/translate` — Translation with voice recording, source/target language, tone
- `/process` — Audio transcription (URL or file upload) with tone transformation and save
- `/saved` — View, search, edit, and delete saved items (auth required)
- `/dashboard` — Admin dashboard: users, subscriptions, payments, support, errors (ADMIN role only)
- `/login` — Login with email or username
- `/signup` — Registration with email OTP verification
- `/pricing`, `/privacy`, `/terms`, `/affiliate` — Marketing pages

**Key Components:**
- `AppLayout` (`client/src/components/AppLayout.tsx`) — Shared nav header for app pages (Polish, Translate, Transcribe, Saved, Dashboard)
- `WebVoiceRecorder` (`client/src/components/WebVoiceRecorder.tsx`) — Browser-based voice recorder using MediaRecorder API with chunked processing (60s intervals), used in Polish and Translate pages
- Landing page Header (`client/src/components/landing/Header.tsx`) — Nav for public/marketing pages

### Backend

The backend is an Express.js application handling RESTful API endpoints. It processes audio file uploads via Multer and uses JSON for requests/responses. Core services include Transcription, Translation, and Polishing, all leveraging AI integration. Google Gemini AI is the primary AI service, with OpenAI as an alternative. Request processing includes audio validation, Zod schema validation, and robust error handling.

### Data Storage

PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, is used for data persistence. The schema includes tables for users and translation results, with an in-memory fallback for development. Session management is handled by Express sessions with a PostgreSQL store.

### Authentication & Authorization

The system uses JWT-based authentication with a session fallback. JWTs have a 7-day expiry. Passwords are hashed with bcryptjs, and email OTP verification is required for registration. Role-Based Access Control (RBAC) defines `GUEST`, `TRIAL`, `USER`, and `ADMIN` roles, with transitions based on subscription status. `refreshUserRole` and `checkRole` middleware enforce access. `checkUserAccess()` grants access via trial, active subscription, or ADMIN role bypass. Both `server/routes.ts` and `api/index.ts` must stay in sync for this logic.

### Unified TextResultCard Component

All text outputs across the mobile app (polished, translated, transcribed, toned text) use a single `TextResultCard` component (`mobile/src/components/TextResultCard.tsx`). Each card provides a consistent set of actions:
- **Play** — text-to-speech with language detection
- **Copy** — clipboard with confirmation
- **Edit** — inline editing (authenticated users)
- **Share** — smart share (text only, or text/image/both choice when image exists)
- **Save** — persist to saved items
- **Image** — AI image generation from text content, with download/share/regenerate

This replaces the old `ResultDisplay` component. Screens using it:
- Polish (`mobile/app/(tabs)/index.tsx`): Original + Polished cards
- Translate (`mobile/app/(tabs)/translate.tsx`): Original + Translation + Polished cards
- Transcribe (`mobile/app/(tabs)/process.tsx`): Source + Translated + Transformed cards

### Web TextResultCard Component

The web app has full feature parity with mobile via `WebTextResultCard` (`client/src/components/WebTextResultCard.tsx`). Each card provides:
- **Play** — TTS via Web SpeechSynthesis API with language mapping for 30+ languages
- **Copy** — Clipboard with visual confirmation
- **Share** — Web Share API with clipboard fallback
- **Edit** — Inline editing toggle with save/cancel
- **Save** — Persist to saved items (authenticated users only)

Used in all web result pages:
- Polish (`client/src/pages/Polish.tsx`): Original + Polished cards
- Translate (`client/src/pages/Translate.tsx`): Original + Translation + Polished cards
- Process (`client/src/pages/Process.tsx`): Transcribed + Transformed result cards with language selector

Process page includes an output language selector using `supportedLanguages` from shared schema. The selected language is sent as `targetLanguage` to the process-url endpoint and used for TTS playback language.

### Unified API Endpoints

Web and mobile share the exact same backend handlers:
- **Public (shared)**: `/api/v1/p/*` — transcribe, polish, translate, tone-categories, process-url, auth/login, auth/signup, mail_otp, auth/google, stripe-config, plans
- **Authenticated**: `/api/v1/a/*` — used by both web and mobile for auth features: saved-texts, settings, subscription, payment, admin/*, support, error-log, auth/logout, auth/me, transcribe, polish, translate
- **Web-specific public**: `/api/v1/wp/*` — web-only endpoints (e.g., `/api/v1/wp/auth/google/config` for GSI client ID)
- **Admin**: `/api/v1/a/admin/*` — dashboard stats, users, subscriptions, payments, support, errors (ADMIN role required)
- **Stripe**: `/api/v1/a/stripe-webhook`, `/api/v1/a/create-subscription`, etc.
- **Health**: `GET /api/health` — server health check (only non-v1 endpoint remaining)
- **Backward compat**: `/api/v1/m/*` requests are URL-rewritten to `/api/v1/a/*` via middleware (temporary, for mobile app transition)

Audio is sent as base64 JSON (`{ audio: base64, mimeType }`) from both web and mobile.
Public endpoints accept `text` field; auth endpoints accept both `originalText` and `text` for polish/translate (backward compatible).
Auth endpoints return `{ success, savedTexts }` wrapper format.
Web frontend uses JWT Bearer tokens from localStorage (`mvp_auth_token`) for `/api/v1/a/*` endpoints.
Landing page VoiceRecorder uses two-step flow (transcribe ? polish/translate) via `/api/v1/p/*` public endpoints.

### Shared Constants & Reusable Utilities

Shared constants and helpers are centralized to avoid duplication across pages:

- **`shared/schema.ts`**: Exports `supportedLanguages`, `OUTPUT_FORMATS`, `OUTPUT_TYPES`, `getLanguageName()` — used by VoiceRecorder, Polish, Translate, and Process pages
- **`client/src/components/LanguageSelect.tsx`**: Reusable language dropdown component wrapping `supportedLanguages`, used by Polish, Translate, and Process pages
- **`client/src/hooks/use-save-text.ts`**: `useSaveTextMutation()` hook for saving text results to `/api/v1/a/saved-texts` with JWT auth, cache invalidation and toast feedback, used by Polish, Translate, and Process pages

### Theme Persistence (Mobile)

Color theme is only available to authenticated users. Guests always see the default Indigo theme.

**Storage**: Dual persistence — AsyncStorage (local, fast startup) + `mvp_user_settings` table (DB, cross-device sync via JWT-authenticated `/api/v1/a/settings` endpoint).

**Startup flow** (authenticated users):
1. Read AsyncStorage for instant theme application
2. Fetch from DB (source of truth) and overwrite local if DB has a theme
3. If DB has no theme but local exists, push local to DB (migration from older version)

**On theme change**: Write to both AsyncStorage and DB simultaneously.
**On logout**: Clear AsyncStorage, reset to default Indigo theme.

**Provider ordering**: `AuthProvider` ? `AuthAwareThemeProvider` ? rest of app (ThemeProvider receives `isAuthenticated` prop from AuthContext).

### AI Processing Pipeline

The Transcription flow involves client-side audio recording, upload to the backend, validation, and AI-powered transcription. The Translation & Polishing flow takes transcribed text and applies user-specified parameters (languages, format, tone) using AI to generate polished output. The pipeline includes retry mechanisms with `p-retry` and concurrency control with `p-limit`.

### Build & Deployment

The build process uses Vite for the React frontend and esbuild for the Node.js backend. Development features include Vite's HMR and custom middleware. Production configurations focus on static file serving and environment-based settings. Database migrations are managed with Drizzle Kit.

### Trial & Subscription System

New users receive a 7-day trial with 90 minutes of recording. Subscription plans (Starter, Pro) manage user access and features.

**Single Source of Truth**: `mvp_user_subscriptions` table stores subscription status (active, cancelled, payment_failed, superseded). `mvp_users` stores trial-only data (trialEndsAt, trialMinutesUsed, trialMinutesTotal). Access is determined by `checkUserAccess()` which reads from BOTH tables — trial from `mvp_users`, subscription from `mvp_user_subscriptions`.

**Role Derivation**: User role (`GUEST`, `TRIAL`, `USER`, `ADMIN`) is derived from subscription/trial state via `refreshUserRole()`. This function is called after every subscription state change (subscribe, webhook events: invoice.paid, invoice.payment_failed, subscription.updated, subscription.deleted).

**Mobile Subscription Flow**: After payment completion, `SubscriptionScreen` calls `refreshAfterSubscription()` which updates both the SubscriptionContext (used by ChunkedVoiceRecorder for access checks) and local screen state. `SubscriptionContext.checkAccess()` updates both `trial` and `subscription` state from the server response.

### Email OTP Verification

During registration, users must verify their email with a 6-digit OTP sent via SMTP. The OTP expires in 10 minutes and is verified before account creation.

### Crash-Resilient Recording Persistence

The mobile application implements a crash-resilient recording system that writes audio segments to disk every 5 seconds, using sentinel files to track session status. This allows for recovery of recordings after crashes or unexpected interruptions. A `RecoveryModal` guides users through recovering or discarding unfinalized sessions on app boot.

### Battery Profile System

A battery profile system allows users to select between Power Saver, Balanced (default), and Real-time modes, which adjust polling intervals, background synchronization, and animations to optimize battery usage. A warning is displayed for high battery usage in Real-time mode.

## Location Tracker System (mobile_loc/)

A separate full-stack location tracking system in `mobile_loc/` folder, completely isolated from the main MyVoicePost application.

### Architecture
- **Backend**: Python FastAPI on port 8001 (spawned from main Express server)
- **Database**: SQLite (`mobile_loc/backend/tracker.db`) - separate from main app's PostgreSQL
- **Web Admin UI**: Vanilla HTML/CSS/JS served by FastAPI at `/ui/`
- **Port mapping**: Internal port 8001 ? External port 3000

### Backend Structure (mobile_loc/backend/)
- `main.py` - FastAPI app with CORS, static files, API router
- `db/database.py` - SQLite schema (users, profiles, groups, members, invitations, subscriptions, notifications)
- `core/config.py` - JWT settings, `core/security.py` - JWT/password utils
- `api/` - Route modules: auth, profiles, groups, members, invitations, subscriptions, deps
- `models/schemas.py` - Pydantic request/response models

### API Endpoints (prefix: /api/v1/)
- Auth: POST `/sendotp/`, POST `/verifyotp/`, POST `/refresh-token/`
- Profiles: POST/PUT `/profiles/`, GET `/profile-details/`
- Groups: GET/POST `/groups/`, GET `/groups/{id}`, PUT `/groups/{id}`, DELETE `/groups/{id}`
- Members: GET `/group-members/{group_id}`, POST `/group-members/location/`, DELETE `/group-members/{group_id}/{user_id}`
- Invitations: POST `/invitations/`, GET `/invitations/sent/`, GET `/invitations/received/`, POST `/invitations/{id}/accept`, POST `/invitations/{id}/reject`
- Subscriptions: GET `/packages/`, POST `/subscribe/`, GET `/subscription/`

### Web UI (mobile_loc/ui/)
- `index.html` - Login with OTP
- `home.html` - Dashboard with tabs: Profile, Groups, Map (Leaflet), Invitations, Subscriptions

## External Dependencies

### Third-Party Services

- **Replit AI Integrations (Google Gemini)**: Primary AI service for transcription and text polishing.
- **OpenAI API**: Alternative AI service for transcription and text polishing (requires API key).
- **Neon PostgreSQL**: Serverless PostgreSQL database.
- **Stripe**: For subscription management and payment processing.
- **SMTP Service**: For sending email OTPs and other notifications.

### Key NPM Packages

- **UI & Styling**: `@radix-ui/*`, `tailwindcss`, `framer-motion`, `class-variance-authority`, `cmdk`.
- **Backend Core**: `express`, `multer`, `cors`, `express-rate-limit`, `express-session`.
- **Data & Validation**: `drizzle-orm`, `drizzle-zod`, `zod`, `@neondatabase/serverless`.
- **AI Integration**: `@google/genai`, `openai`.
- **Utilities**: `date-fns`, `nanoid`, `p-limit`, `p-retry`.