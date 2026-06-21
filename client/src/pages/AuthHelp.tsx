import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  Search,
  Mail,
  Rocket,
  Mic,
  CreditCard,
  Settings,
  FileText,
  Languages,
  BrainCircuit,
  Zap,
} from "lucide-react";

interface FAQ {
  q: string;
  a: string;
}

interface Category {
  id: string;
  title: string;
  icon: typeof Rocket;
  faqs: FAQ[];
}

const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    faqs: [
      {
        q: "How do I record my first voice note?",
        a: "Go to the Polish page, select your language and tone, click the microphone button, speak clearly, then click again to stop. Your text will be polished automatically.",
      },
      {
        q: "What languages are supported?",
        a: "MyVoicePost supports 18+ languages including English, Spanish, French, German, Hindi, Chinese, Japanese, Korean, Arabic, Bengali, and more.",
      },
      {
        q: "How do I link my Google account?",
        a: 'On the login screen, click "Continue with Google" to sign in with your Google account. Your account will be linked automatically.',
      },
    ],
  },
  {
    id: "features",
    title: "Core Features",
    icon: Zap,
    faqs: [
      {
        q: "What is the difference between Polish, Translate, and Transcribe?",
        a: "Polish refines your speech into clean, professional text in the same language. Translate converts your speech into a different target language. Transcribe processes YouTube links or uploaded audio files.",
      },
      {
        q: "What is Doc AI?",
        a: "Doc AI lets you upload a PDF, DOCX, TXT, PNG, or JPG file and process it with AI. You can extract text, get an executive summary, generate Q&A pairs, or turn it into a blog post.",
      },
      {
        q: "How do I save my results?",
        a: "After processing any text, click the Save button that appears in the result card. All saved items are available on the Saved page.",
      },
    ],
  },
  {
    id: "transcribe",
    title: "Transcribe & Doc AI",
    icon: FileText,
    faqs: [
      {
        q: "What file types does Doc AI support?",
        a: "PDF and DOCX up to 25 MB, plain text (TXT) up to 25 MB, and PNG/JPG images up to 10 MB.",
      },
      {
        q: "Can I process a YouTube video?",
        a: "Yes. On the Transcribe page, paste a YouTube URL and choose a language. The transcript is extracted and can be polished or translated.",
      },
      {
        q: "How accurate is the transcription?",
        a: "Transcription uses Gemini AI and is typically very accurate for clear speech. Background noise or heavy accents may reduce accuracy.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Billing",
    icon: CreditCard,
    faqs: [
      {
        q: "How long does the free trial last?",
        a: "Every new account gets a free trial with 90 minutes of processing time. You can see your remaining trial time on the Profile page.",
      },
      {
        q: "How do I upgrade to a paid plan?",
        a: "Go to the Pricing page and select a plan. Payment is processed securely via Stripe. Your account is upgraded immediately after a successful payment.",
      },
      {
        q: "How do I change my password?",
        a: "Go to Account Settings and use the Change Password form. You'll need your current password to set a new one.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings & Preferences",
    icon: Settings,
    faqs: [
      {
        q: "How do I switch between dark and light mode?",
        a: "Go to App Settings and toggle Dark Mode. The preference is saved to your browser automatically.",
      },
      {
        q: "Can I change my display name?",
        a: "Yes. Go to Account Settings and update your username in the Profile section.",
      },
    ],
  },
];

export default function AuthHelp() {
  const [search, setSearch] = useState("");

  const filtered = CATEGORIES.map((cat) => ({
    ...cat,
    faqs: cat.faqs.filter(
      (faq) =>
        !search ||
        faq.q.toLowerCase().includes(search.toLowerCase()) ||
        faq.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.faqs.length > 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center mx-auto mb-4">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Help & Support</h1>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Find answers, learn features, or contact our team — we're here to help.
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search FAQ…"
              className="pl-9"
              data-testid="input-help-search"
            />
          </div>

          {/* Getting started callout */}
          {!search && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Rocket className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm mb-1">New to MyVoicePost?</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Start by opening the <strong>Polish</strong> page, record a short voice note, and
                      watch it get transformed into clean text in seconds.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { icon: Mic, label: "Polish" },
                        { icon: Languages, label: "Translate" },
                        { icon: FileText, label: "Transcribe" },
                        { icon: BrainCircuit, label: "Doc AI" },
                      ].map(({ icon: Icon, label }) => (
                        <Badge key={label} variant="secondary" className="gap-1.5">
                          <Icon className="w-3 h-3" />
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* FAQ categories */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No results for "{search}"
            </div>
          ) : (
            filtered.map((cat) => {
              const Icon = cat.icon;
              return (
                <Card key={cat.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {cat.title}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Accordion type="single" collapsible className="w-full">
                      {cat.faqs.map((faq, idx) => (
                        <AccordionItem
                          key={idx}
                          value={`${cat.id}-${idx}`}
                          data-testid={`faq-item-${cat.id}-${idx}`}
                        >
                          <AccordionTrigger className="text-sm font-medium text-left">
                            {faq.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                            {faq.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Contact support */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Still need help?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Our support team typically responds within 24 hours.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  data-testid="button-contact-support"
                >
                  <a href="mailto:support@myvoicepost.com">
                    <Mail className="w-4 h-4 mr-2" />
                    Contact Support
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
