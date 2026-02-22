# MyVoicePost - Voice-to-Text AI Application

## Overview

MyVoicePost is a voice-to-text AI application that transforms spoken words into polished, well-written content. The application supports multiple output formats (messages, notes, emails, posts, journals) with customizable tones (professional, casual, formal, friendly). It also features multi-language translation and transcription capabilities.

The application targets users who need to quickly capture thoughts, create content, or communicate across language barriers using voice input. Key use cases include note-taking, communication (emails/messages), content creation, and journaling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript using Vite as the build tool

**UI Component System**: 
- shadcn/ui components built on Radix UI primitives
- Tailwind CSS for styling with custom design system
- Framer Motion for animations and transitions
- Design follows a "New York" style with neutral base colors and custom theme variables

**State Management**:
- TanStack Query (React Query) for server state and API data fetching
- React hooks for local component state
- No global state management library (Redux/Zustand) - keeping state local and close to components

**Routing**:
- Wouter for lightweight client-side routing
- Single-page application with minimal routes (Home page and 404)

**Key Frontend Features**:
- Voice recording with real-time transcription
- Language selection and translation interface
- Output format and tone customization
- Copy-to-clipboard functionality
- Responsive design for mobile and desktop

### Backend Architecture

**Framework**: Express.js on Node.js

**API Design**:
- RESTful endpoints under `/api` prefix
- Multipart form data handling for audio file uploads (via Multer)
- JSON request/response format
- Health check endpoint for monitoring

**Key Backend Services**:
1. **Transcription Service**: Converts audio files to text
2. **Translation Service**: Translates transcribed text between languages
3. **Polishing Service**: Applies tone and format transformations to text

**AI Integration**:
- Primary: Google Gemini AI via Replit AI Integrations service
- Secondary: OpenAI API (requires API key configuration)
- The application uses Gemini by default through Replit's managed service (no API key required)
- OpenAI integration is available but requires manual configuration

**Request Processing**:
- Audio file validation (type and size limits up to 25MB)
- Schema validation using Zod
- Error handling with detailed error responses

### Data Storage Solutions

**Database**: PostgreSQL via Neon serverless driver

**ORM**: Drizzle ORM for type-safe database operations

**Schema Design**:
- Users table: Basic user authentication (username, password, UUID primary key)
- Translation results storage: Stores transcription and translation history
- In-memory fallback: MemStorage class provides in-memory storage for development/testing

**Session Management**: 
- Express sessions with PostgreSQL session store (connect-pg-simple)
- Alternative memory store for development

### Authentication & Authorization

**Strategy**: Local username/password authentication

**Implementation**:
- Passport.js for authentication middleware
- Session-based authentication (no JWT)
- Password storage (implementation details not visible in shared code)

**User Flow**:
- User registration and login
- Session persistence across requests
- Protected API endpoints (if needed)

### AI Processing Pipeline

**Transcription Flow**:
1. Client records audio via browser MediaRecorder API
2. Audio uploaded as multipart form data to `/api/translate-speech`
3. Backend validates audio file format and size
4. Audio sent to AI service for transcription
5. Transcribed text returned to client

**Translation & Polishing Flow**:
1. Transcribed text processed with user-specified parameters:
   - Source language
   - Target language
   - Output format (message, note, email, post, journal)
   - Tone (professional, casual, formal, friendly)
2. AI service applies transformations
3. Polished output returned to client

**Retry & Error Handling**:
- p-retry library for automatic retry on API failures
- Rate limiting with p-limit for concurrent requests
- AbortError for unrecoverable failures

### Build & Deployment

**Build Process**:
- Client: Vite builds React app to `dist/public`
- Server: esbuild bundles server code to `dist/index.cjs`
- Custom build script handles both client and server compilation
- Dependency bundling strategy: allowlist for specific packages to reduce cold start times

**Development Setup**:
- Vite dev server with HMR
- Custom middleware mode integration with Express
- Replit-specific plugins for development experience

**Production Configuration**:
- Static file serving from built client
- Environment-based configuration (NODE_ENV)
- Database migrations via Drizzle Kit

## External Dependencies

### Third-Party Services

**AI Services**:
- **Replit AI Integrations (Gemini)**: Primary AI service for transcription and text polishing (billed to Replit credits, no API key required)
- **OpenAI API**: Alternative AI service requiring manual API key configuration (`OPENAI_API_KEY` environment variable)

**Database**:
- **Neon PostgreSQL**: Serverless PostgreSQL database (`DATABASE_URL` environment variable required)

### Key NPM Packages

