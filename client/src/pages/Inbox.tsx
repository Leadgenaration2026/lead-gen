import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Inbox as InboxIcon, RefreshCw, CheckCircle2, XCircle, Loader2, Mail,
  ShieldAlert, MailWarning, Newspaper, UserX, HelpCircle, StopCircle,
} from "lucide-react";
import { toast } from "sonner";

type FilterClassification = "all" | "genuine" | "auto_reply" | "newsletter" | "spam" | "bounce" | "unsubscribe" | "unknown";

const CLASSIFICATION_META: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  genuine: { label: "Genuine Reply", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  auto_reply: { label: "Auto-Reply", color: "bg-amber-100 text-amber-800 border-amber-200", icon: MailWarning },
  newsletter: { label: "Newsletter", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Newspaper },
  spam: { label: "Spam", color: "bg-red-100 text-red-800 border-red-200", icon: ShieldAlert },
  bounce: { label: "Bounce", color: "bg-orange-100 text-orange-800 border-orange-200", icon: XCircle },
  unsubscribe: { label: "Unsubscribe", color: "bg-slate-100 text-slate-800 border-slate-200", icon: UserX },
  unknown: { label: "Unknown", color: "bg-gray-100 text-gray-800 border-gray-200", icon: HelpCircle },
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InboxPage() {
  const [filter, setFilter] = useState<FilterClassification>("all");

  const repliesQuery = trpc.inbox.list.useQuery({ limit: 200 });
  const statsQuery = trpc.inbox.getStats.useQuery();
  const syncStatusQuery = trpc.inbox.getSyncStatus.useQuery();

  const enableSyncMutation = trpc.inbox.enableInboxSync.useMutation({
    onSuccess: () => { toast.success("Inbox sync enabled!"); syncStatusQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to enable inbox sync"),
  });
  const disableSyncMutation = trpc.inbox.disableInboxSync.useMutation({
    onSuccess: () => { toast.success("Inbox sync paused."); syncStatusQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to pause inbox sync"),
  });
  const syncNowMutation = trpc.inbox.syncNow.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Checked inbox — ${result.scanned} new message(s), ${result.matched} matched a lead.`);
      } else {
        toast.error(result.error || "Sync failed");
      }
      repliesQuery.refetch();
      statsQuery.refetch();
      syncStatusQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to sync inbox"),
  });

  const replies = useMemo(() => {
    const items = repliesQuery.data || [];
    if (filter === "all") return items;
    return items.filter((r: any) => r.classification === filter);
  }, [repliesQuery.data, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <InboxIcon className="w-6 h-6 text-fuchsia-500" /> Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Replies from leads, detected automatically via IMAP. Genuine replies stop follow-ups right away.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncNowMutation.mutate()}
          disabled={syncNowMutation.isPending || !syncStatusQuery.data?.configured}
          className="gap-2"
        >
          {syncNowMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Check Now
        </Button>
      </div>

      {/* Sync status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!syncStatusQuery.data?.configured ? (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              <MailWarning className="w-4 h-4 shrink-0" />
              IMAP isn't configured yet. Go to Settings → Integrations → Reply Inbox to connect your mailbox.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {syncStatusQuery.data?.enabled ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Running
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <StopCircle className="w-3 h-3" /> Paused
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">Checks every 5 minutes</span>
                {syncStatusQuery.data?.enabled ? (
                  <Button variant="ghost" size="sm" onClick={() => disableSyncMutation.mutate()} disabled={disableSyncMutation.isPending}>
                    Pause
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => enableSyncMutation.mutate()} disabled={enableSyncMutation.isPending}>
                    Enable
                  </Button>
                )}
              </div>
              {syncStatusQuery.data?.lastSyncedAt && (
                <p className="text-xs text-muted-foreground">Last checked: {formatDate(syncStatusQuery.data.lastSyncedAt)}</p>
              )}
              {syncStatusQuery.data?.nextExecutionAt && (
                <p className="text-xs text-muted-foreground">Next check: {formatDate(syncStatusQuery.data.nextExecutionAt)}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Replies</p>
            <p className="text-2xl font-bold">{statsQuery.data?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Genuine Replies</p>
            <p className="text-2xl font-bold text-green-600">{statsQuery.data?.genuine ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Follow-Ups Stopped</p>
            <p className="text-2xl font-bold text-blue-600">{statsQuery.data?.followUpsStopped ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Reply Rate (of replies, genuine)</p>
            <p className="text-2xl font-bold text-purple-600">
              {statsQuery.data && statsQuery.data.total > 0 ? Math.round((statsQuery.data.genuine / statsQuery.data.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterClassification)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Replies</SelectItem>
            <SelectItem value="genuine">Genuine</SelectItem>
            <SelectItem value="auto_reply">Auto-Reply</SelectItem>
            <SelectItem value="newsletter">Newsletter</SelectItem>
            <SelectItem value="spam">Spam</SelectItem>
            <SelectItem value="bounce">Bounce</SelectItem>
            <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reply list */}
      <div className="space-y-3">
        {repliesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : replies.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <InboxIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No replies yet.
            </CardContent>
          </Card>
        ) : (
          replies.map((reply: any) => {
            const meta = CLASSIFICATION_META[reply.classification] || CLASSIFICATION_META.unknown;
            const Icon = meta.icon;
            return (
              <Card key={reply.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge variant="outline" className={`text-xs gap-1 ${meta.color}`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </Badge>
                        {reply.followUpsStopped ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                            <StopCircle className="w-3 h-3" /> Follow-ups stopped
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground ml-auto">{formatDate(reply.receivedAt)}</span>
                      </div>
                      <p className="text-sm font-medium truncate">
                        {reply.leadName ? `${reply.leadName}${reply.companyName ? ` — ${reply.companyName}` : ""}` : reply.fromEmail}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{reply.fromEmail}</p>
                      {reply.subject && <p className="text-sm font-medium mt-1.5">{reply.subject}</p>}
                      {reply.bodySnippet && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{reply.bodySnippet}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
