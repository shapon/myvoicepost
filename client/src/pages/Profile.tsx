import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import {
  User,
  Mic,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Settings,
  Shield,
  BadgeCheck,
} from "lucide-react";

interface UsageStats {
  trialMinutesTotal: number;
  trialMinutesUsed: number;
  totalTranscriptions: number;
  totalUsageSeconds: number;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialUsed: boolean;
}

interface SubscriptionStatus {
  isActive: boolean;
  planName?: string;
  validUntil?: string | null;
}

interface AudioLog {
  id: string;
  createdAt: string;
  usageSeconds: number;
  language?: string;
  status?: string;
  outputType?: string;
}

function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 10;

export default function Profile() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    success: boolean;
    stats: UsageStats;
  }>({
    queryKey: ["/api/v1/a/usage-stats"],
  });

  const { data: subData } = useQuery<{
    success: boolean;
    isActive: boolean;
    planName?: string;
    validUntil?: string | null;
  }>({
    queryKey: ["/api/v1/a/subscription-status"],
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{
    success: boolean;
    logs: AudioLog[];
    total: number;
    page: number;
  }>({
    queryKey: ["/api/v1/a/audio-logs", page],
    queryFn: () =>
      fetch(`/api/v1/a/audio-logs?page=${page}&limit=${PAGE_SIZE}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("mvp_auth_token") ?? ""}`,
        },
      }).then((r) => r.json()),
  });

  const stats = statsData?.stats;
  const logs = logsData?.logs ?? [];
  const total = logsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getSubscriptionLabel(): string {
    if (subData?.isActive) return subData.planName ?? "Subscribed";
    if (stats?.trialUsed === false) return "Free Trial";
    return "Trial Ended";
  }

  function getSubscriptionVariant(): "default" | "secondary" | "destructive" | "outline" {
    if (subData?.isActive) return "default";
    if (stats?.trialUsed === false) return "secondary";
    return "destructive";
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold" data-testid="text-profile-username">
                  {user?.username}
                </h1>
                <p className="text-sm text-muted-foreground" data-testid="text-profile-email">
                  {user?.email ?? "No email on file"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/account-settings">
                  <Shield className="w-4 h-4 mr-1.5" />
                  Account
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings">
                  <Settings className="w-4 h-4 mr-1.5" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>

          {/* Subscription + member-since banner */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Subscription</p>
                    {statsLoading ? (
                      <Skeleton className="h-4 w-24 mt-0.5" />
                    ) : (
                      <Badge variant={getSubscriptionVariant()} data-testid="status-subscription">
                        {getSubscriptionLabel()}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Member since</p>
                    {statsLoading ? (
                      <Skeleton className="h-4 w-20 mt-0.5" />
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-member-since">
                        {formatDate(stats?.trialStartsAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "Recordings",
                icon: Mic,
                value: statsLoading ? null : (stats?.totalTranscriptions ?? 0),
                testId: "stat-recordings",
              },
              {
                label: "Total time",
                icon: Clock,
                value: statsLoading ? null : formatSeconds(stats?.totalUsageSeconds ?? 0),
                testId: "stat-total-time",
              },
              {
                label: "Trial minutes",
                icon: Clock,
                value: statsLoading ? null : `${stats?.trialMinutesUsed?.toFixed(1) ?? 0} / ${stats?.trialMinutesTotal ?? 90}`,
                testId: "stat-trial-usage",
              },
              {
                label: "Trial ends",
                icon: Calendar,
                value: statsLoading ? null : formatDate(stats?.trialEndsAt),
                testId: "stat-trial-end",
              },
            ].map(({ label, icon: Icon, value, testId }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  {value === null ? (
                    <Skeleton className="h-6 w-16 mt-1" />
                  ) : (
                    <p className="text-lg font-bold" data-testid={testId}>
                      {value}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trial progress bar */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Trial Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">
                    {stats.trialMinutesUsed.toFixed(1)} / {stats.trialMinutesTotal} min used
                  </span>
                  <Badge
                    variant={stats.trialUsed ? "destructive" : "secondary"}
                    data-testid="status-trial"
                  >
                    {stats.trialUsed ? "Trial expired" : "Trial active"}
                  </Badge>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (stats.trialMinutesUsed / stats.trialMinutesTotal) * 100
                      )}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audio logs */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recording History
              </CardTitle>
              {total > 0 && (
                <span className="text-xs text-muted-foreground">
                  {total} recording{total !== 1 ? "s" : ""} total
                </span>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {logsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  No recordings yet
                </div>
              ) : (
                <>
                  <ScrollArea className="max-h-80">
                    <div className="space-y-1">
                      {logs.map((log, idx) => (
                        <div key={log.id}>
                          <div
                            className="flex items-center justify-between py-2.5 px-1 text-sm"
                            data-testid={`row-audio-log-${log.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground truncate">
                                {formatDateTime(log.createdAt)}
                              </span>
                              {log.language && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {log.language}
                                </Badge>
                              )}
                            </div>
                            <span className="font-medium shrink-0 ml-2">
                              {formatSeconds(log.usageSeconds ?? 0)}
                            </span>
                          </div>
                          {idx < logs.length - 1 && <Separator />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 mt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-logs-prev"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-logs-next"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
