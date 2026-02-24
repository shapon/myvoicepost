import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Upload,
  Link as LinkIcon,
  Loader2,
  FileAudio,
  Sparkles,
  Copy,
  Check,
  X,
  RefreshCw,
  MessageSquare,
  BookOpen,
  Heart,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [audioUrl, setAudioUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribedText, setTranscribedText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const [copied, setCopied] = useState<"transcribed" | "result" | null>(null);

  const { data: toneData } = useQuery<{ success: boolean; categories: Record<string, ToneCategory> }>({
    queryKey: ["/api/v1/m/tone-categories"],
  });

  const categories = toneData?.categories || {};

  const transcribeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/v1/m/transcribe-url", { url });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to transcribe");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setTranscribedText(data.transcribedText);
      setResultText("");
      setSelectedTone(null);
      toast({ title: "Transcription complete", description: "Audio has been transcribed successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    },
  });

  const transcribeFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/v1/m/transcribe-file", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to transcribe");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setTranscribedText(data.transcribedText);
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
      const res = await apiRequest("POST", "/api/v1/m/transform-tone", { text, toneId });
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
        toast({ title: "Enter a URL", description: "Please provide an audio URL to transcribe.", variant: "destructive" });
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

  function handleCopy(text: string, type: "transcribed" | "result") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-14">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button size="sm" variant="ghost" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Home
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Process Audio</h1>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset">
              <RefreshCw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
                  <LinkIcon className="h-4 w-4 mr-1" /> Audio URL
                </TabsTrigger>
                <TabsTrigger value="file" className="flex-1" data-testid="tab-file">
                  <Upload className="h-4 w-4 mr-1" /> Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-3 mt-4">
                <Input
                  placeholder="Enter audio file URL (e.g., https://example.com/audio.mp3)"
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
                  Transcribing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Transcribe Audio
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {transcribedText && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileAudio className="h-5 w-5 text-primary" />
                  Step 2: Transcribed Text
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(transcribedText, "transcribed")}
                  data-testid="button-copy-transcribed"
                >
                  {copied === "transcribed" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied === "transcribed" ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={transcribedText}
                onChange={(e) => setTranscribedText(e.target.value)}
                rows={6}
                className="resize-y"
                data-testid="textarea-transcribed"
              />
            </CardContent>
          </Card>
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
                        className={`cursor-pointer text-sm py-1.5 px-3 ${
                          selectedTone === tone.id ? "" : ""
                        }`}
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Check className="h-5 w-5 text-primary" />
                  Result
                  {selectedTone && (
                    <Badge variant="secondary" className="ml-2">{getSelectedToneLabel()}</Badge>
                  )}
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(resultText, "result")}
                  data-testid="button-copy-result"
                >
                  {copied === "result" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied === "result" ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className="p-4 rounded-md bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap"
                data-testid="text-result"
              >
                {resultText}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
