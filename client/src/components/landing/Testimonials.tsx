import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star } from "lucide-react";
import { SiX, SiAppstore, SiGoogleplay, SiProducthunt } from "react-icons/si";

const testimonials = [
  {
    name: "Jonathan Holden",
    avatar: "JH",
    platform: "twitter",
    icon: SiX,
    title: "Really helped me",
    content: "I was just having a bit of an existential crisis, so I talked about it to MyVoicePost, which provided me with a summary that included very useful category headings. That really helped me figure things out!",
    rating: 5,
  },
  {
    name: "@LadyG",
    avatar: "LG",
    platform: "appstore",
    icon: SiAppstore,
    title: "Transformed how I take notes",
    content: "It has completely transformed how I take notes! The speech-to-text accuracy is impressive, and the structured output makes organizing my thoughts a breeze. Highly recommend!",
    rating: 5,
  },
  {
    name: "Mila Kono",
    avatar: "MK",
    platform: "producthunt",
    icon: SiProducthunt,
    title: "2 minutes, and I get a neat email",
    content: "Usually I'd need around 15 minutes to give structured feedback but now it's just 2 minutes of voice note, and I get a neat email ready to be sent!",
    rating: 5,
  },
  {
    name: "Matej Cabadaj",
    avatar: "MC",
    platform: "producthunt",
    icon: SiProducthunt,
    title: "I can let my ideas flow",
    content: "MyVoicePost is perfect for my forest walks! I can let my ideas flow without stopping. Love it!",
    rating: 5,
  },
  {
    name: "Conner Kees",
    avatar: "CK",
    platform: "googleplay",
    icon: SiGoogleplay,
    title: "Essential tool for content creators",
    content: "MyVoicePost is amazing. I use it everyday for content. I think it could be an essential tool in the toolkit of content creators, big thinkers, or entrepreneurs.",
    rating: 5,
  },
  {
    name: "Sofiane",
    avatar: "SF",
    platform: "twitter",
    icon: SiX,
    title: "Can't go back now",
    content: "I don't think I can go back now. I'm really hooked! The way it structures my thoughts and voice notes is... perfect.",
    rating: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 md:py-32" id="reviews" data-testid="testimonials-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Experience of our clients
          </h2>
          <p className="text-lg text-muted-foreground">
            Join thousands of happy users transforming their voice into text
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className="p-6 h-full bg-card border-border hover-elevate"
                data-testid={`card-testimonial-${index}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white font-medium">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{testimonial.name}</span>
                      <testimonial.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                      ))}
                    </div>
                  </div>
                </div>

                <h3 className="font-semibold mb-2">{testimonial.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {testimonial.content}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
