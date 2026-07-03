import { useCallback, useEffect, useRef, useState } from "react";

export const LANGUAGE_TO_BCP47: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  nl: "nl-NL",
  ru: "ru-RU",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  ar: "ar-SA",
  hi: "hi-IN",
  tr: "tr-TR",
  pl: "pl-PL",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
};

export function toBcp47(languageCode: string): string {
  return LANGUAGE_TO_BCP47[languageCode] || "en-US";
}

interface UseLiveDictationOptions {
  language?: string;
  onInterimResult?: (spokenText: string) => void;
  onFinalResult?: (spokenText: string) => void;
}

interface UseLiveDictationResult {
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): any {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export function useLiveDictation({
  language = "en-US",
  onInterimResult,
  onFinalResult,
}: UseLiveDictationOptions): UseLiveDictationResult {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  const isSupported = !!SpeechRecognitionCtor;

  const recognitionRef = useRef<any>(null);
  const shouldRestartRef = useRef(false);
  const spokenTextRef = useRef("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInterimResultRef = useRef(onInterimResult);
  const onFinalResultRef = useRef(onFinalResult);
  onInterimResultRef.current = onInterimResult;
  onFinalResultRef.current = onFinalResult;

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(() => {
    if (!isSupported) return;

    setError(null);
    spokenTextRef.current = "";
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          spokenTextRef.current = spokenTextRef.current
            ? spokenTextRef.current.trim() + " " + transcript.trim()
            : transcript.trim();
        } else {
          interim += transcript;
        }
      }
      const combined = interim.trim()
        ? (spokenTextRef.current ? spokenTextRef.current + " " + interim.trim() : interim.trim())
        : spokenTextRef.current;
      onInterimResultRef.current?.(combined);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission denied. Please allow microphone access.");
        shouldRestartRef.current = false;
      } else {
        setError(event.error || "Speech recognition error");
      }
    };

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // fall through to stopped state if restart fails
        }
      }
      setIsListening(false);
      onFinalResultRef.current?.(spokenTextRef.current);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError("Failed to start speech recognition. Please try again.");
      setIsListening(false);
    }
  }, [isSupported, language]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  return { isSupported, isListening, error, start, stop };
}
