import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star } from "lucide-react";
import { SiX, SiAppstore, SiGoogleplay, SiProducthunt } from "react-icons/si";
import { Link } from "wouter";

export const testimonials = [
  {
    name: "James Hartwell",
    avatar: "JH",
    platform: "X",
    icon: SiX,
    content: "I just talk to it — and walk away with structured notes. Wild.",
    rating: 5,
  },
  {
    name: "Lauren Grace",
    avatar: "LG",
    platform: "App Store",
    icon: SiAppstore,
    content: "Completely transformed how I take notes. The accuracy is unreal.",
    rating: 5,
  },
  {
    name: "Maya Krishnan",
    avatar: "MK",
    platform: "Product Hunt",
    icon: SiProducthunt,
    content: "Feedback that took me 15 minutes now takes 2.",
    rating: 5,
  },
  {
    name: "Marcus Chen",
    avatar: "MC",
    platform: "Product Hunt",
    icon: SiProducthunt,
    content: "Perfect for my walks — I let ideas flow without stopping.",
    rating: 5,
  },
  {
    name: "Cameron Knox",
    avatar: "CK",
    platform: "Google Play",
    icon: SiGoogleplay,
    content: "I use it every day for content. An essential tool.",
    rating: 5,
  },
  {
    name: "Sophie Farrell",
    avatar: "SF",
    platform: "Google Play",
    icon: SiGoogleplay,
    content: "Powerful, fast, and the output quality is amazing.",
    rating: 5,
  },
];

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
      ))}
    </div>
  );
}

export function TestimonialCard({ testimonial, index = 0 }: { testimonial: typeof testimonials[0]; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className="h-full"
    >
      <Card
        className="p-6 h-full flex flex-col bg-card border-border hover-elevate"
        data-testid={`card-testimonial-${index}`}
      >
        <StarRow count={testimonial.rating} />

        <p className="text-foreground font-medium text-base leading-relaxed flex-1 mb-6">
          "{testimonial.content}"
        </p>

        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {testimonial.avatar}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm leading-tight">{testimonial.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <testimonial.icon className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Review from {testimonial.platform}</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Testimonials() {
  return (
    <section className="py-20 md:py-32" id="reviews" data-testid="testimonials-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            What 300,000+ users say
          </h2>

          {/* Store ratings */}
          <div className="inline-flex items-center gap-0 divide-x divide-border border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3">
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
              <div className="text-left">
                <p className="text-xl font-bold leading-none">4.8</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">App Store</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-6 py-3">
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
              <div className="text-left">
                <p className="text-xl font-bold leading-none">4.7</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Google Play</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.name} testimonial={t} index={i} />
          ))}
        </div>

        {/* See all reviews */}
        <div className="text-center">
          <Link href="/reviews">
            <Button variant="outline" size="lg" data-testid="button-see-all-reviews">
              See all reviews
            </Button>
          </Link>
        </div>

      </div>
    </section>
  );
}
