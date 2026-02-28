import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Square, Loader2 } from "lucide-react";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface WebVoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onPartialTranscription?: (text: string) => void;
  maxDuration?: number;
  chunkDuration?: number;
  disabled?: boolean;
}

export default function WebVoiceRecorder({
  onTranscriptionComplete,
  onPartialTranscription,
  maxDuration = 300,
  chunkDuration = 60,
  disabled = false,
}: WebVoiceRecorderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [processingChunks, setProcessingChunks] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedTextRef = useRef("");
  const durationRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function transcribeBlob(blob: Blob): Promise<string> {
    const audio = await blobToBase64(blob);
    const token = getAuthToken();
    const endpoint = token ? "/api/v1/m/transcribe" : "/api/v1/p/transcribe";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio,
        mimeType: blob.type || "audio/webm",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Transcription failed" }));
      throw new Error(err.error || "Transcription failed");
    }
    const data = await res.json();
    return data.originalText || "";
  }

  async function processChunk() {
    if (chunksRef.current.length === 0) return;

    const chunkBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    setProcessingChunks((prev) => prev + 1);
    try {
      const text = await transcribeBlob(chunkBlob);
      if (text.trim()) {
        accumulatedTextRef.current = accumulatedTextRef.current
          ? accumulatedTextRef.current + " " + text.trim()
          : text.trim();
        onPartialTranscription?.(accumulatedTextRef.current);
      }
    } catch (err) {
      console.error("Chunk transcription error:", err);
    } finally {
      setProcessingChunks((prev) => Math.max(0, prev - 1));
    }
  }

  async function startRecording() {
    if (!user) {
      toast({
        title: "Registration Required",
        description: "Please register to use 7 days trial",
        variant: "destructive",
      });
      navigate("/signup");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      accumulatedTextRef.current = "";
      durationRef.current = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= maxDuration) {
          stopRecording();
        }
      }, 1000);

      chunkTimerRef.current = setInterval(() => {
        processChunk();
      }, chunkDuration * 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      cleanup();
      return;
    }

    setIsProcessing(true);

    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (chunksRef.current.length > 0) {
      const finalBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      try {
        const text = await transcribeBlob(finalBlob);
        if (text.trim()) {
          accumulatedTextRef.current = accumulatedTextRef.current
            ? accumulatedTextRef.current + " " + text.trim()
            : text.trim();
        }
      } catch (err) {
        console.error("Final chunk error:", err);
      }
    }

    onTranscriptionComplete(accumulatedTextRef.current);
    setIsProcessing(false);
    setDuration(0);
    mediaRecorderRef.current = null;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const progressPercent = (duration / maxDuration) * 100;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            {!isRecording && !isProcessing && (
              <Button
                onClick={startRecording}
                disabled={disabled}
                size="icon"
                className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-500 text-white shadow-lg no-default-hover-elevate no-default-active-elevate transition-shadow duration-200"
                data-testid="button-start-recording"
              >
                <Mic className="h-6 w-6" />
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="icon"
                className="w-16 h-16 rounded-full shadow-lg no-default-hover-elevate no-default-active-elevate transition-shadow duration-200"
                data-testid="button-stop-recording"
              >
                <Square className="h-6 w-6" />
              </Button>
            )}

            {isProcessing && (
              <Button
                disabled
                size="icon"
                variant="secondary"
                className="w-16 h-16 rounded-full shadow-lg"
                data-testid="button-processing"
              >
                <Loader2 className="h-6 w-6 animate-spin" />
              </Button>
            )}
          </div>

          {isRecording && (
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span data-testid="text-recording-time">
                    {formatTime(duration)}
                  </span>
                </div>
                <span>{formatTime(maxDuration)} max</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              {processingChunks > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing audio chunk...
                </p>
              )}
            </div>
          )}

          {!isRecording && !isProcessing && (
            <p className="text-xs text-muted-foreground text-center">
              Click Record to start capturing audio. Max {Math.floor(maxDuration / 60)} minutes.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
