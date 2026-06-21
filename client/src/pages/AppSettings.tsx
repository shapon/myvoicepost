import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/contexts/ThemeContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Settings, Moon, Bell, BellOff, Loader2 } from "lucide-react";

interface SettingEntry {
  id: string;
  setting_key: string;
  setting_value: string;
}

function useSetting(key: string, defaultValue: string) {
  const { data } = useQuery<{ success: boolean; settings: SettingEntry[] }>({
    queryKey: ["/api/v1/a/settings"],
  });
  const entry = data?.settings?.find((s) => s.setting_key === key);
  return entry?.setting_value ?? defaultValue;
}

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

  const saveMutation = useMutation({
    mutationFn: async (settings: { setting_key: string; setting_value: string }[]) => {
      const res = await apiRequest("PUT", "/api/v1/a/settings", { settings });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/v1/a/settings"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    },
  });

  const handleToggleSetting = (key: string, current: string) => {
    const next = current === "true" ? "false" : "true";
    saveMutation.mutate([{ setting_key: key, setting_value: next }]);
  };

  const notifRecordings = getVal("notif_recordings_complete", "true");
  const notifWeekly = getVal("notif_weekly_summary", "false");
  const notifProduct = getVal("notif_product_updates", "true");

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
