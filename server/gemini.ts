import { GoogleGenAI, Type } from "@google/genai";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";

// This is using Replit's AI Integrations service, which provides Gemini-compatible API access 
// without requiring your own Gemini API key. Charges are billed to your Replit credits.
const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Language name mapping for prompts
const languageNames: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", ru: "Russian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", hi: "Hindi", tr: "Turkish", pl: "Polish",
  vi: "Vietnamese", th: "Thai", id: "Indonesian",
  // Indian languages
  te: "Telugu", ta: "Tamil", mr: "Marathi", gu: "Gujarati", kn: "Kannada",
  ml: "Malayalam", or: "Odia", bn: "Bengali", pa: "Punjabi", ur: "Urdu",
  ne: "Nepali", si: "Sinhala",
  // South-East Asian
  ms: "Malay", tl: "Filipino", km: "Khmer", lo: "Lao", my: "Myanmar",
  // European
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", el: "Greek",
  cs: "Czech", sk: "Slovak", ro: "Romanian", hu: "Hungarian", bg: "Bulgarian",
  hr: "Croatian", sr: "Serbian", sl: "Slovenian", uk: "Ukrainian",
  lt: "Lithuanian", lv: "Latvian", et: "Estonian", is: "Icelandic",
  mk: "Macedonian", sq: "Albanian", bs: "Bosnian", cy: "Welsh",
  ga: "Irish", mt: "Maltese", ca: "Catalan", eu: "Basque", gl: "Galician",
  // Middle-Eastern / Central Asian
  he: "Hebrew", fa: "Persian", ka: "Georgian", hy: "Armenian",
  az: "Azerbaijani", kk: "Kazakh", uz: "Uzbek", mn: "Mongolian",
  // African
  sw: "Swahili", af: "Afrikaans", am: "Amharic",
};

// Tone/format instructions
const toneInstructions: Record<string, string> = {
  professional: "Use a professional, business-appropriate tone. Be clear, concise, and respectful.",
  casual: "Use a casual, friendly tone. Be conversational and approachable.",
  formal: "Use a formal, official tone. Be polished and ceremonious.",
  friendly: "Use a warm, friendly tone. Be personable and engaging.",
};

// Output type instructions
const outputTypeInstructions: Record<string, string> = {
  message: "Format as a well-structured message suitable for texting or messaging apps.",
  note: "Format as a concise, organized note with clear points.",
  email: "Format as a professional email with appropriate greeting and sign-off.",
  post: "Format as an engaging social media post that's attention-grabbing.",
  journal: "Format as a reflective journal entry with personal insights.",
};

// Template formatting instructions
const templateInstructions: Record<string, string> = {
  none: "",
  "meeting-followup": `Format as a professional Meeting Follow-Up Email with the following structure:
- Subject line suggestion
- Greeting
- Brief meeting summary
- Action items as a numbered or bulleted list with assigned owners and deadlines if mentioned
- Next steps
- Professional closing`,
  "client-refusal": `Format as a Formal Client Refusal email with the following structure:
- Professional greeting
- Express appreciation for the opportunity
- Clear but polite decline
- Brief reasoning (if appropriate)
- Offer alternative solutions or future collaboration possibilities
- Maintain positive relationship tone
- Professional closing`,
  "project-proposal": `Format as a Project Proposal Outline with the following structure:
- Executive Summary
- Project Objectives
- Scope of Work
- Timeline/Milestones
- Resources Required
- Budget Considerations (if mentioned)
- Expected Outcomes
- Next Steps`,
  "bullet-points": `Format the content as clear, organized bullet points:
- Use consistent bullet formatting
- Each point should be concise and actionable
- Group related points together
- Use sub-bullets for nested information`,
  "bolding": `Format the content with strategic bolding:
- **Bold key terms**, important concepts, and action items
- Use **bold text** for emphasis on critical information
- Bold names, dates, and important numbers
- Keep the overall structure readable with bold highlights`,
};

// Helper function to check if error is rate limit or quota violation
/** Thrown inside pRetry when Gemini returns a hallucinated result so the
 *  call is retried automatically (not wrapped in AbortError). */
