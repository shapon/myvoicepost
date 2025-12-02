import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  Tags,
  Zap,
  Globe,
  Monitor,
  LayoutGrid,
  WifiOff,
  RefreshCw,
  Moon,
  Languages,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Tags,
    title: "Tags",
    description: "Tag your notes for easy organization.",
  },
  {
    icon: Zap,
    title: "Actions",
    description: "Send your notes anywhere—from Google Docs to Notion—using Zapier or webhooks.",
  },
  {
    icon: Globe,
    title: "90+ languages",
    description: "Just speak, the languages are recognized automatically.",
  },
  {
    icon: Monitor,
    title: "Screen-off recording",
    description: "Record on the go with the screen off or in background mode.",
  },
  {
    icon: LayoutGrid,
    title: "Widget",
    description: "Start recording instantly with one tap.",
  },
  {
    icon: WifiOff,
    title: "Offline recording",
    description: "Record anywhere, even during flights or without internet.",
  },
  {
    icon: RefreshCw,
    title: "Syncing",
    description: "Access your notes on any device with native apps and web.",
  },
  {
    icon: Moon,
    title: "Dark & light modes",
    description: "Choose your preferred theme for comfortable viewing.",
  },
  {
    icon: Languages,
    title: "Translation",
    description: "Translate your speech into any language.",
  },
  {
    icon: Sparkles,
    title: "25+ rewrite options",
    description: "Use the latest AI trained by linguists.",
  },
];

export default function Features() {
  return (
    <section className="py-20 md:py-32 bg-muted/30" id="features" data-testid="features-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Even more useful features
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to capture and transform your voice
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className="p-5 h-full bg-card border-border hover-elevate"
                data-testid={`card-feature-${index}`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
