import { useState } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, ArrowRight, Gift, Users, DollarSign, Share2, 
  CheckCircle2, Zap, TrendingUp, Star, Sparkles, Copy, Check,
  Mic, Globe, Clock, Shield, Heart, Award, Wallet, CreditCard,
  ChevronRight, Mail, Building
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const rewards = [
  { icon: Building, label: "Bank Payout", account: "JPMorgan ****3145", amount: "+$126.50" },
  { icon: Building, label: "Bank Payout", account: "JPMorgan ****3145", amount: "+$252.10" },
  { icon: Building, label: "Bank Payout", account: "JPMorgan ****3145", amount: "+$199.25" },
];

const steps = [
  {
    number: "1",
    title: "Sign Up",
    description: "Join our affiliate program for free in just 2 minutes",
    icon: Users,
    color: "from-blue-500 to-cyan-500"
  },
  {
    number: "2", 
    title: "Share Your Link",
    description: "Get your unique referral link and share it with your audience",
    icon: Share2,
    color: "from-purple-500 to-pink-500"
  },
  {
    number: "3",
    title: "Earn Rewards",
    description: "Earn 30% commission for every paying customer you refer",
    icon: DollarSign,
    color: "from-green-500 to-emerald-500"
  }
];

const benefits = [
  {
    icon: TrendingUp,
    title: "30% Recurring Commission",
    description: "Earn 30% of every payment your referrals make - for as long as they're subscribed!"
  },
  {
    icon: Clock,
    title: "90-Day Cookie Duration",
    description: "Your referrals are tracked for 90 days, so you get credit even if they sign up later"
  },
  {
    icon: Wallet,
    title: "Monthly Payouts",
    description: "Get paid every month via PayPal or direct bank transfer when you reach $50"
  },
  {
    icon: Globe,
    title: "Global Program",
    description: "Accept referrals from anywhere in the world - we support 100+ countries"
  },
  {
    icon: Shield,
    title: "Real-Time Tracking",
    description: "Access your dashboard anytime to see clicks, signups, and earnings"
  },
  {
    icon: Heart,
    title: "Dedicated Support",
    description: "Get priority support and marketing materials to help you succeed"
  }
];

const testimonials = [
  {
    name: "Sarah M.",
    role: "Content Creator",
    earnings: "$2,450",
    quote: "I shared MyVoicePost with my podcast community and the commissions just keep coming in!",
    avatar: "S"
  },
  {
    name: "David K.",
    role: "YouTuber",
    earnings: "$5,200",
    quote: "The 30% recurring commission is incredible. It's now my top-earning affiliate program.",
    avatar: "D"
  },
  {
    name: "Emma L.",
    role: "Blogger",
    earnings: "$1,890",
    quote: "Super easy to promote. My audience loves the voice-to-text features!",
    avatar: "E"
  }
];

const faqs = [
  {
    question: "How much can I earn?",
    answer: "You earn 30% recurring commission on every payment your referrals make. If someone signs up for a $19.99/month plan, you earn $6 every month they stay subscribed!"
  },
  {
    question: "When do I get paid?",
    answer: "Payouts are processed monthly. Once your balance reaches $50, we'll send your earnings via PayPal or direct bank transfer."
  },
  {
    question: "How long is the cookie duration?",
    answer: "We track referrals for 90 days. If someone clicks your link and signs up within 90 days, you get the commission."
  },
  {
    question: "Can I promote on social media?",
    answer: "Absolutely! Share your link on YouTube, TikTok, Instagram, Twitter, blogs, newsletters, or anywhere you have an audience."
  },
  {
    question: "Is the program free to join?",
    answer: "Yes! Our affiliate program is completely free. Sign up and start earning today."
  }
];

