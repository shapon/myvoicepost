import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Cookie, ArrowUp, Info, AlertTriangle, CheckCircle2, Settings,
  BarChart3, Target, Globe, Mail, MapPin, ExternalLink, Shield,
  Eye, Zap, RefreshCw, Clock
} from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

const tocItems = [
  { id: "intro", label: "Introduction", icon: Cookie },
  { id: "what-are-cookies", label: "What Are Cookies?", icon: Info },
  { id: "why-we-use", label: "Why We Use Cookies", icon: Settings },
  { id: "cookies-we-use", label: "Cookies We Use", icon: Shield },
  { id: "manage-cookies", label: "Managing Cookies", icon: Settings },
  { id: "other-tracking", label: "Other Tracking Tech", icon: Eye },
  { id: "targeted-ads", label: "Targeted Advertising", icon: Target },
  { id: "policy-updates", label: "Policy Updates", icon: RefreshCw },
  { id: "contact", label: "Contact Us", icon: Mail },
];

const essentialCookies = [
  { name: "cc_cookie", provider: "MyVoicePost", purpose: "Stores your cookie consent preferences", expiry: "6 months", type: "First-Party" },
  { name: "csrf_token", provider: "MyVoicePost", purpose: "Protects against cross-site request forgery attacks", expiry: "Session", type: "First-Party" },
];

const functionalCookies = [
  { name: "cache-sprite-plyr", provider: "Plyr", purpose: "Caches media player sprites for faster loading", expiry: "Persistent", type: "First-Party" },
];

const analyticsCookies = [
  { name: "_ga", provider: "Google Analytics", purpose: "Distinguishes unique users and sessions", expiry: "13 months", type: "Third-Party" },
  { name: "_ga_*", provider: "Google Analytics", purpose: "Maintains session state for Google Analytics 4", expiry: "13 months", type: "Third-Party" },
  { name: "AMP_*", provider: "Amplitude", purpose: "Tracks product analytics and user behavior", expiry: "1 year", type: "Third-Party" },
];

const marketingCookies = [
  { name: "_fbp", provider: "Meta (Facebook)", purpose: "Tracks visits across websites for advertising", expiry: "3 months", type: "Third-Party" },
  { name: "lastExternalReferrer", provider: "Meta (Facebook)", purpose: "Records referral source for attribution", expiry: "Persistent", type: "Third-Party" },
];

function CookieTable({ cookies }: { cookies: typeof essentialCookies }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-4 py-3 font-semibold text-foreground">Cookie Name</th>
            <th className="text-left px-4 py-3 font-semibold text-foreground">Provider</th>
            <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Purpose</th>
            <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Expiration</th>
            <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Type</th>
          </tr>
        </thead>
        <tbody>
          {cookies.map((cookie, i) => (
            <tr
              key={cookie.name}
              className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
            >
              <td className="px-4 py-3">
                <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">{cookie.name}</code>
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cookie.provider}</td>
              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{cookie.purpose}</td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cookie.expiry}</td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {cookie.type}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ type, children }: { type: "info" | "warning"; children: React.ReactNode }) {
  const isWarning = type === "warning";
  return (
    <div className={`flex gap-3 rounded-lg p-4 text-sm ${isWarning ? "bg-amber-500/10 border border-amber-500/20" : "bg-primary/10 border border-primary/20"}`}>
      <div className="shrink-0 mt-0.5">
        {isWarning
          ? <AlertTriangle className="w-4 h-4 text-amber-500" />
          : <Info className="w-4 h-4 text-primary" />}
      </div>
      <div className={isWarning ? "text-amber-200/90" : "text-foreground/80"}>{children}</div>
    </div>
  );
}

