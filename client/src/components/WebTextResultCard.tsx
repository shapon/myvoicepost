import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Volume2,
  VolumeX,
  Copy,
  Check,
  Share2,
  Pencil,
  Save,
  X,
  Loader2,
  ImageIcon,
  Download,
  RotateCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface WebTextResultCardProps {
  title: string;
  text: string;
  language?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  editable?: boolean;
  saveable?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onTextChange?: (newText: string) => void;
  icon?: React.ReactNode;
  showImageGen?: boolean;
  isAuthenticated?: boolean;
}

export default function WebTextResultCard({
  title,
  text,
  language = "en",
  badge,
  badgeVariant = "secondary",
  editable = false,
  saveable = false,
  onSave,
  isSaving = false,
  onTextChange,
  icon,
  showImageGen = false,
  isAuthenticated = false,
}: WebTextResultCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setEditText(text);
  }, [text]);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setSecondsLeft(remaining);
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cooldownUntil]);

  const startCooldown = (seconds: number) => {
    setCooldownUntil(Date.now() + seconds * 1000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editText : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const shareText = isEditing ? editText : text;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          await fallbackCopyShare(shareText);
        }
      }
    } else {
      await fallbackCopyShare(shareText);
    }
  };

  const fallbackCopyShare = async (shareText: string) => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "Copied for sharing", description: "Text copied to clipboard. You can paste it anywhere." });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    }
  };

  const handlePlay = () => {
    if (!window.speechSynthesis) {
      toast({ title: "Not supported", description: "Text-to-Speech is not available in your browser.", variant: "destructive" });
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const textToSpeak = isEditing ? editText : text;
    if (!textToSpeak.trim()) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = mapLanguageCode(language);
    utterance.rate = 0.95;

    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      toast({ title: "Playback error", description: "Could not play the text.", variant: "destructive" });
    };

    utteranceRef.current = utterance;
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleEditToggle = () => {
    if (isEditing) {
      if (onTextChange && editText !== text) {
        onTextChange(editText);
      }
      setIsEditing(false);
    } else {
      setEditText(text);
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setEditText(text);
    setIsEditing(false);
  };

  const handleGenerateImage = async () => {
    if (!text.trim() || secondsLeft > 0) return;
    setIsGeneratingImage(true);
    try {
      const prompt = `Create a visually appealing image that represents the following text content. Make it suitable for sharing on social media:\n\n${text.substring(0, 500)}`;
      const res = await apiRequest("POST", "/api/v1/a/generate-image-web", {
        prompt,
        size: "1024x1024",
        quality: "standard",
      });

      if (res.status === 429) {
        const err = await res.json();
        const retryAfter = err.retryAfterSeconds || 30;
        startCooldown(retryAfter);
        toast({
          title: "Too many requests",
          description: err.error || `Please wait ${retryAfter}s before generating again.`,
          variant: "destructive",
        });
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate image");
      }

      const data = await res.json();
      if (data.success && data.imageBase64) {
        setGeneratedImage(data.imageBase64);
        startCooldown(30);
      } else {
        throw new Error("No image returned from server");
      }
    } catch (error: any) {
      toast({
        title: "Image generation failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${generatedImage}`;
    link.download = `myvoicepost-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!text) return null;

  const isCoolingDown = secondsLeft > 0;
  const imageButtonLabel = isGeneratingImage
    ? "Generating..."
    : isCoolingDown
    ? `Image (${secondsLeft}s)`
    : "Image";

  return (
    <Card data-testid={`card-result-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePlay}
            data-testid={`button-play-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCopy}
            data-testid={`button-copy-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleShare}
            data-testid={`button-share-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <Share2 className="w-4 h-4" />
          </Button>
          {editable && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleEditToggle}
                data-testid={`button-edit-${title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {isEditing ? <Check className="w-4 h-4 text-green-500" /> : <Pencil className="w-4 h-4" />}
              </Button>
              {isEditing && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  data-testid={`button-cancel-edit-${title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
          {saveable && onSave && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onSave}
              disabled={isSaving}
              data-testid={`button-save-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          )}
          {showImageGen && isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || isCoolingDown}
              className="gap-1.5 text-primary"
              data-testid={`button-image-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {isGeneratingImage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              <span className="text-xs">{imageButtonLabel}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isEditing ? (
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[100px] text-sm"
            data-testid={`textarea-edit-${title.toLowerCase().replace(/\s+/g, "-")}`}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid={`text-content-${title.toLowerCase().replace(/\s+/g, "-")}`}>
            {text}
          </p>
        )}
      </CardContent>

      {isGeneratingImage && !generatedImage && (
        <CardContent className="pt-0">
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground rounded-md border border-dashed">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Creating your image…</p>
            <p className="text-xs">This may take 15–30 seconds</p>
          </div>
        </CardContent>
      )}

      {generatedImage && (
        <CardContent className="pt-0 space-y-3" data-testid={`section-image-${title.toLowerCase().replace(/\s+/g, "-")}`}>
          <img
            src={`data:image/png;base64,${generatedImage}`}
            alt="AI generated illustration"
            className="w-full rounded-md border object-contain"
            data-testid={`img-generated-${title.toLowerCase().replace(/\s+/g, "-")}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleDownloadImage}
              data-testid={`button-download-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || isCoolingDown}
              data-testid={`button-regen-${title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              {isCoolingDown ? `Redo (${secondsLeft}s)` : "Redo"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function mapLanguageCode(lang: string): string {
  const mapping: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    pt: "pt-BR",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh-CN",
    ar: "ar-SA",
    hi: "hi-IN",
    ru: "ru-RU",
    nl: "nl-NL",
    pl: "pl-PL",
    tr: "tr-TR",
    vi: "vi-VN",
    th: "th-TH",
    sv: "sv-SE",
    da: "da-DK",
    fi: "fi-FI",
    no: "nb-NO",
    uk: "uk-UA",
    cs: "cs-CZ",
    el: "el-GR",
    he: "he-IL",
    id: "id-ID",
    ms: "ms-MY",
    ro: "ro-RO",
    hu: "hu-HU",
    bg: "bg-BG",
  };
  return mapping[lang] || lang;
}
