import { useState, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Mic, Zap, CreditCard, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/queryClient";

const MONTHLY_PRICE = 15;
const YEARLY_PRICE = Math.round(MONTHLY_PRICE * 0.8); // 20% off

type CellValue = boolean | string;

interface ComparisonRow {
  feature: string;
  free: CellValue;
  pro: CellValue;
  note?: string;
}

interface ComparisonSection {
  title: string;
  rows: ComparisonRow[];
}

const comparisonSections: ComparisonSection[] = [
  {
    title: "Recording & Transcription",
    rows: [
      { feature: "Voice recording & transcription", free: true, pro: true },
      { feature: "Audio file upload", free: true, pro: true },
      { feature: "Background / screen-off recording", free: true, pro: true },
      { feature: "Offline recording", free: true, pro: true },
      { feature: "Monthly audio minutes", free: "90 mins", pro: "3,000 mins" },
      { feature: "Pay-as-you-go top-up (if you run out)", free: true, pro: true },
    ],
  },
  {
    title: "AI Processing",
    rows: [
      { feature: "AI Polish — rewrite your speech", free: true, pro: true },
      { feature: "AI Translation (90+ languages)", free: true, pro: true },
      { feature: "25+ rewrite styles & tones", free: true, pro: true },
      { feature: "Long-form content (500+ words)", free: false, pro: true },
    ],
  },
  {
    title: "File & Document Processing",
    rows: [
      { feature: "PDF / DOCX / Image upload", free: true, pro: true },
      { feature: "Max file size", free: "25 MB", pro: "50 MB" },
      { feature: "Auto summary & key takeaways", free: true, pro: true },
      { feature: "Auto-generated FAQ from documents", free: true, pro: true },
      { feature: "SEO blog post from voice / file", free: false, pro: true },
    ],
  },
  {
    title: "Apps & Sync",
    rows: [
      { feature: "iOS, Android, Web & macOS apps", free: true, pro: true },
      { feature: "Sync across all devices", free: true, pro: true },
      { feature: "Dark & light mode", free: true, pro: true },
      { feature: "Save & access full history", free: true, pro: true },
    ],
  },
  {
    title: "Support & Billing",
    rows: [
      { feature: "Email support", free: true, pro: true },
      { feature: "Priority support", free: false, pro: true },
      { feature: "No credit card required to start", free: true, pro: false },
      { feature: "Cancel anytime", free: false, pro: true },
    ],
  },
];

function CellContent({ value, isProCol }: { value: CellValue; isProCol: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check
        className={`w-5 h-5 mx-auto ${isProCol ? "text-primary" : "text-primary"}`}
        aria-label="Included"
      />
    ) : (
      <X className="w-4 h-4 mx-auto text-muted-foreground/40" aria-label="Not included" />
    );
  }
  return (
    <span className={`text-sm font-medium ${isProCol ? "text-foreground" : "text-foreground"}`}>
      {value}
    </span>
  );
}

interface UsageStats {
  audioMinutesAdded: number;
  audioMinutesUsed: number;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialUsed: boolean;
}

interface SubscriptionStatus {
  success: boolean;
  has_active_subscription: boolean;
  has_active_trial: boolean;
  valid_ends_at?: string | null;
  current_package?: string | null;
  trial: {
    is_active: boolean;
    days_remaining: number;
    minutes_remaining: number;
    minutes_used: number;
    trial_ends_at: string | null;
  } | null;
  subscription: {
    minutes_remaining: number;
    plan_name: string;
    status: string;
    valid_date_upto?: string | null;
  } | null;
}

