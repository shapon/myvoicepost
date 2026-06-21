import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Shield, User, Lock, Loader2, Check } from "lucide-react";

// ── Schemas ────────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(64),
  email: z.string().email("Invalid email address"),
});
type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type PasswordValues = z.infer<typeof passwordSchema>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [profileSaved, setProfileSaved] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const originalPushStateRef = useRef<typeof window.history.pushState | null>(null);
  const sentinelPushedRef = useRef(false);

  // Profile form
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: user?.username ?? "",
      email: user?.email ?? "",
    },
  });

  // Password form (declared before the navigation guard so it can be referenced in the effect)
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    profileForm.reset({
      username: user?.username ?? "",
      email: user?.email ?? "",
    });
  }, [user]);

  // ── Navigation guard ────────────────────────────────────────────────────────
  //
  // Strategy:
  //  • In-app navigation (Wouter pushState): intercept and show dialog.
  //  • Browser back/forward: push a sentinel history entry when the guard
  //    activates so that pressing back stays at /account-settings (the URL
  //    doesn't change → Wouter doesn't navigate away). Our popstate handler
  //    re-pushes the sentinel and shows the dialog.
  //  • beforeunload: native browser confirmation for tab close / reload.

  useEffect(() => {
    const isDirty = profileForm.formState.isDirty || passwordForm.formState.isDirty;

    // beforeunload: browser tab close / reload / external navigation
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);

    if (!isDirty) {
      return () => {
        window.removeEventListener("beforeunload", beforeUnloadHandler);
      };
    }

    // Capture the real pushState before we override it
    const original = window.history.pushState.bind(window.history);
    originalPushStateRef.current = original;

    // Push a sentinel entry now. The history stack becomes:
    //   [..., prevPage, /account-settings (real), /account-settings (sentinel)]
    // Pressing back moves to "real" — URL stays /account-settings so Wouter
    // sees no route change and leaves the component mounted.
    if (!sentinelPushedRef.current) {
      original(null, "", "/account-settings");
      sentinelPushedRef.current = true;
    }

    // Intercept Wouter's pushState for in-app link clicks
    window.history.pushState = function (
      state: unknown,
      title: string,
      url?: string | URL | null
    ) {
      const targetPath = url?.toString() ?? "";
      if (targetPath && !targetPath.startsWith("/account-settings")) {
        setPendingPath(targetPath);
        setShowLeaveDialog(true);
        return;
      }
      original(state, title, url);
    };

    // popstate fires when the user presses back/forward.
    // Because we have a sentinel, the URL is still /account-settings after one
    // back press → Wouter stays put. We re-push the sentinel immediately so any
    // additional back presses are also caught, then show the dialog.
    const popstateHandler = () => {
      original(null, "", "/account-settings");
      setPendingPath("__back__");
      setShowLeaveDialog(true);
    };
    window.addEventListener("popstate", popstateHandler);

    return () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      window.removeEventListener("popstate", popstateHandler);
      if (originalPushStateRef.current) {
        window.history.pushState = originalPushStateRef.current;
        originalPushStateRef.current = null;
      }
      // Remove our sentinel so we don't pollute the history stack when the
      // guard deactivates (e.g. after a successful save).
      if (sentinelPushedRef.current) {
        sentinelPushedRef.current = false;
        window.history.go(-1);
      }
    };
  }, [profileForm.formState.isDirty, passwordForm.formState.isDirty]);

  const handleConfirmLeave = () => {
    // Restore original pushState before navigating
    if (originalPushStateRef.current) {
      window.history.pushState = originalPushStateRef.current;
      originalPushStateRef.current = null;
    }
    // Prevent cleanup from trying to pop the sentinel (we handle nav ourselves)
    sentinelPushedRef.current = false;
    profileForm.reset();
    passwordForm.reset();
    setShowLeaveDialog(false);
    const target = pendingPath;
    setPendingPath(null);
    if (target === "__back__") {
      // After popstateHandler re-pushed the sentinel, history is:
      //   [..., prevPage, /account-settings (real), /account-settings (new-sentinel)]
      // Go back 2 to reach prevPage.
      window.history.go(-2);
    } else if (target) {
      navigate(target);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveDialog(false);
    setPendingPath(null);
  };

  // ── Profile mutation ────────────────────────────────────────────────────────

  const profileMutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const res = await apiRequest("PUT", "/api/v1/a/profile", values);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update profile");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.token) {
        setAuthToken(data.token);
      }
      if (data?.user) {
        updateUser({ username: data.user.username, email: data.user.email });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/v1/a/auth/me'] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordValues) => {
      const res = await apiRequest("PUT", "/api/v1/a/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({ title: "Password changed", description: "Your password has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Account Settings</h1>
              <p className="text-sm text-muted-foreground">Update your profile and password</p>
            </div>
          </div>

          {/* Update profile */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Profile</CardTitle>
              </div>
              <CardDescription>Change your display name or email address</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form
                  onSubmit={profileForm.handleSubmit((v) => profileMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={profileForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your username"
                            {...field}
                            data-testid="input-username"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            {...field}
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={profileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {profileMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                    ) : profileSaved ? (
                      <><Check className="w-4 h-4 mr-2 text-green-500" />Saved</>
                    ) : (
                      "Save Profile"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Separator />

          {/* Change password */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Change Password</CardTitle>
              </div>
              <CardDescription>Enter your current password to set a new one</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            data-testid="input-current-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Min. 6 characters"
                            {...field}
                            data-testid="input-new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Repeat new password"
                            {...field}
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={passwordMutation.isPending}
                    data-testid="button-change-password"
                  >
                    {passwordMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Changing…</>
                    ) : (
                      "Change Password"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={(open) => { if (!open) handleCancelLeave(); }}>
        <AlertDialogContent data-testid="dialog-unsaved-changes">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now, those changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-stay-on-page" onClick={handleCancelLeave}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction data-testid="button-discard-changes" onClick={handleConfirmLeave}>
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
