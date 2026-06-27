import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, Mic, RefreshCw, Loader2, ArrowLeft } from "lucide-react";
import Header from "@/components/landing/Header";

interface Plan {
  id: string;
  name: string;
  valid_total_minutes: number | null;
  price_monthly: number;
  stripe_price_id: string | null;
  chunks_count: number;
  recordings_available_days: number;
  offline_recording: boolean;
  is_visible: boolean;
}

const PLAN_DISPLAY: Record<string, { description: string; features: string[]; highlighted: boolean }> = {
  Starter: {
    description: "Perfect for personal use",
    features: [
      "30 minutes of audio per month",
      "Polish feature included",
      "5 languages supported",
      "Email support",
      "Basic text formatting",
    ],
    highlighted: false,
  },
  Pro: {
    description: "Best for professionals",
    features: [
      "120 minutes of audio per month",
      "Polish + Translate features",
      "29 languages supported",
      "Priority support",
      "Advanced formatting options",
      "Save & export history",
    ],
    highlighted: true,
  },
  Enterprise: {
    description: "For teams and businesses",
    features: [
      "Unlimited audio processing",
      "All languages supported",
      "Dedicated account manager",
      "Custom integrations",
      "Team collaboration",
    ],
    highlighted: false,
  },
};

function formatMinutes(mins: number | null) {
  if (!mins) return "Unlimited";
  return `${mins.toLocaleString()} min/mo`;
}

function formatPrice(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

export default function Subscribe() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const preselectedPlan = params.get("plan") ?? "";

  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [autoRenew, setAutoRenew] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login?redirect=/subscribe" + (preselectedPlan ? `?plan=${preselectedPlan}` : ""));
    }
  }, [user, authLoading, navigate, preselectedPlan]);

  const { data, isLoading: plansLoading } = useQuery<{ success: boolean; plans: Plan[] }>({
    queryKey: ["/api/v1/p/plans"],
  });

  const plans = (data?.plans ?? []).filter((p) => p.is_visible && p.stripe_price_id);

  useEffect(() => {
    if (plans.length === 0) return;
    if (preselectedPlan) {
      const match = plans.find((p) => p.name.toLowerCase() === preselectedPlan.toLowerCase());
      if (match) { setSelectedPlanId(match.id); return; }
    }
    const highlighted = plans.find((p) => PLAN_DISPLAY[p.name]?.highlighted);
    setSelectedPlanId(highlighted?.id ?? plans[0]?.id ?? "");
  }, [plans, preselectedPlan]);

  const subscribeMutation = useMutation({
    mutationFn: async ({ priceId, autoRenew }: { priceId: string; autoRenew: boolean }) => {
      const res = await apiRequest("POST", "/api/v1/a/web-subscribe", { priceId, autoRenew });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start checkout");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: Error) => {
      toast({ title: "Checkout error", description: err.message, variant: "destructive" });
    },
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleSubscribe = () => {
    if (!selectedPlan?.stripe_price_id) return;
    subscribeMutation.mutate({ priceId: selectedPlan.stripe_price_id, autoRenew });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-32 pb-20 px-4 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-96 rounded-md" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto">

          <div className="mb-8">
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="gap-2 mb-4" data-testid="button-back-pricing">
                <ArrowLeft className="w-4 h-4" />
                Back to Pricing
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Choose Your Plan</h1>
            <p className="text-muted-foreground mt-1">Select a plan and payment preference below.</p>
          </div>

          {/* Auto-renewal toggle */}
          <Card className="mb-8 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold text-foreground">Auto-renewal</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {autoRenew
                    ? "Your subscription renews automatically each month. Cancel anytime."
                    : "You will be billed once. You must manually renew before it expires."}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 pt-1">
                <span className="text-sm text-muted-foreground">Manual</span>
                <Switch
                  checked={autoRenew}
                  onCheckedChange={setAutoRenew}
                  data-testid="switch-auto-renew"
                />
                <span className="text-sm text-foreground font-medium">Auto</span>
                {autoRenew && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Auto-renews
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {plansLoading ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-md" />)}
            </div>
          ) : plans.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No subscription plans are currently available. Please contact support.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {plans.map((plan) => {
                const display = PLAN_DISPLAY[plan.name] ?? { description: "", features: [], highlighted: false };
                const isSelected = plan.id === selectedPlanId;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className="text-left w-full"
                    data-testid={`card-plan-${plan.name.toLowerCase()}`}
                  >
                    <Card
                      className={`relative p-6 h-full flex flex-col transition-all ${
                        display.highlighted
                          ? "bg-foreground text-background border-foreground scale-105 shadow-xl"
                          : isSelected
                            ? "ring-2 ring-primary"
                            : ""
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <Badge variant={display.highlighted ? "outline" : "default"} className="text-xs">
                            Selected
                          </Badge>
                        </div>
                      )}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${display.highlighted ? "bg-background/20" : "bg-primary/10"}`}>
                            <Mic className={`w-3.5 h-3.5 ${display.highlighted ? "text-background" : "text-primary"}`} />
                          </div>
                          <span className="font-semibold">{plan.name}</span>
                        </div>
                        <p className={`text-sm ${display.highlighted ? "text-background/70" : "text-muted-foreground"}`}>
                          {display.description || formatMinutes(plan.valid_total_minutes)}
                        </p>
                      </div>

                      <div className="mb-5">
                        <span className="text-3xl font-bold">{formatPrice(plan.price_monthly)}</span>
                        <span className={`text-sm ml-1 ${display.highlighted ? "text-background/70" : "text-muted-foreground"}`}>/month</span>
                      </div>

                      <ul className="space-y-2 flex-1">
                        {(display.features.length > 0 ? display.features : [
                          formatMinutes(plan.valid_total_minutes),
                          `${plan.recordings_available_days} days recording access`,
                          plan.offline_recording ? "Offline recording" : "Online recording",
                        ]).map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <Check className={`w-4 h-4 shrink-0 mt-0.5 ${display.highlighted ? "text-green-400" : "text-primary"}`} />
                            <span className={`text-sm ${display.highlighted ? "text-background/90" : "text-muted-foreground"}`}>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}

          {plans.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={handleSubscribe}
                disabled={!selectedPlan?.stripe_price_id || subscribeMutation.isPending}
                data-testid="button-subscribe"
                className="min-w-48"
              >
                {subscribeMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecting…</>
                ) : (
                  `Subscribe to ${selectedPlan?.name ?? "Plan"}`
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                You will be redirected to Stripe's secure checkout.{" "}
                {autoRenew ? "Cancel anytime from Account Settings." : "No automatic charges — you control each renewal."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