function formatValidUntil(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function BalanceRow({
  subData,
  stats,
}: {
  subData: SubscriptionStatus | null;
  stats: UsageStats | null;
}) {
  const isSubscribed = subData?.has_active_subscription ?? false;
  const isTrial = subData?.has_active_trial ?? false;

  // Mobile-style priority chain: subscription ? trial ? usage-stats fallback
  let remaining: number | null = null;
  if (isSubscribed && subData?.subscription?.minutes_remaining != null) {
    remaining = subData.subscription.minutes_remaining;
  } else if (isTrial && subData?.trial?.minutes_remaining != null) {
    remaining = subData.trial.minutes_remaining;
  } else if (stats) {
    remaining = Math.max(0, stats.audioMinutesAdded - stats.audioMinutesUsed);
  }

  if (remaining === null) return null;

  const total = stats?.audioMinutesAdded ?? 90;
  const isLow = remaining <= 10;

  // Resolve "valid until" date from wherever it's available
  const validUntilIso =
    subData?.valid_ends_at ||
    subData?.subscription?.valid_date_upto ||
    subData?.trial?.trial_ends_at ||
    stats?.trialEndsAt ||
    null;
  const validUntilStr = formatValidUntil(validUntilIso);

  if (isTrial && !isSubscribed) {
    const pct = total > 0 ? Math.min(1, remaining / total) : 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="max-w-3xl mx-auto mb-10"
        data-testid="balance-row-trial"
      >
        <Card className="px-6 py-4">
          <div className="flex items-center gap-4 flex-wrap mb-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Balance Minutes</p>
              {validUntilStr ? (
                <p className="text-xs text-muted-foreground">Valid until {validUntilStr}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Upgrade to Pro for 3,000 mins/month</p>
              )}
            </div>
            <span
              className={`text-sm font-semibold shrink-0 ${isLow ? "text-destructive" : "text-foreground"}`}
              data-testid="balance-minutes-remaining"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={Math.floor(remaining)}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.25 }}
                  style={{ display: "inline-block" }}
                >
                  {Math.floor(remaining)}
                </motion.span>
              </AnimatePresence>
              {" / "}{total} min
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isLow ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${pct * 100}%` }}
              data-testid="balance-progress-bar"
            />
          </div>
        </Card>
      </motion.div>
    );
  }

  const sublabel = isSubscribed
    ? validUntilStr
      ? `Valid until ${validUntilStr}`
      : "Resets with your next billing cycle"
    : validUntilStr
    ? `Valid until ${validUntilStr}`
    : "Top up anytime to add more minutes";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="max-w-3xl mx-auto mb-10"
      data-testid={isSubscribed ? "balance-row-subscribed" : "balance-row-balance"}
    >
      <Card className="px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Balance Minutes</p>
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
        <Badge
          variant={isLow ? "destructive" : "secondary"}
          className="text-sm font-semibold shrink-0"
          data-testid="balance-minutes-remaining"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={Math.floor(remaining)}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              style={{ display: "inline-block" }}
            >
              {Math.floor(remaining)}
            </motion.span>
          </AnimatePresence>
          {" min remaining"}
        </Badge>
      </Card>
    </motion.div>
  );
}

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // -- Post-checkout polling ---------------------------------------------------
  // When user lands back from Stripe Checkout with ?session_id= or ?checkout=success,
  // poll subscription-status every 2s (max 10×) until the plan changes.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const hasCheckout =
      params.has("session_id") ||
      params.get("checkout") === "success" ||
      params.has("payment_intent");
    if (!hasCheckout) return;

    // Strip the Stripe params from the URL without a hard reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);

    let attempts = 0;
    const MAX = 10;
    let prevPlan: string | undefined;

    const poll = async () => {
      attempts++;
      try {
        const res = await apiRequest("GET", "/api/v1/a/subscription-status");
        const data: SubscriptionStatus = await res.json();
        const currentPlan =
          data.current_package ||
          data.subscription?.plan_name ||
          (data.has_active_trial ? "TRIAL" : undefined);

        if (prevPlan === undefined) {
          prevPlan = currentPlan;
        } else if (currentPlan !== prevPlan) {
          // Plan changed ? refresh queries and stop
          queryClient.invalidateQueries({ queryKey: ["/api/v1/a/subscription-status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/v1/a/usage-stats"] });
          return;
        }
      } catch {
        // silently ignore network errors during poll
      }
      if (attempts < MAX) {
        setTimeout(poll, 2000);
      }
    };

    // Start polling after a short delay to let webhook arrive
    setTimeout(poll, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const { data: usageData } = useQuery<{ success: boolean; stats: UsageStats }>({
    queryKey: ["/api/v1/a/usage-stats"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: subData } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/v1/a/subscription-status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const displayPrice = isYearly ? YEARLY_PRICE : MONTHLY_PRICE;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-28 pb-24 px-4">
        <div className="max-w-5xl mx-auto">

          {/* -- Page heading -- */}
          <div className="text-center mb-14">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              Simple, transparent pricing
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-muted-foreground"
            >
              Start free for 7 days. Upgrade when you need more.
            </motion.p>

            {/* Billing toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center bg-muted rounded-full p-1 mt-8"
            >
              <button
                onClick={() => setIsYearly(false)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  !isYearly
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-monthly"
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  isYearly
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-yearly"
              >
                Yearly
                <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-2 py-0.5 rounded-full font-semibold">
                  Save 20%
                </span>
              </button>
            </motion.div>
          </div>

          {/* -- Balance row (authenticated users only) -- */}
          {user && (subData || usageData?.stats) && (
            <BalanceRow
              subData={subData ?? null}
              stats={usageData?.stats ?? null}
            />
          )}

          {/* -- Plan cards -- */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-20">

            {/* Free Trial card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="relative p-8 h-full flex flex-col bg-card border-border" data-testid="card-plan-free">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-lg leading-none">7-Day Free Trial</p>
                    <p className="text-sm text-muted-foreground mt-0.5">No credit card needed</p>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold">$0</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Free for 7 days</p>
                </div>

                <Link href={user ? "/dashboard" : "/signup"}>
                  <Button
                    variant="outline"
                    className="w-full mb-8"
                    data-testid="button-get-started-free"
                  >
                    Start Free Trial
                  </Button>
                </Link>

                <ul className="space-y-3 flex-1">
                  {[
                    "90 mins of audio",
                    "AI Polish & Translate",
                    "90+ languages",
                    "25+ rewrite styles",
                    "PDF / DOCX / Image upload (25 MB)",
                    "Auto summaries & FAQs",
                    "iOS, Android, Web & macOS",
                    "Sync across devices",
                    "Save & access history",
                    "Pay-as-you-go top-up available",
                    "Email support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>

            {/* Pro card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card
                className="relative p-8 h-full flex flex-col bg-foreground text-background border-foreground shadow-2xl scale-[1.02]"
                data-testid="card-plan-pro"
              >
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0 px-4 py-1 text-xs font-semibold whitespace-nowrap">
                  Most Popular
                </Badge>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-background/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-background" />
                  </div>
                  <div>
                    <p className="font-bold text-lg leading-none text-background">Pro</p>
                    <p className="text-sm text-background/60 mt-0.5">For power users</p>
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-background">${displayPrice}</span>
                    <span className="text-sm text-background/60">/month</span>
                  </div>
                  <p className="text-sm text-background/60 mt-1">
                    {isYearly ? `$${YEARLY_PRICE * 12}/year — you save $${(MONTHLY_PRICE - YEARLY_PRICE) * 12}` : "Billed monthly"}
                  </p>
                </div>

                <Link href={user ? `/subscribe?plan=pro&billing=${isYearly ? "yearly" : "monthly"}` : "/signup"}>
                  <Button
                    className="w-full mb-8 bg-background text-foreground hover:bg-background/90"
                    data-testid="button-get-started-pro"
                  >
                    {user ? "Subscribe Now" : "Get Started"}
                  </Button>
                </Link>

                <ul className="space-y-3 flex-1">
                  {[
                    "3,000 mins of audio / month",
                    "AI Polish & Translate",
                    "90+ languages",
                    "25+ rewrite styles",
                    "Long-form content (500+ words)",
                    "PDF / DOCX / Image upload (50 MB)",
                    "Auto summaries, FAQs & SEO blog posts",
                    "iOS, Android, Web & macOS",
                    "Sync across devices",
                    "Save & access full history",
                    "Pay-as-you-go top-up available",
                    "Priority support",
                    "Cancel anytime",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-background/90">{f}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          </div>

          {/* -- Pay-as-you-go callout -- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto mb-20"
          >
            <Card className="p-6 md:p-8 bg-primary/5 border-primary/20 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Pay-as-you-go top-ups</h3>
                <p className="text-sm text-muted-foreground">
                  Run out of minutes mid-month? No problem. Both Free and Pro users can purchase
                  additional audio minutes on demand — no plan upgrade required. Pay only for
                  what you use, whenever you need it.
                </p>
              </div>
              <Link href={user ? "/dashboard" : "/signup"}>
                <Button variant="outline" className="flex-shrink-0" data-testid="button-topup">
                  Top up now
                </Button>
              </Link>
            </Card>
          </motion.div>

          {/* -- Feature comparison table -- */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10" data-testid="heading-comparison">
              Full feature comparison
            </h2>

            <div className="overflow-x-auto rounded-xl border border-border" data-testid="table-features">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left py-4 px-6 font-semibold text-foreground w-1/2">
                      Feature
                    </th>
                    <th className="text-center py-4 px-6 font-semibold text-foreground w-1/4">
                      7-Day Free
                    </th>
                    <th className="text-center py-4 px-6 font-semibold text-foreground w-1/4 bg-primary/8">
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonSections.map((section) => (
                    <Fragment key={section.title}>
                      {/* Section header row */}
                      <tr className="border-b border-border bg-muted/20">
                        <td
                          colSpan={3}
                          className="py-3 px-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {section.title}
                        </td>
                      </tr>

                      {/* Feature rows */}
                      {section.rows.map((row, i) => (
                        <tr
                          key={row.feature}
                          className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20 ${
                            i % 2 === 0 ? "" : "bg-muted/10"
                          }`}
                        >
                          <td className="py-3.5 px-6 text-foreground">{row.feature}</td>
                          <td className="py-3.5 px-6 text-center">
                            <CellContent value={row.free} isProCol={false} />
                          </td>
                          <td className="py-3.5 px-6 text-center bg-primary/5">
                            <CellContent value={row.pro} isProCol={true} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* -- FAQ / contact nudge -- */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-16"
          >
            <p className="text-muted-foreground">
              Questions about the right plan?{" "}
              <a
                href="mailto:support@myvoicepost.com"
                className="text-primary hover:underline font-medium"
                data-testid="link-contact"
              >
                Email us — we're happy to help.
              </a>
            </p>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
