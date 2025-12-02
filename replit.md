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