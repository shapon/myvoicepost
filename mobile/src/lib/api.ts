import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { tokenManager } from './tokenManager';
import { handleApiError, isRetryableError, delay, ErrorReporter } from '../utils/errorHandler';
import { environment } from '../config/environment';
import { sanitizeApiInput, sanitizationPresets, logSecurityIssue } from '../utils/inputSanitizer';
import { isAllowedHost } from '../utils/sslPinning';
import { secureLog } from '../utils/secureLogger';

/**
 * API Client for MyVoicePost Mobile App
 * 
 * Production URL: https://www.myvoicepost.com
 * 
 * ============================================================
 * API ENDPOINTS:
 * ============================================================
 * 
 * PUBLIC (No Auth Required) - /api/v1/p/:
 *   POST /api/v1/p/transcribe    - Convert audio to text
 *   POST /api/v1/p/polish        - Polish text
 *   POST /api/v1/p/translate     - Translate text
 *   POST /api/v1/p/process-url   - Process YouTube/webpage URL (public)
 *   POST /api/v1/p/login         - Login (returns JWT token)
 *   POST /api/v1/p/register      - Register new account (returns JWT token)
 *
 * AUTHENTICATED (Requires JWT) - /api/v1/a/:
 *   POST /api/v1/a/logout       - Logout
 *   GET  /api/v1/a/me            - Get current user
 *   POST /api/v1/a/transcribe   - Transcribe with auth
 *   POST /api/v1/a/polish       - Polish with auth
 *   POST /api/v1/a/translate    - Translate with auth
 *   POST /api/v1/a/process-url  - Process YouTube/webpage URL (auth)
 *   GET/POST/PUT/DELETE /api/v1/a/saved-texts - CRUD saved items
 * ============================================================
 */

const PRODUCTION_BASE_URL = 'https://www.myvoicepost.com';
const DEFAULT_TIMEOUT = 30000;
const TRANSCRIBE_TIMEOUT = 120000; // 2 minutes for transcription
const URL_PROCESS_TIMEOUT = 150000; // 2.5 minutes for YouTube audio fallback processing

// ============================================
// API CLIENTS SETUP
// ============================================

