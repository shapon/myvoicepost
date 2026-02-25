import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supportedLanguages } from "@shared/schema";
import AppLayout from "@/components/AppLayout";
import WebVoiceRecorder from "@/components/WebVoiceRecorder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Languages,
  ArrowRightLeft,
  Loader2,
  Copy,
  Check,
  Bookmark,
  RefreshCw,
  Mic,
  Type,
} from "lucide-react";

const OUTPUT_FORMATS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "friendly", label: "Friendly" },
] as const;

export default function Translate() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [outputFormat, setOutputFormat] = useState("professional");
  const [result, setResult] = useState<{
    originalText: string;
    translatedText: string;
    polishedText: string;
  } | null>(null);
  const [copied, setCopied] = useState<"original" | "translated" | "polished" | null>(null);

  const translateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/translate-text", {
        text: text.trim(),
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to translate");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult({
        originalText: data.originalText,
        translatedText: data.translatedText,
        polishedText: data.polishedText,
      });
      toast({ title: "Translation complete", description: "Your text has been translated and polished." });
    },
    onError: (err: Error) => {
      toast({ title: "Translation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No result to save");
      const res = await apiRequest("POST", "/api/saved-texts", {
        type: "translate",
        originalText: result.originalText,
        polishedText: result.polishedText,
        translatedText: result.translatedText,
        sourceLanguage,
        targetLanguage,
        outputFormat,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-texts"] });
      toast({ title: "Saved", description: "Translation saved to your collection." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function handleTranslate() {
    if (!text.trim()) {
      toast({ title: "Enter text", description: "Please enter some text to translate.", variant: "destructive" });
      return;
    }
    if (sourceLanguage === targetLanguage) {
      toast({ title: "Same language", description: "Source and target languages must be different.", variant: "destructive" });
      return;
    }
    translateMutation.mutate();
  }

  function handleSwapLanguages() {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
  }

  function handleCopy(content: string, type: "original" | "translated" | "polished") {
    navigator.clipboard.writeText(content);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleReset() {
    setText("");
    setResult(null);
    setCopied(null);
  }

  function handleTranscriptionComplete(transcribedText: string) {
    if (transcribedText.trim()) {
      setText((prev) => (prev ? prev + " " + transcribedText.trim() : transcribedText.trim()));
    }
  }

  function handlePartialTranscription(transcribedText: string) {
    setText(transcribedText);
  }

  const sourceLangName = supportedLanguages.find((l) => l.code === sourceLanguage)?.name || sourceLanguage;
  const targetLangName = supportedLanguages.find((l) => l.code === targetLanguage)?.name || targetLanguage;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Translate</h1>
          </div>
          {result && (
            <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset">
              <RefreshCw className="h-4 w-4 mr-1" /> New Translation
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Language Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1 w-full space-y-1.5">
                <label className="text-sm text-muted-foreground">From</label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                  <SelectTrigger data-testid="select-source-language">
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

              <Button size="icon" variant="outline" onClick={handleSwapLanguages} data-testid="button-swap-languages">
                <ArrowRightLeft className="h-4 w-4" />
              </Button>

              <div className="flex-1 w-full space-y-1.5">
                <label className="text-sm text-muted-foreground">To</label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger data-testid="select-target-language">
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
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Tone</label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_FORMATS.map((fmt) => (
                    <SelectItem key={fmt.value} value={fmt.value} data-testid={`option-format-${fmt.value}`}>
                      {fmt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input ({sourceLangName})</CardTitle>
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
                  placeholder={`Type or paste your ${sourceLangName} text here...`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  className="resize-y"
                  data-testid="textarea-source"
                />
              </TabsContent>

              <TabsContent value="voice" className="mt-4 space-y-3">
                <WebVoiceRecorder
                  onTranscriptionComplete={handleTranscriptionComplete}
                  onPartialTranscription={handlePartialTranscription}
                  maxDuration={user ? 300 : 55}
                  chunkDuration={60}
                  disabled={translateMutation.isPending}
                />
                {text && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Transcribed text:</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-voice-transcription">{text}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button
              onClick={handleTranslate}
              disabled={translateMutation.isPending || !text.trim()}
              className="w-full"
              data-testid="button-translate"
            >
              {translateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4 mr-2" />
                  Translate to {targetLangName}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Original ({sourceLangName})
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(result.originalText, "original")}
                    data-testid="button-copy-original"
                  >
                    {copied === "original" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied === "original" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-md bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-original">
                  {result.originalText}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Translation ({targetLangName})</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(result.translatedText, "translated")}
                    data-testid="button-copy-translated"
                  >
                    {copied === "translated" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied === "translated" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-md bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-translated">
                  {result.translatedText}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Languages className="h-4 w-4 text-primary" />
                    Polished Translation
                    <Badge variant="secondary">{targetLangName}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(result.polishedText, "polished")}
                      data-testid="button-copy-polished"
                    >
                      {copied === "polished" ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                      {copied === "polished" ? "Copied" : "Copy"}
                    </Button>
                    {user && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        data-testid="button-save"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Bookmark className="h-4 w-4 mr-1" />
                        )}
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-md bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap" data-testid="text-polished">
                  {result.polishedText}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
