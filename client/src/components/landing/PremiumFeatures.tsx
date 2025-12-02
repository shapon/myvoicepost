import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  UserCog,
  FileText,
  Send,
  Mic,
  Mail,
  Users,
  Archive,
  BarChart3,
  WifiOff,
  AudioWaveform,
  Crown,
  Zap,
  Building2,
  Accessibility,
} from "lucide-react";

const premiumCategories = [
  {
    id: "ai-power",
    title: "AI Power & Quality",
    icon: Sparkles,
    color: "from-purple-500 to-pink-500",
    features: [
      {
        icon: Zap,
        name: "Unlimited AI Rewrites",
        description: "No daily limits - get unlimited access to the core AI value for all your transcription and polishing needs.",
      },
      {
        icon: UserCog,
        name: "Advanced Persona & Brand Voice",
        description: "Upload style guides or documents to train AI on your company tone, brand voice, or executive persona.",
      },
      {
        icon: FileText,
        name: "Depth & Length Processing",
        description: "Generate long-form content: 500+ word messages, full blog drafts from voice notes, and multi-paragraph reports.",
      },
    ],
  },
  {
    id: "integration",
    title: "Integration & Automation",
    icon: Send,
    color: "from-blue-500 to-cyan-500",
    features: [
      {
        icon: Send,
        name: "Direct App Integration",
        description: "One-tap sending to Slack, Salesforce, HubSpot, Trello, Notion and more. No more copy/pasting.",
      },
      {
        icon: Mic,
        name: "Voice Macro Automation",
        description: "Define multi-step actions with voice. Say 'Send meeting prep' to transcribe, polish, add signature, and send to Slack.",
      },
      {
        icon: Mail,
        name: "Email Reply Suggestions",
        description: "Integrate with your email to generate three polished reply options based on received emails and your spoken thoughts.",
      },
    ],
  },
  {
    id: "business",
    title: "Business & Team Collaboration",
    icon: Building2,
    color: "from-orange-500 to-red-500",
    features: [
      {
        icon: Users,
        name: "Shared Team Vocabulary",
        description: "Share custom dictionaries of technical jargon, client names, and acronyms across all team members.",
      },
      {
        icon: Archive,
        name: "Team History & Archive",
        description: "Central, searchable archive of all transcribed notes for auditing, compliance, and collaborative review.",
      },
      {
        icon: BarChart3,
        name: "Analytics & Efficiency Reports",
        description: "Dashboard showing words dictated, time saved vs typing, and most-used templates for ROI tracking.",
      },
    ],
  },
  {
    id: "utility",
    title: "Advanced Utility & Accessibility",
    icon: Accessibility,
    color: "from-green-500 to-emerald-500",
    features: [
      {
        icon: WifiOff,
        name: "Offline Polishing Mode",
        description: "Download optimized language model for basic polishing when offline - perfect for flights and low connectivity.",
      },
      {
        icon: AudioWaveform,
        name: "Advanced Voice Navigation",
        description: "Complex voice commands: 'Delete last sentence,' 'Change tone to professional,' or 'Insert bullet point here.'",
      },
    ],
  },
];

export default function PremiumFeatures() {
  return (
    <section className="py-20 md:py-32 bg-muted/30" data-testid="premium-features-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge
            variant="secondary"
            className="mb-4 px-4 py-2 text-sm font-medium bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-500 border-yellow-500/30"
          >
            <Crown className="w-3.5 h-3.5 mr-2" />
            Premium Features
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Unlock the full power of
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> MyVoicePost Pro</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Take your productivity to the next level with advanced AI features, seamless integrations, and team collaboration tools.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {premiumCategories.map((category, categoryIndex) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: categoryIndex * 0.1 }}
            >
              <Card
                className="h-full p-6 md:p-8 bg-card border-border overflow-visible"
                data-testid={`card-premium-${category.id}`}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                    <category.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold">{category.title}</h3>
                </div>

                <div className="space-y-4">
                  {category.features.map((feature, featureIndex) => (
                    <div
                      key={feature.name}
                      className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
                      data-testid={`feature-${category.id}-${featureIndex}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">{feature.name}</h4>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 text-lg px-10"
            data-testid="button-upgrade-pro"
          >
            <Crown className="w-5 h-5 mr-2" />
            Upgrade to Pro
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Start with a 7-day free trial. Cancel anytime.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