class HallucinationError extends Error {
  constructor(attempt: number) {
    super(`Gemini hallucination detected on attempt ${attempt}, retrying`);
    this.name = 'HallucinationError';
  }
}

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Safe JSON parse with fallback
function safeJsonParse(text: string, fallback: any = {}): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", e, "Text:", text?.substring(0, 200));
    return fallback;
  }
}

// Common hallucination patterns for audio with silence/noise
// These are phrases Gemini generates when it receives no real speech
const HALLUCINATION_PATTERNS = [
  /^it'?s?\s+just\s+that\s+there'?s?\s+that\.?$/i,
  /^(um+|uh+|hmm+|ah+|oh+|eh+)[\s.,!?]*$/i,
  /^that'?s?\s+it\.?$/i,
  // Generic filler hallucinations
  /^(okay|alright|all right|sure|yep|yeah|yes|no)[,.]?$/i,
  /^thank\s+you\.?$/i,
  /^(hello|hi|hey)\s*(there|everyone|folks)?\.?$/i,
  /^welcome\.?$/i,
  /^(good\s+)?(morning|afternoon|evening|day)\.?$/i,
  /music\s+(playing|continues|fades)/i,
  /\[music\]/i,
  /\[applause\]/i,
  /\[laughter\]/i,
  /\[background\s+noise\]/i,
  /\[inaudible\]/i,
  /\[crosstalk\]/i,
  /this\s+is\s+(a\s+)?test/i,
  /the\s+following\s+is\s+a\s+transcription/i,
  /^(caption|subtitle)s?\s+by/i,
  /subtitles?\s+provided\s+by/i,
  /auto(-|\s)?generated\s+captions?/i,
  /transcript\s+generated\s+by/i,
  /^narrator\s*:/i,
  /^speaker\s*\d*\s*:/i,
  /^(right|so|well)[,.]?$/i,
  /^\.+$/,
  // Common elaborate hallucination patterns - Gemini often generates these
  /welcome\s+to\s+(the\s+)?(new\s+)?episode\s+of/i,
  /welcome\s+to\s+this\s+new\s+episode/i,
  /welcome\s+to\s+(the\s+)?podcast/i,
  /today\s+we\s+are\s+joined\s+by/i,
  /today\s+we'?re?\s+joined\s+by/i,
  /our\s+very\s+special\s+guest/i,
  /thank\s+you\s+for\s+joining\s+us/i,
  /thank\s+you\s+for\s+being\s+with\s+us/i,
  /john\s+smith/i,  // Common placeholder name in hallucinations
  /jane\s+doe/i,    // Common placeholder name in hallucinations
  /mr\.\s+smith/i,
  /mrs?\.\s+john/i,
  /^\s*$/,
  // Prompt leakage — Gemini returning our own prompt text as transcription
  /you are a strict speech-to-text transcription engine/i,
  /speech-to-text transcription engine/i,
  /task:\s*transcribe/i,
  /strict rules\s*--\s*you must follow/i,
  /return\s+only\s+valid\s+json/i,
  /do not\s+stop\s+early\s+or\s+truncate/i,
  /never\s+invent,?\s+paraphrase,?\s+summar/i,
  /confidence values:\s*"high"/i,
  /\bdetectedlanguage\b.*\bbcp-47\b/i,
];

// Check if transcription looks like a hallucination from noise/silence
function isLikelyHallucination(text: string, audioSizeBytes: number): boolean {
  const trimmed = text.trim();
  
  // Empty or very short text (only flag if truly trivial - single char/punctuation)
  if (trimmed.length < 3) {
    console.log(`[Gemini] Hallucination check: Text too short (${trimmed.length} chars)`);
    return true;
  }
  
  // Density check: only flag if text is extremely sparse AND very small (< 10 chars).
  // Do NOT discard real short utterances ("yes", "hello", short answers) from long recordings.
  // Trust Gemini's hasSpeech/confidence judgement over a byte-ratio heuristic.
  const charsPerKb = trimmed.length / (audioSizeBytes / 1024);
  if (charsPerKb < 0.1 && trimmed.length < 10) {
    console.log(`[Gemini] Suspiciously low text density: ${charsPerKb.toFixed(2)} chars/KB`);
    return true;
  }
  
  // Check known hallucination patterns - these can appear ANYWHERE in the text
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.log(`[Gemini] Detected hallucination pattern in text: ${pattern.source}`);
      console.log(`[Gemini] Flagged text: "${trimmed.substring(0, 200)}..."`);
      return true;
    }
  }
  
  // Additional check: if text contains multiple common "filler" hallucination phrases
  const hallucinationKeywords = [
    'podcast', 'episode', 'special guest', 'john smith', 'jane doe',
    'welcome to the show', 'thank you for joining', 'honored to have',
    'our guest today', 'joining us today'
  ];
  
  const lowerText = trimmed.toLowerCase();
  let keywordCount = 0;
  for (const keyword of hallucinationKeywords) {
    if (lowerText.includes(keyword)) {
      keywordCount++;
      console.log(`[Gemini] Found hallucination keyword: "${keyword}"`);
    }
  }
  
  // If 2+ hallucination keywords found, it's likely fabricated
  if (keywordCount >= 2) {
    console.log(`[Gemini] Multiple hallucination keywords (${keywordCount}) detected - likely fabricated content`);
    return true;
  }
  
  return false;
}

