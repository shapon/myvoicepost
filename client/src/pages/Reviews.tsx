import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { SiAppstore, SiGoogleplay, SiProducthunt, SiX } from "react-icons/si";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { testimonials, TestimonialCard } from "@/components/landing/Testimonials";

const extraReviews = [
  {
    name: "Daniel Park",
    avatar: "DP",
    platform: "App Store",
    icon: SiAppstore,
    content: "The translation feature alone is worth it. I speak Korean and it gives me perfect English output every time.",
    rating: 5,
  },
  {
    name: "Rachel Morgan",
    avatar: "RM",
    platform: "X",
    icon: SiX,
    content: "I dictate my meeting notes during the commute and have a polished summary before I even arrive. Game changer.",
    rating: 5,
  },
  {
    name: "Arjun Patel",
    avatar: "AP",
    platform: "Google Play",
    icon: SiGoogleplay,
    content: "As a non-native English speaker, this tool gives me confidence. My emails now sound professional and fluent.",
    rating: 5,
  },
  {
    name: "Elena Fischer",
    avatar: "EF",
    platform: "Product Hunt",
    icon: SiProducthunt,
    content: "I've tried six transcription apps. None come close to the polish quality here. This is the real deal.",
    rating: 5,
  },
  {
    name: "Tom Walters",
    avatar: "TW",
    platform: "App Store",
    icon: SiAppstore,
    content: "Perfect for capturing ideas during runs. No more forgetting that brilliant thought from mile 3.",
    rating: 5,
  },
  {
    name: "Nadia Osei",
    avatar: "NO",
    platform: "Google Play",
    icon: SiGoogleplay,
    content: "I use it to draft client proposals. What used to take an hour now takes ten minutes of talking out loud.",
    rating: 5,
  },
];

const allReviews = [...testimonials, ...extraReviews];

const storeRatings = [
  { label: "App Store", score: "4.8", icon: SiAppstore, color: "text-blue-500" },
  { label: "Google Play", score: "4.7", icon: SiGoogleplay, color: "text-green-500" },
  { label: "Product Hunt", score: "4.9", icon: SiProducthunt, color: "text-orange-500" },
];

export default function Reviews() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-28 pb-24 px-4">
        <div className="max-w-6xl mx-auto">

          {/* Page heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-14"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              What 300,000+ users say
            </h1>
            <p className="text-lg text-muted-foreground mb-10">
              Real reviews from real users across every platform
            </p>

            {/* Store rating badges */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {storeRatings.map((store) => (
                <div
                  key={store.label}
                  className="flex items-center gap-3 px-5 py-3 rounded-xl border border-border bg-card"
                >
                  <store.icon className={`w-5 h-5 ${store.color}`} />
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="text-lg font-bold leading-none">{store.score}</span>
                    </div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                      {store.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* All reviews grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {allReviews.map((review, i) => (
              <TestimonialCard key={review.name} testimonial={review} index={i} />
            ))}
          </div>

          {/* Bottom trust note */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-sm text-muted-foreground mt-14"
          >
            Reviews collected from the App Store, Google Play, Product Hunt, and X (Twitter).
          </motion.p>

        </div>
      </main>

      <Footer />
    </div>
  );
}
