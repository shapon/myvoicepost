import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AlignLeft, 
  Twitter, 
  Mail, 
  MessageSquare, 
  CheckSquare, 
  MoreHorizontal,
  Sparkles
} from "lucide-react";

const rewriteOptions = [
  {
    icon: AlignLeft,
    title: "Structured text",
    description: "Organize using paragraphs, bullet points, headings.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Twitter,
    title: "X Post",
    description: "Make an engaging tweet",
    color: "from-sky-500 to-blue-500",
  },
  {
    icon: Mail,
    title: "Formal email",
    description: "Compose a clear professional email",
    color: "from-primary to-purple-500",
  },
  {
    icon: MessageSquare,
    title: "Friendly message",
    description: "Write text as if to a friend",
    color: "from-green-500 to-emerald-500",
  },
  {
    icon: CheckSquare,
    title: "To-do list",
    description: "Make a list of tasks",
    color: "from-orange-500 to-red-500",
  },
  {
    icon: MoreHorizontal,
    title: "and 20+ more",
    description: "Explore all rewrite options",
    color: "from-gray-500 to-gray-600",
  },
];

export default function RewriteOptions() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden" data-testid="rewrite-options-section">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Use rewrite options.
            <br />
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              Turn your voice into anything
            </span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {rewriteOptions.map((option, index) => (
            <motion.div
              key={option.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
            >
              <Card
                className="p-6 h-full bg-card border-border hover-elevate cursor-pointer"
                data-testid={`card-rewrite-${index}`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${option.color} flex items-center justify-center flex-shrink-0`}
                  >
                    <option.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{option.title}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Card className="inline-block p-8 bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
            <div className="flex items-center gap-2 mb-4 justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-bold">...or create your own rewrite option!</h3>
            </div>
            <p className="text-muted-foreground mb-6 max-w-md">
              You can ask AI to write anything. What do you want your voice to become? Try it out now!
            </p>
            <Button
              className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90"
              data-testid="button-get-now-rewrite"
            >
              Get now
            </Button>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