// Validate M4A/AAC audio file header
function validateAudioHeader(buffer: Buffer, mimeType: string): { valid: boolean; details: string } {
  const hex = buffer.slice(0, 32).toString('hex');
  
  // M4A/MP4 files start with ftyp box
  if (hex.includes('66747970')) { // 'ftyp' in hex
    return { valid: true, details: 'Valid M4A/MP4 header (ftyp box found)' };
  }
  
  // AAC files may start with ADTS sync word (0xFFF)
  if (buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0) {
    return { valid: true, details: 'Valid AAC ADTS header' };
  }
  
  // WAV files start with RIFF
  if (hex.startsWith('52494646')) { // 'RIFF' in hex
    return { valid: true, details: 'Valid WAV header' };
  }
  
  // MP3 files start with ID3 or sync word
  if (hex.startsWith('494433') || buffer[0] === 0xFF) { // 'ID3' or sync
    return { valid: true, details: 'Valid MP3 header' };
  }
  
  return { 
    valid: false, 
    details: `Unknown format. First 32 bytes hex: ${hex}` 
  };
}

// Normalise MIME type for Gemini compatibility
function normaliseMimeType(mimeType: string): string {
  if (mimeType === 'audio/m4a') return 'audio/mp4';
  if (mimeType === 'audio/x-m4a') return 'audio/mp4';
  if (mimeType === 'audio/x-wav') return 'audio/wav';
  if (mimeType === 'audio/x-mp3') return 'audio/mpeg';
  return mimeType;
}