export default function AffiliateProgram() {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  
  const sampleLink = "myvoicepost.com/ref/your-unique-id";

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${sampleLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg">MyVoicePost</span>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/30 to-cyan-400/30 rounded-full blur-3xl" />
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4 bg-white/50 dark:bg-gray-800/50 px-4 py-1.5">
                <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
                MYVOICEPOST AFFILIATE PROGRAM
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-gray-900 via-purple-800 to-gray-900 dark:from-white dark:via-purple-200 dark:to-white bg-clip-text text-transparent">
                You share, we reward
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                Love MyVoicePost and think others will too? Share it with your friends or audience 
                and earn money for every purchase they make.
              </p>
              <Button size="lg" className="text-lg px-8 py-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-xl shadow-purple-500/25" data-testid="button-join-program-hero">
                Join the Program
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 mt-16">
              <Card className="bg-gradient-to-br from-amber-400 to-orange-400 border-0 text-white overflow-hidden relative">
                <CardContent className="p-8 relative z-10">
                  <div className="absolute top-4 right-4">
                    <Sparkles className="w-6 h-6 text-white/50" />
                  </div>
                  <div className="text-6xl sm:text-7xl font-bold mb-2">30%</div>
                  <p className="text-lg text-white/90">for every paying user you refer</p>
                </CardContent>
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
              </Card>

              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center min-h-[200px]">
                <div className="text-center p-6">
                  <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-xl">
                    <Gift className="w-12 h-12 text-white" />
                  </div>
                  <p className="font-semibold text-lg">Share the love</p>
                  <p className="text-sm text-muted-foreground">Help others discover voice-to-text magic</p>
                </div>
              </div>

              <Card className="bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 border-purple-200 dark:border-purple-800 overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-purple-500" />
                    Your rewards
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rewards.map((reward, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center">
                          <reward.icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{reward.label}</p>
                          <p className="text-xs text-muted-foreground">{reward.account}</p>
                        </div>
                      </div>
                      <span className="font-bold text-green-600 dark:text-green-400">{reward.amount}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 text-center">
              <Button size="lg" className="text-lg px-10 py-6 rounded-full bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-200 dark:text-gray-900 shadow-xl" data-testid="button-join-program-main">
                Join the Program
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 bg-white/50 dark:bg-gray-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">How it works</h2>
              <p className="text-muted-foreground text-lg">Start earning in 3 simple steps</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div key={i} className="relative">
                  <Card className="text-center p-6 hover-elevate">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                      <step.icon className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
                      {step.number}
                    </div>
                    <CardTitle className="mb-2">{step.title}</CardTitle>
                    <p className="text-muted-foreground">{step.description}</p>
                  </Card>
                  {i < 2 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                      <ArrowRight className="w-8 h-8 text-purple-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-4">
                <Award className="w-3 h-3 mr-1 text-amber-500" />
                WHY JOIN US
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Amazing benefits for affiliates</h2>
              <p className="text-muted-foreground text-lg">Everything you need to succeed as an affiliate partner</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit, i) => (
                <Card key={i} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl flex items-center justify-center mb-4">
                      <benefit.icon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{benefit.title}</h3>
                    <p className="text-muted-foreground text-sm">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
            <Zap className="w-12 h-12 mx-auto mb-6 text-yellow-300" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your earning potential</h2>
            <p className="text-xl text-white/80 mb-8">See how much you could earn as a MyVoicePost affiliate</p>
            
            <div className="grid sm:grid-cols-3 gap-6">
              <Card className="bg-white/10 border-white/20 text-white">
                <CardContent className="p-6">
                  <p className="text-sm text-white/70 mb-2">10 referrals/month</p>
                  <p className="text-3xl font-bold">$60</p>
                  <p className="text-sm text-white/70">per month</p>
                </CardContent>
              </Card>
              <Card className="bg-white/20 border-white/30 text-white transform scale-105">
                <CardContent className="p-6">
                  <Badge className="mb-2 bg-yellow-400 text-yellow-900">Popular</Badge>
                  <p className="text-sm text-white/70 mb-2">50 referrals/month</p>
                  <p className="text-4xl font-bold">$300</p>
                  <p className="text-sm text-white/70">per month</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 border-white/20 text-white">
                <CardContent className="p-6">
                  <p className="text-sm text-white/70 mb-2">200 referrals/month</p>
                  <p className="text-3xl font-bold">$1,200</p>
                  <p className="text-sm text-white/70">per month</p>
                </CardContent>
              </Card>
            </div>

            <p className="mt-6 text-sm text-white/60">
              * Based on average subscription value of $19.99/month and 30% commission
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">What our affiliates say</h2>
              <p className="text-muted-foreground text-lg">Join hundreds of successful affiliate partners</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, i) => (
                <Card key={i} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <p className="font-semibold">{testimonial.name}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-muted-foreground mb-4">"{testimonial.quote}"</p>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      <DollarSign className="w-3 h-3 mr-1" />
                      Earned {testimonial.earnings}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-white/50 dark:bg-gray-900/50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Try your referral link</h2>
              <p className="text-muted-foreground text-lg">Here's what your unique link will look like</p>
            </div>

            <Card className="max-w-xl mx-auto">
              <CardContent className="p-6">
                <div className="flex gap-2">
                  <div className="flex-1 bg-muted rounded-lg px-4 py-3 font-mono text-sm truncate">
                    https://{sampleLink}
                  </div>
                  <Button variant="outline" size="icon" onClick={copyLink} className="shrink-0" data-testid="button-copy-link">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-3 text-center">
                  {copied ? "Link copied!" : "Click to copy your referral link"}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Frequently asked questions</h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <Card key={i} className="hover-elevate">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-lg mb-2 flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      {faq.question}
                    </h3>
                    <p className="text-muted-foreground pl-7">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-to-br from-gray-900 to-purple-900 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-6 text-yellow-400" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to start earning?</h2>
            <p className="text-xl text-white/80 mb-8">
              Join our affiliate program today and turn your audience into recurring revenue
            </p>

            <Card className="max-w-md mx-auto bg-white/10 border-white/20">
              <CardContent className="p-6">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                    data-testid="input-affiliate-email"
                  />
                  <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shrink-0" data-testid="button-join-now">
                    Join Now
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                <p className="text-sm text-white/60 mt-3">
                  Free to join. No minimum requirements.
                </p>
              </CardContent>
            </Card>

            <div className="mt-12 flex flex-wrap justify-center gap-8 text-white/60 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                30% Commission
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                90-Day Cookie
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Monthly Payouts
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Free Marketing Materials
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 bg-muted/50 text-center">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-sm text-muted-foreground">
              Sales are tracked only if the user purchases through your referral link on the web version. 
              However, they'll have access to all platforms: mobile, web, and Mac.
            </p>
          </div>
        </section>

        <footer className="py-8 border-t">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-muted-foreground">
                (c) 2026 MyVoicePost. All rights reserved.
              </p>
              <div className="flex items-center gap-4">
                <Link href="/privacy">
                  <Button variant="ghost" size="sm">Privacy Policy</Button>
                </Link>
                <Link href="/terms">
                  <Button variant="ghost" size="sm">Terms of Service</Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost" size="sm">Back to Home</Button>
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
