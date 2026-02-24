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
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  pl: "Polish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
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
  /^okay\.?$/i,
  /^yes\.?$/i,
  /^no\.?$/i,
  /^right\.?$/i,
  /^so\.?$/i,
  /^well\.?$/i,
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
];

// Check if transcription looks like a hallucination from noise/silence
function isLikelyHallucination(text: string, audioSizeBytes: number): boolean {
  const trimmed = text.trim();
  
  // Empty or very short text
  if (trimmed.length < 5) {
    console.log(`[Gemini] Hallucination check: Text too short (${trimmed.length} chars)`);
    return true;
  }
  
  // Very short text relative to audio size (less than 1 char per 10KB of audio suggests silence)
  const charsPerKb = trimmed.length / (audioSizeBytes / 1024);
  if (charsPerKb < 0.5 && trimmed.length < 50) {
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

// Transcribe audio using Gemini with retry logic
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  // Generate unique transcription request ID
  const transcriptionId = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();
  
  // Generate audio fingerprint for debugging
  const bufferHash = audioBuffer.slice(0, 20).toString('hex') + '...' + audioBuffer.slice(-20).toString('hex');
  const base64Preview = audioBuffer.toString('base64').substring(0, 50);
  
  console.log(`[Gemini] ========== TRANSCRIPTION ${transcriptionId} ==========`);
  console.log(`[Gemini] Timestamp: ${timestamp}`);
  console.log(`[Gemini] Audio size: ${audioBuffer.length} bytes`);
  console.log(`[Gemini] MIME type: ${mimeType}`);
  console.log(`[Gemini] Buffer fingerprint: ${bufferHash}`);
  console.log(`[Gemini] Base64 preview: ${base64Preview}...`);
  
  // Validate audio file header
  const headerCheck = validateAudioHeader(audioBuffer, mimeType);
  console.log(`[Gemini] ${transcriptionId} - Header validation: ${headerCheck.details}`);
  
  if (!headerCheck.valid) {
    console.log(`[Gemini] ${transcriptionId} - WARNING: Audio header validation failed!`);
    // Continue anyway but log the warning
  }
  
  // Check for very small audio files (likely empty/corrupt)
  if (audioBuffer.length < 5000) {
    console.log(`[Gemini] ${transcriptionId} - Audio too small (${audioBuffer.length} bytes), likely empty`);
    return "";
  }
  
  return pRetry(
    async () => {
      try {
        const base64Data = audioBuffer.toString("base64");
        console.log(`[Gemini] ${transcriptionId} - Sending to Gemini API, base64 length: ${base64Data.length}`);
        
        // Simple, direct prompt for transcription
        const uniquePrompt = `Transcribe the audio file attached to this message.

Rules:
- Return ONLY the exact words spoken in the audio
- If silent or no speech: return [SILENT]
- If unclear: return [UNCLEAR]  
- Do not make up content or guess

Transcription:`;

        // Use audio/* for better compatibility if m4a
        let effectiveMimeType = mimeType;
        if (mimeType === 'audio/m4a') {
          effectiveMimeType = 'audio/mp4'; // M4A is MP4 audio container
        }
        
        console.log(`[Gemini] ${transcriptionId} - Using MIME type: ${effectiveMimeType} (original: ${mimeType})`);
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [
              { 
                inlineData: { 
                  mimeType: effectiveMimeType, 
                  data: base64Data 
                } 
              },
              { text: uniquePrompt }
            ]
          }],
          config: {
            temperature: 0, // Use 0 temperature for deterministic output
          }
        });
        
        let transcription = response.text?.trim() || "";
        console.log(`[Gemini] ${transcriptionId} - Raw result (${transcription.length} chars): "${transcription}"`);
        
        // Check for explicit error markers
        const errorMarkers = ["[SILENCE]", "[SILENT]", "[NOISE]", "[UNCLEAR]", "[AUDIO_UNCLEAR]", "[AUDIO_EMPTY]", "[NO AUDIO]", "[NO SPEECH]"];
        for (const marker of errorMarkers) {
          if (transcription.toUpperCase().includes(marker)) {
            console.log(`[Gemini] ${transcriptionId} - Audio issue detected: ${marker}`);
            return "";
          }
        }
        
        // Check for hallucination patterns
        if (isLikelyHallucination(transcription, audioBuffer.length)) {
          console.log(`[Gemini] ${transcriptionId} - Detected likely hallucination, returning empty`);
          return "";
        }
        
        console.log(`[Gemini] ${transcriptionId} - Valid transcription: "${transcription}"`);
        console.log(`[Gemini] ========== END ${transcriptionId} ==========`);
        
        return transcription;
      } catch (error: any) {
        console.error(`[Gemini] ${transcriptionId} - ERROR:`, error);
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

// Translate and polish text using Gemini
export async function translateAndPolish(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  outputFormat: string
): Promise<{ translatedText: string; polishedText: string }> {
  const sourceLang = languageNames[sourceLanguage] || sourceLanguage;
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  return pRetry(
    async () => {
      try {
        // If source and target are the same, just polish the text
        if (sourceLanguage === targetLanguage) {
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

        // Translate and polish in one call
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert translator and writer. The user will provide text in ${sourceLang}. 

Your task:
1. Translate the text accurately to ${targetLang}
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
      { id: "podcast", label: "Podcast-style", instruction: "Write in a podcast host style — conversational, engaging, with rhetorical questions and natural flow as if speaking to an audience." },
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
export async function transcribeAudioFromUrl(url: string): Promise<string> {
  // Basic URL validation - only allow http/https
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
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
  const langName = languageNames[language] || language;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;
  const templateGuide = template && template !== "none" ? templateInstructions[template] || "" : "";

  return pRetry(
    async () => {
      try {
        const templateSection = templateGuide ? `\n\nTemplate Format:\n${templateGuide}` : "";
        
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert writer and editor. Transform the following speech transcription into well-written ${outputType}.

Language: ${langName}
Tone: ${toneGuide}
Format: ${typeGuide}${templateSection}

Make the text clear, well-structured, and grammatically correct while preserving the original meaning and intent.

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