// =============================================================================
// ENDPOINT: /api/v1/a/transcribe_l  (language-specific transcription)
// PURPOSE : Caller provides an explicit BCP-47 language code.  Gemini is told
//           which language to expect and should IGNORE all other languages.
// PROMPT  : Defined inline inside this function -- fully standalone.
//           Do NOT share or merge with transcribeAudioAuto's prompt.
// =============================================================================
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  language: string = "en"
): Promise<string> {
  const transcriptionId = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();
  const bufferHash = audioBuffer.slice(0, 20).toString('hex') + '...' + audioBuffer.slice(-20).toString('hex');

  console.log(`[Gemini] ========== TRANSCRIPTION ${transcriptionId} ==========`);
  console.log(`[Gemini] Timestamp: ${timestamp}`);
  console.log(`[Gemini] Audio size: ${audioBuffer.length} bytes`);
  console.log(`[Gemini] MIME type: ${mimeType} | Language: ${language}`);
  console.log(`[Gemini] Buffer fingerprint: ${bufferHash}`);

  // Validate audio file header
  const headerCheck = validateAudioHeader(audioBuffer, mimeType);
  console.log(`[Gemini] ${transcriptionId} - Header: ${headerCheck.details}`);
  if (!headerCheck.valid) {
    console.log(`[Gemini] ${transcriptionId} - WARNING: audio header invalid -- proceeding anyway`);
  }

  // Reject suspiciously small buffers (< 5 KB  under 0.3 s of audio)
  if (audioBuffer.length < 5000) {
    console.log(`[Gemini] ${transcriptionId} - Audio too small (${audioBuffer.length} bytes), skipping`);
    return "";
  }

  const langName = languageNames[language] || language;
  const effectiveMimeType = normaliseMimeType(mimeType);

  let hallucinationCount = 0;

  return pRetry(
    async (attemptNumber) => {
      try {
        const base64Data = audioBuffer.toString("base64");
        console.log(`[Gemini] ${transcriptionId} - Sending ${base64Data.length} chars of base64, lang=${langName}`);

        //  Structured prompt 
        // We ask Gemini to return JSON so the response is machine-readable and
        // cannot accidentally contain stray prose.  The confidence field lets us
        // reject low-confidence guesses before they reach the user.
        const prompt = `You are a strict speech-to-text transcription engine.

TASK: Transcribe the audio attached to this message — every single word from start to finish.
EXPECTED LANGUAGE: ${langName} (${language})

STRICT RULES -- you MUST follow every rule:
1. Output ONLY what is actually spoken in the audio. Word-for-word, ALL of it.
2. Transcribe the COMPLETE audio from beginning to end. Do NOT stop early or truncate.
3. If the audio contains speech in ${langName}, transcribe it exactly.
4. If there is NO speech (silence, background noise, music), set "hasSpeech" to false and "transcription" to "".
5. If the speech is too unclear to transcribe reliably, set "confidence" to "low" and still transcribe what you hear.
6. NEVER invent, paraphrase, summarise, or add anything not actually spoken.
7. NEVER add labels like "Speaker:", "Narrator:", timestamps, or any commentary.
8. NEVER output podcast intros, greetings, or placeholder text.
9. Return ONLY valid JSON. No extra text before or after.

Return this exact JSON structure:
{
  "hasSpeech": true,
  "confidence": "high",
  "transcription": "exact words spoken here"
}

Confidence values: "high" (clearly audible), "medium" (mostly clear), "low" (hard to hear)`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: effectiveMimeType, data: base64Data } },
              { text: prompt }
            ]
          }],
          config: {
            temperature: attemptNumber > 1 ? 0.3 : 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hasSpeech:     { type: Type.BOOLEAN },
                confidence:    { type: Type.STRING },
                transcription: { type: Type.STRING },
              },
              required: ["hasSpeech", "confidence", "transcription"],
            },
          }
        });

        const rawText = response.text?.trim() || "";
        console.log(`[Gemini] ${transcriptionId} - Raw JSON (${rawText.length} chars): ${rawText.substring(0, 300)}`);

        //  Parse structured response 
        const parsed = safeJsonParse(rawText, null);

        if (!parsed) {
          // JSON parse failed -- treat as empty rather than using raw text
          console.log(`[Gemini] ${transcriptionId} - JSON parse failed, discarding response`);
          return "";
        }

        const { hasSpeech, confidence, transcription } = parsed as {
          hasSpeech: boolean;
          confidence: string;
          transcription: string;
        };

        console.log(`[Gemini] ${transcriptionId} - hasSpeech=${hasSpeech}, confidence=${confidence}, text="${String(transcription).substring(0, 120)}"`);

        //  Guard: no speech detected 
        if (!hasSpeech) {
          if (audioBuffer.length > 100 * 1024) {
            hallucinationCount++;
            if (hallucinationCount <= 1) {
              console.log(`[Gemini] ${transcriptionId} - hasSpeech=false on large audio (${audioBuffer.length} bytes), retrying...`);
              throw new HallucinationError(hallucinationCount);
            }
            console.log(`[Gemini] ${transcriptionId} - hasSpeech=false again after retry, accepting as genuine silence`);
          } else {
            console.log(`[Gemini] ${transcriptionId} - No speech detected by model`);
          }
          return "";
        }

        //  Guard: low-confidence result -- still return text, don't discard
        if (confidence === "low") {
          console.log(`[Gemini] ${transcriptionId} - Low confidence, returning text with warning`);
        }

        const text = String(transcription || "").trim();
        if (!text) {
          console.log(`[Gemini] ${transcriptionId} - Empty transcription string`);
          return "";
        }

        //  Guard: explicit no-speech markers 
        const errorMarkers = ["[SILENCE]", "[SILENT]", "[NOISE]", "[UNCLEAR]",
                              "[AUDIO_UNCLEAR]", "[AUDIO_EMPTY]", "[NO AUDIO]", "[NO SPEECH]"];
        for (const marker of errorMarkers) {
          if (text.toUpperCase().includes(marker)) {
            console.log(`[Gemini] ${transcriptionId} - Error marker detected: ${marker}`);
            return "";
          }
        }

        //  Guard: hallucination patterns 
        if (isLikelyHallucination(text, audioBuffer.length)) {
          hallucinationCount++;
          if (hallucinationCount <= 1) {
            console.log(`[Gemini] ${transcriptionId} - Hallucination detected (attempt ${hallucinationCount}), retrying...`);
            throw new HallucinationError(hallucinationCount);
          }
          console.log(`[Gemini] ${transcriptionId} - Hallucination detected again after retry, discarding`);
          return "";
        }

        console.log(`[Gemini] ${transcriptionId} - ACCEPTED (${text.length} chars): "${text.substring(0, 120)}"`);
        console.log(`[Gemini] ========== END ${transcriptionId} ==========`);
        return text;

      } catch (error: any) {
        if (error instanceof HallucinationError) throw error; // pRetry will retry
        console.error(`[Gemini] ${transcriptionId} - ERROR:`, error);
        if (isRateLimitError(error)) {
          throw error; // let p-retry back off and retry
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
    }
  );
}