**UI & Styling**:
- `@radix-ui/*`: Headless UI components (accordion, dialog, dropdown, select, etc.)
- `tailwindcss`: Utility-first CSS framework
- `framer-motion`: Animation library
- `class-variance-authority`: Variant-based styling
- `cmdk`: Command menu component

**Backend Core**:
- `express`: Web framework
- `multer`: File upload handling
- `cors`: Cross-origin resource sharing
- `express-rate-limit`: API rate limiting
- `express-session`: Session management

**Data & Validation**:
- `drizzle-orm`: TypeScript ORM
- `drizzle-zod`: Schema validation
- `zod`: Runtime type validation
- `@neondatabase/serverless`: Neon PostgreSQL driver

**AI Integration**:
- `@google/genai`: Google Generative AI SDK
- `openai`: OpenAI API client

**Utilities**:
- `date-fns`: Date manipulation
- `nanoid`: Unique ID generation
- `p-limit`: Concurrency control
- `p-retry`: Retry logic with exponential backoff

### Trial & Subscription System

**Trial System** (implemented Feb 2026):
- New users get a 7-day trial with 90 minutes of recording
- Trial expires when either 7 days pass OR 90 minutes consumed
- Trial fields on `mvp_users`: `trial_starts_at`, `trial_ends_at`, `trial_used`, `trial_minutes_total`, `trial_minutes_used`
- On trial expiry, user is auto-assigned the default plan (Starter) with `pending_payment` status
- If user subscribes during trial, remaining trial minutes carry forward to subscription

**Subscription Plans** (`mvp_subscription_plans`):
- Free (hidden, is_visible=false)
- Starter (default, is_visible=true, is_default=true) - $9.99/mo
- Pro (hidden, is_visible=false) - $24.99/mo
- Plans have `is_default` and `is_visible` flags

**Key Endpoints**:
- `GET /api/v1/p/plans` - Lists visible plans (add `?all=true` for all)
- `POST /api/v1/m/check-access` - Checks if user has access (trial OR subscription)
- `GET /api/v1/m/subscription` - Gets active subscription + trial info
- `POST /api/v1/m/subscribe` - Subscribe with trial-to-paid transition + minutes carryover

**Access Logic**: Access granted if (trial active AND minutes > 0) OR (active subscription AND minutes_remaining > 0)

### Email OTP Verification (implemented Feb 2026)

**Flow**: During registration, users must verify their email with a 6-digit OTP before account creation.

1. User enters email ? calls `POST /api/v1/p/mail_otp` with `{ email }` ? 6-digit OTP sent via SMTP
2. User enters OTP + other details ? calls signup endpoint with `otp` field
3. Server verifies OTP (checks match + expiry), then creates account
4. OTP records are deleted after successful registration

**Database Table**: `mvp_email_otps` (id, email, otp, expires_at, verified, created_at)
**OTP Expiry**: 10 minutes

**Affected Endpoints**:
- `POST /api/v1/p/mail_otp` - Send OTP to email (public, no auth)
- `POST /api/auth/signup` - Web signup (now requires `otp` field)
- `POST /api/v1/p/register` - Mobile register (now requires `otp` field)
- `POST /api/v1/p/auth/signup` - Alt mobile signup (now requires `otp` field)

**SMTP Config**: Uses same SMTP env vars as password reset: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

**IMPORTANT**: Both `server/routes.ts` (dev) and `api/index.ts` (Vercel production) must be kept in sync for all API changes. The dev server uses `SUPABASE_DATABASE_URL` (external Supabase DB).

### Stripe Subscription Endpoints (implemented Feb 2026)

**Stripe Client**: `server/stripeClient.ts` - Fetches Stripe credentials from Replit connector API (auto-handles dev/prod keys). Never cache the client.

**Database Changes**: Added `stripe_customer_id`, `stripe_subscription_id` columns to `mvp_users` table. Added `stripe_price_id` column to `mvp_subscription_plans`.

**Current Plan**: Only the Starter plan ($9.99/mo, price_id: `price_1SzVvyCu3GlQjfboRLx67yVz`) is active with the 7-day trial (90 minutes).

**Endpoints**:

1. `GET /api/stripe-config` + `GET /api/v1/p/stripe-config` (Public, no auth)
   - Response: `{ success: true, publishableKey: string }`
   - Returns Stripe publishable key for client-side payment initialization.

2. `GET /api/subscription-status` (Web, session auth) + `GET /api/v1/m/subscription-status` (Mobile, JWT auth)
   - Response: `{ success, trial: { is_active, days_remaining, minutes_remaining, minutes_used, trial_ends_at }, subscription: { id, plan_name, status, valid_date_upto, minutes_used, minutes_remaining, stripe_subscription_id, stripe_status, cancel_at_period_end, current_period_end }, has_active_subscription, has_active_trial }`
   - Returns full subscription and trial status including live Stripe subscription state.

