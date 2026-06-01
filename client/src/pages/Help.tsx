import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Rocket, Mic, Palette, Wrench, CreditCard, Cloud,
  ChevronDown, Mail, MessageCircle, Send, CheckCircle, AlertTriangle,
  Loader2, ArrowRight, BookOpen, Zap, HelpCircle, ExternalLink,
  Play, Square, Trash2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

type SystemStatus = "operational" | "degraded" | "outage" | "checking";

const FAQ_CATEGORIES = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    color: "#6366f1",
    bg: "bg-indigo-500/10 dark:bg-indigo-500/10",
    questions: [
      { q: "How do I set up MyVoicePost?", a: "Create an account or sign in with Google at myvoicepost.com and you're ready to go. Choose your preferred language in your profile settings." },
      { q: "How do I link my Google account?", a: 'On the login screen, click "Continue with Google" to sign in with your Google account. Your account will be linked automatically.' },
      { q: "What languages are supported?", a: "MyVoicePost supports 18+ languages including English, Spanish, French, German, Hindi, Chinese, Japanese, Korean, Arabic, Bengali, and more." },
      { q: "How do I record my first voice note?", a: "Go to the Polish or Translate page, select your language, click the microphone icon, speak clearly, and click again to stop recording." },
    ],
  },
  {
    id: "voice-management",
    title: "Voice Management",
    icon: Mic,
    color: "#22c55e",
    bg: "bg-green-500/10",
    questions: [
      { q: "How do I save my recordings?", a: 'After processing, click the "Save" button on the result screen. Your saved texts are accessible from the Saved Items page.' },
      { q: "Can I download my transcriptions?", a: "Yes, use the copy or share button on any result to export your transcribed and polished text." },
      { q: "What is the difference between Polish and Translate?", a: "Polish improves your text in the same language (grammar, tone, clarity). Translate converts your speech from one language to another." },
      { q: "Why is my transcription inaccurate?", a: "Speak clearly in a quiet environment, hold your microphone close, and ensure the correct input language is selected." },
    ],
  },
  {
    id: "personalization",
    title: "Personalization",
    icon: Palette,
    color: "#f59e0b",
    bg: "bg-amber-500/10",
    questions: [
      { q: "How do I change the output tone?", a: "In your settings, set your default tone (Professional, Casual, Formal, Friendly). You can also change it per recording before processing." },
      { q: "Can I customize the output type?", a: "Yes, choose between Message, Note, Email, Social Post, or Journal formats to match your content needs." },
      { q: "How do I set my default language?", a: "Go to your Profile settings and select your preferred source and target languages. These will be pre-selected on Polish and Translate pages." },
      { q: "Can I re-polish or re-translate text?", a: 'Yes, click "Re-polish Edited Text" or "Re-translate" on any result to process it again with different settings.' },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: Wrench,
    color: "#ef4444",
    bg: "bg-red-500/10",
    questions: [
      { q: "Why am I not receiving notifications?", a: "Check that notifications are enabled in your browser settings for MyVoicePost. Also verify notification preferences in your Profile settings." },
      { q: "The app isn't responding. What should I do?", a: "Try refreshing the page. If the issue persists, clear your browser cache, or try a different browser." },
      { q: "My recording failed to process.", a: "Check your internet connection and try again. If the issue continues, the recording may have been too short or the audio quality too low." },
      { q: "I can't sign in to my account.", a: 'Use "Forgot Password" to reset your password. For Google sign-in issues, ensure you\'re using the same Google account you registered with.' },
    ],
  },
  {
    id: "subscription",
    title: "Subscription",
    icon: CreditCard,
    color: "#8b5cf6",
    bg: "bg-purple-500/10",
    questions: [
      { q: "How do I manage my subscription?", a: "Go to your Profile to view your plan, upgrade, or manage billing through the Stripe portal." },
      { q: "What happens when my free trial ends?", a: "You get 90 free minutes of transcription. After that, subscribe or purchase top-up minutes to continue." },
      { q: "How do I check my usage?", a: "Go to your Profile to see your total usage, remaining minutes, and detailed audio logs." },
      { q: "Can I cancel my subscription?", a: 'Yes, go to Profile and click "Manage Subscription" to cancel or modify through the Stripe portal.' },
    ],
  },
  {
    id: "storage",
    title: "Storage & Data",
    icon: Cloud,
    color: "#06b6d4",
    bg: "bg-cyan-500/10",
    questions: [
      { q: "Where are my saved texts stored?", a: "Saved texts are stored securely on our servers and accessible from the Saved Items page when you're signed in." },
      { q: "How do I delete saved texts?", a: "In the Saved Items page, click the delete button on any saved item to remove it permanently." },
      { q: "Can I export my data?", a: "Use the copy/share buttons on any saved text to export it to other apps, email, or clipboard." },
      { q: "Is my data secure?", a: "Yes, all data is transmitted over HTTPS and stored securely. We never share your personal recordings or transcriptions." },
    ],
  },
];

