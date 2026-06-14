import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/queryClient";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit,
  Upload,
  FileText,
  FileCheck,
  Trash2,
  Copy,
  Check,
  Download,
  Loader2,
  Sparkles,
  AlignLeft,
  ListChecks,
  MessageSquareQuote,
  Newspaper,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ProcessMode = "extract" | "summarize" | "qa" | "blog";

interface ModeConfig {
  value: ProcessMode;
  label: string;
  description: string;
  icon: typeof AlignLeft;
  loadingText: string;
}

const MODES: ModeConfig[] = [
  {
    value: "extract",
    label: "Extract",
    description: "Clean structured text from raw file",
    icon: AlignLeft,
    loadingText: "Extracting text…",
  },
  {
    value: "summarize",
    label: "Summarize",
    description: "Executive summary + 5 key takeaways",
    icon: ListChecks,
    loadingText: "AI is summarizing…",
  },
  {
    value: "qa",
    label: "Q&A",
    description: "5–10 customer Q&A pairs",
    icon: MessageSquareQuote,
    loadingText: "Generating Q&A pairs…",
  },
  {
    value: "blog",
    label: "Blog Post",
    description: "Full SEO-optimised long-form article",
    icon: Newspaper,
    loadingText: "AI is drafting blog post…",
  },
];

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
};

const DOC_MAX_BYTES = 25 * 1024 * 1024;
const IMG_MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(file: File) {
  return file.type.startsWith("image/");
}

export default function DocAI() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<ProcessMode>("extract");
  const [result, setResult] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const validateAndSetFile = useCallback((f: File) => {
    setFileError(null);
    if (!ACCEPTED_TYPES[f.type]) {
      setFileError("Unsupported file type. Please upload PDF, DOCX, TXT, PNG, or JPG.");
      return;
    }
    const maxSize = isImage(f) ? IMG_MAX_BYTES : DOC_MAX_BYTES;
    if (f.size > maxSize) {
      setFileError(
        `File too large. Max ${isImage(f) ? "10 MB for images" : "25 MB for documents"} (your file: ${formatBytes(f.size)}).`
      );
      return;
    }
    setFile(f);
    setResult("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) validateAndSetFile(dropped);
    },
    [validateAndSetFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) validateAndSetFile(picked);
    e.target.value = "";
  };

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      const res = await fetch("/api/v1/a/doc-ai", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Processing failed");
      }
      return res.json() as Promise<{ success: boolean; result: string; mode: string }>;
    },
    onSuccess: (data) => {
      setResult(data.result || "");
      toast({ title: "Done!", description: "Document processed successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportMarkdown = () => {
    const blob = new Blob([result], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const modeName = MODES.find((m) => m.value === mode)?.label ?? mode;
    a.href = url;
    a.download = `doc-ai-${modeName.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setResult("");
    setFileError(null);
  };

  const currentMode = MODES.find((m) => m.value === mode)!;
  const ModeIcon = currentMode.icon;
  const isProcessing = processMutation.isPending;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center flex-shrink-0">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">Document Intelligence &amp; Interactive Q&amp;A Engine</h1>
                <p className="text-sm text-muted-foreground">Upload a document and let AI extract, summarise, answer, or write.</p>
              </div>
            </div>
          </div>

          {/* Upload zone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                1 — Upload File
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!file ? (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors select-none ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    }`}
                    data-testid="dropzone-docai"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={handleFileInput}
                      data-testid="input-docai-file"
                    />
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium mb-1">Drag &amp; drop your file here</p>
                    <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {Object.values(ACCEPTED_TYPES).filter((v, i, a) => a.indexOf(v) === i).map((fmt) => (
                        <Badge key={fmt} variant="secondary" className="text-xs">{fmt}</Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">· docs up to 25 MB · images up to 10 MB</span>
                    </div>
                  </div>
                  {fileError && (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
                      <Badge variant="destructive" className="text-xs shrink-0">Error</Badge>
                      <span className="text-sm text-destructive" data-testid="text-file-error">{fileError}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 border border-border px-4 py-3">
                  <FileCheck className="w-8 h-8 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" data-testid="text-docai-filename">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {ACCEPTED_TYPES[file.type] ?? "File"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={reset}
                    disabled={isProcessing}
                    data-testid="button-remove-docai-file"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mode selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                2 — Choose Processing Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setMode(m.value)}
                      className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
                      }`}
                      data-testid={`button-mode-${m.value}`}
                    >
                      <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{m.label}</span>
                      <span className="text-xs text-muted-foreground leading-tight">{m.description}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Process button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={() => processMutation.mutate()}
              disabled={!file || isProcessing}
              className="min-w-56 bg-gradient-to-r from-primary to-purple-400"
              data-testid="button-process-docai"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {currentMode.loadingText}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Process Document
                </>
              )}
            </Button>
          </div>

          {/* Result workspace */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        3 — Result
                      </CardTitle>
                      <Badge className="bg-gradient-to-r from-primary to-purple-400 text-white border-0">
                        <ModeIcon className="w-3 h-3 mr-1" />
                        {currentMode.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        data-testid="button-copy-docai"
                      >
                        {copied ? (
                          <><Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />Copied</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportMarkdown}
                        data-testid="button-export-docai"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export .md
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="relative rounded-md bg-muted/40 border border-border overflow-hidden">
                      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-muted/60">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          doc-ai · {currentMode.label.toLowerCase()}
                        </span>
                      </div>
                      <textarea
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                        className="w-full min-h-[360px] bg-transparent px-4 py-4 text-sm font-mono leading-relaxed resize-y focus:outline-none text-foreground"
                        spellCheck={false}
                        data-testid="textarea-docai-result"
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={reset}
                        data-testid="button-reset-docai"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        New Document
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </AppLayout>
  );
}