// =============================================================================
// ENDPOINT: /api/v1/a/transcribe  (auto-detect transcription)
// PURPOSE : No language is provided by the caller.  Gemini must auto-detect the
//           spoken language and return ALL speech regardless of language.
// PROMPT  : Defined inline inside this function -- fully standalone.
//           Do NOT share or merge with transcribeAudio's prompt.
// =============================================================================
export async function transcribeAudioAuto(
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ text: string; detectedLanguage?: string }> {
  const transcriptionId = `trans_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  console.log(`[Gemini] ========== AUTO-TRANSCRIPTION ${transcriptionId} ==========`);
  console.log(`[Gemini] Audio size: ${audioBuffer.length} bytes | MIME type: ${mimeType}`);

  const headerCheck = validateAudioHeader(audioBuffer, mimeType);
  console.log(`[Gemini] ${transcriptionId} - Header: ${headerCheck.details}`);

  if (audioBuffer.length < 5000) {
    console.log(`[Gemini] ${transcriptionId} - Audio too small (${audioBuffer.length} bytes), skipping`);
    return { text: "" };
  }

  const effectiveMimeType = normaliseMimeType(mimeType);

  let hallucinationCount = 0;

  return pRetry(
    async (attemptNumber) => {
      try {
        const base64Data = audioBuffer.toString("base64");
        console.log(`[Gemini] ${transcriptionId} - Sending ${base64Data.length} chars of base64 (auto-detect mode)`);

        const prompt = `You are a strict speech-to-text transcription engine.

TASK: Transcribe ALL speech in this audio, in whatever language(s) are spoken — every single word from start to finish.
LANGUAGE: auto (detect language automatically from the audio)

STRICT RULES -- you MUST follow every rule:
1. Detect and transcribe ALL spoken words exactly as heard, in their original language(s).
2. Transcribe the COMPLETE audio from beginning to end. Do NOT stop early or truncate.
3. If multiple languages are spoken, transcribe each part in its original language without mixing or translating.
4. If there is NO speech (silence, background noise, music only), set "hasSpeech" to false and "transcription" to "".
5. If speech is unclear, set "confidence" to "low" and still transcribe what you hear.
6. NEVER invent, paraphrase, summarise, or add anything not actually spoken.
7. NEVER add labels like "Speaker:", "Narrator:", language tags, timestamps, or any commentary.
8. NEVER output podcast intros, greetings, or placeholder text.
9. Return ONLY valid JSON. No extra text before or after.

Return this exact JSON structure:
{
  "hasSpeech": true,
  "confidence": "high",
  "transcription": "exact words spoken here",
  "detectedLanguage": "en"
}

Confidence values: "high" (clearly audible), "medium" (mostly clear), "low" (hard to hear)
For detectedLanguage: use BCP-47 code of the primary language spoken (e.g. "en", "hi", "es", "fr")`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: effectiveMimeType, data: base64Data } },
              { text: prompt }
            ]
          }],
          config: {
            temperature: attemptNumber > 1 ? 0.3 : 0,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hasSpeech:        { type: Type.BOOLEAN },
                confidence:       { type: Type.STRING },
                transcription:    { type: Type.STRING },
                detectedLanguage: { type: Type.STRING },
              },
              required: ["hasSpeech", "confidence", "transcription"],
            },
          }
        });

        const rawText = response.text?.trim() || "";
        console.log(`[Gemini] ${transcriptionId} - Raw JSON (${rawText.length} chars): ${rawText.substring(0, 300)}`);

        const parsed = safeJsonParse(rawText, null);
        if (!parsed) {
          console.log(`[Gemini] ${transcriptionId} - JSON parse failed, discarding response`);
          return { text: "" };
        }

        const { hasSpeech, confidence, transcription, detectedLanguage } = parsed as {
          hasSpeech: boolean;
          confidence: string;
          transcription: string;
          detectedLanguage?: string;
        };

        console.log(`[Gemini] ${transcriptionId} - hasSpeech=${hasSpeech}, confidence=${confidence}, detectedLang=${detectedLanguage}, text="${String(transcription).substring(0, 120)}"`);

        if (!hasSpeech) {
          if (audioBuffer.length > 100 * 1024) {
            hallucinationCount++;
            if (hallucinationCount <= 1) {
              console.log(`[Gemini] ${transcriptionId} - hasSpeech=false on large audio (${audioBuffer.length} bytes), retrying...`);
              throw new HallucinationError(hallucinationCount);
            }
            console.log(`[Gemini] ${transcriptionId} - hasSpeech=false again after retry, accepting as genuine silence`);
          } else {
            console.log(`[Gemini] ${transcriptionId} - No speech detected`);
          }
          return { text: "" };
        }

        if (confidence === "low") {
          console.log(`[Gemini] ${transcriptionId} - Low confidence, returning text with warning`);
        }

        const text = String(transcription || "").trim();
        if (!text) {
          console.log(`[Gemini] ${transcriptionId} - Empty transcription string`);
          return { text: "" };
        }

        const errorMarkers = ["[SILENCE]", "[SILENT]", "[NOISE]", "[UNCLEAR]",
                              "[AUDIO_UNCLEAR]", "[AUDIO_EMPTY]", "[NO AUDIO]", "[NO SPEECH]"];
        for (const marker of errorMarkers) {
          if (text.toUpperCase().includes(marker)) {
            console.log(`[Gemini] ${transcriptionId} - Error marker detected: ${marker}`);
            return { text: "" };
          }
        }

        if (isLikelyHallucination(text, audioBuffer.length)) {
          hallucinationCount++;
          if (hallucinationCount <= 1) {
            console.log(`[Gemini] ${transcriptionId} - Hallucination detected (attempt ${hallucinationCount}), retrying...`);
            throw new HallucinationError(hallucinationCount);
          }
          console.log(`[Gemini] ${transcriptionId} - Hallucination detected again after retry, discarding`);
          return { text: "" };
        }

        console.log(`[Gemini] ${transcriptionId} - ACCEPTED (${text.length} chars): "${text.substring(0, 120)}"`);
        console.log(`[Gemini] ========== END ${transcriptionId} ==========`);
        return { text, detectedLanguage: detectedLanguage || undefined };

      } catch (error: any) {
        if (error instanceof HallucinationError) throw error; // pRetry will retry
        console.error(`[Gemini] ${transcriptionId} - ERROR:`, error);
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 5, minTimeout: 2000, maxTimeout: 30000, factor: 2 }
  );
}

// Translate and polish text using Gemini
export async function translateAndPolish(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  outputFormat: string
): Promise<{ translatedText: string; polishedText: string }> {
  // "none"/"auto"/empty are auto-detect sentinels from clients — never map
  // these into languageNames as if they were real language codes.
  const isAutoSource = !sourceLanguage || sourceLanguage === "none" || sourceLanguage === "auto";
  const sourceLang = isAutoSource ? undefined : (languageNames[sourceLanguage] || sourceLanguage);
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  return pRetry(
    async () => {
      try {
        // If source and target are explicitly the same, just polish the text.
        // Skip this shortcut for auto-detected source — we don't actually know
        // the spoken language yet, so it may differ from the target.
        if (!isAutoSource && sourceLanguage === targetLanguage) {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `You are an expert writer and editor. Polish the following text to make it clear, well-structured, and grammatically correct. ${toneGuide}

Return your response as JSON with this exact format:
{"polishedText": "the polished text here"}

Text to polish:
${text}`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  polishedText: { type: Type.STRING }
                },
                required: ["polishedText"]
              }
            }
          });

          const result = safeJsonParse(response.text || "{}", { polishedText: text });
          return {
            translatedText: text,
            polishedText: result.polishedText || text,
          };
        }

        const sourceLangInstruction = isAutoSource
          ? "The text below may be in any language — first detect what language it is actually written in, then proceed."
          : `The user will provide text in ${sourceLang}.`;

        // Translate and polish in one call
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert translator and writer. ${sourceLangInstruction}

Your task:
1. Translate the text accurately to ${targetLang}. If the text is already in ${targetLang}, return it unchanged as the translation.
2. Polish the translation to make it natural, fluent, and well-structured
3. ${toneGuide}

Return your response as JSON with this exact format:
{"translatedText": "direct translation", "polishedText": "polished and refined version"}

Text to translate:
${text}`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  translatedText: { type: Type.STRING },
                  polishedText: { type: Type.STRING }
                },
                required: ["translatedText", "polishedText"]
              }
            }
          });

        const result = safeJsonParse(response.text || "{}", { translatedText: text, polishedText: text });
        
        return {
          translatedText: result.translatedText || text,
          polishedText: result.polishedText || result.translatedText || text,
        };
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw error; // Rethrow to trigger p-retry
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
    }
  );
}