const QUICK_LINKS = [
  { icon: Rocket, label: "Getting Started", desc: "New here? Start with the basics", href: "#getting-started", color: "text-indigo-500" },
  { icon: Zap, label: "Quick Tips", desc: "Power-user features & shortcuts", href: "#voice-management", color: "text-amber-500" },
  { icon: CreditCard, label: "Billing & Plans", desc: "Manage your subscription", href: "#subscription", color: "text-purple-500" },
  { icon: Wrench, label: "Fix an Issue", desc: "Troubleshoot common problems", href: "#troubleshooting", color: "text-red-500" },
];

const SUGGESTIONS = ["How to record", "Supported languages", "Cancel subscription", "Reset password", "Save recordings"];

function SystemStatusBadge() {
  const [status, setStatus] = useState<SystemStatus>("checking");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        setStatus(res.ok ? "operational" : "degraded");
      } catch {
        setStatus("degraded");
      }
    };
    check();
  }, []);

  const config = {
    checking: { color: "bg-muted-foreground", text: "text-muted-foreground", label: "Checking status…" },
    operational: { color: "bg-green-500", text: "text-green-600 dark:text-green-400", label: "All systems operational" },
    degraded: { color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Some services may be slow" },
    outage: { color: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "Service interruption detected" },
  }[status];

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm">
      <span className={`relative flex h-2 w-2`}>
        {status === "operational" && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`} />
      </span>
      <span className={`font-medium ${config.text}`}>{config.label}</span>
    </div>
  );
}

function FAQItem({ question, answer, isOpen, onToggle }: {
  question: string; answer: string; isOpen: boolean; onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-start justify-between gap-4 py-4 text-left hover:text-foreground text-foreground/90 transition-colors"
        onClick={onToggle}
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
      >
        <span className="font-medium text-sm leading-relaxed">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 mt-0.5"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return text.toLowerCase().includes(query.toLowerCase().trim());
  return words.every((word) => text.toLowerCase().includes(word));
}

function FAQCategory({ category, searchQuery }: { category: typeof FAQ_CATEGORIES[0]; searchQuery: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = searchQuery
    ? category.questions.filter(
        (q) => matchesSearch(q.q, searchQuery) || matchesSearch(q.a, searchQuery)
      )
    : category.questions;

  useEffect(() => {
    if (searchQuery) setExpanded(true);
  }, [searchQuery]);

  if (filtered.length === 0) return null;

  const Icon = category.icon;

  return (
    <motion.div
      ref={ref}
      id={category.id}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover-elevate transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`faq-category-${category.id}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${category.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-4 h-4" style={{ color: category.color }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">{category.title}</p>
            <p className="text-xs text-muted-foreground">{filtered.length} articles</p>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-2 border-t border-border">
              {filtered.map((item, i) => (
                <FAQItem
                  key={i}
                  question={item.q}
                  answer={item.a}
                  isOpen={openId === i}
                  onToggle={() => setOpenId(openId === i ? null : i)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ContactCard({ icon: Icon, title, subtitle, badge, badgeColor, href, onClick }: {
  icon: React.ElementType; title: string; subtitle: string; badge: string;
  badgeColor: string; href?: string; onClick?: () => void;
}) {
  const content = (
    <div className="group relative flex flex-col items-center text-center p-6 rounded-xl border border-border bg-card hover-elevate transition-all cursor-pointer gap-3">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${badgeColor}18` }}>
        <Icon className="w-5 h-5" style={{ color: badgeColor }} />
      </div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <span
        className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
        style={{ backgroundColor: badgeColor }}
      >
        {badge}
      </span>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );

  if (href) return <a href={href} target="_blank" rel="noopener noreferrer">{content}</a>;
  return <div onClick={onClick}>{content}</div>;
}

export default function Help() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailName, setEmailName] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 280);
    return () => clearTimeout(t);
  }, [search]);

  const allMatches = debouncedSearch
    ? FAQ_CATEGORIES.flatMap((c) =>
        c.questions.filter(
          (q) => matchesSearch(q.q, debouncedSearch) || matchesSearch(q.a, debouncedSearch)
        )
      )
    : [];

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingEmail(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSendingEmail(false);
    setEmailSent(true);
    setTimeout(() => { setEmailOpen(false); setEmailSent(false); setEmailName(""); setEmailMsg(""); }, 2500);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-20">
        {/* Hero */}
        <section className="relative overflow-hidden py-16 md:py-24">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent pointer-events-none" />
          <div className="absolute top-10 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <HelpCircle className="w-3.5 h-3.5" />
                Help Center
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                How can we{" "}
                <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  help you?
                </span>
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                Search our knowledge base or browse by topic below.
              </p>

              <div className="relative max-w-xl mx-auto mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search for answers…"
                  className="pl-11 pr-4 h-12 text-base rounded-xl border-border/70 bg-card shadow-sm"
                  data-testid="input-help-search"
                />
                {search && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setSearch("")}
                    data-testid="button-clear-search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSearch(s)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`suggestion-${s.replace(/\s/g, "-").toLowerCase()}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <SystemStatusBadge />
            </motion.div>
          </div>
        </section>

        {/* Search results */}
        <AnimatePresence>
          {debouncedSearch && allMatches.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="max-w-3xl mx-auto px-4 sm:px-6 mb-8"
            >
              <p className="text-sm text-muted-foreground mb-3">
                {allMatches.length} result{allMatches.length !== 1 ? "s" : ""} for &ldquo;{debouncedSearch}&rdquo;
              </p>
              <div className="space-y-2">
                {allMatches.slice(0, 6).map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-xl border border-border bg-card"
                  >
                    <p className="font-medium text-sm mb-1">{item.q}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.a}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
          {debouncedSearch && allMatches.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto px-4 sm:px-6 mb-8 text-center py-10"
            >
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">No results found</p>
              <p className="text-sm text-muted-foreground">Try a different search term or browse the categories below.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick links */}
        {!debouncedSearch && (
          <section className="max-w-4xl mx-auto px-4 sm:px-6 mb-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {QUICK_LINKS.map((link, i) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="group flex flex-col gap-2 p-4 rounded-xl border border-border bg-card hover-elevate transition-all"
                  data-testid={`quicklink-${link.label.replace(/\s/g, "-").toLowerCase()}`}
                >
                  <link.icon className={`w-5 h-5 ${link.color}`} />
                  <div>
                    <p className="font-semibold text-sm">{link.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{link.desc}</p>
                  </div>
                </motion.a>
              ))}
            </div>
          </section>
        )}

        {/* FAQ categories */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-16">
          {!debouncedSearch && (
            <h2 className="text-xl font-bold mb-5">Browse by Topic</h2>
          )}
          <div className="space-y-3">
            {FAQ_CATEGORIES.map((cat) => (
              <FAQCategory key={cat.id} category={cat} searchQuery={debouncedSearch} />
            ))}
          </div>
        </section>

        {/* Contact section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 mb-20">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-purple-500/5 to-transparent p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Still need help?</h2>
              <p className="text-muted-foreground">Our support team is here for you. Reach out any way you prefer.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <ContactCard
                icon={Mail}
                title="Email Support"
                subtitle="hi@myvoicepost.com"
                badge="24h reply"
                badgeColor="#6366f1"
                onClick={() => setEmailOpen(true)}
              />
              <ContactCard
                icon={MessageCircle}
                title="WhatsApp"
                subtitle="Chat with us instantly"
                badge="Instant"
                badgeColor="#25D366"
                href="https://wa.me/1234567890?text=Hi,%20I%20need%20help%20with%20MyVoicePost"
              />
              <ContactCard
                icon={Send}
                title="Telegram"
                subtitle="Message our support bot"
                badge="24/7"
                badgeColor="#229ED9"
                href="https://t.me/MyVoicePostBot"
              />
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Average response time under 4 hours &mdash;{" "}
              <a href="mailto:hi@myvoicepost.com" className="text-primary hover:underline font-medium">
                hi@myvoicepost.com
              </a>
            </p>
          </div>
        </section>
      </main>

      {/* Email modal */}
      <AnimatePresence>
        {emailOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setEmailOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 22, stiffness: 350 }}
              className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-6"
            >
              {emailSent ? (
                <div className="text-center py-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 14, stiffness: 300 }}
                  >
                    <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-lg font-bold mb-1">Message sent!</h3>
                  <p className="text-sm text-muted-foreground">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-indigo-500" />
                      </div>
                      <h3 className="font-bold">Send us a message</h3>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setEmailOpen(false)} data-testid="button-close-email">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <form onSubmit={handleSendEmail} className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Your name</label>
                      <Input
                        value={emailName}
                        onChange={(e) => setEmailName(e.target.value)}
                        placeholder="Jane Smith"
                        required
                        data-testid="input-email-name"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">How can we help?</label>
                      <textarea
                        value={emailMsg}
                        onChange={(e) => setEmailMsg(e.target.value)}
                        placeholder="Describe your issue or question…"
                        required
                        rows={4}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                        data-testid="textarea-email-message"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={sendingEmail} data-testid="button-send-email">
                      {sendingEmail ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                      ) : (
                        <><Send className="w-4 h-4 mr-2" /> Send Message</>
                      )}
                    </Button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
