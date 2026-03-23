import { useEffect, useRef, useState } from "react";
import { motion, useInView, useAnimation } from "framer-motion";
import { Link } from "wouter";
import {
  Mic,
  Sparkles,
  Globe,
  BookOpen,
  Mail,
  FileText,
  MessageSquare,
  Lightbulb,
  ListChecks,
  Users,
  Copy,
  Share2,
  Volume2,
  Save,
  Pencil,
  Zap,
  ShieldCheck,
  Moon,
  Smartphone,
  ArrowRight,
  ChevronDown,
  Play,
  Star,
  Headphones,
  Brain,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

function AnimatedSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatCounter({ end, label, prefix = "", suffix = "" }: { end: number; label: string; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, end]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
        {prefix}{count.toLocaleString()}{suffix}
      </div>
      <div className="text-muted-foreground mt-2 text-sm font-medium">{label}</div>
    </div>
  );
}

const steps = [
  {
    step: "01",
    icon: Mic,
    title: "Record Your Voice",
    description: "Tap the mic and speak naturally in any of 50+ supported languages. No setup, no training needed.",
    color: "from-violet-500 to-purple-600",
  },
  {
    step: "02",
    icon: Brain,
    title: "AI Processes Your Words",
    description: "Our advanced AI understands your intent, structures your thoughts, and refines your language in seconds.",
    color: "from-purple-500 to-pink-500",
  },
  {
    step: "03",
    icon: Sparkles,
    title: "Get Perfect Text",
    description: "Receive polished, publication-ready text formatted to your chosen style, tone, and output type.",
    color: "from-pink-500 to-rose-500",
  },
];

const features = [
  {
    icon: Mic,
    title: "Voice Polish",
    description: "Record your voice and get AI-polished text. Choose from multiple output types and tones.",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    badge: "Core",
  },
  {
    icon: Globe,
    title: "Voice Translation",
    description: "Speak in one language, get perfectly translated and polished text in another — instantly.",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    badge: "Popular",
  },
  {
    icon: Headphones,
    title: "Audio Transcription",
    description: "Upload any audio file or paste a URL. Transcribe, enhance, and save the result.",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    badge: "Pro",
  },
  {
    icon: FileText,
    title: "Multiple Output Types",
    description: "Messages, emails, notes, social posts, journals, articles, meeting summaries — pick your format.",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    badge: null,
  },
  {
    icon: Zap,
    title: "Tone Selection",
    description: "Professional, casual, formal, friendly, creative, academic — your text sounds exactly how you want it.",
    color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    badge: null,
  },
  {
    icon: Save,
    title: "Personal Library",
    description: "Save every result to your library. Filter, edit, re-process, and share at any time.",
    color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    badge: null,
  },
  {
    icon: Volume2,
    title: "Text-to-Speech",
    description: "Hear your AI-polished results read back to you in the correct language before sharing.",
    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    badge: null,
  },
  {
    icon: Share2,
    title: "Instant Sharing",
    description: "Share to WhatsApp, Telegram, Email, and more with a single tap directly from the result.",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    badge: null,
  },
  {
    icon: Moon,
    title: "Themes & Dark Mode",
    description: "Multiple colour themes and full dark mode support for a comfortable experience any time of day.",
    color: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    badge: null,
  },
];

const useCases = [
  {
    icon: MessageSquare,
    title: "Messages",
    description: "Write messages to friends or colleagues without using up your valuable time and mental energy.",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: Mail,
    title: "Emails",
    description: "Compose professional emails effortlessly. A task that should take 30 seconds — not 15 minutes.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Lightbulb,
    title: "Ideas & Thoughts",
    description: "Capture your unique ideas instantly. Never lose a brilliant thought because you didn't have time to write.",
    color: "from-yellow-500 to-orange-500",
  },
  {
    icon: BookOpen,
    title: "Notes & Memos",
    description: "Voice-capture notes when your hands are busy. Get beautiful, organised text ready to use.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Users,
    title: "Meeting Summaries",
    description: "Record and summarise meetings instantly. Never miss a task, action item, or important detail again.",
    color: "from-pink-500 to-rose-500",
  },
  {
    icon: ListChecks,
    title: "Tasks & Plans",
    description: "Speaking is 3x faster than typing. Get your to-do list written in seconds.",
    color: "from-indigo-500 to-violet-500",
  },
  {
    icon: FileText,
    title: "Social Media Posts",
    description: "Create high-quality content by voice. Free up time for more important tasks.",
    color: "from-fuchsia-500 to-pink-500",
  },
  {
    icon: Pencil,
    title: "Creative Writing",
    description: "Overcome writer's block. MyVoicePost listens and organises your thoughts like a personal writing partner.",
    color: "from-orange-500 to-red-500",
  },
];

