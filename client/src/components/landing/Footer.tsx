import { Mic } from "lucide-react";
import { SiX, SiDiscord, SiInstagram } from "react-icons/si";

const footerLinks = {
  product: [
    { label: "Updates", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Resources", href: "#" },
    { label: "Support", href: "#" },
  ],
  legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Preferences", href: "#" },
    { label: "Affiliate Program", href: "#" },
  ],
  download: [
    { label: "iOS", href: "#" },
    { label: "Android", href: "#" },
    { label: "Mac", href: "#" },
    { label: "Web App", href: "#" },
  ],
};

const socialLinks = [
  { icon: SiX, href: "#", label: "X" },
  { icon: SiDiscord, href: "#", label: "Discord" },
  { icon: SiInstagram, href: "#", label: "Instagram" },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card/50" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2">
            <a href="#" className="flex items-center gap-2 text-foreground mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">MyVoicePost</span>
            </a>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Transform your voice into beautiful, polished text with the power of AI. 
              Available on all your devices.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  data-testid={`link-social-${social.label.toLowerCase()}`}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Download</h3>
            <ul className="space-y-3">
              {footerLinks.download.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 MyVoicePost. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Get in touch: <a href="mailto:hi@myvoicepost.com" className="text-primary hover:underline">hi@myvoicepost.com</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
