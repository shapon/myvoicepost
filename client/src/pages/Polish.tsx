import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { supportedLanguages } from "@shared/schema";
import AppLayout from "@/components/AppLayout";
import WebVoiceRecorder from "@/components/WebVoiceRecorder";
import WebTextResultCard from "@/components/WebTextResultCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  RotateCcw,
  Mic,
  Type,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const OUTPUT_FORMATS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
];

const OUTPUT_TYPES = [
  { value: "message", label: "Message" },
  { value: "note", label: "Note" },
  { value: "email", label: "Email" },
  { value: "post", label: "Post" },
  { value: "journal", label: "Journal" },
];

interface PolishResult {
  id: string;
  originalText: string;
  polishedText: string;
}

export default function Polish() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [inputText, setInputText] = useState("");
  const [language, setLanguage] = useState("en");
  const [outputFormat, setOutputFormat] = useState("professional");
  const [outputType, setOutputType] = useState("message");
  const [result, setResult] = useState<PolishResult | null>(null);

  const polishMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/polish-text", {
        text,
        language,
        outputFormat,
        outputType,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to polish text");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult({
        id: data.id,
        originalText: data.originalText,
        polishedText: data.polishedText,
      });
      toast({ title: "Text polished", description: "Your text has been polished successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Polish failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (polishedText: string) => {
      if (!result) throw new Error("No result to save");
      const res = await apiRequest("POST", "/api/saved-texts", {
        type: "polish",
        originalText: result.originalText,
        polishedText,
        sourceLanguage: language,
        outputFormat,
        outputType,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-texts"] });
      toast({ title: "Saved", description: "Text saved to your collection." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function handlePolish() {
    if (!inputText.trim()) {
      toast({ title: "Enter text", description: "Please enter some text to polish.", variant: "destructive" });
      return;
    }
    polishMutation.mutate(inputText.trim());
  }

  function handleRePolish() {
    if (!result?.polishedText) return;
    setInputText(result.polishedText);
    setResult(null);
    polishMutation.mutate(result.polishedText);
  }

  function handleReset() {
    setInputText("");
    setResult(null);
  }

  function handleTranscriptionComplete(text: string) {
    if (text.trim()) {
      setInputText((prev) => (prev ? prev + " " + text.trim() : text.trim()));
    }
  }

  function handlePartialTranscription(text: string) {
    setInputText(text);
  }

  function handlePolishedTextEdit(newText: string) {
    if (result) {
      setResult({ ...result, polishedText: newText });
    }
  }

  const selectedLangName = supportedLanguages.find((l) => l.code === language)?.name || language;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Polish</h1>
          </div>
          {(inputText || result) && (
            <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset">
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Language</label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code} data-testid={`option-lang-${lang.code}`}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Tone</label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger data-testid="select-tone">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMATS.map((fmt) => (
                      <SelectItem key={fmt.value} value={fmt.value} data-testid={`option-tone-${fmt.value}`}>
                        {fmt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Type</label>
                <Select value={outputType} onValueChange={setOutputType}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} data-testid={`option-type-${t.value}`}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "voice")}>
              <TabsList className="w-full" data-testid="tabs-input-mode">
                <TabsTrigger value="text" className="flex-1" data-testid="tab-text">
                  <Type className="h-4 w-4 mr-1" /> Type Text
                </TabsTrigger>
                <TabsTrigger value="voice" className="flex-1" data-testid="tab-voice">
                  <Mic className="h-4 w-4 mr-1" /> Record Voice
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-4">
                <Textarea
                  placeholder="Type or paste your text here..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={6}
                  className="resize-y"
                  data-testid="textarea-input"
                />
              </TabsContent>

              <TabsContent value="voice" className="mt-4 space-y-3">
                <WebVoiceRecorder
                  onTranscriptionComplete={handleTranscriptionComplete}
                  onPartialTranscription={handlePartialTranscription}
                  maxDuration={user ? 300 : 55}
                  chunkDuration={60}
                  disabled={polishMutation.isPending}
                />
                {inputText && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Transcribed text:</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-voice-transcription">{inputText}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button
              onClick={handlePolish}
              disabled={polishMutation.isPending || !inputText.trim()}
              className="w-full"
              data-testid="button-polish"
            >
              {polishMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Polishing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Polish Text
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            <WebTextResultCard
              title="Original Text"
              text={result.originalText}
              language={language}
            />

            <WebTextResultCard
              title="Polished Text"
              text={result.polishedText}
              language={language}
              badge={selectedLangName}
              editable
              saveable={!!user}
              onSave={() => saveMutation.mutate(result.polishedText)}
              isSaving={saveMutation.isPending}
              onTextChange={handlePolishedTextEdit}
              icon={<Sparkles className="h-4 w-4 text-primary" />}
            />

            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={handleRePolish}
                disabled={polishMutation.isPending}
                data-testid="button-repolish"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Re-polish
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
