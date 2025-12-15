import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

const plans = [
  {
    name: "Starter",
    description: "Perfect for personal use",
    monthlyPrice: 9,
    yearlyPrice: 7,
    features: [
      "30 minutes of audio per month",
      "Polish feature included",
      "5 languages supported",
      "Email support",
      "Basic text formatting",
    ],
    highlighted: false,
    cta: "Get Started",
  },
  {
    name: "Pro",
    description: "Best for professionals",
    monthlyPrice: 29,
    yearlyPrice: 23,
    features: [
      "120 minutes of audio per month",
      "Polish + Translate features",
      "29 languages supported",
      "Priority support",
      "Advanced formatting options",
      "Save & export history",
      "API access",
    ],
    highlighted: true,
    cta: "Get Started",
  },
  {
    name: "Enterprise",
    description: "For teams and businesses",
    monthlyPrice: 79,
    yearlyPrice: 63,
    features: [
      "Unlimited audio processing",
      "All languages supported",
      "Dedicated account manager",
      "Custom integrations",
      "Team collaboration",
      "Advanced analytics",
      "SLA guarantee",
      "White-label options",
    ],
    highlighted: false,
    cta: "Contact Sales",
  },
];

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <Link href="/">
              <a className="flex items-center gap-2 text-foreground" data-testid="link-logo">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight">MyVoicePost</span>
              </a>
            </Link>
            <Link href="/">
              <Button variant="ghost" data-testid="button-back-home">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
            >
              Plans
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-muted-foreground"
            >
              No hidden fees. Cancel anytime.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-center gap-2 mt-8"
            >
              <div className="inline-flex items-center bg-muted rounded-full p-1">
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
                  <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs px-2 py-0.5 rounded-full">
                    40% off
                  </span>
                </button>
              </div>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
              >
                <Card
                  className={`relative p-6 lg:p-8 h-full flex flex-col ${
                    plan.highlighted
                      ? "bg-foreground text-background border-foreground scale-105 shadow-2xl"
                      : "bg-card"
                  }`}
                  data-testid={`card-plan-${plan.name.toLowerCase()}`}
                >
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          plan.highlighted
                            ? "bg-background/20"
                            : "bg-primary/10"
                        }`}
                      >
                        <Mic
                          className={`w-4 h-4 ${
                            plan.highlighted ? "text-background" : "text-primary"
                          }`}
                        />
                      </div>
                      <span className="font-semibold text-lg">
                        MyVoicePost
                        <span
                          className={`text-xs ml-1 ${
                            plan.highlighted
                              ? "text-background/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {plan.name}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl lg:text-5xl font-bold">
                        ${isYearly ? plan.yearlyPrice : plan.monthlyPrice}
                      </span>
                      <span
                        className={`text-sm ${
                          plan.highlighted
                            ? "text-background/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        /month
                      </span>
                    </div>
                    <p
                      className={`text-sm mt-1 ${
                        plan.highlighted
                          ? "text-background/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isYearly ? "Billed yearly" : "Billed monthly"}
                    </p>
                  </div>

                  <Link href="/signup">
                    <Button
                      className={`w-full mb-6 ${
                        plan.highlighted
                          ? "bg-background text-foreground hover:bg-background/90"
                          : ""
                      }`}
                      variant={plan.highlighted ? "default" : "outline"}
                      data-testid={`button-get-started-${plan.name.toLowerCase()}`}
                    >
                      {plan.cta}
                    </Button>
                  </Link>

                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                            plan.highlighted ? "text-green-400" : "text-primary"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            plan.highlighted
                              ? "text-background/90"
                              : "text-muted-foreground"
                          }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-16"
          >
            <p className="text-muted-foreground">
              Need more?{" "}
              <a
                href="mailto:support@myvoicepost.com"
                className="text-primary hover:underline font-medium"
                data-testid="link-contact"
              >
                Let's talk!
              </a>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-20"
          >
            <h2 className="text-2xl font-bold text-center mb-8">
              Feature Comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full max-w-4xl mx-auto" data-testid="table-features">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 font-medium text-muted-foreground">
                      Feature
                    </th>
                    <th className="text-center py-4 px-4 font-medium">Starter</th>
                    <th className="text-center py-4 px-4 font-medium bg-muted/50 rounded-t-lg">
                      Pro
                    </th>
                    <th className="text-center py-4 px-4 font-medium">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      feature: "Audio minutes/month",
                      starter: "30 min",
                      pro: "120 min",
                      enterprise: "Unlimited",
                    },
                    {
                      feature: "Polish feature",
                      starter: true,
                      pro: true,
                      enterprise: true,
                    },
                    {
                      feature: "Translate feature",
                      starter: false,
                      pro: true,
                      enterprise: true,
                    },
                    {
                      feature: "Languages supported",
                      starter: "5",
                      pro: "29",
                      enterprise: "All",
                    },
                    {
                      feature: "Save history",
                      starter: false,
                      pro: true,
                      enterprise: true,
                    },
                    {
                      feature: "API access",
                      starter: false,
                      pro: true,
                      enterprise: true,
                    },
                    {
                      feature: "Team collaboration",
                      starter: false,
                      pro: false,
                      enterprise: true,
                    },
                    {
                      feature: "Custom integrations",
                      starter: false,
                      pro: false,
                      enterprise: true,
                    },
                    {
                      feature: "Priority support",
                      starter: false,
                      pro: true,
                      enterprise: true,
                    },
                    {
                      feature: "Dedicated manager",
                      starter: false,
                      pro: false,
                      enterprise: true,
                    },
                  ].map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-border ${
                        i % 2 === 0 ? "" : "bg-muted/20"
                      }`}
                    >
                      <td className="py-4 px-4 text-sm">{row.feature}</td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.starter === "boolean" ? (
                          row.starter ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )
                        ) : (
                          <span className="text-sm">{row.starter}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center bg-muted/50">
                        {typeof row.pro === "boolean" ? (
                          row.pro ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )
                        ) : (
                          <span className="text-sm font-medium">{row.pro}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.enterprise === "boolean" ? (
                          row.enterprise ? (
                            <Check className="w-5 h-5 text-primary mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )
                        ) : (
                          <span className="text-sm">{row.enterprise}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} MyVoicePost. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
