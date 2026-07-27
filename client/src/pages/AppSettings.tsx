import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Moon, Bell, Loader2, Languages, Globe, Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supportedLanguages } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SettingEntry {
  id: string;
  setting_key: string;
  setting_value: string;
}

// ── Tone options (matching mobile) ─────────────────────────────────────────────

const POLISH_TONES = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];

// ── My Languages chip picker ────────────────────────────────────────────────────

const MAX_MY_LANGUAGES = 10;

function MyLanguagesPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (langs: string[]) => void;
}) {
  const [filter, setFilter] = useState("");

  const visible = (supportedLanguages as readonly { code: string; name: string; flag: string }[]).filter(
    (l) =>
      l.code !== "auto" &&
      l.name.toLowerCase().includes(filter.toLowerCase())
  );

  function toggle(code: string) {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else if (selected.length < MAX_MY_LANGUAGES) {
      onChange([...selected, code]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">No languages selected</p>
        ) : (
          selected.map((code) => {
            const lang = supportedLanguages.find((l) => l.code === code);
            return (
              <Badge
                key={code}
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => toggle(code)}
                data-testid={`my-lang-chip-${code}`}
              >
                {lang?.name ?? code}
                <X className="h-3 w-3 opacity-60" />
              </Badge>
            );
          })
        )}
      </div>
      <input
        type="text"
        placeholder="Search language…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        data-testid="input-language-filter"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {visible.map((l) => {
          const active = selected.includes(l.code);
          return (
            <button
              key={l.code}
              onClick={() => toggle(l.code)}
              disabled={!active && selected.length >= MAX_MY_LANGUAGES}
              className={[
                "flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 disabled:opacity-40",
              ].join(" ")}
              data-testid={`lang-option-${l.code}`}
            >
              {active && <Check className="h-3 w-3 shrink-0" />}
              {l.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} / {MAX_MY_LANGUAGES} selected
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AppSettings() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData, isLoading } = useQuery<{
    success: boolean;
    settings: SettingEntry[];
  }>({
    queryKey: ["/api/v1/a/settings"],
  });

  function getVal(key: string, def: string) {
    return settingsData?.settings?.find((s) => s.setting_key === key)?.setting_value ?? def;
  }

  // ── My Languages ─────────────────────────────────────────────────────────────
  const [myLanguages, setMyLanguages] = useState<string[]>([]);
  const [myLangsDirty, setMyLangsDirty] = useState(false);

  useEffect(() => {
    const raw = getVal("my_languages", "[]");
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setMyLanguages(parsed);
    } catch {
      setMyLanguages([]);
    }
    setMyLangsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  function handleMyLanguagesChange(langs: string[]) {
    setMyLanguages(langs);
    setMyLangsDirty(true);
  }

  // ── Polish defaults ────────────────────────────────────────────────────────
  const [polishLang, setPolishLang] = useState("");
  const [polishTone, setPolishTone] = useState("");
  const [polishDirty, setPolishDirty] = useState(false);

  useEffect(() => {
    setPolishLang(getVal("polish_default_language", "en"));
    setPolishTone(getVal("polish_default_tone", "formal"));
    setPolishDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  // ── Translate defaults ─────────────────────────────────────────────────────
  const [translateSrc, setTranslateSrc] = useState("");
  const [translateDst, setTranslateDst] = useState("");
  const [translateDirty, setTranslateDirty] = useState(false);

  useEffect(() => {
    setTranslateSrc(getVal("translate_default_source", "auto"));
    setTranslateDst(getVal("translate_default_target", "en"));
    setTranslateDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (settings: { setting_key: string; setting_value: string }[]) => {
      const res = await apiRequest("PUT", "/api/v1/a/settings", { settings });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/a/settings"] });
      toast({ title: "Saved", description: "Settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    },
  });

  const handleToggleSetting = (key: string, current: string) => {
    const next = current === "true" ? "false" : "true";
    saveMutation.mutate([{ setting_key: key, setting_value: next }]);
  };

  const saveMyLanguages = () => {
    saveMutation.mutate([
      { setting_key: "my_languages", setting_value: JSON.stringify(myLanguages) },
    ]);
    setMyLangsDirty(false);
  };

  const savePolishDefaults = () => {
    saveMutation.mutate([
      { setting_key: "polish_default_language", setting_value: polishLang },
      { setting_key: "polish_default_tone", setting_value: polishTone },
    ]);
    setPolishDirty(false);
  };

  const saveTranslateDefaults = () => {
    saveMutation.mutate([
      { setting_key: "translate_default_source", setting_value: translateSrc },
      { setting_key: "translate_default_target", setting_value: translateDst },
    ]);
    setTranslateDirty(false);
  };

  const notifRecordings = getVal("notif_recordings_complete", "true");
  const notifWeekly = getVal("notif_weekly_summary", "false");
  const notifProduct = getVal("notif_product_updates", "true");

  const allLangs = supportedLanguages as readonly { code: string; name: string; flag: string }[];
  const langOptions = allLangs.filter((l) => l.code !== "auto");
  const langWithAuto = [{ code: "auto", name: "Auto-detect", flag: "" }, ...langOptions];

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">App Settings</h1>
              <p className="text-sm text-muted-foreground">Personalise your experience</p>
            </div>
          </div>

          {/* Appearance */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Appearance</CardTitle>
              </div>
              <CardDescription>Switch between light and dark mode</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="dark-mode-toggle" className="text-sm font-medium">
                    Dark mode
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Currently: {theme === "dark" ? "Dark" : "Light"}
                  </p>
                </div>
                <Switch
                  id="dark-mode-toggle"
                  checked={theme === "dark"}
                  onCheckedChange={toggleTheme}
                  data-testid="switch-dark-mode"
                />
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* My Languages */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">My Languages</CardTitle>
              </div>
              <CardDescription>
                Pin up to {MAX_MY_LANGUAGES} languages for quick access in Translate and Polish
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <MyLanguagesPicker
                    selected={myLanguages}
                    onChange={handleMyLanguagesChange}
                  />
                  {myLangsDirty && (
                    <Button
                      size="sm"
                      onClick={saveMyLanguages}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-my-languages"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Polish defaults */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Polish Defaults</CardTitle>
              </div>
              <CardDescription>Default language and tone used on the Polish page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Language</Label>
                      <Select
                        value={polishLang}
                        onValueChange={(v) => { setPolishLang(v); setPolishDirty(true); }}
                      >
                        <SelectTrigger data-testid="select-polish-lang">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {langOptions.map((l) => (
                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tone</Label>
                      <Select
                        value={polishTone}
                        onValueChange={(v) => { setPolishTone(v); setPolishDirty(true); }}
                      >
                        <SelectTrigger data-testid="select-polish-tone">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {POLISH_TONES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {polishDirty && (
                    <Button
                      size="sm"
                      onClick={savePolishDefaults}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-polish-defaults"
                    >
                      {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Translate defaults */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Translate Defaults</CardTitle>
              </div>
              <CardDescription>Default source and target language on the Translate page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Source</Label>
                      <Select
                        value={translateSrc}
                        onValueChange={(v) => { setTranslateSrc(v); setTranslateDirty(true); }}
                      >
                        <SelectTrigger data-testid="select-translate-src">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {langWithAuto.map((l) => (
                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Target</Label>
                      <Select
                        value={translateDst}
                        onValueChange={(v) => { setTranslateDst(v); setTranslateDirty(true); }}
                      >
                        <SelectTrigger data-testid="select-translate-dst">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {langOptions.map((l) => (
                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {translateDirty && (
                    <Button
                      size="sm"
                      onClick={saveTranslateDefaults}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-translate-defaults"
                    >
                      {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Notifications */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Notifications</CardTitle>
              </div>
              <CardDescription>Control which email notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  {[
                    {
                      key: "notif_recordings_complete",
                      label: "Recording completed",
                      description: "Get notified when a long recording finishes processing",
                      value: notifRecordings,
                      testId: "switch-notif-recordings",
                    },
                    {
                      key: "notif_weekly_summary",
                      label: "Weekly summary",
                      description: "Receive a weekly digest of your usage",
                      value: notifWeekly,
                      testId: "switch-notif-weekly",
                    },
                    {
                      key: "notif_product_updates",
                      label: "Product updates",
                      description: "Hear about new features and improvements",
                      value: notifProduct,
                      testId: "switch-notif-product",
                    },
                  ].map(({ key, label, description, value, testId }, idx, arr) => (
                    <div key={key}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 pr-4">
                          <Label className="text-sm font-medium">{label}</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        </div>
                        <Switch
                          checked={value === "true"}
                          onCheckedChange={() => handleToggleSetting(key, value)}
                          disabled={saveMutation.isPending}
                          data-testid={testId}
                        />
                      </div>
                      {idx < arr.length - 1 && <Separator className="mt-4" />}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