export default function CookiePolicy() {
  const [activeSection, setActiveSection] = useState("intro");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);

      const sections = tocItems.map(item => document.getElementById(item.id));
      const scrollPos = window.scrollY + 120;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = sections[i];
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(tocItems[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 90;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <div className="pt-20 pb-10 border-b border-border bg-gradient-to-br from-background via-background to-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shrink-0">
              <Cookie className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  Last Updated: May 31, 2026
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  GDPR Compliant
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ePrivacy Compliant
                </Badge>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold" data-testid="text-cookie-title">Cookie Policy</h1>
              <p className="text-muted-foreground mt-1 max-w-xl">
                This policy explains how MyVoicePost uses cookies and similar tracking technologies on our platform.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-10">

          {/* Sticky TOC */}
          <aside className="lg:w-64 shrink-0">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">On this page</p>
              <nav className="space-y-1" data-testid="nav-toc">
                {tocItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                      data-testid={`toc-${item.id}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-12">

            {/* Introduction */}
            <section id="intro" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Introduction</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                MyVoicePost ("we", "us", "our") uses cookies and similar technologies on{" "}
                <a href="https://myvoicepost.com" className="text-primary hover:underline">myvoicepost.com</a>{" "}
                to provide, secure, and improve our voice transcription and AI text-polishing services.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                This Cookie Policy explains what cookies are, which ones we use, why we use them, and how you can manage your preferences. By continuing to use our platform, you acknowledge this policy.
              </p>
              <Callout type="info">
                This policy applies to our website and web app only. Our mobile apps (iOS and Android) use device-specific tracking identifiers governed by your operating system's privacy settings.
              </Callout>
            </section>

            {/* What Are Cookies */}
            <section id="what-are-cookies" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">What Are Cookies?</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Cookies are small text files stored on your device by your browser when you visit a website. They are widely used to make websites work efficiently and to provide information to site owners.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      First-Party Cookies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Set directly by MyVoicePost. Used for authentication, security, and improving your experience on our platform.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-purple-500" />
                      </div>
                      Third-Party Cookies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Set by our trusted service providers (e.g. Google Analytics, Meta) when you interact with features powered by those services.</p>
                  </CardContent>
                </Card>
              </div>
              <p className="text-muted-foreground leading-relaxed mt-4 text-sm">
                Cookies can be <strong className="text-foreground">session cookies</strong> (deleted when you close your browser) or <strong className="text-foreground">persistent cookies</strong> (stored for a defined period).
              </p>
            </section>

            {/* Why We Use */}
            <section id="why-we-use" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Why We Use Cookies</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                We use cookies for four core purposes. Some are essential to the platform functioning at all; others you can opt out of.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Shield, color: "text-green-500", bg: "bg-green-500/10", title: "Strictly Necessary", desc: "These cookies are required for the website to work. They enable core features like secure login, session management, and CSRF protection. They cannot be disabled.", optional: false },
                  { icon: Zap, color: "text-blue-500", bg: "bg-blue-500/10", title: "Functional", desc: "Enhance your experience by remembering preferences such as media player settings and UI state. Disabling them may affect how features look and behave.", optional: true },
                  { icon: BarChart3, color: "text-purple-500", bg: "bg-purple-500/10", title: "Analytics", desc: "Help us understand how visitors use our platform — which pages are most visited, where users drop off, and how we can improve the experience.", optional: true },
                  { icon: Target, color: "text-orange-500", bg: "bg-orange-500/10", title: "Marketing", desc: "Allow us to show you relevant ads on other platforms based on your interaction with our website. Used for retargeting and campaign measurement.", optional: true },
                ].map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.title} className="flex gap-4 p-4 rounded-lg border border-border">
                      <div className={`w-9 h-9 rounded-lg ${cat.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`w-5 h-5 ${cat.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{cat.title}</span>
                          {cat.optional
                            ? <Badge variant="outline" className="text-xs">Optional</Badge>
                            : <Badge className="text-xs bg-green-600 text-white hover:bg-green-600">Required</Badge>
                          }
                        </div>
                        <p className="text-sm text-muted-foreground">{cat.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Cookies We Use */}
            <section id="cookies-we-use" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Cookies We Use</h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Below is a complete list of cookies currently used on myvoicepost.com, organised by category.
              </p>

              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md bg-green-500/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-green-500" />
                    </div>
                    <h3 className="font-semibold text-lg">Essential Cookies</h3>
                    <Badge className="text-xs bg-green-600 text-white hover:bg-green-600">Always Active</Badge>
                  </div>
                  <Callout type="warning">
                    Disabling essential cookies will cause parts of our platform — including login and security features — to stop working properly.
                  </Callout>
                  <div className="mt-3">
                    <CookieTable cookies={essentialCookies} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-lg">Functional Cookies</h3>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  <CookieTable cookies={functionalCookies} />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md bg-purple-500/10 flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-purple-500" />
                    </div>
                    <h3 className="font-semibold text-lg">Analytics Cookies</h3>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  <Callout type="info">
                    Analytics data is aggregated and anonymised where possible. We use it solely to improve our platform — never to profile individual users for advertising.
                  </Callout>
                  <div className="mt-3">
                    <CookieTable cookies={analyticsCookies} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-md bg-orange-500/10 flex items-center justify-center">
                      <Target className="w-4 h-4 text-orange-500" />
                    </div>
                    <h3 className="font-semibold text-lg">Marketing Cookies</h3>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  <CookieTable cookies={marketingCookies} />
                </div>
              </div>
            </section>

            {/* Manage Cookies */}
            <section id="manage-cookies" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Managing Cookies</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                You have several ways to control cookies. Note that restricting certain cookies may affect how the platform functions.
              </p>

              <h3 className="font-semibold mb-3">Browser Settings</h3>
              <p className="text-sm text-muted-foreground mb-4">Most browsers let you view, block, or delete cookies. Follow the instructions for your browser:</p>
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {[
                  { name: "Google Chrome", url: "https://support.google.com/chrome/answer/95647" },
                  { name: "Apple Safari", url: "https://support.apple.com/guide/safari/sfri11471" },
                  { name: "Mozilla Firefox", url: "https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" },
                  { name: "Microsoft Edge", url: "https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" },
                ].map((browser) => (
                  <a
                    key={browser.name}
                    href={browser.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                    data-testid={`link-browser-${browser.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span className="text-sm font-medium">{browser.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </a>
                ))}
              </div>

              <h3 className="font-semibold mb-3">Industry Opt-Out Tools</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { name: "Digital Advertising Alliance (DAA)", url: "https://optout.aboutads.info/" },
                  { name: "Network Advertising Initiative (NAI)", url: "https://optout.networkadvertising.org/" },
                  { name: "Google Analytics Opt-Out", url: "https://tools.google.com/dlpage/gaoptout" },
                  { name: "Facebook Ad Preferences", url: "https://www.facebook.com/adpreferences/ad_settings" },
                ].map((tool) => (
                  <a
                    key={tool.name}
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                    data-testid={`link-optout-${tool.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span className="text-sm font-medium">{tool.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </a>
                ))}
              </div>
            </section>

            {/* Other Tracking */}
            <section id="other-tracking" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Other Tracking Technologies</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                In addition to cookies, we may use the following technologies on our platform:
              </p>
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-border">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    Web Beacons
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Also known as "pixel tags" or "clear GIFs", web beacons are tiny transparent images embedded in emails and web pages. They allow us to track whether an email has been opened or a page has been viewed, and to count the number of visitors to our site.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Tracking Pixels
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    We may use conversion pixels placed by advertising networks (such as Meta Pixel) to measure the effectiveness of our advertising campaigns and understand which actions users take after viewing our ads.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-border">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Local Storage
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    We may store certain preferences and session data in your browser's local storage. Unlike cookies, this data is not transmitted to our servers automatically but may be read by our web app to personalise your experience.
                  </p>
                </div>
              </div>
            </section>

            {/* Targeted Advertising */}
            <section id="targeted-ads" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Targeted Advertising</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may use information collected through marketing cookies to serve you relevant advertisements on third-party platforms such as Meta (Facebook/Instagram) and Google.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                This helps us reach new customers who are likely to be interested in MyVoicePost and to re-engage users who have visited our platform. We do not sell your personal data to advertisers.
              </p>
              <Callout type="info">
                You can opt out of interest-based advertising at any time using the tools listed in the <button onClick={() => scrollToSection("manage-cookies")} className="text-primary hover:underline font-medium">Managing Cookies</button> section above, or by adjusting your ad settings directly within each platform.
              </Callout>
            </section>

            {/* Policy Updates */}
            <section id="policy-updates" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Policy Updates</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may update this Cookie Policy from time to time to reflect changes in our practices, technologies, or legal requirements. When we do, we will update the "Last Updated" date at the top of this page.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We encourage you to review this policy periodically. If we make material changes, we may notify you via email or a prominent notice on our platform before the changes take effect.
              </p>
              <div className="flex items-center gap-3 p-4 rounded-lg border border-border">
                <RefreshCw className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-sm">Current Version</p>
                  <p className="text-sm text-muted-foreground">Last updated: May 31, 2026 — Version 1.0</p>
                </div>
              </div>
            </section>

            {/* Contact */}
            <section id="contact" className="scroll-mt-24">
              <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                If you have questions about this Cookie Policy, how we use cookies, or want to exercise any of your rights, please reach out to us.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Mail className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm mb-1">Email Support</p>
                        <a href="mailto:support@myvoicepost.com" className="text-primary hover:underline text-sm" data-testid="link-contact-email">
                          support@myvoicepost.com
                        </a>
                        <p className="text-xs text-muted-foreground mt-1">We respond within 2 business days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm mb-1">Mailing Address</p>
                        <p className="text-sm text-muted-foreground">MyVoicePost</p>
                        <p className="text-sm text-muted-foreground">Plantation, FL</p>
                        <p className="text-sm text-muted-foreground">United States</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 p-4 rounded-lg border border-border text-center text-sm text-muted-foreground">
                <p>For privacy-related requests (data access, deletion, portability) please see our{" "}
                  <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  {" "}or{" "}
                  <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>.
                </p>
              </div>
            </section>

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
