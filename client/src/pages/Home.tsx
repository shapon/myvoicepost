import Header from "@/components/landing/Header";
import HeroSection from "@/components/landing/HeroSection";
import WhyChooseUs from "@/components/landing/WhyChooseUs";
import UseCases from "@/components/landing/UseCases";
import Features from "@/components/landing/Features";
import PremiumFeatures from "@/components/landing/PremiumFeatures";
import Testimonials from "@/components/landing/Testimonials";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <HeroSection />
        <WhyChooseUs />
        <UseCases />
        <Features />
        <PremiumFeatures />
        <Testimonials />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
