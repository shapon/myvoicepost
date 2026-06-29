import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import {
  Bell,
  CheckCheck,
  Clock,
  AlertCircle,
  RefreshCw,
  XCircle,
  CreditCard,
  Zap,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AppLayout from "@/components/AppLayout";
import type { NotificationLog } from "@shared/schema";

type LucideIcon = React.ComponentType<{ className?: string }>;

function typeIcon(type: string): { Icon: LucideIcon; className: string } {
  const map: Record<string, { Icon: LucideIcon; className: string }> = {
    subscription_renewed:     { Icon: RefreshCw,   className: "text-green-500" },
    payment_failed:           { Icon: AlertCircle, className: "text-destructive" },
    subscription_expired:     { Icon: XCircle,     className: "text-orange-500" },
    subscription_expiry_2days:{ Icon: Clock,       className: "text-amber-500" },
    subscription_expiry_7days:{ Icon: Clock,       className: "text-amber-500" },
    trial_expiry_2days:       { Icon: Clock,       className: "text-amber-500" },
    trial_expiry_7days:       { Icon: Clock,       className: "text-amber-500" },
    low_minutes:              { Icon: Gauge,       className: "text-orange-500" },
    expiry_3days_manual:      { Icon: Clock,       className: "text-amber-500" },
    renewal_reminder_3days:   { Icon: CreditCard,  className: "text-indigo-500" },
    topup_credited:           { Icon: Zap,         className: "text-green-500" },
  };
  return map[type] ?? { Icon: Bell, className: "text-muted-foreground" };
}

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    subscription_renewed: "Subscription",
    payment_failed: "Payment",
    subscription_expired: "Subscription",
    subscription_expiry_2days: "Subscription",
    subscription_expiry_7days: "Subscription",
    trial_expiry_2days: "Trial",
    trial_expiry_7days: "Trial",
    low_minutes: "Minutes",
    expiry_3days_manual: "Subscription",
    renewal_reminder_3days: "Billing",
    topup_credited: "Top-Up",
  };
  return map[type] ?? "System";
}

export default function Notifications() {
  const { data, isLoading } = useQuery<{
    success: boolean;
    notifications: NotificationLog[];
    unreadCount: number;
  }>({
    queryKey: ["/api/v1/a/notifications"],
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v1/a/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/a/notifications"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const autoMarkedRef = useRef(false);
  useEffect(() => {
    if (!autoMarkedRef.current && data && unreadCount > 0) {
      autoMarkedRef.current = true;
      readAllMutation.mutate();
    }
  }, [data, unreadCount]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold" data-testid="heading-notifications">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" data-testid="badge-unread-count">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-24">
              <Bell className="w-12 h-12 opacity-20" />
              <p className="text-sm" data-testid="text-no-notifications">
                No notifications yet
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const isUnread = !n.readAt;
                return (
                  <li
                    key={n.id}
                    data-testid={`notification-item-${n.id}`}
                    className={`flex items-start gap-4 px-6 py-4 transition-colors ${
                      isUnread ? "bg-muted/40" : ""
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {(() => {
                        const { Icon, className } = typeIcon(n.notificationType);
                        return <Icon className={`w-4 h-4 ${className}`} />;
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-medium text-sm"
                          data-testid={`text-notif-title-${n.id}`}
                        >
                          {n.title ?? typeLabel(n.notificationType)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {typeLabel(n.notificationType)}
                        </Badge>
                        {isUnread && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-primary inline-block"
                            aria-label="unread"
                          />
                        )}
                      </div>
                      {n.message && (
                        <p
                          className="text-sm text-muted-foreground mt-0.5 line-clamp-2"
                          data-testid={`text-notif-message-${n.id}`}
                        >
                          {n.message}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span data-testid={`text-notif-time-${n.id}`}>
                        {timeAgo(n.sentAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
