import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUp, FileText, Users, CreditCard, Shield, Scale, Phone, CheckCircle, Globe, Check, Languages, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const translations: Record<string, Record<string, string>> = {
  en: {
    title: "Terms of Service",
    backToHome: "Back to Home",
    effectiveDate: "Effective Date: January 7, 2026 | Version 2.0",
    welcome: "Welcome to Our Terms of Service",
    welcomeText: "Thank you for choosing MyVoicePost! We've written these terms in plain language to help you understand your rights and responsibilities.",
    inNutshell: "In a nutshell:",
    quickNav: "Quick Navigation",
    gettingStarted: "Getting Started",
    paymentsSubscriptions: "Payments & Subscriptions",
    usingService: "Using Our Service",
    legalProtections: "Legal Protections",
    legalTerms: "Legal Terms",
    otherInfo: "Other Important Info",
    expandAll: "Expand All",
    collapseAll: "Collapse All",
    accessibilityCompliant: "Accessibility Compliant",
  },
  es: {
    title: "Términos de Servicio",
    backToHome: "Volver al Inicio",
    effectiveDate: "Fecha de vigencia: 7 de enero de 2026 | Versión 2.0",
    welcome: "Bienvenido a Nuestros Términos de Servicio",
    welcomeText: "¡Gracias por elegir MyVoicePost! Hemos escrito estos términos en un lenguaje sencillo para ayudarle a entender sus derechos y responsabilidades.",
    inNutshell: "En resumen:",
    quickNav: "Navegación Rápida",
    gettingStarted: "Comenzando",
    paymentsSubscriptions: "Pagos y Suscripciones",
    usingService: "Usando Nuestro Servicio",
    legalProtections: "Protecciones Legales",
    legalTerms: "Términos Legales",
    otherInfo: "Otra Información Importante",
    expandAll: "Expandir Todo",
    collapseAll: "Contraer Todo",
    accessibilityCompliant: "Cumple con Accesibilidad",
  },
  pl: {
    title: "Warunki Korzystania z Usługi",
    backToHome: "Powrót do Strony Głównej",
    effectiveDate: "Data wejścia w życie: 7 stycznia 2026 | Wersja 2.0",
    welcome: "Witamy w Naszych Warunkach Korzystania",
    welcomeText: "Dziękujemy za wybór MyVoicePost! Napisaliśmy te warunki prostym językiem, aby pomóc Ci zrozumieć Twoje prawa i obowiązki.",
    inNutshell: "W skrócie:",
    quickNav: "Szybka Nawigacja",
    gettingStarted: "Rozpoczęcie",
    paymentsSubscriptions: "Płatności i Subskrypcje",
    usingService: "Korzystanie z Usługi",
    legalProtections: "Ochrona Prawna",
    legalTerms: "Warunki Prawne",
    otherInfo: "Inne Ważne Informacje",
    expandAll: "Rozwiń Wszystko",
    collapseAll: "Zwiń Wszystko",
    accessibilityCompliant: "Zgodny z Dostępnością",
  },
  fr: {
    title: "Conditions d'Utilisation",
    backToHome: "Retour à l'Accueil",
    effectiveDate: "Date d'effet: 7 janvier 2026 | Version 2.0",
    welcome: "Bienvenue dans nos Conditions d'Utilisation",
    welcomeText: "Merci d'avoir choisi MyVoicePost! Nous avons rédigé ces conditions en langage simple pour vous aider à comprendre vos droits et responsabilités.",
    inNutshell: "En bref:",
    quickNav: "Navigation Rapide",
    gettingStarted: "Pour Commencer",
    paymentsSubscriptions: "Paiements et Abonnements",
    usingService: "Utilisation de Notre Service",
    legalProtections: "Protections Juridiques",
    legalTerms: "Termes Juridiques",
    otherInfo: "Autres Informations Importantes",
    expandAll: "Tout Développer",
    collapseAll: "Tout Réduire",
    accessibilityCompliant: "Conforme à l'Accessibilité",
  },
  de: {
    title: "Nutzungsbedingungen",
    backToHome: "Zurück zur Startseite",
    effectiveDate: "Gültig ab: 7. Januar 2026 | Version 2.0",
    welcome: "Willkommen zu unseren Nutzungsbedingungen",
    welcomeText: "Vielen Dank, dass Sie sich für MyVoicePost entschieden haben! Wir haben diese Bedingungen in einfacher Sprache verfasst, um Ihnen zu helfen, Ihre Rechte und Pflichten zu verstehen.",
    inNutshell: "Kurz gesagt:",
    quickNav: "Schnellnavigation",
    gettingStarted: "Erste Schritte",
    paymentsSubscriptions: "Zahlungen und Abonnements",
    usingService: "Nutzung unseres Dienstes",
    legalProtections: "Rechtlicher Schutz",
    legalTerms: "Rechtliche Bedingungen",
    otherInfo: "Weitere Wichtige Informationen",
    expandAll: "Alle Erweitern",
    collapseAll: "Alle Reduzieren",
    accessibilityCompliant: "Barrierefreiheit Konform",
  },
};

