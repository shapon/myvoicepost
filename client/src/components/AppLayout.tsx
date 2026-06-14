import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, removeAuthToken } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Mic,
  Sparkles,
  Languages,
  FileAudio,
  Bookmark,
  LogOut,
  BarChart3,
  Globe,
  Trash2,
  Loader2,
  BrainCircuit,
} from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { label: "Polish", href: "/polish", icon: Sparkles },
  { label: "Translate", href: "/translate", icon: Languages },
  { label: "Transcribe", href: "/process", icon: FileAudio },
  { label: "Doc AI", href: "/doc-ai", icon: BrainCircuit },
  { label: "Saved", href: "/saved", icon: Bookmark },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = async () => {
    setShowDialog(false);
    await logout();
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await apiRequest("DELETE", "/api/auth/account", {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete account");
      }
      removeAuthToken();
      toast({ title: "Account deleted", description: "Your account and all data have been permanently deleted." });
      await logout();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete account. Please try again.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <>
      <SidebarProvider style={sidebarStyle}>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar collapsible="icon">
            <SidebarHeader className="border-b px-2 py-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setShowDialog(true)}
                    tooltip="View website"
                    data-testid="button-logo-view-website"
                    className="gap-2"
                  >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center flex-shrink-0">
                      <Mic className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-base tracking-tight">MyVoicePost</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => {
                      const isActive = location === item.href;
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            tooltip={item.label}
                            data-testid={`nav-${item.label.toLowerCase()}`}
                          >
                            <Link href={item.href}>
                              <Icon className="w-4 h-4" />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                    {isAdmin && (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={location === "/dashboard"}
                          tooltip="Dashboard"
                          data-testid="nav-dashboard"
                        >
                          <Link href="/dashboard">
                            <BarChart3 className="w-4 h-4" />
                            <span>Dashboard</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t px-2 py-2">
              <SidebarMenu>
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={user.email || user.username}
                      data-testid="button-user-info"
                    >
                      <Avatar className="w-5 h-5 flex-shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {user.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">{user.username}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setShowDeleteDialog(true)}
                      tooltip="Delete account"
                      data-testid="button-delete-account"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Account</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={handleLogout}
                    tooltip="Log out"
                    data-testid="button-logout"
                    className="text-muted-foreground"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <header className="h-12 border-b flex items-center px-3 gap-2 bg-background shrink-0">
              <SidebarTrigger data-testid="button-sidebar-trigger" />
              <div className="flex-1" />
              {user && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground md:hidden">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-24">{user.username}</span>
                </div>
              )}
            </header>

            <main className="flex-1 overflow-auto">
              {children}
            </main>

            <nav
              className="md:hidden shrink-0 border-t bg-background flex items-stretch"
              data-testid="nav-bottom-tabs"
            >
              {navItems.map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                    data-testid={`bottom-tab-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </SidebarProvider>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              View Website?
            </AlertDialogTitle>
            <AlertDialogDescription>
              To browse the website and its content, you need to log out first. Would you like to log out now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-dialog-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              data-testid="button-dialog-logout"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              By this your account will be deleted along with your data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-dialog-cancel" disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-dialog-confirm"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
