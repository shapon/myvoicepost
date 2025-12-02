import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const languages = [
  "Spanish",
  "French", 
  "German",
  "Japanese",
  "Chinese",
  "Arabic",
];

export default function TranslationHero() {
  const [languageIndex, setLanguageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLanguageIndex((prev) => (prev + 1) % languages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const scrollToDemo = () => {
    const element = document.getElementById("demo");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="py-20 md:py-32 relative overflow-hidden" data-testid="translation-hero-section">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Turn your speech
            <br />
            into fluent{" "}
            <AnimatePresence mode="wait">
              <motion.span
                key={languageIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"
                data-testid="text-rotating-language"
              >
                {languages[languageIndex]}
              </motion.span>
            </AnimatePresence>
          </h2>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 flex items-center justify-center gap-2">
            Speak in your language. Get perfect translations instantly.
            <Sparkles className="w-5 h-5 text-yellow-500" />
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 px-8"
              onClick={scrollToDemo}
              data-testid="button-translation-get-now"
            >
              Get now
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={scrollToDemo}
              data-testid="button-translation-try-demo"
            >
              Try demo
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
