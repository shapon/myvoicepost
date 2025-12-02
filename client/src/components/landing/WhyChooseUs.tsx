import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X, Check } from "lucide-react";

const painPointsData = [
  {
    category: "Output Quality & Customization",
    items: [
      {
        painPoint: "Generic, Robotic Output",
        gapInExistingApps: "AI rewrites often sound 'bland,' 'plainer,' or 'un-human-like,' making users spend time manually fixing the tone.",
        solution: "Personal Voice Profile",
        howWeSolve: "Allow users to train AI on their existing texts so every message sounds authentically them with their unique vocabulary and stylistic flair.",
      },
      {
        painPoint: "Lack of Output Structure Control",
        gapInExistingApps: "Most apps offer just 'email' or 'post.' Users need complex formatting (bullet points, bolding, etc).",
        solution: "Structured Output Templates",
        howWeSolve: "Specialized formats like 'Meeting Follow-Up Email (with action items)', 'Formal Client Refusal', or 'Project Proposal Outline'.",
      },
      {
        painPoint: "Limited Editing of AI Output",
        gapInExistingApps: "Users struggle to fine-tune AI results, forcing them to copy text elsewhere to edit.",
        solution: "Voice-Based Editing",
        howWeSolve: "Tap any sentence and say 'Make that sound more urgent' - AI rewrites only that part instantly.",
      },
    ],
  },
  {
    category: "Workflow & Integration",
    items: [
      {
        painPoint: "Broken, Non-Continuous Workflow",
        gapInExistingApps: "Dictation stops, transcription fails, and users lose their flow or entire message.",
        solution: "Continuous Background Listening",
        howWeSolve: "Capture speech continuously even when pausing or switching apps briefly - no thought is ever lost.",
      },
      {
        painPoint: "Contextual Blind Spots",
        gapInExistingApps: "AI is great at grammar but bad at understanding who the message is for (Boss vs. Friend).",
        solution: "Recipient/Context Tagging",
        howWeSolve: "Tag output destination like 'for my boss John' or 'for LinkedIn' which feeds critical context to the AI.",
      },
    ],
  },
];

export default function WhyChooseUs() {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden" data-testid="why-choose-us-section">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge
            variant="secondary"
            className="mb-4 px-4 py-2 text-sm font-medium bg-primary/10 text-primary border-primary/20"
          >
            Why We're Different
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Major Gaps & Pain Points
            <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent"> We Address</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See how MyVoicePost solves the problems other voice-to-text apps can't
          </p>
        </div>

        <div className="space-y-12">
          {painPointsData.map((category, categoryIndex) => (
            <motion.div
              key={category.category}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: categoryIndex * 0.1 }}
            >
              <h3 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3">
                <span className="w-2 h-8 rounded-full bg-gradient-to-b from-primary to-purple-500" />
                {category.category}
              </h3>

              <div className="rounded-xl border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <Table data-testid={`table-category-${categoryIndex}`}>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-semibold text-foreground w-[15%]">Category</TableHead>
                        <TableHead className="font-semibold text-foreground w-[30%]">
                          <div className="flex items-center gap-2">
                            <X className="w-4 h-4 text-destructive" />
                            Pain Point / Gap in Existing Apps
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-foreground w-[55%]">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            How MyVoicePost Solves It
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.items.map((item, index) => (
                        <TableRow 
                          key={item.painPoint}
                          className="hover:bg-muted/30"
                          data-testid={`row-painpoint-${categoryIndex}-${index}`}
                        >
                          <TableCell className="font-medium text-primary align-top py-4">
                            {item.painPoint}
                          </TableCell>
                          <TableCell className="text-muted-foreground align-top py-4">
                            <div className="flex items-start gap-2">
                              <X className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                              <span>{item.gapInExistingApps}</span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-green-500">{item.solution}: </span>
                                <span className="text-muted-foreground">{item.howWeSolve}</span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