3. `POST /api/create-subscription` (Web, session auth) + `POST /api/v1/m/create-subscription` (Mobile, JWT auth)
   - Request: `{ email: string, priceId: string }`
   - Response: `{ success: true, subscriptionId: string, clientSecret: string | null }`
   - Creates Stripe Customer (if needed), creates Subscription with `payment_behavior: 'default_incomplete'`, returns `clientSecret` for PaymentSheet confirmation.

4. `POST /api/cancel-subscription` (Web) + `POST /api/v1/m/cancel-subscription` (Mobile)
   - Request: `{ subscriptionId: string }`
   - Response: `{ success: true, message: string, cancel_at: string | null, current_period_end: string | null }`
   - Ownership check: only the subscription owner can cancel. Cancels at end of billing period.

5. `POST /api/stripe-webhook` + `POST /api/v1/m/stripe-webhook`
   - Handles 4 event types:
     - `invoice.paid`: Activates subscription, carries over remaining trial minutes
     - `invoice.payment_failed`: Marks subscription as `payment_failed`
     - `customer.subscription.updated`: Syncs plan changes, handles `past_due`/`unpaid` status
     - `customer.subscription.deleted`: Cancels subscription in DB, clears stripe IDs
   - Uses `STRIPE_WEBHOOK_SECRET` env var for signature verification.
   - Uses `rawBody` from express.json verify callback for signature validation.

6. `GET /api/v1/p/plans` (Public)
   - Returns plans with `stripe_price_id` included for client-side price selection.

**Stripe Sync**: On dev startup, `stripe-replit-sync` runs migrations to create `stripe` schema, sets up managed webhook, and syncs backfill data.

### Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string for Neon database
- `AI_INTEGRATIONS_GEMINI_API_KEY`: Provided by Replit for Gemini access
- `AI_INTEGRATIONS_GEMINI_BASE_URL`: Provided by Replit for Gemini endpoint

Optional:
- `OPENAI_API_KEY`: Required only if using OpenAI instead of Gemini
- `NODE_ENV`: Environment mode (development/production)

### Asset Management

**Static Assets**:
- Images stored in `attached_assets/` directory
- Custom alias `@assets` for importing images in components
- Generated images used for marketing/landing page visuals

**Font Loading**:
- Google Fonts: Inter (primary UI), Architects Daughter, DM Sans, Fira Code, Geist Mono
- Loaded via CDN in HTML head

### Battery Profile System (Feb 2026)

**Files**: `mobile/src/utils/batteryManager.ts`, `mobile/src/contexts/BatteryContext.tsx`, `mobile/src/components/HighBatteryUsageWarning.tsx`

**Profiles**:
- Power Saver: 15min polling, no background sync, no animations, WorkManager requires idle+unmetered
- Balanced (default): 30s polling, standard sync, full animations, WorkManager standard constraints
- Real-time: 5s polling, full sync, full animations, shows high battery warning banner

**Integration**: BatteryContext provides `useBattery()` hook. ReliabilityContext dynamically adjusts polling interval and background sync gating based on active profile. SettingsScreen includes profile selector with radio buttons and confirmation dialog for Real-time mode.

**Persistence**: Profile stored in AsyncStorage (`@battery_profile`). BatteryManager detects Android system power save mode via NativeModules.PowerManager.

### Mobile App Performance Audit (Feb 2026)

**Completed optimizations**:
- FlatList perf props (removeClippedSubviews, maxToRenderPerBatch, windowSize) on SavedItemsScreen, PendingScreen, ProfileScreen
- React.memo on MenuItem, SavedItemCard; useCallback on renderItem/keyExtractor/handlers
- Module-level language maps and helper functions (getLanguageName, formatDuration, formatDate) extracted from render paths
- useMemo for computed values (trialMinutesRemaining, trialProgress)
- Stale closure fix: ChunkedVoiceRecorder AppState handler now uses refs (appStateRef, isRecordingRef, offlineRecordingRef) with useCallback instead of re-subscribing on state changes
- ReliabilityContext polling reduced from 5s to 30s; fixed stale syncStatus.isSyncing reference using functional setState
- Migrated console.log/error/warn to secureLog in AuthContext, SubscriptionContext, ReliabilityContext, ChunkedVoiceRecorder, ContinuousVoiceRecorder, VoiceRecorder, ProfileScreen
- Security: tokenManager uses expo-secure-store, certificate pinning in withNetworkSecurity.js, secureLogger redacts sensitive data in production