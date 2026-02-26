import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Redirect, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  CreditCard,
  LifeBuoy,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  ExternalLink,
  BarChart3,
} from "lucide-react";

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleBadgeVariant(role: string) {
  switch (role) {
    case "ADMIN": return "default";
    case "USER": return "secondary";
    default: return "outline";
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "active": return "default";
    case "open": return "destructive";
    case "in_progress": return "secondary";
    case "resolved":
    case "closed": return "outline";
    case "succeeded": return "default";
    case "failed": return "destructive";
    default: return "outline";
  }
}

function StatsCards({ stats }: { stats: any }) {
  const items = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users },
    { label: "Active Subscriptions", value: stats?.activeSubscriptions ?? 0, icon: CreditCard },
    { label: "Open Support Requests", value: stats?.openSupportRequests ?? 0, icon: LifeBuoy },
    { label: "Error Logs", value: stats?.totalErrors ?? 0, icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid={`stat-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/users", `?page=${page}&limit=15`],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">All Users</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-users">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Stripe ID</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.users?.map((u: any) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.trialUsed ? "outline" : "secondary"}>
                        {u.trialUsed ? "Used" : "Available"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {u.stripeCustomerId || "None"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(u.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {(!data?.users || data.users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <Pagination page={page} setPage={setPage} total={data?.pagination?.total || 0} limit={15} />
        </>
      )}
    </div>
  );
}

function SubscriptionsTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/subscriptions", `?page=${page}&limit=15`],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">All Subscriptions</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-subs">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Minutes Used</TableHead>
                  <TableHead>Minutes Left</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.subscriptions?.map((s: any) => (
                  <TableRow key={s.id} data-testid={`row-sub-${s.id}`}>
                    <TableCell>
                      <div className="font-medium">{s.username}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </TableCell>
                    <TableCell>{s.planName}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(s.validDateUpto)}</TableCell>
                    <TableCell>{s.minutesUsed}</TableCell>
                    <TableCell>{s.minutesRemaining}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(s.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {(!data?.subscriptions || data.subscriptions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No subscriptions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <Pagination page={page} setPage={setPage} total={data?.pagination?.total || 0} limit={15} />
        </>
      )}
    </div>
  );
}

function PaymentsTab() {
  const [lastId, setLastId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const query = lastId ? `?limit=15&starting_after=${lastId}` : "?limit=15";
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/payments", query],
  });

  function nextPage() {
    if (data?.lastId) {
      setHistory((prev) => [...prev, lastId || ""]);
      setLastId(data.lastId);
    }
  }

  function prevPage() {
    const prev = [...history];
    const previousId = prev.pop();
    setHistory(prev);
    setLastId(previousId || null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">Payment History</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-payments">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.payments?.map((p: any) => (
                  <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                    <TableCell>
                      <div className="font-medium">{p.customerName}</div>
                      <div className="text-xs text-muted-foreground">{p.customerEmail}</div>
                    </TableCell>
                    <TableCell className="font-medium">
                      ${p.amount.toFixed(2)} {p.currency.toUpperCase()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {p.description}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(p.created)}</TableCell>
                    <TableCell>
                      {p.receiptUrl && (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" data-testid={`link-receipt-${p.id}`}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.payments || data.payments.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No payments found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={prevPage} disabled={history.length === 0} data-testid="button-payments-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={nextPage} disabled={!data?.hasMore} data-testid="button-payments-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SupportTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");

  const filterQuery = statusFilter !== "all" ? `&status=${statusFilter}` : "";
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/support", `?page=${page}&limit=15${filterQuery}`],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/m/admin/support/${id}`, { status });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/m/admin/support"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/m/admin/stats"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">Support Requests</h3>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-support-filter">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-support">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.requests?.map((r: any) => (
                  <TableRow key={r.id} data-testid={`row-support-${r.id}`}>
                    <TableCell className="font-medium">{r.email}</TableCell>
                    <TableCell>
                      <div className="max-w-[250px]">
                        <div className="font-medium truncate">{r.subject}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.message}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.platform}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Select
                        value={r.status}
                        onValueChange={(newStatus) => updateStatusMutation.mutate({ id: r.id, status: newStatus })}
                      >
                        <SelectTrigger className="w-[120px]" data-testid={`select-status-${r.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.requests || data.requests.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No support requests found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <Pagination page={page} setPage={setPage} total={data?.pagination?.total || 0} limit={15} />
        </>
      )}
    </div>
  );
}

function ErrorsTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/errors", `?page=${page}&limit=15`],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold">Error Logs</h3>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-errors">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.errors?.map((e: any) => (
                  <TableRow key={e.id} data-testid={`row-error-${e.id}`}>
                    <TableCell>
                      <div className="max-w-[300px]">
                        <div className="font-medium text-destructive truncate">{e.errorMessage}</div>
                        {e.errorStack && (
                          <div className="text-xs text-muted-foreground truncate mt-1">{e.errorStack}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {e.errorCode ? <Badge variant="outline">{e.errorCode}</Badge> : <span className="text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.platform}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {e.endpoint || "N/A"}
                    </TableCell>
                    <TableCell>
                      {e.username ? (
                        <div>
                          <div className="text-sm">{e.username}</div>
                          <div className="text-xs text-muted-foreground">{e.email}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Anonymous</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
                  </TableRow>
                ))}
                {(!data?.errors || data.errors.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No error logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <Pagination page={page} setPage={setPage} total={data?.pagination?.total || 0} limit={15} />
        </>
      )}
    </div>
  );
}

function Pagination({ page, setPage, total, limit }: { page: number; setPage: (p: number) => void; total: number; limit: number }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} total)
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPage(page - 1)} disabled={page <= 1} data-testid="button-page-prev">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage(page + 1)} disabled={page >= totalPages} data-testid="button-page-next">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isLoading, isAdmin } = useAuth();

  const { data: statsData, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/v1/m/admin/stats"],
    enabled: isAdmin,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-16">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button size="sm" variant="ghost" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Admin Dashboard</h1>
              </div>
            </div>
            <Badge variant="default" data-testid="badge-admin-role">ADMIN</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <StatsCards stats={statsData?.stats} />
        )}

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full justify-start flex-wrap gap-1" data-testid="tabs-dashboard">
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-1" /> Users
            </TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">
              <CreditCard className="h-4 w-4 mr-1" /> Subscriptions
            </TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">
              <CreditCard className="h-4 w-4 mr-1" /> Payments
            </TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-support">
              <LifeBuoy className="h-4 w-4 mr-1" /> Support
            </TabsTrigger>
            <TabsTrigger value="errors" data-testid="tab-errors">
              <AlertTriangle className="h-4 w-4 mr-1" /> Errors
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="users"><UsersTab /></TabsContent>
            <TabsContent value="subscriptions"><SubscriptionsTab /></TabsContent>
            <TabsContent value="payments"><PaymentsTab /></TabsContent>
            <TabsContent value="support"><SupportTab /></TabsContent>
            <TabsContent value="errors"><ErrorsTab /></TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}
