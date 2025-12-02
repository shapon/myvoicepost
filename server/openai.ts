import OpenAI from "openai";
import type { TranslateRequest } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
// Lazy initialization to prevent crash on startup if API key is missing
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured. Please add your OPENAI_API_KEY.");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

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

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const openai = getOpenAIClient();
  
  // Convert buffer to a file-like object for OpenAI
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  const audioFile = new File([audioBlob], "audio.webm", { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
  });

  return transcription.text;
}

export async function translateAndPolish(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  outputFormat: string
): Promise<{ translatedText: string; polishedText: string }> {
  const sourceLang = languageNames[sourceLanguage] || sourceLanguage;
  const targetLang = languageNames[targetLanguage] || targetLanguage;
  const toneGuide = toneInstructions[outputFormat] || toneInstructions.professional;

  const openai = getOpenAIClient();

  // If source and target are the same, just polish the text
  if (sourceLanguage === targetLanguage) {
    const polishResponse = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are an expert writer and editor. Polish the following text to make it clear, well-structured, and grammatically correct. ${toneGuide} Respond with JSON in this format: { "polishedText": "the polished text" }`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(polishResponse.choices[0].message.content || "{}");
    return {
      translatedText: text,
      polishedText: result.polishedText || text,
    };
  }

  // Translate and polish in one call
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: `You are an expert translator and writer. The user will provide text in ${sourceLang}. 
        
Your task:
1. Translate the text accurately to ${targetLang}
2. Polish the translation to make it natural, fluent, and well-structured
3. ${toneGuide}

Respond with JSON in this format:
{
  "translatedText": "direct translation of the text",
  "polishedText": "polished and refined version of the translation"
}`,
      },
      {
        role: "user",
        content: text,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  
  return {
    translatedText: result.translatedText || text,
    polishedText: result.polishedText || result.translatedText || text,
  };
}
