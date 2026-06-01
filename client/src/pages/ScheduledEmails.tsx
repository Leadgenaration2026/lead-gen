import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, Clock, CheckCircle2, XCircle, Ban, ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50"><Clock className="w-3 h-3" />Pending</Badge>;
    case "sent":
      return <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50"><CheckCircle2 className="w-3 h-3" />Sent</Badge>;
    case "failed":
      return <Badge variant="outline" className="gap-1 text-red-600 border-red-300 bg-red-50"><XCircle className="w-3 h-3" />Failed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="gap-1 text-muted-foreground border-muted bg-muted/30"><Ban className="w-3 h-3" />Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduledEmails() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const scheduledQuery = trpc.scheduledEmails.list.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000, // refresh every 30s
  });

  const cancelMutation = trpc.scheduledEmails.cancel.useMutation({
    onSuccess: () => {
      toast.success("Scheduled email cancelled");
      scheduledQuery.refetch();
    },
    onError: () => {
      toast.error("Failed to cancel email");
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const emails = scheduledQuery.data || [];
  const pendingCount = emails.filter(e => e.status === "pending").length;
  const sentCount = emails.filter(e => e.status === "sent").length;
  const failedCount = emails.filter(e => e.status === "failed").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Scheduled Emails
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                View and manage your scheduled email queue
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => scheduledQuery.refetch()}
            disabled={scheduledQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${scheduledQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-amber-600">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-green-600">{sentCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-red-600">{failedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Queue Table */}
        <Card>
          <CardHeader>
            <CardTitle>Email Queue</CardTitle>
            <CardDescription>
              {emails.length === 0
                ? "No scheduled emails yet. Use the Email Composer to schedule emails."
                : `${emails.length} total scheduled email${emails.length !== 1 ? "s" : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No scheduled emails</p>
                <p className="text-sm mt-1">
                  Go to the{" "}
                  <button
                    className="text-primary underline hover:no-underline"
                    onClick={() => navigate("/email-composer")}
                  >
                    Email Composer
                  </button>{" "}
                  and use "Schedule Send" to queue emails for later.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Scheduled For</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {email.subject}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(email.scheduledFor)}
                        </TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {email.sentAt ? formatDate(email.sentAt) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-red-500 max-w-[150px] truncate">
                          {email.errorMessage || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {email.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => cancelMutation.mutate(email.id)}
                              disabled={cancelMutation.isPending}
                            >
                              {cancelMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Cancel"
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