// Tone categories and their sub-tones for the Process page
export const toneCategories: Record<string, { label: string; tones: { id: string; label: string; instruction: string }[] }> = {
  conversational: {
    label: "Conversational & Media Tones",
    tones: [
      { id: "casual", label: "Casual", instruction: "Use a casual, laid-back conversational tone. Write as if chatting with a friend." },
      { id: "friendly", label: "Friendly", instruction: "Use a warm, approachable, and friendly tone that makes the reader feel welcome." },
      { id: "humorous", label: "Humorous", instruction: "Use a witty, humorous tone with light jokes and clever phrasing. Keep it tasteful." },
      { id: "storytelling", label: "Storytelling", instruction: "Use a narrative, storytelling tone. Structure the content as an engaging story with flow and vivid details." },
      { id: "podcast", label: "Podcast-style", instruction: "Write in a podcast host style -- conversational, engaging, with rhetorical questions and natural flow as if speaking to an audience." },
      { id: "interview", label: "Interview", instruction: "Format the content as if presenting interview insights. Structured, clear, with key quotes and takeaways." },
    ],
  },
  informational: {
    label: "Information-Driven Tones",
    tones: [
      { id: "professional", label: "Professional", instruction: "Use a polished, professional business tone. Be clear, concise, and authoritative." },
      { id: "formal", label: "Formal", instruction: "Use a formal, official tone suitable for documents, reports, and official communications." },
      { id: "academic", label: "Academic", instruction: "Use an academic, scholarly tone with precise language, citations-ready structure, and analytical depth." },
      { id: "technical", label: "Technical", instruction: "Use a technical tone with precise terminology, structured explanations, and detail-oriented content." },
      { id: "educational", label: "Educational", instruction: "Use an educational, teaching tone. Explain concepts clearly with examples, making complex ideas accessible." },
      { id: "instructional", label: "Instructional", instruction: "Use a step-by-step instructional tone. Provide clear directions and actionable guidance." },
    ],
  },
  emotional: {
    label: "Emotional & Rhetorical Tones",
    tones: [
      { id: "persuasive", label: "Persuasive", instruction: "Use a persuasive, compelling tone. Build strong arguments, use rhetorical devices, and drive the reader toward a conclusion." },
      { id: "inspirational", label: "Inspirational", instruction: "Use an uplifting, inspirational tone. Motivate and encourage the reader with powerful, positive language." },
      { id: "empathetic", label: "Empathetic", instruction: "Use a compassionate, empathetic tone. Show understanding, validate feelings, and connect emotionally with the reader." },
      { id: "dramatic", label: "Dramatic", instruction: "Use a dramatic, impactful tone with vivid descriptions, tension, and emotional weight." },
      { id: "motivational", label: "Motivational", instruction: "Use an energizing, motivational tone. Push the reader to take action with strong calls-to-action and positive reinforcement." },
      { id: "passionate", label: "Passionate", instruction: "Use a deeply passionate, enthusiastic tone that conveys strong conviction and excitement about the subject." },
    ],
  },
};

