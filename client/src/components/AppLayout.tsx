import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { apiRequest, removeAuthToken, queryClient } from "@/lib/queryClient";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
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
  HelpCircle,
  Sun,
  Moon,
  Settings,
  Shield,
  Bell,
  Mail,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ReactNode } from "react";

const NOTIF_LABELS: Record<string, { label: string; description: string }> = {
  subscription_renewed: { label: "Subscription Renewed", description: "When your plan renews successfully" },
  payment_failed: { label: "Payment Failed", description: "When a payment attempt fails" },
  subscription_expired: { label: "Subscription Expired", description: "When your subscription ends" },
  topup_credited: { label: "Top-Up Credited", description: "When minutes are added to your account" },
  low_minutes: { label: "Low on Minutes", description: "When you're running low on recording time" },
  expiry_3days_manual: { label: "Expiring Soon", description: "3-day warning before your plan ends" },
};

interface NotifPref { notificationType: string; pushEnabled: boolean; emailEnabled: boolean; }

const navItems = [
  { label: "Polish", href: "/polish", icon: Sparkles },
  { label: "Translate", href: "/translate", icon: Languages },
  { label: "Transcribe", href: "/process", icon: FileAudio },
  { label: "Doc AI", href: "/doc-ai", icon: BrainCircuit },
  { label: "Saved", href: "/saved", icon: Bookmark },
  { label: "Help", href: "/help", icon: HelpCircle },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [location] = useLocation();

  const { data: notifData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/v1/a/notifications"],
    select: (d: any) => ({ unreadCount: d?.unreadCount ?? 0 }),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const unreadCount = notifData?.unreadCount ?? 0;
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);

  // -- Notification preferences (shared cache key with AccountSettings) --------
  const { data: notifPrefsData, isLoading: notifPrefsLoading } = useQuery<{
    success: boolean;
    preferences: NotifPref[];
  }>({
    queryKey: ["/api/v1/a/notification-preferences"],
    enabled: !!user,
  });

  const notifPrefs: Record<string, NotifPref> = {};
  if (notifPrefsData?.preferences) {
    notifPrefsData.preferences.forEach(p => { notifPrefs[p.notificationType] = p; });
  }

  const notifPrefMutation = useMutation({
    mutationFn: async (pref: NotifPref) => {
      const res = await apiRequest("PATCH", "/api/v1/a/notification-preferences", pref);
      if (!res.ok) throw new Error("Failed to save preference");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/notification-preferences"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save notification preference", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/notification-preferences"] });
    },
  });

  function toggleNotifPref(type: string, field: "pushEnabled" | "emailEnabled", value: boolean) {
    const current = notifPrefs[type] ?? { notificationType: type, pushEnabled: true, emailEnabled: true };
    const updated = { ...current, [field]: value };
    queryClient.setQueryData<{ success: boolean; preferences: NotifPref[] }>(
      ["/api/v1/a/notification-preferences"],
      (old) => {
        if (!old) return old;
        const exists = old.preferences.some(p => p.notificationType === type);
        const preferences = exists
          ? old.preferences.map(p => p.notificationType === type ? updated : p)
          : [...old.preferences, updated];
        return { ...old, preferences };
      }
    );
    notifPrefMutation.mutate(updated);
  }

  const handleLogout = async () => {
    setShowDialog(false);
    await logout();
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await apiRequest("POST", "/api/v1/a/account/delete", {});
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
                            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <Link href={item.href}>
                              <Icon className="w-4 h-4" />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/notifications"}
                        tooltip="Notifications"
                        data-testid="nav-notifications"
                      >
                        <Link href="/notifications" className="flex items-center gap-2">
                          <Bell className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1">Notifications</span>
                          {unreadCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto text-xs px-1.5 py-0 min-w-[1.25rem] justify-center"
                              data-testid="badge-sidebar-unread"
                            >
                              {unreadCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
                      asChild
                      isActive={location === "/profile"}
                      tooltip="Profile"
                      data-testid="nav-profile"
                    >
                      <Link href="/profile">
                        <Avatar className="w-5 h-5 flex-shrink-0">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {user.username.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{user.username}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/account-settings"}
                      tooltip="Account Settings"
                      data-testid="nav-account-settings"
                    >
                      <Link href="/account-settings">
                        <Shield className="w-4 h-4" />
                        <span>Account Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/settings"}
                      tooltip="App Settings"
                      data-testid="nav-app-settings"
                    >
                      <Link href="/settings">
                        <Settings className="w-4 h-4" />
                        <span>App Settings</span>
                      </Link>
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
                <Popover open={notifPopoverOpen} onOpenChange={setNotifPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Notification preferences"
                      data-testid="button-notif-prefs-trigger"
                      className="relative"
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="absolute -top-1 -right-1 text-xs px-1 py-0 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center no-default-active-elevate"
                          data-testid="badge-header-unread-count"
                        >
                          {unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-80 p-0"
                    data-testid="popover-notif-prefs"
                  >
                    <div className="px-4 py-3 border-b">
                      <p className="text-sm font-semibold">Notification Preferences</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Control how you receive alerts</p>
                    </div>
                    <div className="px-4 py-2">
                      {notifPrefsLoading ? (
                        <div className="space-y-3 py-2">
                          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center py-2">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Notification</span>
                            <span className="text-xs text-muted-foreground font-medium w-10 text-center flex items-center justify-center gap-0.5">
                              <Smartphone className="w-3 h-3" />
                            </span>
                            <span className="text-xs text-muted-foreground font-medium w-10 text-center flex items-center justify-center gap-0.5">
                              <Mail className="w-3 h-3" />
                            </span>
                          </div>
                          <Separator />
                          <div className="space-y-0.5 py-1">
                            {Object.keys(NOTIF_LABELS).map(type => {
                              const pref = notifPrefs[type] ?? { notificationType: type, pushEnabled: true, emailEnabled: true };
                              const info = NOTIF_LABELS[type];
                              return (
                                <div key={type} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center py-2">
                                  <div>
                                    <p className="text-sm font-medium leading-none" data-testid={`text-popover-notif-label-${type}`}>{info.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                                  </div>
                                  <div className="flex justify-center w-10">
                                    <Switch
                                      checked={pref.pushEnabled}
                                      onCheckedChange={v => toggleNotifPref(type, "pushEnabled", v)}
                                      data-testid={`switch-popover-push-${type}`}
                                    />
                                  </div>
                                  <div className="flex justify-center w-10">
                                    <Switch
                                      checked={pref.emailEnabled}
                                      onCheckedChange={v => toggleNotifPref(type, "emailEnabled", v)}
                                      data-testid={`switch-popover-email-${type}`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="px-4 py-2 border-t">
                      <Link
                        href="/notifications"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setNotifPopoverOpen(false)}
                        data-testid="link-popover-view-notifications"
                      >
                        View all notifications
                      </Link>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </Button>
              {user && (
                <Link href="/profile" data-testid="button-user-avatar-header">
                  <Avatar className="w-7 h-7 cursor-pointer">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              )}
            </header>

            <main className="flex-1 overflow-auto">
              {children}
            </main>

            <nav
              className="md:hidden shrink-0 border-t bg-background flex items-stretch"
              data-testid="nav-bottom-tabs"
            >
              {navItems.slice(0, 5).map((item) => {
                const isActive = location === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                    data-testid={`bottom-tab-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
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
