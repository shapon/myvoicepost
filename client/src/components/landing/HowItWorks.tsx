import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Mic, Sparkles, FileText, ArrowRight, AudioWaveform } from "lucide-react";

const steps = [
  {
    icon: Mic,
    title: "Your voice",
    description: "Simply speak your thoughts naturally into the app",
    color: "from-orange-500 to-red-500",
  },
  {
    icon: Sparkles,
    title: "Magic",
    description: "AI processes and structures your speech instantly",
    color: "from-primary to-purple-500",
    isCenter: true,
  },
  {
    icon: FileText,
    title: "Amazing text",
    description: "Get polished, ready-to-use content in seconds",
    color: "from-green-500 to-emerald-500",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden" id="how" data-testid="how-it-works-section">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            MyVoicePost isn't just a transcription tool
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            You simply speak your unstructured thoughts into the app, and in seconds, 
            you get polished text that you can use right away.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
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
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </Card>

              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="flex justify-center"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-purple-500/30 rounded-3xl blur-2xl" />
            <div 
              className="relative w-64 md:w-80 h-48 md:h-64 rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/30 flex items-center justify-center"
              data-testid="img-how-it-works"
            >
              <div className="flex items-center gap-4">
                <AudioWaveform className="w-12 h-12 md:w-16 md:h-16 text-primary animate-pulse" />
                <ArrowRight className="w-6 h-6 text-muted-foreground" />
                <FileText className="w-12 h-12 md:w-16 md:h-16 text-primary" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}