// Get tone instruction by tone ID
function getToneInstruction(toneId: string): string {
  for (const category of Object.values(toneCategories)) {
    const tone = category.tones.find(t => t.id === toneId);
    if (tone) return tone.instruction;
  }
  return toneInstructions.professional;
}

// Transform text with a specific tone using Gemini
export async function transformTextWithTone(
  text: string,
  toneId: string,
): Promise<string> {
  const toneGuide = getToneInstruction(toneId);

  return pRetry(
    async () => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert writer and content transformer. Rewrite the following text applying the specified tone while preserving the original meaning and key information.

Tone: ${toneGuide}

Important rules:
- Preserve all factual information and key points from the original text
- Adapt the writing style, vocabulary, and structure to match the requested tone
- Make the output feel natural and authentic to the tone
- Do not add information that wasn't in the original text

Return your response as JSON with this exact format:
{"transformedText": "the transformed text here"}

Original text:
${text}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transformedText: { type: Type.STRING }
              },
              required: ["transformedText"]
            }
          }
        });

        const result = safeJsonParse(response.text || "{}", { transformedText: text });
        return result.transformedText || text;
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw error;
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
    }
  );
}

// Transcribe audio from a URL by downloading it first
function isPrivateOrReservedHost(hostname: string): boolean {
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', ''].includes(hostname)) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
  }
  return false;
}

