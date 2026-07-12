import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Pricing from "@/pages/Pricing";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import AffiliateProgram from "@/pages/AffiliateProgram";
import Dashboard from "@/pages/Dashboard";
import Process from "@/pages/Process";
import Polish from "@/pages/Polish";
import Translate from "@/pages/Translate";
import SavedItems from "@/pages/SavedItems";
import About from "@/pages/About";
import Help from "@/pages/Help";
import CookiePolicy from "@/pages/CookiePolicy";
import DocAI from "@/pages/DocAI";
import Profile from "@/pages/Profile";
import AccountSettings from "@/pages/AccountSettings";
import AppSettings from "@/pages/AppSettings";
import AuthHelp from "@/pages/AuthHelp";
import Notifications from "@/pages/Notifications";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Subscribe from "@/pages/Subscribe";
import SubscribeSuccess from "@/pages/SubscribeSuccess";
import Reviews from "@/pages/Reviews";

function AppSkeleton() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900" aria-label="Loading">
      <div className="w-60 shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse">
        <div className="h-12 border-b border-neutral-200 dark:border-neutral-800 flex items-center px-3 gap-2">
          <div className="w-7 h-7 rounded-lg bg-neutral-300 dark:bg-neutral-700 shrink-0" />
          <div className="h-4 w-28 rounded bg-neutral-300 dark:bg-neutral-700" />
        </div>
        <div className="flex-1 px-2 py-3 flex flex-col gap-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
          ))}
        </div>
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-2 py-3 flex flex-col gap-1">
          <div className="h-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-8 rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
      <div className="flex flex-col flex-1 min-w-0 animate-pulse">
        <div className="h-12 shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center px-3 gap-2">
          <div className="w-7 h-7 rounded-md bg-neutral-300 dark:bg-neutral-700" />
          <div className="flex-1" />
          <div className="w-7 h-7 rounded-md bg-neutral-300 dark:bg-neutral-700" />
          <div className="w-7 h-7 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>
        <div className="flex-1 p-6 flex flex-col gap-4">
          <div className="h-8 w-48 rounded-md bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-full rounded-md bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-3/4 rounded-md bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-32 w-full rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <AppSkeleton />;

  if (!user) return null;

  return <Component />;
}

function HomeRoute() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/polish");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <AppSkeleton />;

  if (user) return null;

  return <Home />;
}

function HelpRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AppSkeleton />;
  return user ? <AuthHelp /> : <Help />;
}

function ThemeGate({ children }: { children: React.ReactNode }) {
  const { isThemeReady } = useTheme();
  if (!isThemeReady) {
    return <div data-testid="theme-loading-skeleton"><AppSkeleton /></div>;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/affiliate" component={AffiliateProgram} />
      <Route path="/about" component={About} />
      <Route path="/help" component={HelpRoute} />
      <Route path="/cookies" component={CookiePolicy} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/polish">
        {() => <ProtectedRoute component={Polish} />}
      </Route>
      <Route path="/translate">
        {() => <ProtectedRoute component={Translate} />}
      </Route>
      <Route path="/process">
        {() => <ProtectedRoute component={Process} />}
      </Route>
      <Route path="/saved">
        {() => <ProtectedRoute component={SavedItems} />}
      </Route>
      <Route path="/doc-ai">
        {() => <ProtectedRoute component={DocAI} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/account-settings">
        {() => <ProtectedRoute component={AccountSettings} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={AppSettings} />}
      </Route>
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/help-center">
        {() => <ProtectedRoute component={AuthHelp} />}
      </Route>
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/subscribe/success" component={SubscribeSuccess} />
      <Route path="/reviews" component={Reviews} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ThemeGate>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeGate>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