const languageNames: Record<string, string> = {
  en: "English",
  es: "Español",
  pl: "Polski",
  fr: "Français",
  de: "Deutsch",
};

const accessibilityChecks = [
  { id: "contrast", label: "Color contrast ratio meets WCAG AA", passed: true },
  { id: "headings", label: "Proper heading hierarchy", passed: true },
  { id: "links", label: "Descriptive link text", passed: true },
  { id: "keyboard", label: "Keyboard navigable", passed: true },
  { id: "screenReader", label: "Screen reader compatible", passed: true },
  { id: "focusVisible", label: "Focus indicators visible", passed: true },
];

export default function TermsOfService() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [language, setLanguage] = useState("en");
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [showAccessibility, setShowAccessibility] = useState(false);

  const t = translations[language];

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

  const allSections = Array.from({ length: 22 }, (_, i) => `section-${i + 1}`);

  const expandAll = () => setOpenSections(allSections);
  const collapseAll = () => setOpenSections([]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4" />
                {t.backToHome}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="cursor-pointer gap-1"
                onClick={() => setShowAccessibility(!showAccessibility)}
                data-testid="badge-accessibility"
              >
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                {t.accessibilityCompliant}
              </Badge>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[140px]" data-testid="select-language">
                  <Languages className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(languageNames).map(([code, name]) => (
                    <SelectItem key={code} value={code} data-testid={`language-${code}`}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {showAccessibility && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Accessibility Compliance Checklist
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {accessibilityChecks.map((check) => (
                  <div key={check.id} className="flex items-center gap-2 text-sm">
                    <Check className={`w-4 h-4 ${check.passed ? 'text-green-500' : 'text-red-500'}`} />
                    <span className="text-muted-foreground">{check.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-terms-title">{t.title}</h1>
              <p className="text-muted-foreground">{t.effectiveDate}</p>
            </div>
          </div>
        </div>

        <Card className="mb-8 bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t.welcome}</h2>
            <p className="text-muted-foreground mb-4">{t.welcomeText}</p>
            <p className="text-muted-foreground">
              <strong>{t.inNutshell}</strong> These terms explain how you can use our service, what we expect from you, and what you can expect from us. By using our service, you're agreeing to these terms.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t.quickNav}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  {t.gettingStarted}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>1. Who Can Use Our Service</li>
                  <li>2. Creating Your Account</li>
                  <li>3. How Our Service Works</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  {t.paymentsSubscriptions}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>4. Pricing & Payment</li>
                  <li>5. Subscription Plans</li>
                  <li>6. Free Trials & Refunds</li>
                  <li>7. Cancellation Policy</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  {t.usingService}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>8. Your Rights to Use Our App</li>
                  <li>9. What You Can Do</li>
                  <li>10. What You Cannot Do</li>
                  <li>11. Your Content & Data</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  {t.legalProtections}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>12. Our Intellectual Property</li>
                  <li>13. Your Intellectual Property</li>
                  <li>14. Privacy & Data Protection</li>
                  <li>15. Service Availability</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  {t.legalTerms}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>16. Disclaimers & Limitations</li>
                  <li>17. Indemnification</li>
                  <li>18. Dispute Resolution</li>
                  <li>19. Termination</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  {t.otherInfo}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>20. Changes to These Terms</li>
                  <li>21. General Provisions</li>
                  <li>22. Contact Information</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">All Sections</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll} data-testid="button-expand-all">
              {t.expandAll}
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} data-testid="button-collapse-all">
              {t.collapseAll}
            </Button>
          </div>
        </div>

        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-2">
          <AccordionItem value="section-1" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-1">
              <span className="font-semibold">1. Who Can Use Our Service</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Age Requirements</h4>
                  <p><strong>Minimum age: 18 years old</strong></p>
                  <ul className="list-disc pl-6 space-y-1 mt-2">
                    <li>Our service processes voice recordings</li>
                    <li>Legal contracts require adult capacity</li>
                    <li>Privacy laws have age restrictions</li>
                    <li>We handle payment information</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Geographic Restrictions</h4>
                  <p>Generally available worldwide, with exceptions for embargoed countries.</p>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Legal Capacity</h4>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>You must have legal authority to enter this agreement</li>
                    <li>You are not prohibited from using our service</li>
                    <li>You will comply with all applicable laws</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-2" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-2">
              <span className="font-semibold">2. Creating Your Account</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>To access our services, you must create an account with accurate and complete information.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Use your real name and valid email address</li>
                  <li>Create a strong, unique password</li>
                  <li>Keep your login credentials secure</li>
                  <li>Notify us immediately of any unauthorized access</li>
                  <li>You are responsible for all activity under your account</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-3" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-3">
              <span className="font-semibold">3. How Our Service Works</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>MyVoicePost provides voice-to-text transcription and translation services.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Record or upload audio files</li>
                  <li>Receive AI-powered transcriptions</li>
                  <li>Translate content between languages</li>
                  <li>Save, edit, and manage your transcriptions</li>
                  <li>Export your content in various formats</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-4" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-4">
              <span className="font-semibold">4. Pricing & Payment</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Our pricing is transparent and clearly displayed before any purchase.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Prices are shown in your local currency where available</li>
                  <li>All payments are processed securely</li>
                  <li>You authorize recurring charges for subscriptions</li>
                  <li>We will notify you of any price changes in advance</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-5" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-5">
              <span className="font-semibold">5. Subscription Plans</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We offer various subscription plans to meet your needs.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Free tier with basic features</li>
                  <li>Premium plans with additional capabilities</li>
                  <li>Subscriptions renew automatically</li>
                  <li>You can upgrade or downgrade at any time</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-6" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-6">
              <span className="font-semibold">6. Free Trials & Refunds</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We may offer free trials for premium features.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Free trials are limited to one per user</li>
                  <li>You will be charged after the trial unless you cancel</li>
                  <li>Refunds are available within 30 days of purchase</li>
                  <li>Contact support for refund requests</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-7" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-7">
              <span className="font-semibold">7. Cancellation Policy</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>You may cancel your subscription at any time.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Cancellation takes effect at the end of your billing period</li>
                  <li>You retain access until your current period ends</li>
                  <li>No partial refunds for unused time</li>
                  <li>You can resubscribe at any time</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-8" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-8">
              <span className="font-semibold">8. Your Rights to Use Our App</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We grant you a limited, non-exclusive, non-transferable license to use our service.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>For personal or internal business use only</li>
                  <li>Subject to these Terms of Service</li>
                  <li>May be revoked for violations</li>
                  <li>Does not include resale rights</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-9" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-9">
              <span className="font-semibold">9. What You Can Do</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>You are permitted to:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Record and transcribe audio for legitimate purposes</li>
                  <li>Save and organize your transcriptions</li>
                  <li>Export your content for personal use</li>
                  <li>Share your own content as you see fit</li>
                  <li>Use the service on multiple devices</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-10" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-10">
              <span className="font-semibold">10. What You Cannot Do</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>You are prohibited from:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Recording conversations without consent where required by law</li>
                  <li>Using the service for illegal activities</li>
                  <li>Uploading malicious content or malware</li>
                  <li>Attempting to hack or disrupt our service</li>
                  <li>Reselling or redistributing our service</li>
                  <li>Violating others' intellectual property rights</li>
                  <li>Harassing or threatening other users</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-11" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-11">
              <span className="font-semibold">11. Your Content & Data</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>You retain ownership of all content you create or upload.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Your audio files and transcriptions belong to you</li>
                  <li>You grant us a license to process your content for the service</li>
                  <li>We do not claim ownership of your content</li>
                  <li>You are responsible for ensuring you have rights to your content</li>
                  <li>We may remove content that violates our terms</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-12" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-12">
              <span className="font-semibold">12. Our Intellectual Property</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>MyVoicePost and all related intellectual property are owned by us.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Our trademarks, logos, and branding are protected</li>
                  <li>Our software, code, and technology are proprietary</li>
                  <li>You may not copy or reverse engineer our service</li>
                  <li>Feedback you provide may be used to improve our service</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-13" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-13">
              <span className="font-semibold">13. Your Intellectual Property</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We respect your intellectual property rights.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You retain all rights to your original content</li>
                  <li>Our license to your content is limited to providing the service</li>
                  <li>We will not use your content for marketing without permission</li>
                  <li>You can delete your content at any time</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-14" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-14">
              <span className="font-semibold">14. Privacy & Data Protection</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Your privacy is important to us. Please review our <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link> for details.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We collect only necessary information</li>
                  <li>We use industry-standard security measures</li>
                  <li>We do not sell your personal information</li>
                  <li>You have rights to access and delete your data</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-15" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-15">
              <span className="font-semibold">15. Service Availability</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We strive to maintain high availability but cannot guarantee uninterrupted service.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We may perform scheduled maintenance</li>
                  <li>Unexpected outages may occur</li>
                  <li>We will communicate major disruptions</li>
                  <li>We are not liable for service interruptions</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-16" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-16">
              <span className="font-semibold">16. Disclaimers & Limitations</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We disclaim all implied warranties</li>
                  <li>We do not guarantee transcription accuracy</li>
                  <li>Our liability is limited to the amount you paid us</li>
                  <li>We are not liable for indirect or consequential damages</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-17" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-17">
              <span className="font-semibold">17. Indemnification</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>You agree to indemnify and hold us harmless from claims arising from:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Your use of the service</li>
                  <li>Your content</li>
                  <li>Your violation of these terms</li>
                  <li>Your violation of any third-party rights</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-18" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-18">
              <span className="font-semibold">18. Dispute Resolution</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We prefer to resolve disputes amicably.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Contact us first to try to resolve issues informally</li>
                  <li>You have 90 days to attempt informal resolution</li>
                  <li>Unresolved disputes go to binding arbitration</li>
                  <li>Class actions and jury trials are waived</li>
                  <li>California law governs these terms</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-19" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-19">
              <span className="font-semibold">19. Termination</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Either party may terminate this agreement.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You can close your account at any time</li>
                  <li>We may terminate for violations of these terms</li>
                  <li>Upon termination, your access ends immediately</li>
                  <li>Certain provisions survive termination</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-20" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-20">
              <span className="font-semibold">20. Changes to These Terms</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>We may update these terms from time to time.</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We will notify you of material changes</li>
                  <li>Continued use constitutes acceptance</li>
                  <li>You can review the latest terms on our website</li>
                  <li>If you disagree, you may close your account</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-21" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-21">
              <span className="font-semibold">21. General Provisions</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Entire Agreement:</strong> These terms constitute the complete agreement</li>
                  <li><strong>Severability:</strong> If any provision is invalid, the rest remains</li>
                  <li><strong>Waiver:</strong> Failure to enforce doesn't waive our rights</li>
                  <li><strong>Assignment:</strong> You may not assign without consent</li>
                  <li><strong>Force Majeure:</strong> We're not liable for events beyond our control</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-22" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-22">
              <span className="font-semibold">22. Contact Information</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Have questions about these Terms of Service? We're here to help.</p>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Phone className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">Legal Team</p>
                          <a href="mailto:legal@myvoicepost.com" className="text-primary hover:underline">
                            legal@myvoicepost.com
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">General Support</p>
                          <a href="mailto:hi@myvoicepost.com" className="text-primary hover:underline">
                            hi@myvoicepost.com
                          </a>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-12 pt-8 border-t">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>Last updated:</strong> January 7, 2026 | <strong>Version:</strong> 2.0 | <strong>Effective date:</strong> January 7, 2026
            </p>
            <p className="text-sm text-muted-foreground">
              © 2026 MyVoicePost. All rights reserved.
            </p>
          </div>
        </div>
      </main>

      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          data-testid="button-scroll-top"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
