import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Square } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useLiveDictation, toBcp47 } from "@/hooks/useLiveDictation";
import WebVoiceRecorder from "@/components/WebVoiceRecorder";

interface LiveVoiceRecorderProps {
  currentText: string;
  onLiveTextChange: (text: string) => void;
  onTranscriptionComplete: (text: string) => void;
  onPartialTranscription?: (text: string) => void;
  maxDuration?: number;
  chunkDuration?: number;
  disabled?: boolean;
  language?: string;
}

export default function LiveVoiceRecorder({
  currentText,
  onLiveTextChange,
  onTranscriptionComplete,
  onPartialTranscription,
  maxDuration = 300,
  chunkDuration = 60,
  disabled = false,
  language = "en",
}: LiveVoiceRecorderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const baseTextRef = useRef("");
  const durationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bcp47Language = toBcp47(language);

  const { isSupported, isListening, error, start, stop } = useLiveDictation({
    language: bcp47Language,
    onInterimResult: (spokenText) => {
      const combined = baseTextRef.current
        ? baseTextRef.current + " " + spokenText
        : spokenText;
      onLiveTextChange(combined.trim());
    },
    onFinalResult: (spokenText) => {
      const combined = baseTextRef.current
        ? baseTextRef.current + " " + spokenText
        : spokenText;
      onLiveTextChange(combined.trim());
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    },
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Dictation Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, toast]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  if (!isSupported) {
    return (
      <WebVoiceRecorder
        onTranscriptionComplete={onTranscriptionComplete}
        onPartialTranscription={onPartialTranscription}
        maxDuration={maxDuration}
        chunkDuration={chunkDuration}
        disabled={disabled}
      />
    );
  }

  function handleClick() {
    if (!user) {
      toast({
        title: "Registration Required",
        description: "Please register to use 7 days trial",
        variant: "destructive",
      });
      navigate("/signup");
      return;
    }

    if (isListening) {
      stop();
    } else {
      baseTextRef.current = currentText.trim();
      durationRef.current = 0;
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        if (durationRef.current >= maxDuration) {
          stop();
        }
      }, 1000);
      start();
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4">
          {!isListening ? (
            <Button
              onClick={handleClick}
              disabled={disabled}
              size="icon"
              className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-500 text-white shadow-lg no-default-hover-elevate no-default-active-elevate transition-shadow duration-200"
              data-testid="button-start-recording"
            >
              <Mic className="h-6 w-6" />
            </Button>
          ) : (
            <Button
              onClick={handleClick}
              variant="destructive"
              size="icon"
              className="w-16 h-16 rounded-full shadow-lg no-default-hover-elevate no-default-active-elevate transition-shadow duration-200"
              data-testid="button-stop-recording"
            >
              <Square className="h-6 w-6" />
            </Button>
          )}

          {isListening && (
            <div className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span data-testid="text-live-listening">Listening... speak now</span>
            </div>
          )}

          {!isListening && (
            <p className="text-xs text-muted-foreground text-center">
              Click the mic and start speaking — your words will appear live as you talk.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
