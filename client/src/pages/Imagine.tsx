import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Download,
  Share2,
  Loader2,
  Image as ImageIcon,
  Clock,
  Lock,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ArtStyle =
  | "realistic"
  | "anime"
  | "watercolor"
  | "oil_paint"
  | "sketch"
  | "cartoon"
  | "cinematic"
  | "abstract";

type Quality = "standard" | "hd";
type Shape = "square" | "portrait" | "landscape";

const ART_STYLES: { value: ArtStyle; label: string; emoji: string }[] = [
  { value: "realistic", label: "Realistic", emoji: "📷" },
  { value: "anime", label: "Anime", emoji: "🌸" },
  { value: "watercolor", label: "Watercolor", emoji: "🎨" },
  { value: "oil_paint", label: "Oil Paint", emoji: "🖌️" },
  { value: "sketch", label: "Sketch", emoji: "✏️" },
  { value: "cartoon", label: "Cartoon", emoji: "🎭" },
  { value: "cinematic", label: "Cinematic", emoji: "🎬" },
  { value: "abstract", label: "Abstract", emoji: "🌀" },
];

const QUALITY_OPTIONS: { value: Quality; label: string; description: string }[] = [
  { value: "standard", label: "Standard", description: "Faster generation" },
  { value: "hd", label: "HD", description: "Higher quality" },
];

const SHAPE_OPTIONS: { value: Shape; label: string; size: string; icon: string }[] = [
  { value: "square", label: "Square", size: "1024×1024", icon: "⬜" },
  { value: "portrait", label: "Portrait", size: "1024×1792", icon: "📱" },
  { value: "landscape", label: "Landscape", size: "1792×1024", icon: "🖥️" },
];

const COOLDOWN_SECONDS = 30;

// ── Main component ─────────────────────────────────────────────────────────────

export default function Imagine() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [artStyle, setArtStyle] = useState<ArtStyle>("realistic");
  const [quality, setQuality] = useState<Quality>("standard");
  const [shape, setShape] = useState<Shape>("square");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const fullPrompt = [
        prompt.trim(),
        `Style: ${artStyle.replace("_", " ")}`,
        quality === "hd" ? "high quality, detailed" : "",
      ]
        .filter(Boolean)
        .join(". ");

      const res = await apiRequest("POST", "/api/v1/a/generate-image-web", {
        prompt: fullPrompt,
        quality,
        shape,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate image");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setImageUrl(data.imageUrl || data.url || null);
      startCooldown();
      toast({ title: "Image created!", description: "Your image has been generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleDownload() {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myvoicepost-imagine-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not download the image.", variant: "destructive" });
    }
  }

  async function handleShare() {
    if (!imageUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Generated with MyVoicePost", url: imageUrl });
      } catch {
        // user cancelled — silent
      }
    } else {
      await navigator.clipboard.writeText(imageUrl);
      toast({ title: "Link copied", description: "Image URL copied to clipboard." });
    }
  }

  const canGenerate = !!user && !!prompt.trim() && !generateMutation.isPending && cooldown === 0;

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Sign in to generate images</h1>
          <p className="text-muted-foreground">
            AI image generation is available to all registered users. Sign in or create a free account to get started.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/login">
              <Button variant="outline">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button>Create free account</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Imagine</h1>
          <Badge variant="secondary" className="text-xs">AI</Badge>
        </div>

        {/* Prompt */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prompt</CardTitle>
            <CardDescription>Describe the image you want to create</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="A serene mountain lake at sunset, with golden reflections on the water..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 4000))}
              rows={4}
              className="resize-y"
              data-testid="textarea-prompt"
            />
            <p className="text-xs text-muted-foreground text-right">{prompt.length} / 4000</p>
          </CardContent>
        </Card>

        {/* Art style */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Art Style</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {ART_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setArtStyle(s.value)}
                  data-testid={`button-style-${s.value}`}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all",
                    artStyle === s.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className="text-xs font-medium leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quality & Shape */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {QUALITY_OPTIONS.map((q) => (
                  <button
                    key={q.value}
                    onClick={() => setQuality(q.value)}
                    data-testid={`button-quality-${q.value}`}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-0.5 p-3 rounded-lg border text-center transition-all",
                      quality === q.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    <span className="text-sm font-semibold">{q.label}</span>
                    <span className="text-xs text-muted-foreground">{q.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Shape</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {SHAPE_OPTIONS.map((sh) => (
                  <button
                    key={sh.value}
                    onClick={() => setShape(sh.value)}
                    data-testid={`button-shape-${sh.value}`}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-0.5 p-3 rounded-lg border text-center transition-all",
                      shape === sh.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    <span className="text-lg leading-none">{sh.icon}</span>
                    <span className="text-xs font-semibold">{sh.label}</span>
                    <span className="text-[10px] text-muted-foreground">{sh.size}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Generate button */}
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!canGenerate}
          className="w-full"
          size="lg"
          data-testid="button-generate"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating…
            </>
          ) : cooldown > 0 ? (
            <>
              <Clock className="h-5 w-5 mr-2" />
              Wait {cooldown}s
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Generate Image
            </>
          )}
        </Button>

        {/* Result */}
        {imageUrl && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <img
                src={imageUrl}
                alt="AI generated image"
                className="w-full rounded-lg object-cover border"
                data-testid="image-result"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDownload}
                  data-testid="button-download"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleShare}
                  data-testid="button-share"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