const resultActions = [
  { icon: Copy, label: "Copy to clipboard" },
  { icon: Share2, label: "Share anywhere" },
  { icon: Volume2, label: "Listen via TTS" },
  { icon: Pencil, label: "Edit inline" },
  { icon: Save, label: "Save to library" },
];

export default function About() {
  const [activeUseCase, setActiveUseCase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveUseCase((prev) => (prev + 1) % useCases.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-400/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-40 bg-gradient-to-t from-background to-transparent" />
        </div>
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="mb-6 px-4 py-1.5 text-sm font-medium bg-primary/10 text-primary border-primary/20">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 inline" />
              About MyVoicePost
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight"
          >
            Stop typing.{" "}
            <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Just speak.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed"
          >
            MyVoicePost transforms your voice into perfectly written, AI-polished text.
            Not just transcription — intelligent writing that sounds like you actually sat down and crafted it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 justify-center"
          >
            <Link href="/signup">
              <Button size="lg" className="gap-2 text-base px-8">
                <Mic className="w-5 h-5" />
                Try Free
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="gap-2 text-base px-8">
                View Pricing
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-16 flex justify-center"
          >
            <ChevronDown className="w-6 h-6 text-muted-foreground animate-bounce" />
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="py-16 px-4 border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <StatCounter end={50} suffix="+" label="Languages Supported" />
          <StatCounter end={8} label="Output Types" />
          <StatCounter end={120} suffix="+" label="E2E Test Cases" />
          <StatCounter end={5} label="Result Actions" />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">How It Works</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Three steps to perfect text</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No training, no setup, no learning curve. Just speak and let the AI do the work.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/3 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 opacity-30" />
            {steps.map((step, i) => (
              <AnimatedSection key={step.step} delay={i * 0.15}>
                <div className="relative group bg-card border border-border rounded-2xl p-8 text-center hover-elevate">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground bg-background border border-border px-3 py-1 rounded-full">
                    Step {step.step}
                  </div>
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-5 shadow-lg`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* WHY DIFFERENT */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Why MyVoicePost</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">This is <em>not</em> dictation</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Regular speech-to-text just transcribes. MyVoicePost <strong>writes for you</strong>.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: "❌", text: "NO typing when your thoughts are flowing fast", sub: "Just open the app and speak" },
              { icon: "❌", text: "NO time wasted composing or proofreading", sub: "AI handles structure and grammar" },
              { icon: "❌", text: "NO awkward dictated text that reads as spoken", sub: "Natural, polished output every time" },
              { icon: "❌", text: "NO lost ideas because you couldn't write them down", sub: "Capture in seconds, anytime" },
            ].map((item, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="flex items-start gap-4 bg-card border border-border rounded-2xl p-6">
                  <span className="text-2xl mt-0.5">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-foreground">{item.text}</p>
                    <p className="text-muted-foreground text-sm mt-1">{item.sub}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection className="mt-8 bg-gradient-to-r from-primary to-purple-500 rounded-2xl p-8 text-white text-center" delay={0.4}>
            <Sparkles className="w-10 h-10 mx-auto mb-4 opacity-80" />
            <h3 className="text-2xl font-bold mb-2">Just SPEAK. AI handles the writing.</h3>
            <p className="opacity-80 text-lg">It's like having a personal AI writing assistant in your pocket, 24/7.</p>
          </AnimatedSection>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Features</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Everything you need</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A complete toolkit for turning your voice into polished, shareable content.
            </p>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <AnimatedSection key={feature.title} delay={(i % 3) * 0.1}>
                <div className="bg-card border border-border rounded-2xl p-6 h-full hover-elevate group">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${feature.color} bg-opacity-10`}>
                      <feature.icon className="w-6 h-6" />
                    </div>
                    {feature.badge && (
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                        {feature.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* RESULT ACTIONS */}
      <section className="py-16 px-4 bg-card/30 border-y border-border">
        <div className="max-w-4xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="text-3xl font-bold mb-2">Every result gives you 5 instant actions</h2>
            <p className="text-muted-foreground mb-10">From recording to sharing in under 30 seconds.</p>
            <div className="flex flex-wrap justify-center gap-4">
              {resultActions.map((action, i) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-2 bg-background border border-border rounded-full px-5 py-2.5 text-sm font-medium"
                >
                  <action.icon className="w-4 h-4 text-primary" />
                  {action.label}
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* USE CASES */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Use Cases</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Use it for everything</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              MyVoicePost fits every moment of your day — at work, at home, on the go.
            </p>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {useCases.map((uc, i) => (
              <AnimatedSection key={uc.title} delay={(i % 4) * 0.08}>
                <div
                  className={`group rounded-2xl p-6 cursor-pointer transition-all duration-300 border hover-elevate ${
                    activeUseCase === i
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                  onMouseEnter={() => setActiveUseCase(i)}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${uc.color} flex items-center justify-center mb-4 shadow-md`}>
                    <uc.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-base mb-2">{uc.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{uc.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* WHO IS IT FOR */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 via-purple-500/5 to-transparent">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Who It's For</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Built for everyone who thinks faster than they type</h2>
          </AnimatedSection>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: "💼", label: "Professionals", desc: "Compose emails and meeting notes without slowing down your day" },
              { icon: "✍️", label: "Content Creators", desc: "Write blogs, posts, and scripts by voice — faster and more naturally" },
              { icon: "🎓", label: "Students", desc: "Capture notes, ideas, and summaries instantly, hands-free" },
              { icon: "🧠", label: "ADHD Users", desc: "Speaking is more natural than writing — capture thoughts as they come" },
              { icon: "🌍", label: "Non-Native Speakers", desc: "Get polished, natural-sounding text in your target language" },
              { icon: "⚡", label: "Busy People", desc: "No time to write? Speak it. Done. In the time it takes to think it." },
            ].map((item, i) => (
              <AnimatedSection key={item.label} delay={i * 0.08}>
                <div className="bg-card border border-border rounded-2xl p-6 hover-elevate">
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="font-bold text-base mb-1">{item.label}</h3>
                  <p className="text-muted-foreground text-sm">{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* SUBSCRIPTION */}
      <section className="py-20 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">Pricing</Badge>
            <h2 className="text-4xl font-bold mb-4">Start free. Scale when you're ready.</h2>
            <p className="text-muted-foreground text-lg">Try MyVoicePost with a free trial that includes recording minutes. No credit card required to start.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: "Free Trial", desc: "Included minutes to explore all features with no commitment", icon: Play, color: "from-slate-500 to-slate-600" },
              { title: "Subscription", desc: "Monthly or annual plans for unlimited access to all features", icon: Star, color: "from-primary to-purple-500" },
              { title: "Top-Up Minutes", desc: "Buy one-time minute packs whenever you need extra capacity", icon: Zap, color: "from-orange-500 to-pink-500" },
            ].map((plan, i) => (
              <AnimatedSection key={plan.title} delay={i * 0.1}>
                <div className="bg-card border border-border rounded-2xl p-6 text-center hover-elevate">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.color} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                    <plan.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{plan.title}</h3>
                  <p className="text-muted-foreground text-sm">{plan.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection className="text-center mt-10" delay={0.3}>
            <Link href="/pricing">
              <Button size="lg" className="gap-2 px-10">
                See Pricing Plans
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary via-purple-600 to-pink-500 p-12 text-center text-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_60%)]" />
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
                  <Mic className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-4xl md:text-5xl font-extrabold mb-4">
                  Your voice, perfectly written.
                </h2>
                <p className="text-white/80 text-xl mb-8 max-w-xl mx-auto">
                  Join thousands of users who've already stopped typing and started speaking.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Link href="/signup">
                    <Button size="lg" variant="outline" className="bg-white text-primary hover:bg-white/90 border-white gap-2 px-8">
                      <Smartphone className="w-5 h-5" />
                      Get Started Free
                    </Button>
                  </Link>
                  <Link href="/pricing">
                    <Button size="lg" className="bg-white/20 hover:bg-white/30 border-white/30 text-white gap-2 px-8">
                      View Pricing
                    </Button>
                  </Link>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-white/70 text-sm">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Secure & private</span>
                  <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> 50+ languages</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Free trial included</span>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      <Footer />
    </div>
  );
}
