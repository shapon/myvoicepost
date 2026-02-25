import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic,
  Menu,
  X,
  LogOut,
  User,
  BarChart3,
  Sparkles,
  Languages,
  FileAudio,
  Bookmark,
} from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { label: "Polish", href: "/polish", icon: Sparkles },
  { label: "Translate", href: "/translate", icon: Languages },
  { label: "Transcribe", href: "/process", icon: FileAudio },
  { label: "Saved", href: "/saved", icon: Bookmark },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, isLoading, isAdmin } = useAuth();
  const [location] = useLocation();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-14">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-foreground"
                data-testid="link-app-logo"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight hidden sm:inline">
                  MyVoicePost
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = location === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        className="gap-1.5"
                        data-testid={`nav-${item.label.toLowerCase()}`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="hidden md:flex items-center gap-2">
              {isLoading ? (
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              ) : user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="gap-2"
                      data-testid="button-user-menu"
                    >
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
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <Link href="/dashboard">
                          <DropdownMenuItem
                            className="gap-2 cursor-pointer"
                            data-testid="link-dashboard"
                          >
                            <BarChart3 className="w-4 h-4" />
                            <span>Dashboard</span>
                          </DropdownMenuItem>
                        </Link>
                      </>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="button-login"
                    >
                      Log in
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button size="sm" data-testid="button-signup">
                      Sign up
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <button
              className="md:hidden p-2 text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              data-testid="button-mobile-nav"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-background border-b border-border">
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2"
                      onClick={() => setIsMobileMenuOpen(false)}
                      data-testid={`nav-mobile-${item.label.toLowerCase()}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
              <div className="pt-2 border-t border-border mt-2">
                {user ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 py-2 px-3">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {user.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {user.username}
                      </span>
                    </div>
                    {isAdmin && (
                      <Link href="/dashboard">
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-2"
                          onClick={() => setIsMobileMenuOpen(false)}
                          data-testid="nav-mobile-dashboard"
                        >
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
                      data-testid="button-mobile-logout"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Link href="/login" className="flex-1">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="button-mobile-login"
                      >
                        Log in
                      </Button>
                    </Link>
                    <Link href="/signup" className="flex-1">
                      <Button
                        className="w-full"
                        onClick={() => setIsMobileMenuOpen(false)}
                        data-testid="button-mobile-signup"
                      >
                        Sign up
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
