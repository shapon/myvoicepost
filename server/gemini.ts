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

// Transcribe audio using Gemini with retry logic
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  return pRetry(
    async () => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [
              { text: "Please transcribe this audio accurately. Return only the transcribed text, nothing else." },
              { 
                inlineData: { 
                  mimeType, 
                  data: audioBuffer.toString("base64") 
                } 
              }
            ]
          }]
        });
        
        return response.text || "";
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

          const result = JSON.parse(response.text || "{}");
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

        const result = JSON.parse(response.text || "{}");
        
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

// Polish text using Gemini (same language, with output type formatting)
export async function polishText(
  text: string,
  language: string,
  outputFormat: string,
  outputType: string
): Promise<string> {
  const langName = languageNames[language] || language;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;
  const typeGuide = outputTypeInstructions[outputType] || outputTypeInstructions.message;

  return pRetry(
    async () => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `You are an expert writer and editor. Transform the following speech transcription into well-written ${outputType}.

Language: ${langName}
Tone: ${toneGuide}
Format: ${typeGuide}

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

        const result = JSON.parse(response.text || "{}");
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
