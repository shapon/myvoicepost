import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  ArrowUp, Mail, Shield, Lock, Eye, Trash2, Download, 
  Settings, Globe, Check, Languages, CheckCircle2, Clock, Users, 
  Database, Cpu, MapPin, Bell, Cookie, Baby, Link2, FileText,
  Phone, ChevronDown, ChevronRight, AlertCircle, Server, Scale,
  Fingerprint, HelpCircle, Bookmark
} from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface QuickNavItem {
  id: string;
  label: string;
  icon: any;
}

const quickNavItems: QuickNavItem[] = [
  { id: "section-1", label: "What We Collect", icon: Database },
  { id: "section-2", label: "How We Use It", icon: Settings },
  { id: "section-3", label: "Who We Share With", icon: Users },
  { id: "section-4", label: "Data Retention", icon: Clock },
  { id: "section-5", label: "Your Rights", icon: Scale },
  { id: "section-6", label: "Access & Delete", icon: Trash2 },
  { id: "section-7", label: "Your Choices", icon: Check },
  { id: "section-8", label: "Security", icon: Lock },
  { id: "section-9", label: "Cookies", icon: Cookie },
  { id: "section-10", label: "AI & ML", icon: Cpu },
  { id: "section-11", label: "Data Transfers", icon: Globe },
  { id: "section-12", label: "Regional Laws", icon: MapPin },
  { id: "section-13", label: "Children", icon: Baby },
  { id: "section-14", label: "Third Parties", icon: Link2 },
  { id: "section-15", label: "Policy Changes", icon: FileText },
  { id: "section-16", label: "Contact Us", icon: Mail },
];

const retentionData = [
  { type: "Account Information", duration: "Active account duration", deletion: "30 days after account closure" },
  { type: "Audio Files (Free)", duration: "Immediately after transcription", deletion: "Within 24 hours" },
  { type: "Audio Files (Paid)", duration: "Per your settings (up to 1 year)", deletion: "When you delete or per settings" },
  { type: "Transcriptions (Free)", duration: "30 days", deletion: "After 30 days automatically" },
  { type: "Transcriptions (Paid)", duration: "Per your settings", deletion: "When you delete or per settings" },
  { type: "Usage Analytics", duration: "24 months", deletion: "After 24 months" },
  { type: "Payment Records", duration: "7 years", deletion: "Legal requirement for taxes" },
  { type: "Support Tickets", duration: "3 years", deletion: "After 3 years" },
  { type: "Marketing Preferences", duration: "Until you unsubscribe", deletion: "Immediately upon request" },
];

