import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Apple, Smartphone, Globe, Monitor, Mic, FileText, Wand2 } from "lucide-react";

const rotatingWords = ["message", "note", "email", "post", "journal"];

export default function HeroSection() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-screen pt-24 pb-16 overflow-hidden" data-testid="hero-section">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <Badge
              variant="secondary"
              className="mb-6 px-4 py-2 text-sm font-medium bg-primary/10 text-primary border-primary/20"
              data-testid="badge-trusted"
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              Trusted by 100,000+ users
            </Badge>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-6">
              Turn your speech
              <br />
              into well-written
              <br />
              <span className="relative inline-block">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentWordIndex}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -30, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
                    data-testid="text-rotating-word"
                  >
                    {rotatingWords[currentWordIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
              Quickly capture your voice. Let AI do the writing.
              <span className="inline-block ml-1">
                <Sparkles className="w-5 h-5 text-yellow-500 inline" />
              </span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 text-lg px-8"
                data-testid="button-hero-get-now"
              >
                Get now
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8"
                data-testid="button-hero-try-demo"
              >
                Try demo
              </Button>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Apple className="w-4 h-4" />
                <span>iOS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                <span>Android</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                <span>Web</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Monitor className="w-4 h-4" />
                <span>macOS</span>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-purple-500/30 rounded-3xl blur-2xl" />
              <div
                className="relative w-64 md:w-80 h-96 md:h-[28rem] rounded-3xl shadow-2xl bg-gradient-to-br from-background to-muted border border-border overflow-hidden"
                data-testid="img-hero-phone"
              >
                <div className="absolute top-0 left-0 right-0 h-8 bg-muted/50 flex items-center justify-center">
                  <div className="w-16 h-1 bg-muted-foreground/30 rounded-full" />
                </div>
                <div className="flex flex-col items-center justify-center h-full p-6 gap-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center animate-pulse">
                    <Mic className="w-12 h-12 text-white" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Wand2 className="w-6 h-6 text-primary" />
                    <span className="text-sm text-muted-foreground">AI Processing</span>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="h-3 bg-muted rounded-full w-full" />
                    <div className="h-3 bg-muted rounded-full w-4/5" />
                    <div className="h-3 bg-muted rounded-full w-3/5" />
                  </div>
                  <FileText className="w-10 h-10 text-primary/60" />
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="absolute -right-4 md:-right-20 top-10 hidden sm:block"
              >
                <div
                  className="w-48 md:w-64 h-32 md:h-40 rounded-xl shadow-xl border border-border bg-gradient-to-br from-muted to-background flex items-center justify-center gap-4"
                  data-testid="img-hero-devices"
                >
                  <Monitor className="w-8 h-8 text-primary" />
                  <Smartphone className="w-6 h-6 text-primary" />
                  <Globe className="w-6 h-6 text-primary" />
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
