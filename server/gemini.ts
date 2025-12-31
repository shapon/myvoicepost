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

// Transcribe audio using Gemini with retry logic
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  console.log(`[Gemini] Transcribing audio: ${audioBuffer.length} bytes, mimeType: ${mimeType}`);
  
  return pRetry(
    async () => {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [
              { 
                inlineData: { 
                  mimeType, 
                  data: audioBuffer.toString("base64") 
                } 
              },
              { text: "Listen to the ENTIRE audio recording from start to finish and transcribe EVERY word spoken. Do not skip or truncate any part. Return the complete transcription as plain text only, with no additional commentary or formatting." }
            ]
          }]
        });
        
        const transcription = response.text || "";
        console.log(`[Gemini] Transcription result (${transcription.length} chars): ${transcription}`);
        return transcription;
      } catch (error: any) {
        console.error(`[Gemini] Transcription error:`, error);
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

