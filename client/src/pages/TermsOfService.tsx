import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, ArrowUp, FileText, Users, CreditCard, Shield, Scale, Phone, 
  Check, CheckCircle2, Clock, AlertCircle, Lock, Globe, Mail, 
  Bookmark, Ban, Zap, RefreshCw, XCircle, HelpCircle, Gavel,
  UserCheck, Settings, FileCheck, Building, AlertTriangle, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface QuickNavItem {
  id: string;
  label: string;
  icon: any;
}

const quickNavItems: QuickNavItem[] = [
  { id: "section-1", label: "Eligibility", icon: UserCheck },
  { id: "section-2", label: "Account", icon: Users },
  { id: "section-3", label: "How It Works", icon: Zap },
  { id: "section-4", label: "Pricing", icon: CreditCard },
  { id: "section-5", label: "Subscriptions", icon: RefreshCw },
  { id: "section-6", label: "Refunds", icon: RefreshCw },
  { id: "section-7", label: "Cancellation", icon: XCircle },
  { id: "section-8", label: "License", icon: FileCheck },
  { id: "section-9", label: "Permitted Use", icon: Check },
  { id: "section-10", label: "Prohibited Use", icon: Ban },
  { id: "section-11", label: "Your Content", icon: FileText },
  { id: "section-12", label: "Our IP", icon: Shield },
  { id: "section-13", label: "Your IP", icon: Lock },
  { id: "section-14", label: "Privacy", icon: Lock },
  { id: "section-15", label: "Availability", icon: Globe },
  { id: "section-16", label: "Disclaimers", icon: AlertTriangle },
  { id: "section-17", label: "Liability", icon: Scale },
  { id: "section-18", label: "Disputes", icon: Gavel },
  { id: "section-19", label: "Termination", icon: XCircle },
  { id: "section-20", label: "Changes", icon: RefreshCw },
  { id: "section-21", label: "General", icon: FileText },
  { id: "section-22", label: "Contact", icon: Mail },
];

