import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Mic, LogOut, User, BarChart3, Sparkles, Languages, FileAudio, Bookmark, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const guestNavLinks = [
  { label: "Polish", href: "/polish", icon: Sparkles },
  { label: "Translate", href: "/translate", icon: Languages },
  { label: "Transcribe", href: "/process", icon: FileAudio },
  { label: "Pricing", href: "/pricing", icon: CreditCard },
];

const authNavLinks = [
  { label: "Polish", href: "/polish", icon: Sparkles },
  { label: "Translate", href: "/translate", icon: Languages },
  { label: "Transcribe", href: "/process", icon: FileAudio },
  { label: "Saved", href: "/saved", icon: Bookmark },
];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, isLoading, isAdmin } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const navLinks = user ? authNavLinks : guestNavLinks;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border"
          : "bg-transparent"
      }`}
      data-testid="header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          <a
            href="#"
            className="flex items-center gap-2 text-foreground"
            data-testid="link-logo"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">MyVoicePost</span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  data-testid={`link-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {user.username.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:inline">{user.username}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="gap-2">
                    <User className="w-4 h-4" />
                    <span>{user.username}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <Link href="/pricing">
                    <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="link-pricing">
                      <CreditCard className="w-4 h-4" />
                      <span>Pricing</span>
                    </DropdownMenuItem>
                  </Link>
                  {isAdmin && (
                    <Link href="/dashboard">
                      <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="link-dashboard">
                        <BarChart3 className="w-4 h-4" />
                        <span>Dashboard</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={handleLogout}
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" data-testid="button-login">
                    Log in
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button
                    className="bg-gradient-to-r from-primary to-purple-500 hover:opacity-90"
                    data-testid="button-get-started"
                  >
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Button variant="ghost" className="w-full justify-start gap-2">
                      <Icon className="w-4 h-4" />
                      {link.label}
                    </Button>
                  </Link>
                );
              })}
              <div className="pt-3 mt-3 border-t border-border flex flex-col gap-1">
                {user ? (
                  <>
                    <div className="flex items-center gap-2 py-2 px-3">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {user.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{user.username}</span>
                    </div>
                    <Link href="/pricing" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start gap-2" data-testid="link-pricing-mobile">
                        <CreditCard className="w-4 h-4" />
                        Pricing
                      </Button>
                    </Link>
                    {isAdmin && (
                      <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start gap-2" data-testid="link-dashboard-mobile">
                          <BarChart3 className="w-4 h-4" />
                          Dashboard
                        </Button>
                      </Link>
                    )}
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-2 text-destructive" 
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      data-testid="button-logout-mobile"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </Button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <Link href="/login" className="flex-1" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full" data-testid="button-login-mobile">
                        Log in
                      </Button>
                    </Link>
                    <Link href="/signup" className="flex-1" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button
                        className="w-full bg-gradient-to-r from-primary to-purple-500"
                        data-testid="button-get-started-mobile"
                      >
                        Get Started
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
