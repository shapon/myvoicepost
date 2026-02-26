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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
}: WebTextResultCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  if (!text) return null;

  return (
    <Card data-testid={`card-result-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
        </div>
        <div className="flex items-center gap-1">
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