// Public API client (no auth required) - /api/v1/p/
const publicApiClient = axios.create({
  baseURL: `${PRODUCTION_BASE_URL}/api/v1/p`,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

publicApiClient.interceptors.request.use(
  (config) => {
    const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
    if (!isAllowedHost(fullUrl)) {
      return Promise.reject(new Error(`[SSL] Blocked request to unauthorized host: ${config.url}`));
    }
    secureLog.debug(`[PUBLIC API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

publicApiClient.interceptors.response.use(
  (response) => {
    secureLog.debug(`[PUBLIC API] Response ${response.status} from ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    secureLog.error('[PUBLIC API] Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

// Authenticated API client - /api/v1/a/
const createAuthApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: `${PRODUCTION_BASE_URL}/api/v1/a`,
    timeout: DEFAULT_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  // Request interceptor - Add JWT token
  client.interceptors.request.use(
    async (config) => {
      try {
        const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
        if (!isAllowedHost(fullUrl)) {
          return Promise.reject(new Error(`[SSL] Blocked request to unauthorized host: ${config.url}`));
        }
        const token = await tokenManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        secureLog.debug(`[AUTH API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      } catch (error) {
        ErrorReporter.report(error, 'API.RequestInterceptor');
        return config;
      }
    },
    (error) => Promise.reject(error)
  );

  client.interceptors.response.use(
    (response) => {
      secureLog.debug(`[AUTH API] Response ${response.status} from ${response.config.url}`);
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

      secureLog.error('[AUTH API] Error:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      });

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        const url = originalRequest.url || '';
        const isAuthEndpoint = url.includes('/auth/') || url.includes('/login');
        if (isAuthEndpoint) {
          secureLog.info('[AUTH API] Clearing token due to 401 on auth endpoint');
          await tokenManager.clearToken();
        } else {
          secureLog.debug('[AUTH API] 401 on non-auth endpoint (token NOT cleared)');
        }
      }

      return Promise.reject(error);
    }
  );

  return client;
};

const authApiClient = createAuthApiClient();

// Helper to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  const token = await tokenManager.getToken();
  return !!token;
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface TranscribeResponse {
  success: boolean;
  originalText: string;
  language: string;
  trial_minutes_total?: number;
  trial_minutes_used?: number;
  is_subscribed?: boolean;
}

export interface PolishResponse {
  success: boolean;
  originalText: string;
  polishedText: string;
  language: string;
  outputFormat: string;
  outputType: string;
  trial_minutes_total?: number;
  trial_minutes_used?: number;
  is_subscribed?: boolean;
}

export interface TranslateResponse {
  success: boolean;
  originalText: string;
  translatedText: string;
  polishedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  outputFormat: string;
  trial_minutes_total?: number;
  trial_minutes_used?: number;
  is_subscribed?: boolean;
}

export interface SavedItem {
  id: string;
  type: 'polish' | 'translate';
  originalText: string;
  polishedText: string;
  translatedText?: string | null;
  sourceLanguage: string;
  targetLanguage?: string | null;
  outputFormat: string;
  outputType?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ============================================
// TRANSCRIBE API
// Uses public endpoint if not logged in, auth endpoint if logged in
// ============================================

export const transcribeApi = {
  /**
   * Transcribe audio to text
   * Uses /api/v1/p/transcribe (public) or /api/v1/a/transcribe (auth)
   */
  transcribe: async (
    base64Audio: string,
    language: string = 'en',
    mimeType: string = 'audio/mp4',
    durationSeconds: number = 0
  ): Promise<TranscribeResponse> => {
    secureLog.debug('[TRANSCRIBE] ========================================');
    secureLog.debug('[TRANSCRIBE] Starting transcription...');
    secureLog.debug('[TRANSCRIBE] Language:', language);
    secureLog.debug('[TRANSCRIBE] MimeType:', mimeType);
    secureLog.debug('[TRANSCRIBE] Duration:', durationSeconds, 'seconds');
    secureLog.debug('[TRANSCRIBE] Audio base64 length:', base64Audio?.length);

    try {
      const useAuth = await isAuthenticated();
      const client = useAuth ? authApiClient : publicApiClient;
      const baseURL = useAuth ? `${PRODUCTION_BASE_URL}/api/v1/a` : `${PRODUCTION_BASE_URL}/api/v1/p`;
      secureLog.debug('[TRANSCRIBE] Using:', useAuth ? 'AUTH API (/api/v1/a)' : 'PUBLIC API (/api/v1/p)');
      secureLog.debug('[TRANSCRIBE] Full URL:', `${baseURL}/transcribe`);

      const response = await client.post('/transcribe', {
        audio: base64Audio,
        mimeType: mimeType,
        language: language,
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
      }, {
        timeout: TRANSCRIBE_TIMEOUT,
      });

      secureLog.debug('[TRANSCRIBE] Response received');
      secureLog.debug('[TRANSCRIBE] Response:', JSON.stringify(response.data).substring(0, 500));

      if (!response.data.success) {
        throw new Error(response.data.error || 'Transcription failed');
      }

      const originalText = response.data.originalText;
      
      if (!originalText || originalText.trim() === '') {
        throw new Error('Transcription returned empty text');
      }

      secureLog.debug('[TRANSCRIBE] SUCCESS! Text:', originalText.substring(0, 100));
      if (response.data.trial_minutes_total !== undefined) {
        secureLog.debug(`[TRANSCRIBE] Trial info: used=${response.data.trial_minutes_used}/${response.data.trial_minutes_total} mins, subscribed=${response.data.is_subscribed}`);
      }
      secureLog.debug('[TRANSCRIBE] ========================================');

      return {
        success: true,
        originalText: originalText.trim(),
        language: response.data.language || language,
        ...(response.data.trial_minutes_total !== undefined ? {
          trial_minutes_total: response.data.trial_minutes_total,
          trial_minutes_used: response.data.trial_minutes_used,
          is_subscribed: response.data.is_subscribed,
        } : {}),
      };
    } catch (error: any) {
      secureLog.error('[TRANSCRIBE] FAILED:', error.message);
      secureLog.error('[TRANSCRIBE] Error code:', error.code);
      secureLog.error('[TRANSCRIBE] Server response:', error.response?.data);
      secureLog.error('[TRANSCRIBE] Request config:', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        timeout: error.config?.timeout,
        dataLength: error.config?.data?.length,
      });
      throw handleApiError(error);
    }
  },

  transcribeLanguageOnly: async (
    base64Audio: string,
    language: string,
    mimeType: string = 'audio/mp4',
    durationSeconds: number = 0
  ): Promise<TranscribeResponse> => {
    secureLog.debug('[TRANSCRIBE-LANG] ========================================');
    secureLog.debug('[TRANSCRIBE-LANG] Starting language-specific transcription...');
    secureLog.debug('[TRANSCRIBE-LANG] Language:', language);
    secureLog.debug('[TRANSCRIBE-LANG] MimeType:', mimeType);
    secureLog.debug('[TRANSCRIBE-LANG] Duration:', durationSeconds, 'seconds');
    secureLog.debug('[TRANSCRIBE-LANG] Audio base64 length:', base64Audio?.length);

    try {
      const useAuth = await isAuthenticated();
      const client = useAuth ? authApiClient : publicApiClient;
      const baseURL = useAuth ? `${PRODUCTION_BASE_URL}/api/v1/a` : `${PRODUCTION_BASE_URL}/api/v1/p`;
      secureLog.debug('[TRANSCRIBE-LANG] Using:', useAuth ? 'AUTH API (/api/v1/a)' : 'PUBLIC API (/api/v1/p)');
      secureLog.debug('[TRANSCRIBE-LANG] Full URL:', `${baseURL}/transcribe_l`);

      const response = await client.post('/transcribe_l', {
        audio: base64Audio,
        mimeType: mimeType,
        language: language,
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
      }, {
        timeout: TRANSCRIBE_TIMEOUT,
      });

      secureLog.debug('[TRANSCRIBE-LANG] Response received');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Transcription failed');
      }

      const originalText = response.data.originalText;

      if (!originalText || originalText.trim() === '') {
        throw new Error('Transcription returned empty text');
      }

      secureLog.debug('[TRANSCRIBE-LANG] SUCCESS! Text:', originalText.substring(0, 100));
      secureLog.debug('[TRANSCRIBE-LANG] ========================================');

      return {
        success: true,
        originalText: originalText.trim(),
        language: response.data.language || language,
        ...(response.data.trial_minutes_total !== undefined ? {
          trial_minutes_total: response.data.trial_minutes_total,
          trial_minutes_used: response.data.trial_minutes_used,
          is_subscribed: response.data.is_subscribed,
        } : {}),
      };
    } catch (error: any) {
      secureLog.error('[TRANSCRIBE-LANG] FAILED:', error.message);
      secureLog.error('[TRANSCRIBE-LANG] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },
};

// ============================================
// POLISH API
// Uses public endpoint if not logged in, auth endpoint if logged in
// ============================================

export const polishApi = {
  /**
   * FULL FLOW: Audio -> Transcribe -> Polish
   */
  polishBase64: async (
    base64Audio: string,
    language: string,
    tone: string,        // maps to outputFormat on server
    outputType: string,
    mimeType: string = 'audio/mp4',
    durationSeconds: number = 0
  ): Promise<PolishResponse> => {
    secureLog.debug('[POLISH] ========================================');
    secureLog.debug('[POLISH] FULL FLOW: Audio -> Transcribe -> Polish');
    secureLog.debug('[POLISH] Settings:', { language, tone, outputType, durationSeconds });

    try {
      // STEP 1: Transcribe audio to text (language-specific)
      const useAutoDetect = !language || language === 'none';
      secureLog.debug('[POLISH] STEP 1:', useAutoDetect ? 'Auto-detect (/transcribe)' : 'Language-specific (/transcribe_l)');
      const transcribeResult = useAutoDetect
        ? await transcribeApi.transcribe(base64Audio, 'en', mimeType, durationSeconds)
        : await transcribeApi.transcribeLanguageOnly(base64Audio, language, mimeType, durationSeconds);
      const originalText = transcribeResult.originalText;
      const effectiveLanguage = useAutoDetect ? (transcribeResult.language || 'en') : language;
      secureLog.debug('[POLISH] STEP 1 COMPLETE: Got text:', originalText.substring(0, 50), 'Language:', effectiveLanguage);

      // STEP 2: Polish the transcribed text
      secureLog.debug('[POLISH] STEP 2: Calling /polish...');
      const polishResult = await polishApi.polishText(originalText, effectiveLanguage, tone, outputType);
      secureLog.debug('[POLISH] STEP 2 COMPLETE: Got polished text');

      secureLog.debug('[POLISH] ========================================');

      return {
        ...polishResult,
        ...(transcribeResult.trial_minutes_total !== undefined ? {
          trial_minutes_total: transcribeResult.trial_minutes_total,
          trial_minutes_used: transcribeResult.trial_minutes_used,
          is_subscribed: transcribeResult.is_subscribed,
        } : {}),
      };
    } catch (error: any) {
      secureLog.error('[POLISH] FLOW FAILED:', error.message);
      throw error;
    }
  },

  /**
   * Polish text directly (for re-polish functionality)
   * Uses /api/v1/p/polish (public) or /api/v1/a/polish (auth)
   */
  polishText: async (
    originalText: string,
    language: string = 'en',
    outputFormat: string = 'professional',  // tone
    outputType: string = 'general'
  ): Promise<PolishResponse> => {
    secureLog.debug('[POLISH-TEXT] Polishing text directly...');
    secureLog.debug('[POLISH-TEXT] Text length:', originalText?.length);
    secureLog.debug('[POLISH-TEXT] Settings:', { language, outputFormat, outputType });

    try {
      // Sanitize text input
      const sanitizedText = sanitizeApiInput(originalText, {
        fieldType: 'text',
        fieldName: 'Text',
        required: true,
        maxLength: 10000, // Allow longer text for polishing
        allowUrls: true, // Text may contain URLs
        allowHtml: false,
        trim: true,
      });

      if (!sanitizedText.isValid) {
        logSecurityIssue('text', sanitizedText.errors.join(', '), originalText.substring(0, 100), 'polishText');
        throw new Error(sanitizedText.errors[0] || 'Invalid text input');
      }

      // Log warnings if any
      if (sanitizedText.warnings.length > 0) {
        secureLog.warn('[POLISH-TEXT] Input warnings:', sanitizedText.warnings);
      }

      const useAuth = await isAuthenticated();
      const client = useAuth ? authApiClient : publicApiClient;
      secureLog.debug('[POLISH-TEXT] Using:', useAuth ? 'AUTH API (/api/v1/a)' : 'PUBLIC API (/api/v1/p)');
      secureLog.debug('[POLISH-TEXT] Sanitized text to polish:', sanitizedText.sanitizedValue?.substring(0, 100));

      // Server expects 'text' field (not 'originalText')
      const requestBody = {
        text: sanitizedText.sanitizedValue,
        language,
        outputFormat,
        outputType
      };
      secureLog.debug('[POLISH-TEXT] Request body keys:', Object.keys(requestBody));

      const response = await client.post('/polish', requestBody);

      secureLog.debug('[POLISH-TEXT] Response received');
      secureLog.debug('[POLISH-TEXT] Response:', JSON.stringify(response.data).substring(0, 500));

      if (!response.data.success) {
        throw new Error(response.data.error || 'Polish failed');
      }

      secureLog.debug('[POLISH-TEXT] SUCCESS!');

      return {
        success: true,
        originalText: response.data.originalText,
        polishedText: response.data.polishedText,
        language: response.data.language,
        outputFormat: response.data.outputFormat,
        outputType: response.data.outputType,
      };
    } catch (error: any) {
      secureLog.error('[POLISH-TEXT] FAILED:', error.message);
      secureLog.error('[POLISH-TEXT] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },
};

// ============================================
// TRANSLATE API
// Uses public endpoint if not logged in, auth endpoint if logged in
// ============================================

export const translateApi = {
  /**
   * FULL FLOW: Audio -> Transcribe -> Translate
   */
  translateBase64: async (
    base64Audio: string,
    sourceLanguage: string,
    targetLanguage: string,
    tone: string,        // maps to outputFormat on server
    mimeType: string = 'audio/mp4',
    durationSeconds: number = 0
  ): Promise<TranslateResponse> => {
    secureLog.debug('[TRANSLATE] ========================================');
    secureLog.debug('[TRANSLATE] FULL FLOW: Audio -> Transcribe -> Translate');
    secureLog.debug('[TRANSLATE] Settings:', { sourceLanguage, targetLanguage, tone, durationSeconds });

    try {
      // STEP 1: Transcribe audio to text (language-specific)
      const useAutoDetect = !sourceLanguage || sourceLanguage === 'none';
      secureLog.debug('[TRANSLATE] STEP 1:', useAutoDetect ? 'Auto-detect (/transcribe)' : 'Language-specific (/transcribe_l)');
      const transcribeResult = useAutoDetect
        ? await transcribeApi.transcribe(base64Audio, 'en', mimeType, durationSeconds)
        : await transcribeApi.transcribeLanguageOnly(base64Audio, sourceLanguage, mimeType, durationSeconds);
      const originalText = transcribeResult.originalText;
      const effectiveSrcLang = useAutoDetect ? (transcribeResult.language || 'en') : sourceLanguage;
      secureLog.debug('[TRANSLATE] STEP 1 COMPLETE: Got text:', originalText.substring(0, 50), 'Language:', effectiveSrcLang);

      // STEP 2: Translate the transcribed text
      secureLog.debug('[TRANSLATE] STEP 2: Calling /translate...');
      const translateResult = await translateApi.translateText(originalText, effectiveSrcLang, targetLanguage, tone);
      secureLog.debug('[TRANSLATE] STEP 2 COMPLETE: Got translated text');

      secureLog.debug('[TRANSLATE] ========================================');

      return {
        ...translateResult,
        ...(transcribeResult.trial_minutes_total !== undefined ? {
          trial_minutes_total: transcribeResult.trial_minutes_total,
          trial_minutes_used: transcribeResult.trial_minutes_used,
          is_subscribed: transcribeResult.is_subscribed,
        } : {}),
      };
    } catch (error: any) {
      secureLog.error('[TRANSLATE] FLOW FAILED:', error.message);
      throw error;
    }
  },

  /**
   * Translate text directly (for re-translate functionality)
   * Uses /api/v1/p/translate (public) or /api/v1/a/translate (auth)
   */
  translateText: async (
    originalText: string,
    sourceLanguage: string = 'en',
    targetLanguage: string,
    outputFormat: string = 'professional'  // tone
  ): Promise<TranslateResponse> => {
    secureLog.debug('[TRANSLATE-TEXT] Translating text directly...');
    secureLog.debug('[TRANSLATE-TEXT] Text length:', originalText?.length);
    secureLog.debug('[TRANSLATE-TEXT] Settings:', { sourceLanguage, targetLanguage, outputFormat });

    try {
      const useAuth = await isAuthenticated();
      const client = useAuth ? authApiClient : publicApiClient;
      secureLog.debug('[TRANSLATE-TEXT] Using:', useAuth ? 'AUTH API (/api/v1/a)' : 'PUBLIC API (/api/v1/p)');
      secureLog.debug('[TRANSLATE-TEXT] Original text to translate:', originalText?.substring(0, 100));

      // Server expects 'text' field (not 'originalText')
      const requestBody = { text: originalText, sourceLanguage, targetLanguage, outputFormat };
      secureLog.debug('[TRANSLATE-TEXT] Request body keys:', Object.keys(requestBody));

      const response = await client.post('/translate', requestBody);

      secureLog.debug('[TRANSLATE-TEXT] Response received');
      secureLog.debug('[TRANSLATE-TEXT] Response:', JSON.stringify(response.data).substring(0, 500));

      if (!response.data.success) {
        throw new Error(response.data.error || 'Translate failed');
      }

      secureLog.debug('[TRANSLATE-TEXT] SUCCESS!');

      return {
        success: true,
        originalText: response.data.originalText,
        translatedText: response.data.translatedText,
        polishedText: response.data.polishedText,
        sourceLanguage: response.data.sourceLanguage,
        targetLanguage: response.data.targetLanguage,
        outputFormat: response.data.outputFormat,
      };
    } catch (error: any) {
      secureLog.error('[TRANSLATE-TEXT] FAILED:', error.message);
      secureLog.error('[TRANSLATE-TEXT] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },
};

// ============================================
// PROCESS API - URL extraction & audio transcription + translation
// ============================================

export interface ProcessResult {
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceType: 'youtube' | 'webpage' | 'audio';
}

export interface ToneItem {
  id: string;
  label: string;
  instruction: string;
}

export interface ToneCategory {
  label: string;
  tones: ToneItem[];
}

export interface ToneCategoriesResponse {
  success: boolean;
  categories: Record<string, ToneCategory>;
}

export interface TransformToneResponse {
  success: boolean;
  transformedText: string;
}

export const processApi = {
  processUrl: async (url: string, targetLanguage: string): Promise<ProcessResult> => {
    secureLog.debug('[PROCESS] Processing URL:', url, 'Target:', targetLanguage);
    try {
      const isAuthenticated = !!(await tokenManager.getToken());
      const client = isAuthenticated ? authApiClient : publicApiClient;
      const endpoint = '/process-url';

      const response = await client.post(endpoint, { url, targetLanguage }, {
        timeout: URL_PROCESS_TIMEOUT,
      });
      const data = response.data;
      if (!data.success) throw new Error(data.error || 'Failed to process URL');

      secureLog.debug('[PROCESS] URL processed successfully, sourceType:', data.sourceType);
      return {
        sourceText: data.sourceText,
        targetText: data.targetText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        sourceType: data.sourceType,
      };
    } catch (error: any) {
      secureLog.error('[PROCESS] URL processing failed:', error.message);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Processing is taking longer than expected. YouTube videos with disabled captions require audio extraction which may take up to 2 minutes. Please try again.');
      }
      throw handleApiError(error);
    }
  },

  processAudio: async (
    base64Audio: string,
    targetLanguage: string,
    mimeType: string = 'audio/mp4'
  ): Promise<ProcessResult> => {
    secureLog.debug('[PROCESS] Processing audio, Target:', targetLanguage);
    try {
      const isAuthenticated = !!(await tokenManager.getToken());
      if (!isAuthenticated) {
        throw new Error('Please log in to process audio files.');
      }

      const { PROCESS_AUDIO_MAX_SIZE_BYTES, PROCESS_AUDIO_MAX_SIZE_MB, isAudioTypeSupported } = await import('../../../shared/audioConfig');
      const rawByteLength = Math.ceil(base64Audio.length * 3 / 4);
      if (rawByteLength > PROCESS_AUDIO_MAX_SIZE_BYTES) {
        throw new Error(`Audio file too large. Maximum size is ${PROCESS_AUDIO_MAX_SIZE_MB}MB.`);
      }
      if (!isAudioTypeSupported(mimeType)) {
        throw new Error(`Unsupported audio type: ${mimeType}`);
      }

      const client = authApiClient;
      const endpoint = '/process-audio';

      const response = await client.post(endpoint, {
        audioBase64: base64Audio,
        targetLanguage,
        mimeType,
      }, { timeout: 120000 });
      const data = response.data;
      if (!data.success) throw new Error(data.error || 'Failed to process audio');

      secureLog.debug('[PROCESS] Audio processed successfully');
      return {
        sourceText: data.sourceText,
        targetText: data.targetText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        sourceType: 'audio',
      };
    } catch (error: any) {
      secureLog.error('[PROCESS] Audio processing failed:', error.message);
      throw handleApiError(error);
    }
  },

  fetchToneCategories: async (): Promise<ToneCategoriesResponse> => {
    secureLog.debug('[PROCESS] Fetching tone categories');
    try {
      const isAuthenticated = !!(await tokenManager.getToken());
      const client = isAuthenticated ? authApiClient : publicApiClient;
      const endpoint = isAuthenticated ? '/tone-categories' : '/tone-categories';

      const response = await client.get(endpoint);
      const data = response.data;
      if (!data.success) throw new Error(data.error || 'Failed to fetch tone categories');

      secureLog.debug('[PROCESS] Tone categories fetched successfully');
      return data;
    } catch (error: any) {
      secureLog.error('[PROCESS] Tone categories fetch failed:', error.message);
      throw handleApiError(error);
    }
  },

  transformTone: async (text: string, toneId: string): Promise<string> => {
    secureLog.debug('[PROCESS] Transforming text with tone:', toneId);
    try {
      const isAuthenticated = !!(await tokenManager.getToken());
      const client = isAuthenticated ? authApiClient : publicApiClient;
      const endpoint = isAuthenticated ? '/transform-tone' : '/transform-tone';

      const response = await client.post(endpoint, { text, toneId });
      const data = response.data;
      if (!data.success) throw new Error(data.error || 'Failed to transform text');

      secureLog.debug('[PROCESS] Text transformed successfully');
      return data.transformedText;
    } catch (error: any) {
      secureLog.error('[PROCESS] Text transformation failed:', error.message);
      throw handleApiError(error);
    }
  },
};

// ============================================
// SAVED ITEMS API (CRUD) - Requires Auth
// All endpoints under /api/v1/a/saved-texts
// ============================================

export const savedItemsApi = {
  /**
   * GET /saved-texts
   */
  getAll: async (type?: 'polish' | 'translate'): Promise<SavedItem[]> => {
    try {
      secureLog.debug('[SAVED] Getting all items, type:', type || 'all');
      const params = (type === 'polish' || type === 'translate') ? { type } : {};
      const response = await authApiClient.get('/saved-texts', { params });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get saved texts');
      }

      const items = (response.data.savedTexts || []).map((item: any) => ({
        id: item.id,
        type: item.type,
        originalText: item.originalText,
        polishedText: item.polishedText,
        translatedText: item.translatedText,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        outputFormat: item.outputFormat,
        outputType: item.outputType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
      
      secureLog.debug('[SAVED] Retrieved', items.length, 'items');
      return items;
    } catch (error) {
      secureLog.error('[SAVED] getAll ERROR:', error);
      throw handleApiError(error);
    }
  },

  /**
   * GET /saved-texts/:id
   */
  getById: async (id: string): Promise<SavedItem> => {
    try {
      const response = await authApiClient.get(`/saved-texts/${id}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get saved text');
      }

      const item = response.data.savedText;
      return {
        id: item.id,
        type: item.type,
        originalText: item.originalText,
        polishedText: item.polishedText,
        translatedText: item.translatedText,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        outputFormat: item.outputFormat,
        outputType: item.outputType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * POST /saved-texts
   */
  save: async (data: {
    type: 'polish' | 'translate';
    originalText: string;
    polishedText: string;
    translatedText?: string | null;
    sourceLanguage: string;
    targetLanguage?: string | null;
    outputFormat: string;
    outputType?: string | null;
  }): Promise<SavedItem> => {
    try {
      secureLog.debug('[SAVED] Saving new item...');
      secureLog.debug('[SAVED] Data:', JSON.stringify(data).substring(0, 200));
      
      const response = await authApiClient.post('/saved-texts', {
        type: data.type,
        originalText: data.originalText,
        polishedText: data.polishedText,
        translatedText: data.translatedText || null,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage || null,
        outputFormat: data.outputFormat,
        outputType: data.outputType || null,
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to save text');
      }

      const item = response.data.savedText;
      secureLog.debug('[SAVED] Saved with ID:', item.id);
      
      return {
        id: item.id,
        type: item.type,
        originalText: item.originalText,
        polishedText: item.polishedText,
        translatedText: item.translatedText,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        outputFormat: item.outputFormat,
        outputType: item.outputType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    } catch (error) {
      secureLog.error('[SAVED] save ERROR:', error);
      throw handleApiError(error);
    }
  },

  /**
   * PUT /saved-texts/:id
   */
  update: async (id: string, data: Partial<SavedItem>): Promise<SavedItem> => {
    try {
      secureLog.debug('[SAVED] Updating item:', id);
      const response = await authApiClient.put(`/saved-texts/${id}`, {
        type: data.type,
        originalText: data.originalText,
        polishedText: data.polishedText,
        translatedText: data.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        outputFormat: data.outputFormat,
        outputType: data.outputType,
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update saved text');
      }

      const item = response.data.savedText;
      return {
        id: item.id,
        type: item.type,
        originalText: item.originalText,
        polishedText: item.polishedText,
        translatedText: item.translatedText,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
        outputFormat: item.outputFormat,
        outputType: item.outputType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * DELETE /saved-texts/:id
   */
  delete: async (id: string): Promise<void> => {
    try {
      secureLog.debug('[SAVED] Deleting item:', id);
      const response = await authApiClient.delete(`/saved-texts/${id}`);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete saved text');
      }
      
      secureLog.debug('[SAVED] Deleted');
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// ============================================
// AUTH API - All under /api/v1/a/auth
// ============================================

export const api = {
  /**
   * POST /api/v1/p/login
   * Login using PUBLIC endpoint (no auth required)
   */
  login: async (email: string, password: string) => {
    try {
      // Sanitize inputs before API call
      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      const sanitizedPassword = sanitizeApiInput(password, {
        fieldType: 'password',
        fieldName: 'Password',
        required: true,
        maxLength: 128,
      });

      // Check if validation failed
      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'login');
        throw new Error(sanitizedEmail.errors[0] || 'Invalid email');
      }

      if (!sanitizedPassword.isValid) {
        logSecurityIssue('password', sanitizedPassword.errors.join(', '), '***', 'login');
        throw new Error(sanitizedPassword.errors[0] || 'Invalid password');
      }

      secureLog.debug('[AUTH] Login:', sanitizedEmail.sanitizedValue);

      // Use sanitized values for API call
      const response = await publicApiClient.post('/login', {
        identifier: sanitizedEmail.sanitizedValue,
        password: sanitizedPassword.sanitizedValue
      });

      secureLog.debug('[AUTH] Login response:', JSON.stringify(response.data).substring(0, 200));
      
      if (response.data.success && response.data.token) {
        await tokenManager.saveToken(response.data.token);
        secureLog.debug('[AUTH] Login SUCCESS - Token saved');
      }
      
      return response.data;
    } catch (error: any) {
      secureLog.error('[AUTH] Login ERROR:', error.message);
      secureLog.error('[AUTH] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },

  /**
   * GET /api/v1/a/me
   */
  getUser: async () => {
    try {
      const response = await authApiClient.get('/me');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  /**
   * POST /api/v1/a/logout
   */
  logout: async () => {
    try {
      await authApiClient.post('/logout');
      await tokenManager.clearToken();
      secureLog.debug('[AUTH] Logout SUCCESS');
    } catch (error) {
      // Even if server call fails, clear local token
      await tokenManager.clearToken();
      secureLog.debug('[AUTH] Logout - local token cleared');
    }
  },

  /**
   * POST /api/v1/p/mail_otp
   * Send OTP to user's email for verification
   */
  sendOTP: async (email: string) => {
    try {
      // Sanitize email input
      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'sendOTP');
        throw new Error(sanitizedEmail.errors[0] || 'Invalid email');
      }

      secureLog.debug('[AUTH] Sending OTP to:', sanitizedEmail.sanitizedValue);

      const response = await publicApiClient.post('/mail_otp', {
        email: sanitizedEmail.sanitizedValue
      });

      secureLog.debug('[AUTH] OTP sent successfully:', response.data);

      return {
        success: true,
        message: response.data?.message || 'Verification code sent to your email',
        ...response.data
      };
    } catch (error: any) {
      secureLog.error('[AUTH] Send OTP ERROR:', error.message);
      secureLog.error('[AUTH] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },

  /**
   * POST /api/v1/p/register
   * Register new account using PUBLIC endpoint (no auth required)
   * Now requires OTP verification and returns trial information (7-day trial with 90 minutes)
   */
  register: async (username: string, email: string, password: string, confirmPassword: string, otp: string) => {
    try {
      // Sanitize all registration inputs
      const sanitizedUsername = sanitizeApiInput(username, {
        fieldType: 'username',
        fieldName: 'Username',
        required: true,
        maxLength: 30,
      });

      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      const sanitizedPassword = sanitizeApiInput(password, {
        fieldType: 'password',
        fieldName: 'Password',
        required: true,
        maxLength: 128,
      });

      const sanitizedConfirmPassword = sanitizeApiInput(confirmPassword, {
        fieldType: 'password',
        fieldName: 'Confirm Password',
        required: true,
        maxLength: 128,
      });

      const sanitizedOTP = sanitizeApiInput(otp, {
        fieldType: 'text',
        fieldName: 'OTP',
        required: true,
        maxLength: 10,
      });

      // Validate all inputs
      const validationErrors: string[] = [];

      if (!sanitizedUsername.isValid) {
        logSecurityIssue('username', sanitizedUsername.errors.join(', '), username, 'register');
        validationErrors.push(...sanitizedUsername.errors);
      }

      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'register');
        validationErrors.push(...sanitizedEmail.errors);
      }

      if (!sanitizedPassword.isValid) {
        logSecurityIssue('password', sanitizedPassword.errors.join(', '), '***', 'register');
        validationErrors.push(...sanitizedPassword.errors);
      }

      if (!sanitizedConfirmPassword.isValid) {
        validationErrors.push(...sanitizedConfirmPassword.errors);
      }

      if (!sanitizedOTP.isValid) {
        logSecurityIssue('otp', sanitizedOTP.errors.join(', '), otp, 'register');
        validationErrors.push(...sanitizedOTP.errors);
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      secureLog.debug('[AUTH] Register:', {
        username: sanitizedUsername.sanitizedValue,
        email: sanitizedEmail.sanitizedValue,
        otp: '***'
      });

      // Use sanitized values for API call
      const response = await publicApiClient.post('/register', {
        username: sanitizedUsername.sanitizedValue,
        email: sanitizedEmail.sanitizedValue,
        password: sanitizedPassword.sanitizedValue,
        confirmPassword: sanitizedConfirmPassword.sanitizedValue,
        otp: sanitizedOTP.sanitizedValue,
      });
      
      secureLog.debug('[AUTH] Register response:', JSON.stringify(response.data).substring(0, 200));
      
      if (response.data.success && response.data.token) {
        await tokenManager.saveToken(response.data.token);
        secureLog.debug('[AUTH] Register SUCCESS - Token saved');

        // Log trial information if present
        if (response.data.trial) {
          secureLog.debug('[AUTH] Trial info:', {
            starts_at: response.data.trial.starts_at,
            ends_at: response.data.trial.ends_at,
            minutes_total: response.data.trial.minutes_total,
            minutes_remaining: response.data.trial.minutes_remaining
          });
        }
      }
      
      return response.data;
    } catch (error: any) {
      secureLog.error('[AUTH] Register ERROR:', error.message);
      secureLog.error('[AUTH] Server response:', error.response?.data);
      throw handleApiError(error);
    }
  },

  /**
   * POST /api/v1/p/forgot-password
   * Request password reset (sends verification code to email)
   */
  forgotPassword: async (email: string) => {
    try {
      // Sanitize email input
      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'forgotPassword');
        throw new Error(sanitizedEmail.errors[0] || 'Invalid email');
      }

      secureLog.debug('[AUTH] Forgot Password Request:', { email: sanitizedEmail.sanitizedValue });

      // Use public API - no auth required
      const response = await publicApiClient.post('/forgot-password', {
        email: sanitizedEmail.sanitizedValue
      });

      secureLog.debug('[AUTH] Forgot Password Success:', response.data);

      // Return normalized response
      return {
        success: true,
        message: response.data?.message || 'Verification code sent successfully',
        ...response.data
      };
    } catch (error: any) {
      secureLog.error('[AUTH] ===== Forgot Password ERROR =====');
      secureLog.error('[AUTH] Error message:', error.message);
      secureLog.error('[AUTH] Status code:', error.response?.status);
      secureLog.error('[AUTH] Server response:', JSON.stringify(error.response?.data, null, 2));
      throw handleApiError(error);
    }
  },

  /**
   * POST /api/v1/p/reset-password
   * Reset password using verification code
   *
   * API Contract (as per set_pwd.txt):
   * Request: { email, code (6 chars), newPassword (min 6 chars), confirmPassword }
   * Response: { success: true, message: "..." }
   */
  resetPassword: async (email: string, code: string, newPassword: string, confirmPassword: string) => {
    try {
      // Sanitize all inputs
      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      const sanitizedCode = sanitizeApiInput(code, {
        fieldType: 'text',
        fieldName: 'Verification Code',
        required: true,
        maxLength: 10,
      });

      const sanitizedNewPassword = sanitizeApiInput(newPassword, {
        fieldType: 'password',
        fieldName: 'New Password',
        required: true,
        maxLength: 128,
      });

      const sanitizedConfirmPassword = sanitizeApiInput(confirmPassword, {
        fieldType: 'password',
        fieldName: 'Confirm Password',
        required: true,
        maxLength: 128,
      });

      // Validate all inputs
      const validationErrors: string[] = [];

      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'resetPassword');
        validationErrors.push(...sanitizedEmail.errors);
      }

      if (!sanitizedCode.isValid) {
        logSecurityIssue('code', sanitizedCode.errors.join(', '), code, 'resetPassword');
        validationErrors.push(...sanitizedCode.errors);
      }

      if (!sanitizedNewPassword.isValid) {
        logSecurityIssue('newPassword', sanitizedNewPassword.errors.join(', '), '***', 'resetPassword');
        validationErrors.push(...sanitizedNewPassword.errors);
      }

      if (!sanitizedConfirmPassword.isValid) {
        validationErrors.push(...sanitizedConfirmPassword.errors);
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      secureLog.debug('[AUTH] Reset Password Request:', {
        email: sanitizedEmail.sanitizedValue,
        code: sanitizedCode.sanitizedValue!.substring(0, 2) + '****',
        passwordLength: sanitizedNewPassword.sanitizedValue!.length
      });

      // Request body matching the exact API contract from set_pwd.txt
      const requestBody = {
        email: sanitizedEmail.sanitizedValue,
        code: sanitizedCode.sanitizedValue,
        newPassword: sanitizedNewPassword.sanitizedValue,
        confirmPassword: sanitizedConfirmPassword.sanitizedValue
      };

      // Use public API - no auth required
      const response = await publicApiClient.post('/reset-password', requestBody);

      secureLog.debug('[AUTH] Reset Password Success:', response.data);

      // Return normalized response
      return {
        success: true,
        message: response.data?.message || 'Password reset successful',
        ...response.data
      };
    } catch (error: any) {
      secureLog.error('[AUTH] ===== Reset Password ERROR =====');
      secureLog.error('[AUTH] Error message:', error.message);
      secureLog.error('[AUTH] Status code:', error.response?.status);
      secureLog.error('[AUTH] Server response:', JSON.stringify(error.response?.data, null, 2));
      throw handleApiError(error);
    }
  },
};

// ============================================
// SUBSCRIPTION API
// ============================================

export interface Plan {
  id: string;
  name: 'Free' | 'Starter' | 'Pro';
  valid_total_minutes: number | null; // null means unlimited
  valid_date_upto_days: number;
  recordings_available_days: number;
  chunks_count: number;
  offline_recording: boolean;
  price_monthly: number; // in cents
  stripe_price_id?: string;
  is_default?: boolean;
  is_visible?: boolean;
}

export interface Subscription {
  id?: string;
  user_id?: string;
  plan_id?: string;
  plan_name: string;
  valid_total_minutes: number | null;
  valid_date_upto_days?: number;
  valid_date_upto?: string;
  recordings_available_days: number;
  chunks_count: number;
  offline_recording: boolean;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  minutes_remaining?: number;
  stripe_subscription_id?: string;
  stripe_status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: string;
}

export interface Trial {
  status: 'active' | 'expired' | 'used';
  is_active?: boolean;
  starts_at?: string;
  ends_at?: string;
  minutes_total?: number;
  minutes_used?: number;
  minutes_remaining?: number;
  days_remaining?: number;
  hours_remaining?: number;
}

export interface CheckAccessResponse {
  access_granted: boolean;
  access_source: 'trial' | 'subscription' | 'none';
  message?: string;
  trial?: {
    status: string;
    minutes_remaining: number;
    days_remaining: number;
  };
  subscription?: {
    plan_name: string;
    minutes_remaining: number;
    valid_until: string;
  };
}

export interface SubscriptionWithTrial {
  subscription: Subscription | null;
  trial: Trial;
}

export const subscriptionApi = {
  /**
   * Get all available plans (public endpoint, no auth required)
   * GET /api/v1/p/plans
   * By default only returns visible plans (Starter). Use ?all=true to see all plans.
   */
  getPlans: async (showAll: boolean = false): Promise<Plan[]> => {
    try {
      secureLog.debug('[SUBSCRIPTION] Fetching available plans...');
      const url = showAll ? '/plans?all=true' : '/plans';
      const response = await publicApiClient.get(url);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch plans');
      }

      secureLog.debug('[SUBSCRIPTION] Plans fetched successfully:', response.data.plans.length);
      return response.data.plans;
    } catch (error: any) {
      secureLog.error('[SUBSCRIPTION] Error fetching plans:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Subscribe to a plan (requires auth)
   * POST /api/v1/a/subscribe
   * If user subscribes during trial, unused trial minutes carry forward
   */
  subscribe: async (planId: string, paymentToken: string): Promise<Subscription> => {
    try {
      secureLog.debug('[SUBSCRIPTION] Subscribing to plan:', planId);

      // Validate payment token
      if (!paymentToken.startsWith('tok_') || paymentToken.length < 8) {
        throw new Error('Invalid payment token format');
      }

      const response = await authApiClient.post('/subscribe', {
        plan_id: planId,
        payment_token: paymentToken,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Subscription failed');
      }

      secureLog.debug('[SUBSCRIPTION] Subscription successful');
      secureLog.debug('[SUBSCRIPTION] Minutes remaining:', response.data.subscription.minutes_remaining);
      return response.data.subscription;
    } catch (error: any) {
      secureLog.error('[SUBSCRIPTION] Error subscribing:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Get current user subscription with trial status (requires auth)
   * GET /api/v1/a/subscription
   * Returns both subscription and trial information
   */
  getSubscription: async (): Promise<SubscriptionWithTrial> => {
    try {
      secureLog.debug('[SUBSCRIPTION] Fetching current subscription and trial status...');
      const response = await authApiClient.get('/subscription');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch subscription');
      }

      const subscription = response.data.subscription;
      const trial = response.data.trial;

      secureLog.debug('[SUBSCRIPTION] Status:', {
        hasSubscription: !!subscription,
        subscriptionPlan: subscription?.plan_name,
        subscriptionStatus: subscription?.status,
        trialStatus: trial?.status,
        trialActive: trial?.is_active
      });

      return {
        subscription: subscription,
        trial: trial
      };
    } catch (error: any) {
      secureLog.error('[SUBSCRIPTION] Error fetching subscription:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Check if user has access to record (requires auth)
   * POST /api/v1/a/check-access
   * Call this before allowing recording to check if user has access via trial or subscription
   */
  checkAccess: async (): Promise<CheckAccessResponse> => {
    try {
      secureLog.debug('[SUBSCRIPTION] Checking access...');
      const response = await authApiClient.post('/check-access');

      const accessData = response.data;

      secureLog.debug('[SUBSCRIPTION] Access check:', {
        granted: accessData.access_granted,
        source: accessData.access_source,
        message: accessData.message
      });

      if (accessData.access_granted) {
        if (accessData.access_source === 'trial' && accessData.trial) {
          secureLog.debug('[SUBSCRIPTION] Trial access:', {
            minutes_remaining: accessData.trial.minutes_remaining,
            days_remaining: accessData.trial.days_remaining
          });
        } else if (accessData.access_source === 'subscription' && accessData.subscription) {
          secureLog.debug('[SUBSCRIPTION] Subscription access:', {
            plan: accessData.subscription.plan_name,
            minutes_remaining: accessData.subscription.minutes_remaining
          });
        }
      }

      return accessData;
    } catch (error: any) {
      secureLog.error('[SUBSCRIPTION] Error checking access:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Get Stripe publishable key (public endpoint, no auth required)
   * GET /api/v1/p/stripe-config
   */
  getStripeConfig: async (): Promise<{ publishableKey: string }> => {
    try {
      secureLog.debug('[STRIPE] Fetching Stripe config...');
      const response = await publicApiClient.get('/stripe-config');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch Stripe config');
      }

      secureLog.debug('[STRIPE] Stripe config fetched successfully');
      return { publishableKey: response.data.publishableKey };
    } catch (error: any) {
      secureLog.error('[STRIPE] Error fetching Stripe config:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Get subscription status with trial info (requires auth)
   * GET /api/v1/a/subscription-status
   */
  getSubscriptionStatus: async (): Promise<{
    trial: {
      is_active: boolean;
      days_remaining: number;
      minutes_remaining: number;
      minutes_used: number;
      trial_ends_at: string;
    };
    subscription: Subscription | null;
    has_active_subscription: boolean;
    has_active_trial: boolean;
  }> => {
    try {
      secureLog.debug('[STRIPE] Fetching subscription status...');
      const response = await authApiClient.get('/subscription-status');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch subscription status');
      }

      secureLog.debug('[STRIPE] Subscription status:', {
        hasActiveSubscription: response.data.has_active_subscription,
        hasActiveTrial: response.data.has_active_trial,
        trialMinutesRemaining: response.data.trial?.minutes_remaining,
      });

      return response.data;
    } catch (error: any) {
      secureLog.error('[STRIPE] Error fetching subscription status:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Create a Stripe subscription (requires auth)
   * POST /api/v1/a/create-subscription
   * Returns clientSecret for PaymentSheet
   */
  createSubscription: async (email: string, priceId: string): Promise<{
    subscriptionId: string;
    clientSecret: string | null;
    type: 'payment' | 'setup';
    ephemeralKey: string;
    customerId: string;
  }> => {
    try {
      // Sanitize inputs
      const sanitizedEmail = sanitizeApiInput(email, {
        fieldType: 'email',
        fieldName: 'Email',
        required: true,
        maxLength: 254,
      });

      const sanitizedPriceId = sanitizeApiInput(priceId, {
        fieldType: 'text',
        fieldName: 'Price ID',
        required: true,
        maxLength: 100,
        trim: true,
      });

      // Validate inputs
      const validationErrors: string[] = [];

      if (!sanitizedEmail.isValid) {
        logSecurityIssue('email', sanitizedEmail.errors.join(', '), email, 'createSubscription');
        validationErrors.push(...sanitizedEmail.errors);
      }

      if (!sanitizedPriceId.isValid) {
        logSecurityIssue('priceId', sanitizedPriceId.errors.join(', '), priceId, 'createSubscription');
        validationErrors.push(...sanitizedPriceId.errors);
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      secureLog.debug('[STRIPE] Creating subscription...');
      secureLog.debug('[STRIPE] Email:', sanitizedEmail.sanitizedValue);
      secureLog.debug('[STRIPE] Price ID:', sanitizedPriceId.sanitizedValue);

      const response = await authApiClient.post('/create-subscription', {
        email: sanitizedEmail.sanitizedValue,
        priceId: sanitizedPriceId.sanitizedValue,
      });

      secureLog.debug('[STRIPE] Response status:', response.status);
      secureLog.debug('[STRIPE] Response data:', JSON.stringify(response.data, null, 2));

      if (!response.data.success) {
        const errorMsg = response.data.error || 'Failed to create subscription';
        secureLog.error('[STRIPE] Server returned error:', errorMsg);
        throw new Error(errorMsg);
      }

      secureLog.debug('[STRIPE] Subscription created:', {
        subscriptionId: response.data.subscriptionId,
        hasClientSecret: !!response.data.clientSecret,
        type: response.data.type,
      });

      return {
        subscriptionId: response.data.subscriptionId,
        clientSecret: response.data.clientSecret,
        type: response.data.type || 'payment',
        ephemeralKey: response.data.ephemeralKey,
        customerId: response.data.customerId,
      };
    } catch (error: any) {
      secureLog.error('[STRIPE] Error creating subscription:', error.message);
      secureLog.error('[STRIPE] Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
        }
      });
      throw handleApiError(error);
    }
  },

  /**
   * Confirm a Stripe subscription after PaymentSheet completes (requires auth)
   * POST /api/v1/a/confirm-subscription
   */
  confirmSubscription: async (subscriptionId: string): Promise<{
    success: boolean;
    message: string;
    status: string;
  }> => {
    try {
      secureLog.debug('[STRIPE] Confirming subscription:', subscriptionId);
      const response = await authApiClient.post('/confirm-subscription', {
        subscriptionId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to confirm subscription');
      }

      return response.data;
    } catch (error: any) {
      secureLog.error('[STRIPE] Error confirming subscription:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Cancel a Stripe subscription (requires auth)
   * POST /api/v1/a/cancel-subscription
   */
  cancelSubscription: async (subscriptionId: string): Promise<{
    message: string;
    cancel_at: string | null;
    current_period_end: string;
  }> => {
    try {
      secureLog.debug('[STRIPE] Cancelling subscription:', subscriptionId);
      const response = await authApiClient.post('/cancel-subscription', {
        subscriptionId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to cancel subscription');
      }

      secureLog.debug('[STRIPE] Subscription cancelled successfully');
      return {
        message: response.data.message,
        cancel_at: response.data.cancel_at,
        current_period_end: response.data.current_period_end,
      };
    } catch (error: any) {
      secureLog.error('[STRIPE] Error cancelling subscription:', error.message);
      throw handleApiError(error);
    }
  },

  preSubscribeCheck: async (): Promise<{
    has_active_access: boolean;
    is_subscribed: boolean;
    current_plan_name: string | null;
    current_valid_until: string | null;
    current_minutes_remaining: number;
    current_days_remaining: number;
    trial_status: string | null;
  }> => {
    try {
      secureLog.debug('[SUBSCRIPTION] Pre-subscribe check...');
      const response = await authApiClient.post('/pre-subscribe-check');
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to check subscription status');
      }
      return response.data;
    } catch (error: any) {
      secureLog.error('[SUBSCRIPTION] Pre-subscribe check error:', error.message);
      throw handleApiError(error);
    }
  },


  /**
   * Create a top-up PaymentIntent (requires auth)
   * POST /api/v1/a/create-topup-checkout
   * Returns clientSecret for in-app Payment Sheet
   */
  createTopupCheckout: async (): Promise<{
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    paymentIntentId: string;
  }> => {
    try {
      secureLog.debug('[TOPUP] Creating top-up payment intent...');

      const response = await authApiClient.post('/create-topup-checkout', {});

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create top-up payment');
      }

      secureLog.debug('[TOPUP] Payment intent created:', {
        paymentIntentId: response.data.paymentIntentId,
        hasClientSecret: !!response.data.clientSecret,
      });

      return {
        clientSecret: response.data.clientSecret,
        ephemeralKey: response.data.ephemeralKey,
        customerId: response.data.customerId,
        paymentIntentId: response.data.paymentIntentId,
      };
    } catch (error: any) {
      secureLog.error('[TOPUP] Error creating top-up payment:', error.message);
      throw handleApiError(error);
    }
  },

  confirmTopup: async (paymentIntentId: string): Promise<{
    success: boolean;
    message: string;
    trialMinutesTotal: number;
    minutesRemaining?: number;
  }> => {
    try {
      secureLog.debug('[TOPUP] Confirming top-up payment:', paymentIntentId);
      const response = await authApiClient.post('/confirm-topup', { paymentIntentId });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to confirm top-up');
      }

      secureLog.debug('[TOPUP] Top-up confirmed:', response.data);
      return response.data;
    } catch (error: any) {
      secureLog.error('[TOPUP] Error confirming top-up:', error.message);
      throw handleApiError(error);
    }
  },

  reactivateSubscription: async (subscriptionId: string): Promise<{
    message: string;
    current_period_end: string | null;
  }> => {
    try {
      secureLog.debug('[STRIPE] Reactivating subscription:', subscriptionId);
      const response = await authApiClient.post('/reactivate-subscription', {
        subscriptionId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to reactivate subscription');
      }

      secureLog.debug('[STRIPE] Subscription reactivated successfully');
      return {
        message: response.data.message,
        current_period_end: response.data.current_period_end,
      };
    } catch (error: any) {
      secureLog.error('[STRIPE] Error reactivating subscription:', error.message);
      throw handleApiError(error);
    }
  },

  updatePaymentMethod: async (): Promise<{
    clientSecret: string;
    ephemeralKey: string;
    customerId: string;
    setupIntentId: string;
  }> => {
    try {
      secureLog.debug('[STRIPE] Creating setup intent for payment method update...');
      const response = await authApiClient.post('/update-payment-method');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to create setup intent');
      }

      secureLog.debug('[STRIPE] Setup intent created for payment method update');
      return {
        clientSecret: response.data.clientSecret,
        ephemeralKey: response.data.ephemeralKey,
        customerId: response.data.customerId,
        setupIntentId: response.data.setupIntentId,
      };
    } catch (error: any) {
      secureLog.error('[STRIPE] Error creating setup intent:', error.message);
      throw handleApiError(error);
    }
  },

  getPaymentHistory: async (): Promise<PaymentRecord[]> => {
    try {
      secureLog.debug('[PAYMENTS] Fetching payment history...');
      const response = await authApiClient.get('/payment-history');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch payment history');
      }

      secureLog.debug('[PAYMENTS] Payment history fetched:', response.data.total);
      return response.data.payments || [];
    } catch (error: any) {
      secureLog.error('[PAYMENTS] Error fetching payment history:', error.message);
      throw handleApiError(error);
    }
  },
};

export interface PaymentRecord {
  id: string;
  type: 'topup' | 'subscription' | 'stripe_charge';
  planName: string;
  amount: number;
  currency: string;
  status: string;
  minutesAdded: number | null;
  date: string | null;
  validUntil: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  receiptUrl: string | null;
  refunded: boolean;
}

// ============================================
// PUSH NOTIFICATIONS API
// ============================================

export const pushNotificationApi = {
  registerToken: async (pushToken: string, platform: string = 'expo', deviceId?: string): Promise<void> => {
    try {
      secureLog.debug('[PUSH] Registering push token...');
      const response = await authApiClient.post('/push-token', {
        pushToken,
        platform,
        deviceId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to register push token');
      }

      secureLog.debug('[PUSH] Push token registered successfully');
    } catch (error: any) {
      secureLog.error('[PUSH] Error registering push token:', error.message);
      throw handleApiError(error);
    }
  },

  unregisterToken: async (pushToken: string): Promise<void> => {
    try {
      secureLog.debug('[PUSH] Unregistering push token...');
      const response = await authApiClient.delete('/push-token', {
        data: { pushToken },
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to unregister push token');
      }

      secureLog.debug('[PUSH] Push token unregistered successfully');
    } catch (error: any) {
      secureLog.error('[PUSH] Error unregistering push token:', error.message);
    }
  },
};

// ============================================
// SETTINGS API
// ============================================

export interface UserSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  updated_at: string;
}

export interface SettingsResponse {
  success: boolean;
  settings: UserSetting[];
}

export const settingsApi = {
  /**
   * Get all settings for the logged-in user
   * GET /api/v1/a/settings
   */
  getSettings: async (): Promise<UserSetting[]> => {
    try {
      secureLog.debug('[SETTINGS] Fetching user settings...');
      const response = await authApiClient.get('/settings');

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch settings');
      }

      secureLog.debug('[SETTINGS] Settings fetched:', response.data.settings.length);
      return response.data.settings;
    } catch (error: any) {
      secureLog.error('[SETTINGS] Error fetching settings:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Create or update settings (upsert)
   * PUT /api/v1/a/settings
   */
  updateSettings: async (settings: Array<{ setting_key: string; setting_value: string }>): Promise<UserSetting[]> => {
    try {
      secureLog.debug('[SETTINGS] Updating settings:', settings);
      const response = await authApiClient.put('/settings', { settings });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update settings');
      }

      secureLog.debug('[SETTINGS] Settings updated successfully');
      return response.data.settings;
    } catch (error: any) {
      secureLog.error('[SETTINGS] Error updating settings:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Delete a specific setting by key
   * DELETE /api/v1/a/settings/:key
   */
  deleteSetting: async (key: string): Promise<void> => {
    try {
      secureLog.debug('[SETTINGS] Deleting setting:', key);
      const response = await authApiClient.delete(`/settings/${key}`);

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to delete setting');
      }

      secureLog.debug('[SETTINGS] Setting deleted successfully');
    } catch (error: any) {
      secureLog.error('[SETTINGS] Error deleting setting:', error.message);
      throw handleApiError(error);
    }
  },

  /**
   * Get a specific setting value by key
   * Helper function that parses the settings array
   */
  getSetting: async (key: string): Promise<string | null> => {
    try {
      const settings = await settingsApi.getSettings();
      const setting = settings.find(s => s.setting_key === key);
      return setting ? setting.setting_value : null;
    } catch (error) {
      secureLog.error('[SETTINGS] Error getting setting:', error);
      return null;
    }
  },
};

// ============================================
// USAGE STATS API
// ============================================

export interface UsageStats {
  trialMinutesTotal: number;
  trialMinutesUsed: number;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialUsed: boolean;
  totalTranscriptions: number;
  totalUsageSeconds: number;
}

export interface AudioLog {
  id: string;
  userId: string;
  usageTime: string;
  usageSeconds: number;
  sourceLanguage: string;
  createdAt: string;
}

export const usageApi = {
  getStats: async (): Promise<UsageStats> => {
    try {
      const response = await authApiClient.get('/usage-stats');
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch usage stats');
      }
      return response.data.stats;
    } catch (error: any) {
      secureLog.error('[USAGE] Primary stats endpoint failed, trying fallback /me:', error.message);
      try {
        const meResponse = await authApiClient.get('/me');
        if (meResponse.data?.success && meResponse.data?.user) {
          const u = meResponse.data.user;
          return {
            trialMinutesTotal: u.trialMinutesTotal ?? 90,
            trialMinutesUsed: u.trialMinutesUsed ?? 0,
            trialStartsAt: u.trialStartsAt ?? null,
            trialEndsAt: u.trialEndsAt ?? null,
            trialUsed: u.trialUsed ?? false,
            totalTranscriptions: 0,
            totalUsageSeconds: 0,
          };
        }
      } catch (fallbackErr: any) {
        secureLog.error('[USAGE] Fallback /me also failed:', fallbackErr.message);
      }
      throw handleApiError(error);
    }
  },

  getAudioLogs: async (page: number = 1, limit: number = 50): Promise<{ logs: AudioLog[]; total: number; page: number; limit: number }> => {
    try {
      const response = await authApiClient.get(`/audio-logs?page=${page}&limit=${limit}`);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch audio logs');
      }
      return {
        logs: response.data.logs,
        total: response.data.total,
        page: response.data.page,
        limit: response.data.limit,
      };
    } catch (error: any) {
      secureLog.error('[USAGE] Error fetching audio logs:', error.message);
      throw handleApiError(error);
    }
  },
};

// ============ IMAGE GENERATION API ============
export interface ImageGenerationResponse {
  success: boolean;
  imageBase64?: string;
  revisedPrompt?: string;
  error?: string;
}

export const imageApi = {
  generateImage: async (
    prompt: string,
    size: '1024x1024' | '1024x1792' | '1792x1024' = '1024x1024',
    quality: 'standard' | 'hd' = 'standard'
  ): Promise<ImageGenerationResponse> => {
    secureLog.debug('[IMAGE GEN] Starting image generation...');
    secureLog.debug('[IMAGE GEN] Prompt length:', prompt.length);
    secureLog.debug('[IMAGE GEN] Size:', size, 'Quality:', quality);

    try {
      const response = await authApiClient.post('/generate-image', {
        prompt,
        size,
        quality,
      }, {
        timeout: 120000,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Image generation failed');
      }

      secureLog.debug('[IMAGE GEN] Image generated successfully');
      return {
        success: true,
        imageBase64: response.data.imageBase64,
        revisedPrompt: response.data.revisedPrompt,
      };
    } catch (error: any) {
      secureLog.error('[IMAGE GEN] Error:', error.message);
      throw handleApiError(error);
    }
  },
};

// Export clients for direct access if needed
export { authApiClient, publicApiClient };
export default api;
