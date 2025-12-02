import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function CTASection() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden" data-testid="cta-section">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/30 rounded-full blur-3xl opacity-50" />
      
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
      >
        <div className="inline-flex items-center gap-2 text-primary mb-6">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium">Start for free</span>
        </div>
        
        <h2 className="text-4xl md:text-6xl font-bold mb-6">
          Turn your voice
          <br />
          <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            into exactly what you need
          </span>
        </h2>
        
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Stop wasting time and effort on writing. Start now!
        </p>

        <Button
          size="lg"
          className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 text-lg px-10 py-6"
          data-testid="button-cta-get-now"
        >
          Get now
        </Button>
      </motion.div>
    </section>
  );
}
