import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Shield, User, Lock, Loader2, Check, CreditCard, RefreshCw, AlertTriangle, Bell, Clock, ExternalLink, Receipt } from "lucide-react";

interface SubscriptionInfo {
  id: string;
  plan_name: string;
  status: string;
  valid_date_upto: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  stripe_status: string | null;
}

interface UsageStats {
  audioMinutesAdded: number;
  audioMinutesUsed: number;
  totalTranscriptions: number;
  totalUsageSeconds: number;
  appStartsAt: string | null;
  validEndsAt: string | null;
  trialUsed: boolean;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(64),
  email: z.string().email("Invalid email address"),
});
type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

// ── Payment History section ────────────────────────────────────────────────────

interface PaymentRecord {
  id: string;
  type: string;
  planName: string;
  amount: number;
  currency: string;
  status: string;
  minutesAdded: number | null;
  date: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  receiptUrl: string | null;
  refunded: boolean;
}

function PaymentHistorySection() {
  const { data, isLoading } = useQuery<{ success: boolean; payments: PaymentRecord[] }>({
    queryKey: ["/api/v1/a/payment-history"],
    staleTime: 5 * 60 * 1000,
  });

  const payments = (data?.payments ?? []).slice(0, 10);

  function formatAmount(amount: number, currency: string) {
    const dollars = amount / 100;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(dollars);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Payment History</CardTitle>
        </div>
        <CardDescription>Your last 10 payments</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-payments">
            No payments yet.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
                data-testid={`payment-row-${p.id}`}
              >
                {/* Date */}
                <div className="shrink-0 text-xs text-muted-foreground w-20">
                  {p.date ? new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </div>

                {/* Plan + card */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.planName}</p>
                  {p.cardBrand && p.cardLast4 && (
                    <p className="text-xs text-muted-foreground">
                      {p.cardBrand.charAt(0).toUpperCase() + p.cardBrand.slice(1)} ···{p.cardLast4}
                    </p>
                  )}
                </div>

                {/* Minutes */}
                {p.minutesAdded != null && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    +{p.minutesAdded} min
                  </span>
                )}

                {/* Amount */}
                <span className="font-semibold shrink-0">
                  {p.amount > 0 ? formatAmount(p.amount, p.currency) : "Free"}
                </span>

                {/* Status badge */}
                <Badge
                  variant={
                    p.refunded
                      ? "destructive"
                      : p.status === "active" || p.status === "succeeded"
                      ? "secondary"
                      : "outline"
                  }
                  className="shrink-0 text-xs"
                  data-testid={`payment-status-${p.id}`}
                >
                  {p.refunded ? "Refunded" : p.status}
                </Badge>

                {/* Receipt link */}
                {p.receiptUrl && (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary hover:underline"
                    data-testid={`payment-receipt-${p.id}`}
                    title="View receipt"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [profileSaved, setProfileSaved] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const originalPushStateRef = useRef<typeof window.history.pushState | null>(null);
  const sentinelPushedRef = useRef(false);

  // ── Subscription query ──────────────────────────────────────────────────────
  const { data: subData, isLoading: subLoading } = useQuery<{
    success: boolean;
    has_active_subscription: boolean;
    current_package: string | null;
    valid_ends_at: string | null;
    subscription: SubscriptionInfo | null;
  }>({
    queryKey: ["/api/v1/a/subscription-status"],
  });

  // ── Usage stats query ────────────────────────────────────────────────────────
  const { data: statsData, isLoading: statsLoading } = useQuery<{
    success: boolean;
    stats: UsageStats;
  }>({
    queryKey: ["/api/v1/a/usage-stats"],
    refetchInterval: 30_000,
  });

  const stats = statsData?.stats;

  const sub = subData?.subscription ?? null;
  const hasSub = subData?.has_active_subscription ?? false;
  const autoRenewOn = hasSub && sub ? !sub.cancel_at_period_end : false;
  const pendingCancellation = hasSub && sub ? sub.cancel_at_period_end : false;

  // Determine whether a non-subscriber's validity has expired (or was never set).
  const trialExpired =
    !hasSub &&
    subData !== undefined &&
    (!subData.valid_ends_at || new Date(subData.valid_ends_at) < new Date());

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/a/cancel-subscription", {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to cancel subscription");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/subscription-status"] });
      toast({ title: "Subscription cancelled", description: "Your plan will remain active until the end of the billing period." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/a/reactivate-subscription", {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reactivate subscription");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/subscription-status"] });
      toast({ title: "Auto-renewal enabled", description: "Your subscription will renew automatically." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Notification preferences ────────────────────────────────────────────────
  const NOTIF_LABELS: Record<string, { label: string; description: string }> = {
    subscription_renewed: { label: "Subscription Renewed", description: "When your plan renews successfully" },
    payment_failed: { label: "Payment Failed", description: "When a payment attempt fails" },
    subscription_expired: { label: "Subscription Expired", description: "When your subscription ends" },
    topup_credited: { label: "Top-Up Credited", description: "When minutes are added to your account" },
    low_minutes: { label: "Low on Minutes", description: "When you're running low on recording time" },
    expiry_3days_manual: { label: "Subscription Expiring Soon", description: "3-day warning before your plan ends" },
  };

  interface NotifPref { notificationType: string; pushEnabled: boolean; emailEnabled: boolean; }

  const { data: notifData, isLoading: notifLoading } = useQuery<{ success: boolean; preferences: NotifPref[] }>({
    queryKey: ["/api/v1/a/notification-preferences"],
  });

  const notifPrefs: Record<string, NotifPref> = {};
  if (notifData?.preferences) {
    notifData.preferences.forEach(p => { notifPrefs[p.notificationType] = p; });
  }

  const notifMutation = useMutation({
    mutationFn: async (pref: NotifPref) => {
      const res = await apiRequest("PATCH", "/api/v1/a/notification-preferences", pref);
      if (!res.ok) throw new Error("Failed to save preference");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/notification-preferences"] });
      toast({ title: "Saved", description: "Notification preference updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save notification preference", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/notification-preferences"] });
    },
  });

  function toggleNotifPref(type: string, field: "pushEnabled" | "emailEnabled", value: boolean) {
    const current = notifPrefs[type] ?? { notificationType: type, pushEnabled: true, emailEnabled: true };
    const updated = { ...current, [field]: value };
    queryClient.setQueryData<{ success: boolean; preferences: NotifPref[] }>(
      ["/api/v1/a/notification-preferences"],
      (old) => {
        if (!old) return old;
        const exists = old.preferences.some(p => p.notificationType === type);
        const preferences = exists
          ? old.preferences.map(p => p.notificationType === type ? updated : p)
          : [...old.preferences, updated];
        return { ...old, preferences };
      }
    );
    notifMutation.mutate(updated);
  }

  // Profile form
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username ?? "",
      email: user?.email ?? "",
    },
  });

  // Password form (declared before the navigation guard so it can be referenced in the effect)
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    profileForm.reset({
      username: user?.username ?? "",
      email: user?.email ?? "",
    });
  }, [user]);

  // ── Navigation guard ────────────────────────────────────────────────────────
  //
  // Strategy:
  //  • In-app navigation (Wouter pushState): intercept and show dialog.
  //  • Browser back/forward: push a sentinel history entry when the guard
  //    activates so that pressing back stays at /account-settings (the URL
  //    doesn't change → Wouter doesn't navigate away). Our popstate handler
  //    re-pushes the sentinel and shows the dialog.
  //  • beforeunload: native browser confirmation for tab close / reload.

  useEffect(() => {
    const isDirty = profileForm.formState.isDirty || passwordForm.formState.isDirty;

    // beforeunload: browser tab close / reload / external navigation
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);

    if (!isDirty) {
      return () => {
        window.removeEventListener("beforeunload", beforeUnloadHandler);
      };
    }

    // Capture the real pushState before we override it
    const original = window.history.pushState.bind(window.history);
    originalPushStateRef.current = original;

    // Push a sentinel entry now. The history stack becomes:
    //   [..., prevPage, /account-settings (real), /account-settings (sentinel)]
    // Pressing back moves to "real" — URL stays /account-settings so Wouter
    // sees no route change and leaves the component mounted.
    if (!sentinelPushedRef.current) {
      original(null, "", "/account-settings");
      sentinelPushedRef.current = true;
    }

    // Intercept Wouter's pushState for in-app link clicks
    window.history.pushState = function (
      state: unknown,
      title: string,
      url?: string | URL | null
    ) {
      const targetPath = url?.toString() ?? "";
      if (targetPath && !targetPath.startsWith("/account-settings")) {
        setPendingPath(targetPath);
        setShowLeaveDialog(true);
        return;
      }
      original(state, title, url);
    };

    // popstate fires when the user presses back/forward.
    // Because we have a sentinel, the URL is still /account-settings after one
    // back press → Wouter stays put. We re-push the sentinel immediately so any
    // additional back presses are also caught, then show the dialog.
    const popstateHandler = () => {
      original(null, "", "/account-settings");
      setPendingPath("__back__");
      setShowLeaveDialog(true);
    };
    window.addEventListener("popstate", popstateHandler);

    return () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      window.removeEventListener("popstate", popstateHandler);
      if (originalPushStateRef.current) {
        window.history.pushState = originalPushStateRef.current;
        originalPushStateRef.current = null;
      }
      // Remove our sentinel so we don't pollute the history stack when the
      // guard deactivates (e.g. after a successful save).
      if (sentinelPushedRef.current) {
        sentinelPushedRef.current = false;
        window.history.go(-1);
      }
    };
  }, [profileForm.formState.isDirty, passwordForm.formState.isDirty]);

  const handleConfirmLeave = () => {
    // Restore original pushState before navigating
    if (originalPushStateRef.current) {
      window.history.pushState = originalPushStateRef.current;
      originalPushStateRef.current = null;
    }
    // Prevent cleanup from trying to pop the sentinel (we handle nav ourselves)
    sentinelPushedRef.current = false;
    profileForm.reset();
    passwordForm.reset();
    setShowLeaveDialog(false);
    const target = pendingPath;
    setPendingPath(null);
    if (target === "__back__") {
      // After popstateHandler re-pushed the sentinel, history is:
      //   [..., prevPage, /account-settings (real), /account-settings (new-sentinel)]
      // Go back 2 to reach prevPage.
      window.history.go(-2);
    } else if (target) {
      navigate(target);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveDialog(false);
    setPendingPath(null);
  };

  // ── Profile mutation ────────────────────────────────────────────────────────

  const profileMutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const res = await apiRequest("PUT", "/api/v1/a/profile", values);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.token) {
        setAuthToken(data.token);
      }
      if (data?.user) {
        updateUser({ username: data.user.username, email: data.user.email });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/v1/a/auth/me'] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordValues) => {
      const res = await apiRequest("PUT", "/api/v1/a/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({ title: "Password changed", description: "Your password has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Account Settings</h1>
              <p className="text-sm text-muted-foreground">Update your profile and password</p>
            </div>
          </div>

          {/* Subscription */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Subscription</CardTitle>
              </div>
              <CardDescription>Manage your plan and auto-renewal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-9 w-32" />
                </div>
              ) : !hasSub ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium text-sm" data-testid="text-current-package">
                      {subData?.current_package ?? "TRIAL"}
                    </span>
                    {trialExpired ? (
                      <Badge variant="destructive" data-testid="status-plan-expired">Expired</Badge>
                    ) : (
                      <Badge variant="secondary" data-testid="status-plan-trial">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                    <span className="text-muted-foreground">Valid until</span>
                    <span className="font-medium" data-testid="text-valid-ends-at">
                      {formatDate(subData?.valid_ends_at)}
                    </span>
                  </div>
                  <Button variant="default" size="sm" asChild data-testid="button-view-plans">
                    <a href="/pricing">View plans</a>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Plan name + status */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium text-sm">{sub?.plan_name}</span>
                    {pendingCancellation ? (
                      <Badge variant="destructive" data-testid="status-sub-cancelling">Cancelling</Badge>
                    ) : (
                      <Badge variant="secondary" data-testid="status-sub-active">Active</Badge>
                    )}
                  </div>

                  {/* Billing date row */}
                  <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                    <span className="text-muted-foreground">
                      {pendingCancellation ? "Access until" : autoRenewOn ? "Next billing date" : "Expires on"}
                    </span>
                    <span className="font-medium" data-testid="text-billing-date">
                      {formatDate(sub?.current_period_end ?? sub?.valid_date_upto)}
                    </span>
                  </div>

                  {/* Auto-renew toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Auto-renewal</span>
                    </div>
                    <Switch
                      checked={autoRenewOn}
                      disabled={cancelMutation.isPending || reactivateMutation.isPending}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          reactivateMutation.mutate();
                        } else {
                          setShowCancelDialog(true);
                        }
                      }}
                      data-testid="switch-auto-renew"
                    />
                  </div>

                  {/* Pending cancellation warning */}
                  {pendingCancellation && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-cancel-warning">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        Your subscription has been cancelled and will expire on{" "}
                        <strong>{formatDate(sub?.current_period_end ?? sub?.valid_date_upto)}</strong>.
                        No further charges will be made. You can reactivate by turning auto-renewal back on.
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Minute Balance */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Minute Balance</CardTitle>
              </div>
              <CardDescription>Your current audio minute usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {statsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-2 w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ) : stats ? (
                <>
                  <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                    <span className="text-muted-foreground">
                      {stats.audioMinutesUsed.toFixed(1)} / {stats.audioMinutesAdded} min used
                    </span>
                    <Badge
                      variant={stats.audioMinutesUsed >= stats.audioMinutesAdded ? "destructive" : "secondary"}
                      data-testid="status-minutes-balance"
                    >
                      {stats.audioMinutesAdded - stats.audioMinutesUsed > 0
                        ? `${(stats.audioMinutesAdded - stats.audioMinutesUsed).toFixed(1)} min remaining`
                        : "No minutes left"}
                    </Badge>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (stats.audioMinutesUsed / Math.max(1, stats.audioMinutesAdded)) * 100)}%`,
                      }}
                      data-testid="progress-minutes"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Card>
                      <CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground mb-1">Total added</p>
                        <p className="text-lg font-bold" data-testid="stat-minutes-added">
                          {stats.audioMinutesAdded} min
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground mb-1">Used</p>
                        <p className="text-lg font-bold" data-testid="stat-minutes-used">
                          {stats.audioMinutesUsed.toFixed(1)} min
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No usage data available.</p>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Payment History */}
          <PaymentHistorySection />

          <Separator />

          {/* Notification Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Notification Preferences</CardTitle>
              </div>
              <CardDescription>Choose which notifications you receive by push or email</CardDescription>
            </CardHeader>
            <CardContent>
              {notifLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center pb-2 mb-1 border-b">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notification</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center w-12">Push</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center w-12">Email</span>
                  </div>
                  {Object.keys(NOTIF_LABELS).map(type => {
                    const pref = notifPrefs[type] ?? { notificationType: type, pushEnabled: true, emailEnabled: true };
                    const info = NOTIF_LABELS[type];
                    return (
                      <div key={type} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center py-2.5">
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-notif-label-${type}`}>{info.label}</p>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                        <div className="flex justify-center w-12">
                          <Switch
                            checked={pref.pushEnabled}
                            onCheckedChange={v => toggleNotifPref(type, "pushEnabled", v)}
                            data-testid={`switch-notif-push-${type}`}
                          />
                        </div>
                        <div className="flex justify-center w-12">
                          <Switch
                            checked={pref.emailEnabled}
                            onCheckedChange={v => toggleNotifPref(type, "emailEnabled", v)}
                            data-testid={`switch-notif-email-${type}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Update profile */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Profile</CardTitle>
              </div>
              <CardDescription>Change your display name or email address</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form
                  onSubmit={profileForm.handleSubmit((v) => profileMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={profileForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your username"
                            {...field}
                            data-testid="input-username"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            {...field}
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={profileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {profileMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    ) : profileSaved ? (
                      <><Check className="w-4 h-4 mr-2 text-green-500" />Saved</>
                    ) : (
                      "Save Profile"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Separator />

          {/* Change password */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Change Password</CardTitle>
              </div>
              <CardDescription>Enter your current password to set a new one</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            data-testid="input-current-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Min. 6 characters"
                            {...field}
                            data-testid="input-new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Repeat new password"
                            {...field}
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={passwordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    {passwordMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Changing…</>
                    ) : (
                      "Change Password"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Cancel subscription confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent data-testid="dialog-cancel-subscription">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel auto-renewal?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will stay active until the end of the current billing period. After that, it won't renew and you'll lose access to premium features. You can turn auto-renewal back on at any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-subscription">Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-cancel"
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                setShowCancelDialog(false);
                cancelMutation.mutate();
              }}
            >
              Cancel auto-renewal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={(open) => { if (!open) handleCancelLeave(); }}>
        <AlertDialogContent data-testid="dialog-unsaved-changes">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now, those changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-stay-on-page" onClick={handleCancelLeave}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction data-testid="button-discard-changes" onClick={handleConfirmLeave}>
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