export async function transcribeAudioFromUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error("URLs pointing to private or internal addresses are not allowed");
  }

  console.log(`[Gemini] Fetching audio from URL: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${response.status} ${response.statusText}`);
  }

  // Check content length before downloading
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 25 * 1024 * 1024) {
    throw new Error("Audio file is too large (max 25MB)");
  }

  const contentType = response.headers.get("content-type") || "audio/mpeg";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[Gemini] Downloaded ${buffer.length} bytes, content-type: ${contentType}`);

  if (buffer.length > 25 * 1024 * 1024) {
    throw new Error("Audio file is too large (max 25MB)");
  }

  if (buffer.length < 1000) {
    throw new Error("Downloaded file is too small to be valid audio");
  }

  return transcribeAudio(buffer, contentType);
}

// Polish text using Gemini (same language, with output type formatting)
export async function polishText(
  text: string,
  language: string,
  outputFormat: string,
  outputType: string,
  template?: string
): Promise<string> {
  // "none" (Auto-detect) has no entry in languageNames, so let the model detect the
  // actual language of the source text instead of forcing an ambiguous "none" label.
  const isAutoDetect = !language || language === "none";
  const langName = languageNames[language] || (isAutoDetect ? undefined : language);
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;
  const templateGuide = template && template !== "none" ? templateInstructions[template] || "" : "";

  return pRetry(
    async () => {
      try {
        const templateSection = templateGuide ? `\n\nTemplate Format:\n${templateGuide}` : "";
        const languageInstruction = langName
          ? `Language: The source text is expected to be in ${langName}. Write the polished output in that same language. If the source text is actually written in a different language, keep the output in the language the source text is actually written in — never translate it into another language.`
          : `Language: Detect the language the source text is written in, and write the polished output in that exact same language. Never translate it into a different language.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert writer and editor. Transform the following speech transcription into well-written ${outputType}.

${languageInstruction}
Tone: ${toneGuide}
Format: ${typeGuide}${templateSection}

Make the text clear, well-structured, and grammatically correct while preserving the original meaning, intent, and language of the source text.

Return your response as JSON with this exact format:
{"polishedText": "the polished text here"}

Text to polish:
${text}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                polishedText: { type: Type.STRING }
              },
              required: ["polishedText"]
            }
          }
        });

        const result = safeJsonParse(response.text || "{}", { polishedText: text });
        return result.polishedText || text;
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw error;
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
    }
  );
}

