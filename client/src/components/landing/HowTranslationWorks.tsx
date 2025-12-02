import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Mic, Sparkles, Languages, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Mic,
    title: "Your voice",
    description: "Speak naturally in your native language into the app",
    color: "from-orange-500 to-red-500",
  },
  {
    icon: Sparkles,
    title: "Magic",
    description: "AI transcribes, translates, and polishes instantly",
    color: "from-primary to-purple-500",
    isCenter: true,
  },
  {
    icon: Languages,
    title: "Perfect translation",
    description: "Get fluent, natural translations in seconds",
    color: "from-green-500 to-emerald-500",
  },
];

export default function HowTranslationWorks() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden" id="how-translate" data-testid="how-translation-works-section">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Voice-to-voice translation made 
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> effortless</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Break language barriers instantly. Speak in your language and get polished, 
            professional translations ready to use in any context.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="relative"
            >
              <Card
                className={`p-8 text-center h-full bg-card border-border ${
                  step.isCenter ? "ring-2 ring-primary/50" : ""
                }`}
              >
                <div
                  className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center`}
                >
                  <step.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-3" data-testid={`text-translate-step-title-${index}`}>
                  {step.title}
                </h3>
                <p className="text-muted-foreground" data-testid={`text-translate-step-desc-${index}`}>
                  {step.description}
                </p>
              </Card>

              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
