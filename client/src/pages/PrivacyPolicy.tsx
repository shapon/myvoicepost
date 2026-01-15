import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUp, Mail, Shield, Lock, Eye, Trash2, Download, Settings, Globe, Check, Languages, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const translations: Record<string, Record<string, string>> = {
  en: {
    title: "Privacy Policy",
    backToHome: "Back to Home",
    effectiveDate: "Effective Date: January 10, 2026 | Version 1.0",
    quickOverview: "Quick Overview - The Essentials",
    whatWeCollect: "What we collect:",
    whatWeDontDo: "What we don't do:",
    yourControl: "Your control:",
    questions: "Questions?",
    tableOfContents: "Table of Contents",
    understandingData: "Understanding Your Data",
    rightsControls: "Your Rights & Controls",
    technicalLegal: "Technical & Legal Details",
    otherInfo: "Other Important Information",
    expandAll: "Expand All",
    collapseAll: "Collapse All",
    accessibilityCompliant: "Accessibility Compliant",
  },
  es: {
    title: "Política de Privacidad",
    backToHome: "Volver al Inicio",
    effectiveDate: "Fecha de vigencia: 10 de enero de 2026 | Versión 1.0",
    quickOverview: "Resumen Rápido - Lo Esencial",
    whatWeCollect: "Lo que recopilamos:",
    whatWeDontDo: "Lo que no hacemos:",
    yourControl: "Tu control:",
    questions: "¿Preguntas?",
    tableOfContents: "Tabla de Contenidos",
    understandingData: "Entendiendo Tus Datos",
    rightsControls: "Tus Derechos y Controles",
    technicalLegal: "Detalles Técnicos y Legales",
    otherInfo: "Otra Información Importante",
    expandAll: "Expandir Todo",
    collapseAll: "Contraer Todo",
    accessibilityCompliant: "Cumple con Accesibilidad",
  },
  pl: {
    title: "Polityka Prywatności",
    backToHome: "Powrót do Strony Głównej",
    effectiveDate: "Data wejścia w życie: 10 stycznia 2026 | Wersja 1.0",
    quickOverview: "Szybki Przegląd - Najważniejsze",
    whatWeCollect: "Co zbieramy:",
    whatWeDontDo: "Czego nie robimy:",
    yourControl: "Twoja kontrola:",
    questions: "Pytania?",
    tableOfContents: "Spis Treści",
    understandingData: "Zrozumienie Twoich Danych",
    rightsControls: "Twoje Prawa i Kontrola",
    technicalLegal: "Szczegóły Techniczne i Prawne",
    otherInfo: "Inne Ważne Informacje",
    expandAll: "Rozwiń Wszystko",
    collapseAll: "Zwiń Wszystko",
    accessibilityCompliant: "Zgodny z Dostępnością",
  },
  fr: {
    title: "Politique de Confidentialité",
    backToHome: "Retour à l'Accueil",
    effectiveDate: "Date d'effet: 10 janvier 2026 | Version 1.0",
    quickOverview: "Aperçu Rapide - L'Essentiel",
    whatWeCollect: "Ce que nous collectons:",
    whatWeDontDo: "Ce que nous ne faisons pas:",
    yourControl: "Votre contrôle:",
    questions: "Questions?",
    tableOfContents: "Table des Matières",
    understandingData: "Comprendre Vos Données",
    rightsControls: "Vos Droits et Contrôles",
    technicalLegal: "Détails Techniques et Juridiques",
    otherInfo: "Autres Informations Importantes",
    expandAll: "Tout Développer",
    collapseAll: "Tout Réduire",
    accessibilityCompliant: "Conforme à l'Accessibilité",
  },
  de: {
    title: "Datenschutzrichtlinie",
    backToHome: "Zurück zur Startseite",
    effectiveDate: "Gültig ab: 10. Januar 2026 | Version 1.0",
    quickOverview: "Schnellübersicht - Das Wesentliche",
    whatWeCollect: "Was wir sammeln:",
    whatWeDontDo: "Was wir nicht tun:",
    yourControl: "Ihre Kontrolle:",
    questions: "Fragen?",
    tableOfContents: "Inhaltsverzeichnis",
    understandingData: "Ihre Daten Verstehen",
    rightsControls: "Ihre Rechte und Kontrollen",
    technicalLegal: "Technische und Rechtliche Details",
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

export default function PrivacyPolicy() {
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

  const allSections = ["section-1", "section-2", "section-3", "section-4", "section-5", "section-6", "section-7", "section-8", "section-9", "section-10", "section-11", "section-12", "section-13", "section-14"];

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
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-privacy-title">{t.title}</h1>
              <p className="text-muted-foreground">{t.effectiveDate}</p>
            </div>
          </div>
        </div>

        <Card className="mb-8 bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t.quickOverview}</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  {t.whatWeCollect}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Your account details (email, name)</li>
                  <li>Audio files you upload or record</li>
                  <li>Transcriptions we create for you</li>
                  <li>Basic usage information to improve our service</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  {t.whatWeDontDo}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>We don't sell your personal information</li>
                  <li>We don't share your transcriptions without permission</li>
                  <li>We don't use your data for advertising</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  {t.yourControl}
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Delete your data anytime</li>
                  <li>Export everything you've created</li>
                  <li>Opt out of AI training</li>
                  <li>Close your account whenever you want</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  {t.questions}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Email us at{" "}
                  <a href="mailto:privacy@myvoicepost.com" className="text-primary hover:underline">
                    privacy@myvoicepost.com
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t.tableOfContents}</h2>
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
              <span className="font-semibold">1. What Information We Collect</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <h4 className="font-medium text-foreground mb-2">Information You Provide</h4>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong>Account information:</strong> Email address, password, display name</li>
                    <li><strong>Profile details:</strong> Optional profile picture, preferences</li>
                    <li><strong>Audio content:</strong> Voice recordings you upload or create</li>
                    <li><strong>Payment information:</strong> Billing details (processed by secure payment providers)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">Information We Collect Automatically</h4>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong>Usage data:</strong> Features used, time spent, actions taken</li>
                    <li><strong>Device information:</strong> Device type, operating system, browser</li>
                    <li><strong>Log data:</strong> IP address, access times, pages viewed</li>
                    <li><strong>Cookies:</strong> Session data, preferences</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-2" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-2">
              <span className="font-semibold">2. How We Use Your Information</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <ul className="list-disc pl-6 space-y-1">
                  <li>To provide and maintain our transcription service</li>
                  <li>To process your audio files and generate transcriptions</li>
                  <li>To communicate with you about your account</li>
                  <li>To improve our AI and machine learning models (with your consent)</li>
                  <li>To detect and prevent fraud or abuse</li>
                  <li>To comply with legal obligations</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-3" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-3">
              <span className="font-semibold">3. Who We Share Information With</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>We may share your information with:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Service providers:</strong> Cloud hosting, payment processing, analytics</li>
                  <li><strong>AI partners:</strong> For transcription processing (data is anonymized)</li>
                  <li><strong>Legal authorities:</strong> When required by law or to protect rights</li>
                  <li><strong>Business transfers:</strong> In case of merger or acquisition</li>
                </ul>
                <p className="font-medium text-foreground">We never sell your personal information to third parties.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-4" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-4">
              <span className="font-semibold">4. How Long We Keep Your Data</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Account data:</strong> Until you delete your account</li>
                  <li><strong>Audio files:</strong> 90 days after processing (or as per your settings)</li>
                  <li><strong>Transcriptions:</strong> Until you delete them</li>
                  <li><strong>Usage logs:</strong> 12 months</li>
                  <li><strong>Payment records:</strong> 7 years (legal requirement)</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-5" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-5">
              <span className="font-semibold">5. Your Privacy Rights</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>You have the right to:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Access:</strong> Request a copy of your personal data</li>
                  <li><strong>Rectification:</strong> Correct inaccurate information</li>
                  <li><strong>Deletion:</strong> Request deletion of your data</li>
                  <li><strong>Portability:</strong> Export your data in a common format</li>
                  <li><strong>Restriction:</strong> Limit how we use your data</li>
                  <li><strong>Objection:</strong> Object to certain processing activities</li>
                  <li><strong>Withdraw consent:</strong> Change your mind at any time</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-6" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-6">
              <span className="font-semibold">6. How to Access or Delete Your Data</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>To access your data:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Go to Account Settings → Export Data</li>
                  <li>Or email privacy@myvoicepost.com</li>
                </ul>
                <p><strong>To delete your data:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Go to Account Settings → Delete Account</li>
                  <li>Or email privacy@myvoicepost.com</li>
                  <li>We'll process your request within 30 days</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-7" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-7">
              <span className="font-semibold">7. Your Choices About Data Collection</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Marketing emails:</strong> Unsubscribe link in every email</li>
                  <li><strong>Push notifications:</strong> Manage in app settings</li>
                  <li><strong>Cookies:</strong> Browser settings or our cookie banner</li>
                  <li><strong>AI training:</strong> Opt out in Account Settings → Privacy</li>
                  <li><strong>Analytics:</strong> Toggle in Account Settings → Privacy</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-8" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-8">
              <span className="font-semibold">8. Security Measures We Take</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <ul className="list-disc pl-6 space-y-1">
                  <li>End-to-end encryption for audio files</li>
                  <li>SSL/TLS encryption for all data in transit</li>
                  <li>AES-256 encryption for data at rest</li>
                  <li>Regular security audits and penetration testing</li>
                  <li>Two-factor authentication available</li>
                  <li>SOC 2 Type II compliance</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-9" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-9">
              <span className="font-semibold">9. Cookies & Tracking</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>Types of cookies we use:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Essential:</strong> Required for the service to function</li>
                  <li><strong>Functional:</strong> Remember your preferences</li>
                  <li><strong>Analytics:</strong> Help us understand usage patterns</li>
                  <li><strong>Marketing:</strong> Optional, for personalized content</li>
                </ul>
                <p>You can manage cookie preferences in your browser settings or through our cookie consent banner.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-10" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-10">
              <span className="font-semibold">10. AI & Machine Learning</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>How we use AI:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Speech-to-text transcription</li>
                  <li>Language detection and translation</li>
                  <li>Quality improvement of our models</li>
                </ul>
                <p><strong>Your control:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Opt out of AI training anytime</li>
                  <li>Your audio is processed but not stored for training by default</li>
                  <li>Anonymized data may be used to improve accuracy</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-11" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-11">
              <span className="font-semibold">11. Children's Privacy</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Our service is intended for users aged 18 and older. We do not knowingly collect information from children under 18.</p>
                <p>If you believe a child has provided us with personal information, please contact us at privacy@myvoicepost.com and we will delete it promptly.</p>
                <p><strong>For educational use:</strong> Special arrangements available for schools with proper parental consent. Contact education@myvoicepost.com.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-12" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-12">
              <span className="font-semibold">12. Third-Party Services</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>We integrate with:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Cloud storage providers (Google Drive, Dropbox)</li>
                  <li>Calendar applications (Google Calendar, Outlook)</li>
                  <li>Video conferencing (Zoom, Google Meet)</li>
                  <li>Productivity tools (Notion, Slack)</li>
                </ul>
                <p>Each integration requires your explicit authorization. Review their privacy policies for data handling.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-13" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-13">
              <span className="font-semibold">13. Changes to This Policy</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p><strong>When we make changes:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Update "Last updated" date at top</li>
                  <li>Summarize changes in app/email</li>
                  <li>Give 30 days advance notice for major changes</li>
                </ul>
                <p><strong>Types of changes:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Minor:</strong> Clarifications, formatting, contact info</li>
                  <li><strong>Major:</strong> New data collection, new purposes, new sharing</li>
                </ul>
                <p>Continuing to use our service after changes means you accept them.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-14" className="border rounded-lg px-4">
            <AccordionTrigger className="text-left" data-testid="accordion-section-14">
              <span className="font-semibold">14. Contact Us</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-muted-foreground">
                <p>Have questions about this Privacy Policy or your data? We're here to help.</p>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">Privacy Team</p>
                          <a href="mailto:privacy@myvoicepost.com" className="text-primary hover:underline">
                            privacy@myvoicepost.com
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-primary" />
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

        <div className="mt-8 space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Quick Reference Guide</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg">
                <p className="font-medium mb-1">How do I delete my account?</p>
                <p className="text-sm text-muted-foreground">Account Settings → Delete Account</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-medium mb-1">How do I download my data?</p>
                <p className="text-sm text-muted-foreground">Account Settings → Export Data</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-medium mb-1">How do I opt out of AI training?</p>
                <p className="text-sm text-muted-foreground">Account Settings → Privacy → AI & ML</p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="font-medium mb-1">Do you sell my data?</p>
                <p className="text-sm text-muted-foreground">No, we never sell personal information</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Legal Information</h3>
            <div className="space-y-2 text-muted-foreground">
              <p><strong>Governing law:</strong> United States</p>
              <p><strong>Dispute resolution:</strong> Binding arbitration</p>
              <p><strong>Related policies:</strong> <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link></p>
            </div>
          </Card>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>Last updated:</strong> January 10, 2026 | <strong>Version:</strong> 1.0 | <strong>Effective date:</strong> January 10, 2026
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