export default function TermsOfService() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["section-1"]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!openSections.includes(sectionId)) {
        setOpenSections([...openSections, sectionId]);
      }
    }
  };

  const allSections = quickNavItems.map(item => item.id);
  const expandAll = () => setOpenSections(allSections);
  const collapseAll = () => setOpenSections([]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Legally Binding
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Plain Language
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold" data-testid="text-terms-title">Terms of Service</h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4" />
                Effective Date: February 29, 2026 | Version 2.0
              </p>
            </div>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Thank you for choosing MyVoicePost! We've written these terms in plain language to help you understand 
            your rights and responsibilities when using our voice transcription and translation services.
          </p>
        </div>

        <Card className="mb-8 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-purple-500/5 border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-blue-500" />
              Quick Summary - The Key Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Check className="w-4 h-4" />
                  What you can do
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Record and transcribe audio
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Translate your content
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Export and share your work
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Cancel anytime
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Ban className="w-4 h-4" />
                  What you cannot do
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    Record without consent (where required)
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    Use for illegal activities
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    Share your account
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    Reverse engineer our service
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <CreditCard className="w-4 h-4" />
                  Payments
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Free tier available
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Cancel subscriptions anytime
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    30-day refund policy
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Secure payment processing
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <HelpCircle className="w-4 h-4" />
                  Need help?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Contact us anytime at:
                </p>
                <a 
                  href="mailto:support@myvoicepost.com" 
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  <Mail className="w-4 h-4" />
                  support@myvoicepost.com
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 overflow-x-auto pb-2">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-sm text-muted-foreground mr-2">Jump to:</span>
            {quickNavItems.slice(0, 8).map((item) => (
              <Button
                key={item.id}
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => scrollToSection(item.id)}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Table of Contents</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Users className="w-4 h-4" />
                  Getting Started
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-1")}>1. Who Can Use Our Service</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-2")}>2. Creating Your Account</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-3")}>3. How Our Service Works</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CreditCard className="w-4 h-4" />
                  Payments & Subscriptions
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-4")}>4. Pricing & Payment</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-5")}>5. Subscription Plans</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-6")}>6. Free Trials & Refunds</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-7")}>7. Cancellation Policy</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <Shield className="w-4 h-4" />
                  Using Our Service
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-8")}>8. Your Rights to Use Our App</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-9")}>9. What You Can Do</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-10")}>10. What You Cannot Do</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-11")}>11. Your Content & Data</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Lock className="w-4 h-4" />
                  Legal Protections
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-12")}>12. Our Intellectual Property</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-13")}>13. Your Intellectual Property</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-14")}>14. Privacy & Data Protection</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-15")}>15. Service Availability</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Scale className="w-4 h-4" />
                  Legal Terms
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-16")}>16. Disclaimers & Limitations</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-17")}>17. Limitation of Liability</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-18")}>18. Dispute Resolution</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-19")}>19. Termination</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2 text-teal-600 dark:text-teal-400">
                  <MessageSquare className="w-4 h-4" />
                  Other Info
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-20")}>20. Changes to These Terms</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-21")}>21. General Provisions</li>
                  <li className="cursor-pointer hover:text-primary" onClick={() => scrollToSection("section-22")}>22. Contact Information</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Full Terms of Service</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll} data-testid="button-expand-all">
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} data-testid="button-collapse-all">
              Collapse All
            </Button>
          </div>
        </div>

        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">
          <AccordionItem value="section-1" id="section-1" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">1. Who Can Use Our Service</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-500" />
                    Age Requirements
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Minimum age: 18 years old</strong>
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- Our service processes voice recordings</li>
                    <li>- Legal contracts require adult capacity</li>
                    <li>- Privacy laws have age restrictions</li>
                    <li>- We handle payment information</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Geographic & Legal
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- Generally available worldwide</li>
                    <li>- Exceptions for embargoed countries</li>
                    <li>- Must have legal authority to agree</li>
                    <li>- Must comply with all applicable laws</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-2" id="section-2" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">2. Creating Your Account</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  To access our services, you must create an account with accurate and complete information.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <h4 className="font-medium text-sm mb-2">Your Responsibilities:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>- Use your real name and valid email</li>
                        <li>- Create a strong, unique password</li>
                        <li>- Keep login credentials secure</li>
                        <li>- Notify us of unauthorized access</li>
                      </ul>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <h4 className="font-medium text-sm mb-2">Account Security:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>- You're responsible for all account activity</li>
                        <li>- Don't share your account with others</li>
                        <li>- Enable two-factor authentication</li>
                        <li>- Log out from shared devices</li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-3" id="section-3" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-semibold">3. How Our Service Works</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                MyVoicePost provides voice-to-text transcription and translation services powered by AI.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <span className="font-bold text-primary">1</span>
                    </div>
                    <h4 className="font-medium text-sm">Record or Upload</h4>
                    <p className="text-xs text-muted-foreground mt-1">Audio files or live recording</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <span className="font-bold text-primary">2</span>
                    </div>
                    <h4 className="font-medium text-sm">AI Processing</h4>
                    <p className="text-xs text-muted-foreground mt-1">Transcribe, polish, translate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <span className="font-bold text-primary">3</span>
                    </div>
                    <h4 className="font-medium text-sm">Save & Export</h4>
                    <p className="text-xs text-muted-foreground mt-1">Manage and share your content</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-4" id="section-4" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">4. Pricing & Payment</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Our pricing is transparent and clearly displayed before any purchase.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      What We Promise
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Prices shown in your local currency</li>
                      <li>- All payments processed securely (Stripe)</li>
                      <li>- Advance notice of any price changes</li>
                      <li>- No hidden fees</li>
                    </ul>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-500" />
                      Payment Methods
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Credit/debit cards</li>
                      <li>- PayPal (where available)</li>
                      <li>- Bank transfers (enterprise)</li>
                      <li>- Automatic recurring billing</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-5" id="section-5" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="font-semibold">5. Subscription Plans</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Free Tier</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Basic features</li>
                      <li>- Limited transcription minutes</li>
                      <li>- Standard processing</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="border-primary">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Premium</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Unlimited transcription</li>
                      <li>- Priority processing</li>
                      <li>- Advanced features</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Enterprise</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Custom limits</li>
                      <li>- Dedicated support</li>
                      <li>- Custom integrations</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Subscriptions renew automatically. You can upgrade or downgrade at any time.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-6" id="section-6" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <span className="font-semibold">6. Free Trials & Refunds</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Free Trials</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- Limited to one per user</li>
                    <li>- Full premium features during trial</li>
                    <li>- Automatic billing after trial ends</li>
                    <li>- Cancel anytime during trial</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Refund Policy</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- <strong>30-day money-back guarantee</strong></li>
                    <li>- Contact support for refund requests</li>
                    <li>- Processed within 5-10 business days</li>
                    <li>- No refunds after 30 days</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-7" id="section-7" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-7">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold">7. Cancellation Policy</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-3">How Cancellation Works:</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    Cancel at any time from your account settings
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    Cancellation takes effect at end of billing period
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    You retain access until your period ends
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    No partial refunds for unused time
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    You can resubscribe anytime
                  </li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-8" id="section-8" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="font-semibold">8. Your Rights to Use Our App</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                We grant you a limited, non-exclusive, non-transferable license to use our service.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="font-medium text-sm mb-2 text-green-800 dark:text-green-200">This License Allows:</h4>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <li>- Personal use</li>
                    <li>- Internal business use</li>
                    <li>- Use on multiple devices</li>
                  </ul>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                  <h4 className="font-medium text-sm mb-2 text-red-800 dark:text-red-200">This License Does NOT Include:</h4>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    <li>- Resale rights</li>
                    <li>- Sublicensing</li>
                    <li>- Commercial redistribution</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-9" id="section-9" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-9">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">9. What You Can Do</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  "Record and transcribe audio for legitimate purposes",
                  "Save and organize your transcriptions",
                  "Export your content for personal use",
                  "Share your own content as you see fit",
                  "Use the service on multiple devices",
                  "Translate content between supported languages"
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-10" id="section-10" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Ban className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold">10. What You Cannot Do</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <h4 className="font-medium mb-3 text-red-800 dark:text-red-200">Prohibited Activities:</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {[
                    "Recording conversations without consent where required",
                    "Using the service for illegal activities",
                    "Uploading malicious content or malware",
                    "Attempting to reverse engineer our service",
                    "Sharing account credentials",
                    "Violating intellectual property rights",
                    "Harassing or threatening others",
                    "Circumventing usage limits"
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-11" id="section-11" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-11">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">11. Your Content & Data</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    You own your content. We don't claim ownership of your audio files or transcriptions.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Your Rights:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- You retain all rights to your content</li>
                      <li>- Export your data anytime</li>
                      <li>- Delete your content whenever you want</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">License to Us:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Limited license to process your content</li>
                      <li>- Only for providing our service</li>
                      <li>- License ends when you delete content</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-12" id="section-12" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-12">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-semibold">12. Our Intellectual Property</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                All rights to MyVoicePost's technology, design, and branding belong to us.
              </p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  Software, code, and AI models are our property
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  Trademarks, logos, and branding are protected
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  User interface designs are copyrighted
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  Documentation and help content are protected
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-13" id="section-13" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-13">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <span className="font-semibold">13. Your Intellectual Property</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                You retain ownership of all intellectual property rights in content you create or upload. 
                When you upload content, you represent that you have the right to do so and grant us only 
                the limited license needed to provide our services.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-14" id="section-14" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-14">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">14. Privacy & Data Protection</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your privacy is important to us. Our data practices are detailed in our Privacy Policy.
                </p>
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm">
                    For complete details on how we collect, use, and protect your data, please read our{" "}
                    <Link href="/privacy">
                      <span className="text-primary hover:underline cursor-pointer font-medium">Privacy Policy</span>
                    </Link>.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-15" id="section-15" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-15">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">15. Service Availability</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We strive for high availability but cannot guarantee 100% uptime.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">We Aim To:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Maintain 99.9% uptime</li>
                      <li>- Provide advance notice of maintenance</li>
                      <li>- Resolve issues quickly</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Possible Disruptions:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Scheduled maintenance</li>
                      <li>- Emergency updates</li>
                      <li>- Third-party service issues</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-16" id="section-16" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="font-semibold">16. Disclaimers & Limitations</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <h4 className="font-medium mb-2 text-amber-800 dark:text-amber-200">Important Disclaimers:</h4>
                <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
                  <li>- Service provided "as is" without warranties</li>
                  <li>- Transcription accuracy is not guaranteed 100%</li>
                  <li>- We're not responsible for third-party services</li>
                  <li>- Results may vary based on audio quality</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-17" id="section-17" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-17">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Scale className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold">17. Limitation of Liability</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                To the maximum extent permitted by law, our liability is limited to the amount you've paid us 
                in the past 12 months. We are not liable for indirect, incidental, or consequential damages.
              </p>
              <p className="text-sm text-muted-foreground">
                This includes but is not limited to: lost profits, data loss, business interruption, 
                or damages from reliance on transcription accuracy.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-18" id="section-18" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-18">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Gavel className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="font-semibold">18. Dispute Resolution</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We prefer to resolve disputes amicably. If issues arise:
                </p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-2">
                        <span className="font-bold text-blue-600">1</span>
                      </div>
                      <h4 className="font-medium text-sm">Contact Support</h4>
                      <p className="text-xs text-muted-foreground mt-1">Try to resolve directly</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-2">
                        <span className="font-bold text-blue-600">2</span>
                      </div>
                      <h4 className="font-medium text-sm">Mediation</h4>
                      <p className="text-xs text-muted-foreground mt-1">If direct resolution fails</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-2">
                        <span className="font-bold text-blue-600">3</span>
                      </div>
                      <h4 className="font-medium text-sm">Arbitration</h4>
                      <p className="text-xs text-muted-foreground mt-1">Binding if necessary</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-19" id="section-19" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-19">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold">19. Termination</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">You Can Terminate:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- Cancel your subscription anytime</li>
                    <li>- Delete your account in settings</li>
                    <li>- Export your data before leaving</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">We Can Terminate:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- For violation of these terms</li>
                    <li>- For illegal activities</li>
                    <li>- With notice for any reason</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-20" id="section-20" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="font-semibold">20. Changes to These Terms</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We may update these terms from time to time. When we make significant changes:
                </p>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    We'll notify you via email
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    We'll provide 30 days advance notice
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    Continued use means acceptance
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    You can close your account if you disagree
                  </li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-21" id="section-21" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-21">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <span className="font-semibold">21. General Provisions</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Entire Agreement</h4>
                  <p>These terms, along with our Privacy Policy, constitute the entire agreement.</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Severability</h4>
                  <p>If any provision is invalid, the rest remains in effect.</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">No Waiver</h4>
                  <p>Failure to enforce a right doesn't waive that right.</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Assignment</h4>
                  <p>We may assign these terms; you may not without consent.</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-22" id="section-22" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-22">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold">22. Contact Information</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="border-primary/20">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-3">
                      <Mail className="w-4 h-4 text-primary" />
                      General Support
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      <a href="mailto:support@myvoicepost.com" className="text-primary hover:underline">support@myvoicepost.com</a>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Response within 24 hours</p>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-3">
                      <Scale className="w-4 h-4 text-primary" />
                      Legal Inquiries
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      <a href="mailto:legal@myvoicepost.com" className="text-primary hover:underline">legal@myvoicepost.com</a>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">For formal legal matters</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Card className="mt-8 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 border-blue-500/20">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Quick Reference</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">How do I cancel my subscription?</p>
                <p className="text-muted-foreground">Account Settings &gt; Subscription &gt; Cancel</p>
              </div>
              <div>
                <p className="font-medium">Can I get a refund?</p>
                <p className="text-muted-foreground">Yes, within 30 days of purchase. Contact support.</p>
              </div>
              <div>
                <p className="font-medium">Who owns my transcriptions?</p>
                <p className="text-muted-foreground">You do. We only have a limited license to provide our service.</p>
              </div>
              <div>
                <p className="font-medium">What if I have a dispute?</p>
                <p className="text-muted-foreground">Contact support first. We'll work to resolve it.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground border-t pt-8">
          <p>Last updated: February 29, 2026 | Version 2.0</p>
          <p className="mt-1">(c) 2026 MyVoicePost. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/privacy">
              <Button variant="ghost" size="sm">Privacy Policy</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm">Back to Home</Button>
            </Link>
          </div>
        </div>
      </main>

      {showScrollTop && (
        <Button
          variant="secondary"
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          onClick={scrollToTop}
          data-testid="button-scroll-top"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
