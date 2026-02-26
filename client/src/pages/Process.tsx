import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { getLanguageName } from "@shared/schema";
import { useSaveTextMutation } from "@/hooks/use-save-text";
import AppLayout from "@/components/AppLayout";
import WebTextResultCard from "@/components/WebTextResultCard";
import LanguageSelect from "@/components/LanguageSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Link as LinkIcon,
  Loader2,
  FileAudio,
  Sparkles,
  RefreshCw,
  MessageSquare,
  BookOpen,
  Heart,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ToneItem {
  id: string;
  label: string;
  instruction: string;
}

interface ToneCategory {
  label: string;
  tones: ToneItem[];
}

const CATEGORY_ICONS: Record<string, typeof MessageSquare> = {
  conversational: MessageSquare,
  informational: BookOpen,
  emotional: Heart,
};

export default function Process() {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [audioUrl, setAudioUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [transcribedText, setTranscribedText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");

  const toneEndpoint = user ? "/api/v1/a/tone-categories" : "/api/v1/p/tone-categories";

  const { data: toneData } = useQuery<{ success: boolean; categories: Record<string, ToneCategory> }>({
    queryKey: [toneEndpoint],
  });

  const categories = toneData?.categories || {};

  const saveMutation = useSaveTextMutation();

  const transcribeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const endpoint = user ? "/api/v1/a/process-url" : "/api/v1/p/process-url";
      const res = await apiRequest("POST", endpoint, { url, targetLanguage });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to transcribe");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const text = data.transcribedText || data.text || data.content || "";
      setTranscribedText(text);
      setResultText("");
      setSelectedTone(null);
      toast({ title: "Processing complete", description: "Content has been extracted successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    },
  });

  const transcribeFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = getAuthToken();
      if (token) {
        const formData = new FormData();
        formData.append("audio", file);
        const res = await fetch("/api/v1/a/transcribe-file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to transcribe");
        }
        return res.json();
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1] || "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/v1/p/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, mimeType: file.type || "audio/mp4" }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to transcribe");
        }
        return res.json();
      }
    },
    onSuccess: (data) => {
      const text = data.transcribedText || data.originalText || data.text || "";
      setTranscribedText(text);
      setResultText("");
      setSelectedTone(null);
      toast({ title: "Transcription complete", description: "Audio file has been transcribed successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    },
  });

  const transformMutation = useMutation({
    mutationFn: async ({ text, toneId }: { text: string; toneId: string }) => {
      const endpoint = user ? "/api/v1/a/transform-tone" : "/api/v1/p/transform-tone";
      const res = await apiRequest("POST", endpoint, { text, toneId });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to transform");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResultText(data.transformedText);
      toast({ title: "Tone applied", description: "Text has been transformed with the selected tone." });
    },
    onError: (err: Error) => {
      toast({ title: "Transform failed", description: err.message, variant: "destructive" });
    },
  });

  function handleTranscribe() {
    if (inputMode === "url") {
      if (!audioUrl.trim()) {
        toast({ title: "Enter a URL", description: "Please provide a URL to process.", variant: "destructive" });
        return;
      }
      transcribeUrlMutation.mutate(audioUrl.trim());
    } else {
      if (!selectedFile) {
        toast({ title: "Select a file", description: "Please choose an audio file to upload.", variant: "destructive" });
        return;
      }
      transcribeFileMutation.mutate(selectedFile);
    }
  }

  function handleTransform() {
    if (!transcribedText.trim()) {
      toast({ title: "No text", description: "Please transcribe audio first.", variant: "destructive" });
      return;
    }
    if (!selectedTone) {
      toast({ title: "Select a tone", description: "Please choose a tone to apply.", variant: "destructive" });
      return;
    }
    transformMutation.mutate({ text: transcribedText, toneId: selectedTone });
  }

  function handleFileChange(e: { target: { files: FileList | null } }) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) {
        toast({ title: "Invalid file", description: "Please select an audio file.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
    }
  }

  function handleReset() {
    setInputMode("url");
    setAudioUrl("");
    setSelectedFile(null);
    setTranscribedText("");
    setResultText("");
    setSelectedTone(null);
    setSelectedCategory(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function getSelectedToneLabel(): string {
    if (!selectedTone) return "";
    for (const cat of Object.values(categories)) {
      const found = cat.tones.find((t: ToneItem) => t.id === selectedTone);
      if (found) return found.label;
    }
    return selectedTone;
  }

  const isTranscribing = transcribeUrlMutation.isPending || transcribeFileMutation.isPending;
  const isTransforming = transformMutation.isPending;
  const selectedLangName = getLanguageName(targetLanguage);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Transcribe Audio</h1>
          </div>
          <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset">
            <RefreshCw className="h-4 w-4 mr-1" /> Reset
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5 text-primary" />
              Language
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LanguageSelect
              value={targetLanguage}
              onValueChange={setTargetLanguage}
              label="Output Language"
              testIdPrefix="target-language"
            />
            <p className="text-xs text-muted-foreground mt-1.5">Used for URL content extraction and text-to-speech playback. Audio files are transcribed with automatic language detection.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileAudio className="h-5 w-5 text-primary" />
              Step 1: Provide Audio Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "url" | "file")}>
              <TabsList className="w-full" data-testid="tabs-input-mode">
                <TabsTrigger value="url" className="flex-1" data-testid="tab-url">
                  <LinkIcon className="h-4 w-4 mr-1" /> URL / YouTube
                </TabsTrigger>
                <TabsTrigger value="file" className="flex-1" data-testid="tab-file">
                  <Upload className="h-4 w-4 mr-1" /> Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-3 mt-4">
                <Input
                  placeholder="Enter URL (YouTube, webpage, or audio file link)"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  data-testid="input-audio-url"
                />
              </TabsContent>

              <TabsContent value="file" className="space-y-3 mt-4">
                <div
                  className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-file"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="hidden"
                    data-testid="input-file"
                  />
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium" data-testid="text-filename">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Click to select an audio file</p>
                      <p className="text-xs text-muted-foreground">MP3, WAV, M4A, OGG, FLAC supported (max 25MB)</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="w-full"
              data-testid="button-transcribe"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Process Content
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {transcribedText && (
          <WebTextResultCard
            title="Step 2: Transcribed Text"
            text={transcribedText}
            language={targetLanguage}
            badge={selectedLangName}
            editable
            saveable={!!user}
            onSave={() => saveMutation.mutate({
              type: "translate",
              originalText: transcribedText,
              polishedText: transcribedText,
              sourceLanguage: targetLanguage,
              outputFormat: "transcription",
            })}
            isSaving={saveMutation.isPending}
            onTextChange={(newText) => setTranscribedText(newText)}
            icon={<FileAudio className="h-4 w-4 text-primary" />}
          />
        )}

        {transcribedText && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" />
                Step 3: Select Tone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(categories).map(([key, cat]) => {
                  const Icon = CATEGORY_ICONS[key] || MessageSquare;
                  const isActive = selectedCategory === key;
                  return (
                    <div
                      key={key}
                      className={`rounded-md border p-3 cursor-pointer transition-colors hover-elevate ${
                        isActive ? "border-primary bg-primary/5" : ""
                      }`}
                      onClick={() => {
                        setSelectedCategory(isActive ? null : key);
                        if (isActive) setSelectedTone(null);
                      }}
                      data-testid={`card-category-${key}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>
                          {cat.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cat.tones.length} tones available
                      </p>
                    </div>
                  );
                })}
              </div>

              {selectedCategory && categories[selectedCategory] && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Choose a tone from {categories[selectedCategory].label}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories[selectedCategory].tones.map((tone: ToneItem) => (
                      <Badge
                        key={tone.id}
                        variant={selectedTone === tone.id ? "default" : "outline"}
                        className="cursor-pointer text-sm py-1.5 px-3"
                        onClick={() => setSelectedTone(selectedTone === tone.id ? null : tone.id)}
                        data-testid={`badge-tone-${tone.id}`}
                      >
                        {tone.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedTone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Selected: <Badge variant="secondary">{getSelectedToneLabel()}</Badge>
                </div>
              )}

              <Button
                onClick={handleTransform}
                disabled={isTransforming || !selectedTone}
                className="w-full"
                data-testid="button-transform"
              >
                {isTransforming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Transforming...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Apply Tone & Transform
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {resultText && (
          <WebTextResultCard
            title="Result"
            text={resultText}
            language={targetLanguage}
            badge={getSelectedToneLabel()}
            editable
            saveable={!!user}
            onSave={() => saveMutation.mutate({
              type: "translate",
              originalText: transcribedText,
              polishedText: resultText,
              sourceLanguage: targetLanguage,
              outputFormat: getSelectedToneLabel(),
            })}
            isSaving={saveMutation.isPending}
            onTextChange={(newText) => setResultText(newText)}
            icon={<Sparkles className="h-4 w-4 text-primary" />}
          />
        )}
      </div>
    </AppLayout>
  );
}
