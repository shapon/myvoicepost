import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { ScanText, FileOutput, HelpCircle, PenLine, Flame } from "lucide-react";

const features = [
  {
    icon: ScanText,
    title: "Smart Text Extraction",
    description:
      "Upload complex PDFs, scanned images, or DOCX files. Our advanced OCR turns flattened documents into perfectly organized, searchable markdown text.",
  },
  {
    icon: FileOutput,
    title: "Executive Summaries",
    description:
      "Condense massive handbooks, receipts, or project notes. Instantly extract a brief executive summary alongside exactly 5 critical takeaways.",
  },
  {
    icon: HelpCircle,
    title: "Automated Customer FAQs",
    description:
      "Our AI analyzes your documents from a client's perspective, predicting the top 5–10 questions a customer would ask and drafting flawless, contextual answers.",
  },
  {
    icon: PenLine,
    title: "Instant SEO Blog Post Creator",
    description:
      "Repurpose raw files or voice summaries instantly. Convert data parameters directly into a structured blog post complete with title hooks, headings, and clear CTAs.",
  },
];

export default function FileInsights() {
  return (
    <section className="py-20 md:py-32" id="file-insights" data-testid="file-insights-section">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 text-primary font-bold uppercase tracking-wider text-xs bg-primary/10 px-3 py-1 rounded-full mb-4">
            <Flame className="w-3.5 h-3.5" />
            New Feature
          </span>
          <h2 className="text-3xl md:text-5xl font-bold mt-4 mb-3">
            Don't just talk.{" "}
            <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              Upload files &amp; get instant insights.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Drop any PDF, Word document, or image. Let our engine extract text, summarize core
            files, generate client FAQs, or draft complete blog posts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className="p-6 h-full bg-card border-border hover-elevate"
                data-testid={`card-file-insight-${index}`}
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2" data-testid={`text-file-insight-title-${index}`}>
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground" data-testid={`text-file-insight-desc-${index}`}>
                  {feature.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
