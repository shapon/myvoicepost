# MyVoicePost - Voice-to-Text AI Application

## Overview

MyVoicePost is a voice-to-text AI application that converts spoken words into polished, formatted content. It supports various output formats (messages, notes, emails, posts, journals) and customizable tones (professional, casual, formal, friendly). The application also offers multi-language translation and transcription, aiming to streamline content creation, communication, and note-taking through voice input. It targets users needing quick thought capture, content generation, or cross-language communication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React 18 and TypeScript using Vite, featuring `shadcn/ui` components based on Radix UI, styled with Tailwind CSS, and animated with Framer Motion. It follows a "New York" design with neutral colors. State management utilizes TanStack Query for server state and React hooks for local component state, avoiding global state libraries. Wouter handles client-side routing for a single-page application. Key features include voice recording, real-time transcription, language selection, output customization, copy-to-clipboard, and responsive design.

### Backend

The backend is an Express.js application handling RESTful API endpoints. It processes audio file uploads via Multer and uses JSON for requests/responses. Core services include Transcription, Translation, and Polishing, all leveraging AI integration. Google Gemini AI is the primary AI service, with OpenAI as an alternative. Request processing includes audio validation, Zod schema validation, and robust error handling.

### Data Storage

PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, is used for data persistence. The schema includes tables for users and translation results, with an in-memory fallback for development. Session management is handled by Express sessions with a PostgreSQL store.

### Authentication & Authorization

The system uses JWT-based authentication with a session fallback. JWTs have a 7-day expiry. Passwords are hashed with bcryptjs, and email OTP verification is required for registration. Role-Based Access Control (RBAC) defines `GUEST`, `USER`, and `ADMIN` roles, with transitions based on subscription status. `refreshUserRole` and `checkRole` middleware enforce access.

### AI Processing Pipeline

The Transcription flow involves client-side audio recording, upload to the backend, validation, and AI-powered transcription. The Translation & Polishing flow takes transcribed text and applies user-specified parameters (languages, format, tone) using AI to generate polished output. The pipeline includes retry mechanisms with `p-retry` and concurrency control with `p-limit`.

### Build & Deployment

The build process uses Vite for the React frontend and esbuild for the Node.js backend. Development features include Vite's HMR and custom middleware. Production configurations focus on static file serving and environment-based settings. Database migrations are managed with Drizzle Kit.

### Trial & Subscription System

New users receive a 7-day trial with 90 minutes of recording. Subscription plans (Starter, Pro) manage user access and features. Access is granted if a trial is active with minutes remaining or if there's an active subscription with available minutes.

### Email OTP Verification

During registration, users must verify their email with a 6-digit OTP sent via SMTP. The OTP expires in 10 minutes and is verified before account creation.

### Crash-Resilient Recording Persistence

The mobile application implements a crash-resilient recording system that writes audio segments to disk every 5 seconds, using sentinel files to track session status. This allows for recovery of recordings after crashes or unexpected interruptions. A `RecoveryModal` guides users through recovering or discarding unfinalized sessions on app boot.

### Battery Profile System

A battery profile system allows users to select between Power Saver, Balanced (default), and Real-time modes, which adjust polling intervals, background synchronization, and animations to optimize battery usage. A warning is displayed for high battery usage in Real-time mode.

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