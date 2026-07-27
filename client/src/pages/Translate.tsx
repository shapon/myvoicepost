import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { OUTPUT_FORMATS, getLanguageName } from "@shared/schema";
import { useSaveTextMutation } from "@/hooks/use-save-text";
import AppLayout from "@/components/AppLayout";
import WebVoiceRecorder from "@/components/WebVoiceRecorder";
import LiveVoiceRecorder from "@/components/LiveVoiceRecorder";
import WebTextResultCard from "@/components/WebTextResultCard";
import LanguageSelect from "@/components/LanguageSelect";
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
  Languages,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  Mic,
  Type,
  RotateCcw,
} from "lucide-react";

export default function Translate() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [outputFormat, setOutputFormat] = useState("professional");
  const [result, setResult] = useState<{
    originalText: string;
    translatedText: string;
    polishedText: string;
    sourceUsed: string;
    targetUsed: string;
  } | null>(null);

  // Track whether the user has edited the original text after a result was shown
  // so we can display the Re-translate button.
  const resultTextRef = useRef<string>("");
  const [isTextDirty, setIsTextDirty] = useState(false);

  const translateMutation = useMutation({
    mutationFn: async (params?: { overrideText?: string }) => {
      const payload = {
        text: (params?.overrideText ?? text).trim(),
        sourceLanguage,
        targetLanguage,
        outputFormat,
      };
      const res = await apiRequest("POST", "/api/v1/p/translate", payload);
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
        sourceUsed: sourceLanguage,
        targetUsed: targetLanguage,
      });
      resultTextRef.current = text;
      setIsTextDirty(false);
      toast({ title: "Translation complete", description: "Your text has been translated and polished." });
    },
    onError: (err: Error) => {
      toast({ title: "Translation failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useSaveTextMutation();

  function handleTranslate() {
    if (!text.trim()) {
      toast({ title: "Enter text", description: "Please enter some text to translate.", variant: "destructive" });
      return;
    }
    if (sourceLanguage !== "auto" && sourceLanguage === targetLanguage) {
      toast({ title: "Same language", description: "Source and target languages must be different.", variant: "destructive" });
      return;
    }
    translateMutation.mutate();
  }

  function handleReTranslate() {
    if (!text.trim()) return;
    translateMutation.mutate();
  }

  function handleSwapLanguages() {
    // Can't swap when source is Auto-detect — instead set source to the current target
    if (sourceLanguage === "auto") {
      setSourceLanguage(targetLanguage);
      setTargetLanguage("en");
    } else {
      setSourceLanguage(targetLanguage);
      setTargetLanguage(sourceLanguage);
    }
  }

  function handleReset() {
    setText("");
    setResult(null);
    setIsTextDirty(false);
    resultTextRef.current = "";
  }

  function handleTextChange(newText: string) {
    setText(newText);
    // Mark dirty if we have a result and the text has changed
    if (result) {
      setIsTextDirty(newText !== resultTextRef.current);
    }
  }

  function handleTranscriptionComplete(transcribedText: string) {
    if (transcribedText.trim()) {
      setText((prev) => {
        const updated = prev ? prev + " " + transcribedText.trim() : transcribedText.trim();
        if (result) setIsTextDirty(updated !== resultTextRef.current);
        return updated;
      });
    }
  }

  function handlePartialTranscription(transcribedText: string) {
    setText(transcribedText);
    if (result) setIsTextDirty(transcribedText !== resultTextRef.current);
  }

  function handleLiveTextChange(transcribedText: string) {
    setText(transcribedText);
    if (result) setIsTextDirty(transcribedText !== resultTextRef.current);
  }

  function handlePolishedTextEdit(newText: string) {
    if (result) {
      setResult({ ...result, polishedText: newText });
    }
  }

  const sourceLangName = getLanguageName(sourceLanguage);
  const targetLangName = getLanguageName(targetLanguage);

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
              <RotateCcw className="h-4 w-4 mr-1" /> New Translation
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Language Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1 w-full">
                <LanguageSelect
                  value={sourceLanguage}
                  onValueChange={setSourceLanguage}
                  label="From"
                  testIdPrefix="source-language"
                  showAutoDetect
                />
              </div>

              <Button size="icon" variant="outline" onClick={handleSwapLanguages} data-testid="button-swap-languages">
                <ArrowRightLeft className="h-4 w-4" />
              </Button>

              <div className="flex-1 w-full">
                <LanguageSelect
                  value={targetLanguage}
                  onValueChange={setTargetLanguage}
                  label="To"
                  testIdPrefix="target-language"
                />
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
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={6}
                  className="resize-y"
                  data-testid="textarea-source"
                />
              </TabsContent>

              <TabsContent value="voice" className="mt-4 space-y-3">
                <LiveVoiceRecorder
                  currentText={text}
                  onLiveTextChange={handleLiveTextChange}
                  onTranscriptionComplete={handleTranscriptionComplete}
                  onPartialTranscription={handlePartialTranscription}
                  maxDuration={user ? 300 : 55}
                  chunkDuration={60}
                  disabled={translateMutation.isPending}
                  language={sourceLanguage === "auto" ? "en" : sourceLanguage}
                />
                {text && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Transcribed text:</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-voice-transcription">{text}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-2">
              <Button
                onClick={handleTranslate}
                disabled={translateMutation.isPending || !text.trim()}
                className="flex-1"
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

              {/* Re-translate — visible when the user edits the original text after a result */}
              {result && isTextDirty && (
                <Button
                  variant="outline"
                  onClick={handleReTranslate}
                  disabled={translateMutation.isPending}
                  data-testid="button-retranslate"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Re-translate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            <WebTextResultCard
              title={`Original (${getLanguageName(result.sourceUsed)})`}
              text={result.originalText}
              language={result.sourceUsed === "auto" ? "en" : result.sourceUsed}
            />

            <WebTextResultCard
              title={`Translation (${getLanguageName(result.targetUsed)})`}
              text={result.translatedText}
              language={result.targetUsed}
            />

            <WebTextResultCard
              title="Polished Translation"
              text={result.polishedText}
              language={result.targetUsed}
              badge={getLanguageName(result.targetUsed)}
              editable
              saveable={!!user}
              onSave={() => saveMutation.mutate({
                type: "translate",
                originalText: result.originalText,
                polishedText: result.polishedText,
                translatedText: result.translatedText,
                sourceLanguage: result.sourceUsed,
                targetLanguage: result.targetUsed,
                outputFormat,
              })}
              isSaving={saveMutation.isPending}
              onTextChange={handlePolishedTextEdit}
              icon={<Languages className="h-4 w-4 text-primary" />}
              showImageGen
              isAuthenticated={!!user}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