export default function PrivacyPolicy() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["section-1"]);
  const [activeSection, setActiveSection] = useState("");

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
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold" data-testid="text-privacy-title">Privacy Policy</h1>
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4" />
                Effective Date: February 29, 2026 | Version 1.0
              </p>
            </div>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            We believe in transparency and your right to privacy. This document explains how we handle your information 
            when you use our voice transcription and translation services. We've written it in plain language to make it easy to understand.
          </p>
        </div>

        <Card className="mb-8 bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-primary" />
              Quick Overview - The Essentials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Eye className="w-4 h-4" />
                  What we collect
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Your account details (email, name)
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Audio files you upload or record
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Transcriptions we create for you
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3 h-3 mt-1 text-green-500 flex-shrink-0" />
                    Basic usage information
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Lock className="w-4 h-4" />
                  What we don't do
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    We don't sell your personal information
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    We don't share transcriptions without permission
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertCircle className="w-3 h-3 mt-1 text-red-500 flex-shrink-0" />
                    We don't use your data for advertising
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Settings className="w-4 h-4" />
                  Your control
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <Trash2 className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Delete your data anytime
                  </li>
                  <li className="flex items-start gap-2">
                    <Download className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Export everything you've created
                  </li>
                  <li className="flex items-start gap-2">
                    <Cpu className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Opt out of AI training
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="w-3 h-3 mt-1 text-blue-500 flex-shrink-0" />
                    Close your account whenever you want
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <HelpCircle className="w-4 h-4" />
                  Questions?
                </h3>
                <p className="text-sm text-muted-foreground">
                  Email us anytime at:
                </p>
                <a 
                  href="mailto:privacy@myvoicepost.com" 
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  <Mail className="w-4 h-4" />
                  privacy@myvoicepost.com
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

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Full Privacy Policy</h2>
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
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">1. What Information We Collect</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Tabs defaultValue="direct" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="direct">You Provide</TabsTrigger>
                  <TabsTrigger value="automatic">Automatic</TabsTrigger>
                  <TabsTrigger value="connected">Connected Apps</TabsTrigger>
                  <TabsTrigger value="voice">Voice Data</TabsTrigger>
                </TabsList>
                <TabsContent value="direct" className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Account Setup</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Email address</strong> - For login and notifications</li>
                          <li><strong>Display name</strong> - How you appear in the app</li>
                          <li><strong>Password</strong> - Encrypted, never visible to us</li>
                          <li><strong>Profile photo</strong> - Optional</li>
                        </ul>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Your Content</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Audio recordings</strong> - Files you upload or record</li>
                          <li><strong>Transcription text</strong> - Written version of your audio</li>
                          <li><strong>Editing history</strong> - Changes you make</li>
                          <li><strong>Speaker labels</strong> - If you enable identification</li>
                        </ul>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Payment Information</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Billing name and address</strong> - For invoicing</li>
                          <li><strong>Payment card details</strong> - Securely processed by Stripe</li>
                          <li><strong>Transaction history</strong> - Records of your payments</li>
                        </ul>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Communications</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Support messages</strong> - Your questions and our responses</li>
                          <li><strong>Feedback</strong> - Ratings, reviews, suggestions</li>
                          <li><strong>Survey responses</strong> - If you participate</li>
                        </ul>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="automatic" className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Usage Information</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Feature usage</strong> - Which tools you use</li>
                          <li><strong>Session info</strong> - When and how long you use our app</li>
                          <li><strong>Actions taken</strong> - Creating, editing, sharing content</li>
                          <li><strong>Error reports</strong> - Technical issues encountered</li>
                        </ul>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Device Information</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <ul className="space-y-1">
                          <li><strong>Device type</strong> - Phone, tablet, computer</li>
                          <li><strong>Operating system</strong> - iOS, Android, Windows, Mac</li>
                          <li><strong>Browser</strong> - Chrome, Safari, Firefox, etc.</li>
                          <li><strong>IP address</strong> - Your internet connection location</li>
                        </ul>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="connected" className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">If you connect third-party apps:</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Calendar Integration</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        Meeting schedules, event titles, participants, calendar permissions
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Cloud Storage</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        File access for import/export, folder structure, sharing permissions
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Video Conferencing</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        Meeting recordings (only ones you authorize), participant info
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Social Login</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        Name, email, profile picture, account verification
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="voice" className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <Fingerprint className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800 dark:text-amber-200">Special Category Data</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          Your voice recordings may constitute biometric data in some regions. Here's how we handle them:
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">What we collect:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>- Raw audio files you upload or record</li>
                        <li>- Voice characteristics for speaker ID (if enabled)</li>
                        <li>- Audio metadata (length, format, quality)</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Your control:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>- Delete audio files anytime</li>
                        <li>- Disable speaker identification</li>
                        <li>- Opt out of AI training</li>
                        <li>- Export your voice data</li>
                      </ul>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-2" id="section-2" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">2. How We Use Your Information</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Providing Our Core Service
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                      <li>- Processing your audio into text</li>
                      <li>- Identifying speakers in conversations</li>
                      <li>- Generating timestamps and summaries</li>
                      <li>- Managing your account and subscription</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Improving Our Service
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                      <li>- Understanding which features are most useful</li>
                      <li>- Identifying bugs and technical issues</li>
                      <li>- Testing new features before launch</li>
                      <li>- Optimizing app performance</li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-purple-500" />
                      AI & Machine Learning
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                      <li>- Using de-identified transcriptions to improve accuracy</li>
                      <li>- Teaching AI to understand different accents</li>
                      <li>- Expanding language support</li>
                      <li>- <strong>Opt-out available</strong> - Email us to exclude your data</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Lock className="w-4 h-4 text-red-500" />
                      Security & Legal
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                      <li>- Detecting fraudulent activity</li>
                      <li>- Preventing abuse and spam</li>
                      <li>- Complying with legal obligations</li>
                      <li>- Protecting legal rights</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-3" id="section-3" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-semibold">3. Who We Share Information With</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 mb-6">
                <p className="text-green-800 dark:text-green-200 font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  We don't sell your personal information. Ever.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      Cloud Infrastructure
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    AWS, Google Cloud - Hosts our servers, stores encrypted data
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      AI & Transcription
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    OpenAI, Gemini - Powers AI features and transcription
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Scale className="w-4 h-4" />
                      Payment Processing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Stripe - Handles all payment transactions securely
                  </CardContent>
                </Card>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Legal Requirements:</p>
                <p>We may disclose information when legally required (court orders, law enforcement, regulatory compliance).</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-4" id="section-4" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="font-semibold">4. How Long We Keep Your Data</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Data Type</th>
                      <th className="text-left py-2 px-3 font-medium">How Long We Keep It</th>
                      <th className="text-left py-2 px-3 font-medium">When We Delete It</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retentionData.map((row, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="py-2 px-3 font-medium">{row.type}</td>
                        <td className="py-2 px-3 text-muted-foreground">{row.duration}</td>
                        <td className="py-2 px-3 text-muted-foreground">{row.deletion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">When You Delete Data:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>- <strong>Immediate:</strong> Removed from active systems within minutes</li>
                  <li>- <strong>Complete:</strong> Permanently removed within 30 days</li>
                  <li>- <strong>Backups:</strong> Erased from backups within 90 days</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-5" id="section-5" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">5. Your Privacy Rights</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border-green-200 dark:border-green-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Eye className="w-4 h-4 text-green-600" />
                      Access Your Data
                    </h4>
                    <p className="text-sm text-muted-foreground">Get a copy of all personal information we have about you.</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Correct Information
                    </h4>
                    <p className="text-sm text-muted-foreground">Fix any inaccurate or incomplete information about you.</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 dark:border-red-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      Delete Your Data
                    </h4>
                    <p className="text-sm text-muted-foreground">Permanently remove your personal information.</p>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 dark:border-purple-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Download className="w-4 h-4 text-purple-600" />
                      Export Your Data
                    </h4>
                    <p className="text-sm text-muted-foreground">Download everything in portable formats (TXT, DOCX, JSON).</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 dark:border-orange-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Bell className="w-4 h-4 text-orange-600" />
                      Opt Out of Marketing
                    </h4>
                    <p className="text-sm text-muted-foreground">Stop receiving promotional emails anytime.</p>
                  </CardContent>
                </Card>
                <Card className="border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Cookie className="w-4 h-4 text-yellow-600" />
                      Control Cookies
                    </h4>
                    <p className="text-sm text-muted-foreground">Decide which cookies can track you.</p>
                  </CardContent>
                </Card>
              </div>
              <div className="mt-6 grid sm:grid-cols-3 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-950/30">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">EU/UK/Swiss Residents</h4>
                    <p className="text-sm text-muted-foreground">Additional GDPR rights including right to restrict processing, object to processing, and lodge complaints.</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-950/30">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">California Residents</h4>
                    <p className="text-sm text-muted-foreground">CCPA/CPRA rights including right to know, non-discrimination, and opt-out of data sharing.</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-950/30">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Canadian Residents</h4>
                    <p className="text-sm text-muted-foreground">PIPEDA rights including explanation, withdraw consent, and challenge our use.</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-6" id="section-6" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold">6. How to Access or Delete Your Data</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Self-Service (Instant)</h4>
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Through Your Account Settings:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal ml-4">
                      <li>Log in to your account</li>
                      <li>Navigate to Settings &gt; Privacy & Data</li>
                      <li>Choose: View, Download, or Delete</li>
                    </ol>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="font-medium">Request by Email</h4>
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">For complex requests:</p>
                    <p className="text-sm text-muted-foreground">
                      Email: <a href="mailto:privacy@myvoicepost.com" className="text-primary hover:underline">privacy@myvoicepost.com</a>
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Response time:</strong> 5 business days to acknowledge, 30 days to complete
                    </p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-7" id="section-7" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-7">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <span className="font-semibold">7. Your Choices About Data Collection</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Mobile Permissions</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Microphone:</strong> Required for recording</p>
                    <p><strong>Storage:</strong> Save files locally</p>
                    <p><strong>Notifications:</strong> Alert when transcriptions ready</p>
                    <p><strong>Location:</strong> Optional features only</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cookie Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Essential:</strong> Cannot be disabled (required)</p>
                    <p><strong>Functional:</strong> Enhanced features</p>
                    <p><strong>Analytics:</strong> Usage tracking (optional)</p>
                    <p><strong>Marketing:</strong> Personalized content (optional)</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-8" id="section-8" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">8. Security Measures We Take</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { icon: Lock, title: "Encryption in Transit", desc: "SSL/TLS for all data transmission" },
                  { icon: Database, title: "Encryption at Rest", desc: "AES-256 encryption for stored data" },
                  { icon: Shield, title: "Regular Audits", desc: "Security testing and penetration tests" },
                  { icon: Fingerprint, title: "Two-Factor Auth", desc: "Optional 2FA for added security" },
                  { icon: CheckCircle2, title: "SOC 2 Type II", desc: "Industry-standard compliance" },
                  { icon: Eye, title: "Access Controls", desc: "Strict employee data access policies" },
                ].map((item, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4 flex items-start gap-3">
                      <item.icon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-9" id="section-9" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-9">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <Cookie className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <span className="font-semibold">9. Cookies & Tracking</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">We use cookies to provide and improve our service. Here's what each type does:</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-1">Essential Cookies</h4>
                    <p className="text-xs text-muted-foreground">Required for authentication, security, and core functionality. Cannot be disabled.</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-1">Functional Cookies</h4>
                    <p className="text-xs text-muted-foreground">Remember your preferences and enhance features. Optional.</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-1">Analytics Cookies</h4>
                    <p className="text-xs text-muted-foreground">Help us understand usage patterns and improve the service. Optional.</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium text-sm mb-1">Marketing Cookies</h4>
                    <p className="text-xs text-muted-foreground">For personalized content (if applicable). Optional.</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Manage preferences through your browser settings or our cookie consent banner.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-10" id="section-10" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-semibold">10. AI & Machine Learning</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">How We Use AI:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Speech-to-text transcription</li>
                      <li>- Language detection and translation</li>
                      <li>- Speaker identification (optional)</li>
                      <li>- Summarization and key points</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">AI Training:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- De-identified data improves accuracy</li>
                      <li>- Personal info is removed before training</li>
                      <li>- Manual review only with explicit consent</li>
                      <li>- <strong>You can opt out anytime</strong></li>
                    </ul>
                  </div>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-medium mb-2">How to Opt Out of AI Training:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal ml-4">
                    <li>Go to Account Settings &gt; Privacy</li>
                    <li>Find "AI & Machine Learning" section</li>
                    <li>Toggle "Use my data to improve AI" to OFF</li>
                  </ol>
                  <p className="text-sm text-muted-foreground mt-2">Or email privacy@myvoicepost.com with subject "AI Training Opt-Out"</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-11" id="section-11" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-11">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">11. International Data Transfers</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We operate globally, which means your data may be transferred across borders. We use Standard Contractual Clauses (SCCs) and other safeguards to protect your data.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Primary Storage:</h4>
                    <p className="text-sm text-muted-foreground">United States (AWS, Google Cloud)</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Processing Locations:</h4>
                    <p className="text-sm text-muted-foreground">AI providers, payment processing, analytics</p>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Protections We Use:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- EU-approved Standard Contractual Clauses</li>
                    <li>- Data Privacy Framework certification</li>
                    <li>- Encryption in transit and at rest</li>
                    <li>- Contractual obligations on all processors</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-12" id="section-12" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-12">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="font-semibold">12. Regional Privacy Laws</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">EU (GDPR)</h4>
                    <p className="text-sm text-muted-foreground">Full GDPR compliance with rights to access, rectification, erasure, and data portability.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">UK (UK GDPR)</h4>
                    <p className="text-sm text-muted-foreground">Similar to EU GDPR. Complaints to ICO at ico.org.uk</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">California (CCPA/CPRA)</h4>
                    <p className="text-sm text-muted-foreground">Right to know, delete, correct, and opt-out of data sharing.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Canada (PIPEDA)</h4>
                    <p className="text-sm text-muted-foreground">10 Fair Information Principles compliance.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Brazil (LGPD)</h4>
                    <p className="text-sm text-muted-foreground">Rights to confirmation, access, correction, and portability.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Australia/NZ</h4>
                    <p className="text-sm text-muted-foreground">Compliance with Australian Privacy Principles and NZ Privacy Act.</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-13" id="section-13" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-13">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                  <Baby className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                </div>
                <span className="font-semibold">13. Children's Privacy</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-200">Age Restrictions</h4>
                    <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1">
                      <li>- Must be at least 18 years old to use our service</li>
                      <li>- We don't knowingly collect information from anyone under 18</li>
                      <li>- We don't market to children</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <h4 className="font-medium mb-2">If we discover child data:</h4>
                <p className="text-sm text-muted-foreground">
                  We immediately suspend the account, contact the account holder, and delete all information within 48 hours. 
                  If you're a parent and believe your child is using our service, email privacy@myvoicepost.com.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-14" id="section-14" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-14">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <span className="font-semibold">14. Third-Party Services</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Our service integrates with other platforms. When you connect a service, you authorize limited access that you can revoke anytime.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {["Cloud Storage", "Calendar", "Video Conferencing", "Productivity"].map((category) => (
                  <Card key={category}>
                    <CardContent className="pt-4">
                      <h4 className="font-medium text-sm">{category}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connected apps have their own privacy policies that also apply.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Manage connections in Account Settings &gt; Connected Apps. You can disconnect anytime.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-15" id="section-15" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-15">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <span className="font-semibold">15. Changes to This Policy</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Minor Changes:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Updated online and in-app notice</li>
                      <li>- No additional notification</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Major Changes:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>- Email notification to you</li>
                      <li>- 30 days advance notice</li>
                      <li>- Option to review before they apply</li>
                    </ul>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Continuing to use our service after changes means you accept them. Previous versions available upon request.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="section-16" id="section-16" className="border rounded-xl px-4 bg-card">
            <AccordionTrigger className="text-left hover:no-underline" data-testid="accordion-section-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold">16. Contact Us</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <Card className="border-primary/20">
                    <CardContent className="pt-4">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-primary" />
                        Privacy Team
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        <a href="mailto:privacy@myvoicepost.com" className="text-primary hover:underline">privacy@myvoicepost.com</a>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Response within 10 business days</p>
                    </CardContent>
                  </Card>
                  <Card className="border-red-200 dark:border-red-800">
                    <CardContent className="pt-4">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        Security Issues
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        <a href="mailto:security@myvoicepost.com" className="text-primary hover:underline">security@myvoicepost.com</a>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Response within 48 hours</p>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <h4 className="font-medium mb-3">Response Times:</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">General inquiry</span>
                      <span>5 business days</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Security issue</span>
                      <span>48 hours</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Data access request</span>
                      <span>30 days</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Data deletion request</span>
                      <span>30 days</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Privacy violation report</span>
                      <span>24 hours</span>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Card className="mt-8 bg-gradient-to-br from-primary/5 to-purple-500/5 border-primary/20">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Quick Reference - Common Questions</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">How do I delete my account?</p>
                <p className="text-muted-foreground">Account Settings &gt; Delete Account, or email privacy@myvoicepost.com</p>
              </div>
              <div>
                <p className="font-medium">How do I download my data?</p>
                <p className="text-muted-foreground">Account Settings &gt; Export Data</p>
              </div>
              <div>
                <p className="font-medium">How do I stop marketing emails?</p>
                <p className="text-muted-foreground">Click "unsubscribe" in any email, or Account Settings &gt; Notifications</p>
              </div>
              <div>
                <p className="font-medium">Do you sell my data?</p>
                <p className="text-muted-foreground">No, we never sell personal information.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground border-t pt-8">
          <p>Last updated: February 29, 2026 | Version 1.0</p>
          <p className="mt-1">(c) 2026 MyVoicePost. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link href="/terms">
              <Button variant="ghost" size="sm">Terms of Service</Button>
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
      <Footer />
    </div>
  );
}
