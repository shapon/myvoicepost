import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StickyNote, MessageSquare, PenTool, BookOpen, type LucideIcon } from "lucide-react";

interface UseCase {
  title: string;
  tags: string[];
  description: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
}

const useCases: UseCase[] = [
  {
    title: "Note-taking",
    tags: ["ideas", "to-dos", "shopping lists", "plans"],
    description: "Easily capture the moments that matter! Never let a thought slip away again.",
    icon: StickyNote,
    gradient: "from-orange-500/20 to-pink-500/20",
    iconColor: "text-orange-500",
  },
  {
    title: "Communication",
    tags: ["messages", "emails", "comments"],
    description: "Craft clear, easy-to-read messages. Communicate with ease and save yourself time.",
    icon: MessageSquare,
    gradient: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-500",
  },
  {
    title: "Content creation",
    tags: ["social media", "articles", "newsletters", "scripts"],
    description: "Say goodbye to writer's block. Create compelling content with ease and inspiration.",
    icon: PenTool,
    gradient: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-500",
  },
  {
    title: "Journaling",
    tags: ["thoughts", "emotions", "memories", "gratitude"],
    description: "Keep a voice journal to reflect on your experiences and track what matters most.",
    icon: BookOpen,
    gradient: "from-green-500/20 to-emerald-500/20",
    iconColor: "text-green-500",
  },
];

export default function UseCases() {
  return (
    <section className="py-20 md:py-32" id="usecases" data-testid="use-cases-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Real-life use cases
          </h2>
          <p className="text-lg text-muted-foreground">
            Transform your voice into any type of content you need
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className="group overflow-hidden h-full bg-card border-border hover-elevate"
                data-testid={`card-usecase-${index}`}
              >
                <div className={`p-6 md:p-8 bg-gradient-to-br ${useCase.gradient}`}>
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-4">{useCase.title}</h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {useCase.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-background/80 text-foreground"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground">{useCase.description}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <div className={`w-32 h-32 md:w-40 md:h-40 rounded-2xl shadow-lg group-hover:scale-105 transition-transform duration-300 bg-gradient-to-br ${useCase.gradient} border border-border flex items-center justify-center`}>
                        <useCase.icon className={`w-16 h-16 md:w-20 md:h-20 ${useCase.iconColor}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}