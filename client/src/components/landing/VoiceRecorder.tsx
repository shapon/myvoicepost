import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, ArrowRightLeft, Copy, Check, Languages, Sparkles, PenLine, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import type { TranslationResult } from "@shared/schema";

const supportedLanguages = [
  { code: "en", name: "English", flag: "US" },
  { code: "es", name: "Spanish", flag: "ES" },
  { code: "fr", name: "French", flag: "FR" },
  { code: "de", name: "German", flag: "DE" },
  { code: "it", name: "Italian", flag: "IT" },
  { code: "pt", name: "Portuguese", flag: "PT" },
  { code: "nl", name: "Dutch", flag: "NL" },
  { code: "ru", name: "Russian", flag: "RU" },
  { code: "zh", name: "Chinese", flag: "CN" },
  { code: "ja", name: "Japanese", flag: "JP" },
  { code: "ko", name: "Korean", flag: "KR" },
  { code: "ar", name: "Arabic", flag: "SA" },
  { code: "hi", name: "Hindi", flag: "IN" },
  { code: "tr", name: "Turkish", flag: "TR" },
  { code: "pl", name: "Polish", flag: "PL" },
  { code: "vi", name: "Vietnamese", flag: "VN" },
  { code: "th", name: "Thai", flag: "TH" },
  { code: "id", name: "Indonesian", flag: "ID" },
];

const outputFormats = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
];

const outputTypes = [
  { value: "message", label: "Message" },
  { value: "note", label: "Note" },
  { value: "email", label: "Email" },
  { value: "post", label: "Post" },
  { value: "journal", label: "Journal" },
];

const polishSuggestions = [
  "a quick note",
  "your thoughts",
  "an email response",
  "a social post",
];

const translateSuggestions = [
  "a message to a friend",
  "your business idea",
  "plans for tomorrow",
  "your daily journal",
];

