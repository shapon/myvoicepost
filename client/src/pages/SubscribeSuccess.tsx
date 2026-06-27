import { useEffect } from "react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, LayoutDashboard, Settings } from "lucide-react";

export default function SubscribeSuccess() {
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/a/subscription-status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="w-9 h-9 text-primary" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-success-title">
          You're subscribed!
        </h1>
        <p className="text-muted-foreground mb-8" data-testid="text-success-description">
          Your subscription is now active. Head to your dashboard to start recording, or visit Account Settings to manage your plan.
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/polish">
            <Button className="w-full gap-2" data-testid="button-go-dashboard">
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/account-settings">
            <Button variant="outline" className="w-full gap-2" data-testid="button-account-settings">
              <Settings className="w-4 h-4" />
              Manage Subscription
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