export default function VoiceRecorder() {
  const [activeTab, setActiveTab] = useState<"polish" | "translate">("polish");
  
  return (
    <section className="py-20 md:py-32" id="demo" data-testid="voice-recorder-section">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "polish" | "translate")} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-12">
            <TabsTrigger value="polish" className="gap-2" data-testid="tab-polish">
              <PenLine className="w-4 h-4" />
              Polish
            </TabsTrigger>
            <TabsTrigger value="translate" className="gap-2" data-testid="tab-translate">
              <Languages className="w-4 h-4" />
              Translate
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="polish" className="mt-0">
            <PolishRecorder />
          </TabsContent>
          
          <TabsContent value="translate" className="mt-0">
            <TranslateRecorder />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function PolishRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(40).fill(0.2));
  const [language, setLanguage] = useState("en");
  const [outputFormat, setOutputFormat] = useState("professional");
  const [outputType, setOutputType] = useState("message");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editableText, setEditableText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isPolishingText, setIsPolishingText] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % polishSuggestions.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      animationRef.current = setInterval(() => {
        setWaveformBars(Array(40).fill(0).map(() => 0.2 + Math.random() * 0.8));
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) clearInterval(animationRef.current);
      setWaveformBars(Array(40).fill(0.2));
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) clearInterval(animationRef.current);
    };
  }, [isRecording]);

  const polishMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("language", language);
      formData.append("outputFormat", outputFormat);
      formData.append("outputType", outputType);

      const response = await fetch("/api/polish-speech", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Polishing failed");
      }

      return response.json() as Promise<TranslationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditableText(data.originalText);
      setIsProcessing(false);
      toast({
        title: "Polishing complete!",
        description: "Your speech has been transformed into well-written text.",
      });
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      toast({
        title: "Polishing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const textPolishMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch("/api/polish-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          language,
          outputFormat,
          outputType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Polishing failed");
      }

      return response.json() as Promise<TranslationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditableText(data.originalText);
      setIsEditing(false);
      setIsPolishingText(false);
      toast({
        title: "Text polished!",
        description: "Your edited text has been polished.",
      });
    },
    onError: (error: Error) => {
      setIsPolishingText(false);
      toast({
        title: "Polishing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePolishText = () => {
    if (editableText.trim()) {
      setIsPolishingText(true);
      textPolishMutation.mutate(editableText);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (audioBlob.size > 0) {
          polishMutation.mutate(audioBlob);
        } else {
          setIsProcessing(false);
          toast({
            title: "No audio recorded",
            description: "Please try speaking into your microphone.",
            variant: "destructive",
          });
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      setResult(null);
    } catch (error: any) {
      console.error("Microphone access error:", error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice recording.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      setIsProcessing(true);
      mediaRecorderRef.current.stop();
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied!",
      description: "Text copied to clipboard.",
    });
  };

  const shareText = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "MyVoicePost - Polished Text",
          text: text,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await copyToClipboard(text, "shared");
        }
      }
    } else {
      await copyToClipboard(text, "shared");
      toast({
        title: "Copied for sharing!",
        description: "Text copied to clipboard. Paste it anywhere to share.",
      });
    }
  };

  return (
    <>
      <div className="text-center mb-12">
        <Badge
          variant="secondary"
          className="mb-4 px-4 py-2 text-sm font-medium bg-primary/10 text-primary border-primary/20"
        >
          <PenLine className="w-3.5 h-3.5 mr-2" />
          AI Writing Assistant
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Turn your speech into
          <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> well-written</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Quickly capture your voice. Let AI do the writing. Get polished messages, notes, emails, and more.
        </p>
      </div>

      <Card className="relative overflow-visible bg-card border-border p-6 md:p-8 max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 rounded-xl" />
        
        <div className="relative">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">I speak</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full" data-testid="select-polish-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} data-testid={`option-polish-lang-${lang.code}`}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">Output type</label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger className="w-full" data-testid="select-output-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value} data-testid={`option-type-${type.value}`}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">Tone</label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-full" data-testid="select-polish-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputFormats.map((format) => (
                    <SelectItem key={format.value} value={format.value} data-testid={`option-polish-format-${format.value}`}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-center">
            {!result && (
              <div className="mb-4">
                <p className="text-muted-foreground mb-2">Don't know what to say?</p>
                <div className="text-lg">
                  <span className="text-foreground">Try speaking </span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={suggestionIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-primary font-medium"
                      data-testid="text-polish-suggestion"
                    >
                      {polishSuggestions[suggestionIndex]}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="text-2xl font-mono font-semibold text-primary mb-6" data-testid="text-polish-timer">
              {formatTime(recordingTime)}
            </div>

            <div className="flex items-center justify-center gap-1 h-20 mb-6" data-testid="polish-waveform">
              {waveformBars.map((height, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-primary to-purple-400"
                  animate={{ height: `${height * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={handleToggleRecording}
                disabled={isProcessing}
                className={`w-20 h-20 rounded-full ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-gradient-to-br from-primary to-purple-500 hover:opacity-90"
                }`}
                data-testid="button-polish-record"
              >
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </Button>
            </div>

            {isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  boxShadow: "0 0 60px rgba(168, 85, 247, 0.3)",
                }}
              />
            )}

            {isProcessing && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-sm text-muted-foreground flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                Transforming your speech into well-written text...
              </motion.p>
            )}

            {!isRecording && !isProcessing && !result && (
              <p className="mt-6 text-sm text-muted-foreground">
                Speak for over 20 seconds for the best experience
              </p>
            )}
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-8"
              >
                <Tabs defaultValue="polished" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="original" data-testid="tab-polish-original">
                      Original
                    </TabsTrigger>
                    <TabsTrigger value="polished" data-testid="tab-polish-polished">
                      Polished
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="original" className="mt-4">
                    <div className="relative rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center justify-between p-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">
                          {isEditing ? "Edit your text below" : "Click to edit"}
                        </span>
                        <div className="flex items-center gap-1">
                          {isEditing && (
                            <Button
                              size="sm"
                              onClick={handlePolishText}
                              disabled={isPolishingText || !editableText.trim()}
                              className="bg-gradient-to-r from-primary to-purple-500"
                              data-testid="button-polish-again"
                            >
                              {isPolishingText ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Polishing...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Polish Again
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(editableText || result.originalText, "original")}
                            data-testid="button-copy-polish-original"
                          >
                            {copiedField === "original" ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={editableText}
                        onChange={(e) => {
                          setEditableText(e.target.value);
                          if (!isEditing) setIsEditing(true);
                        }}
                        onFocus={() => setIsEditing(true)}
                        className="min-h-[120px] border-0 bg-transparent resize-none focus-visible:ring-0"
                        placeholder="Your transcribed text will appear here..."
                        data-testid="textarea-polish-original"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="polished" className="mt-4">
                    <div className="relative p-4 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className="bg-gradient-to-r from-primary to-purple-500">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Polished
                        </Badge>
                        <Badge variant="secondary">{outputType}</Badge>
                        <Badge variant="secondary">{outputFormat}</Badge>
                      </div>
                      <p className="pr-20 text-foreground" data-testid="text-polish-result">
                        {result.polishedText}
                      </p>
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => shareText(result.polishedText)}
                          data-testid="button-share-polish-result"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(result.polishedText, "polished")}
                          data-testid="button-copy-polish-result"
                        >
                          {copiedField === "polished" ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResult(null);
                      setEditableText("");
                      setIsEditing(false);
                    }}
                    data-testid="button-new-polish-recording"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    New Recording
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </>
  );
}

function TranslateRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(40).fill(0.2));
  const [sourceLanguage, setSourceLanguage] = useState("es");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [outputFormat, setOutputFormat] = useState("professional");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editableText, setEditableText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isTranslatingText, setIsTranslatingText] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % translateSuggestions.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      animationRef.current = setInterval(() => {
        setWaveformBars(Array(40).fill(0).map(() => 0.2 + Math.random() * 0.8));
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) clearInterval(animationRef.current);
      setWaveformBars(Array(40).fill(0.2));
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) clearInterval(animationRef.current);
    };
  }, [isRecording]);

  const translateMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("sourceLanguage", sourceLanguage);
      formData.append("targetLanguage", targetLanguage);
      formData.append("outputFormat", outputFormat);

      const response = await fetch("/api/translate-speech", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Translation failed");
      }

      return response.json() as Promise<TranslationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditableText(data.originalText);
      setIsProcessing(false);
      toast({
        title: "Translation complete!",
        description: "Your speech has been transcribed and translated.",
      });
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      toast({
        title: "Translation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const textTranslateMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch("/api/translate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          sourceLanguage,
          targetLanguage,
          outputFormat,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Translation failed");
      }

      return response.json() as Promise<TranslationResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditableText(data.originalText);
      setIsEditing(false);
      setIsTranslatingText(false);
      toast({
        title: "Text translated!",
        description: "Your edited text has been translated.",
      });
    },
    onError: (error: Error) => {
      setIsTranslatingText(false);
      toast({
        title: "Translation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTranslateText = () => {
    if (editableText.trim()) {
      setIsTranslatingText(true);
      textTranslateMutation.mutate(editableText);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (audioBlob.size > 0) {
          translateMutation.mutate(audioBlob);
        } else {
          setIsProcessing(false);
          toast({
            title: "No audio recorded",
            description: "Please try speaking into your microphone.",
            variant: "destructive",
          });
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      setResult(null);
    } catch (error: any) {
      console.error("Microphone access error:", error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice recording.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      setIsProcessing(true);
      mediaRecorderRef.current.stop();
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const swapLanguages = () => {
    const temp = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(temp);
  };

  const getLanguageName = (code: string) => {
    return supportedLanguages.find((l) => l.code === code)?.name || code;
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied!",
      description: "Text copied to clipboard.",
    });
  };

  const shareText = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "MyVoicePost - Translation",
          text: text,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await copyToClipboard(text, "shared");
        }
      }
    } else {
      await copyToClipboard(text, "shared");
      toast({
        title: "Copied for sharing!",
        description: "Text copied to clipboard. Paste it anywhere to share.",
      });
    }
  };

  return (
    <>
      <div className="text-center mb-12">
        <Badge
          variant="secondary"
          className="mb-4 px-4 py-2 text-sm font-medium bg-primary/10 text-primary border-primary/20"
        >
          <Languages className="w-3.5 h-3.5 mr-2" />
          Multilingual Translation
        </Badge>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Speak in any language, 
          <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> translate instantly</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Record your voice in your native language and get polished translations for your target audience.
        </p>
      </div>

      <Card className="relative overflow-visible bg-card border-border p-6 md:p-8 max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 rounded-xl" />
        
        <div className="relative">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">I speak</label>
              <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                <SelectTrigger className="w-full" data-testid="select-source-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} data-testid={`option-source-${lang.code}`}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={swapLanguages}
              className="mt-5 sm:mt-5"
              data-testid="button-swap-languages"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">Translate to</label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger className="w-full" data-testid="select-target-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code} data-testid={`option-target-${lang.code}`}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1.5 block">Tone</label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-full" data-testid="select-output-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputFormats.map((format) => (
                    <SelectItem key={format.value} value={format.value} data-testid={`option-format-${format.value}`}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-center">
            {!result && (
              <div className="mb-4">
                <p className="text-muted-foreground mb-2">Don't know what to say?</p>
                <div className="text-lg">
                  <span className="text-foreground">Try speaking </span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={suggestionIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-primary font-medium"
                      data-testid="text-suggestion"
                    >
                      {translateSuggestions[suggestionIndex]}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="text-2xl font-mono font-semibold text-primary mb-6" data-testid="text-timer">
              {formatTime(recordingTime)}
            </div>

            <div className="flex items-center justify-center gap-1 h-20 mb-6" data-testid="waveform">
              {waveformBars.map((height, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-primary to-purple-400"
                  animate={{ height: `${height * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={handleToggleRecording}
                disabled={isProcessing}
                className={`w-20 h-20 rounded-full ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-gradient-to-br from-primary to-purple-500 hover:opacity-90"
                }`}
                data-testid="button-record"
              >
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isRecording ? (
                  <Square className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </Button>
            </div>

            {isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  boxShadow: "0 0 60px rgba(168, 85, 247, 0.3)",
                }}
              />
            )}

            {isProcessing && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-sm text-muted-foreground flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                Transcribing and translating with AI...
              </motion.p>
            )}

            {!isRecording && !isProcessing && !result && (
              <p className="mt-6 text-sm text-muted-foreground">
                Speak for over 20 seconds for the best experience
              </p>
            )}
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-8"
              >
                <Tabs defaultValue="polished" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="original" data-testid="tab-original">
                      Original ({getLanguageName(result.sourceLanguage)})
                    </TabsTrigger>
                    <TabsTrigger value="translated" data-testid="tab-translated">
                      Translated
                    </TabsTrigger>
                    <TabsTrigger value="polished" data-testid="tab-polished">
                      Polished
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="original" className="mt-4">
                    <div className="relative rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center justify-between p-2 border-b border-border">
                        <span className="text-xs text-muted-foreground">
                          {isEditing ? "Edit your text below" : "Click to edit"}
                        </span>
                        <div className="flex items-center gap-1">
                          {isEditing && (
                            <Button
                              size="sm"
                              onClick={handleTranslateText}
                              disabled={isTranslatingText || !editableText.trim()}
                              className="bg-gradient-to-r from-primary to-purple-500"
                              data-testid="button-translate-again"
                            >
                              {isTranslatingText ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Translating...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Translate Again
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(editableText || result.originalText, "original")}
                            data-testid="button-copy-original"
                          >
                            {copiedField === "original" ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={editableText}
                        onChange={(e) => {
                          setEditableText(e.target.value);
                          if (!isEditing) setIsEditing(true);
                        }}
                        onFocus={() => setIsEditing(true)}
                        className="min-h-[120px] border-0 bg-transparent resize-none focus-visible:ring-0"
                        placeholder="Your transcribed text will appear here..."
                        data-testid="textarea-translate-original"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="translated" className="mt-4">
                    <div className="relative p-4 rounded-lg bg-muted/50 border border-border">
                      <Badge variant="secondary" className="mb-2">
                        {getLanguageName(result.targetLanguage)}
                      </Badge>
                      <p className="pr-20 text-foreground" data-testid="text-translated">
                        {result.translatedText}
                      </p>
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => shareText(result.translatedText)}
                          data-testid="button-share-translated"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(result.translatedText, "translated")}
                          data-testid="button-copy-translated"
                        >
                          {copiedField === "translated" ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="polished" className="mt-4">
                    <div className="relative p-4 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className="bg-gradient-to-r from-primary to-purple-500">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Polished
                        </Badge>
                        <Badge variant="secondary">{result.outputFormat}</Badge>
                      </div>
                      <p className="pr-20 text-foreground" data-testid="text-polished">
                        {result.polishedText}
                      </p>
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => shareText(result.polishedText)}
                          data-testid="button-share-polished"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(result.polishedText, "polished")}
                          data-testid="button-copy-polished"
                        >
                          {copiedField === "polished" ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResult(null);
                      setEditableText("");
                      setIsEditing(false);
                    }}
                    data-testid="button-new-recording"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    New Recording
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </>
  );
}
