import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  valid: "Valid", invalid: "Invalid", catch_all: "Catch-All", role_based: "Role-Based", disposable: "Disposable", unknown: "Unknown",
};
const STATUS_COLORS: Record<string, string> = {
  valid: "border-green-300 text-green-700 dark:text-green-400",
  invalid: "border-red-300 text-red-700 dark:text-red-400",
  disposable: "border-red-300 text-red-700 dark:text-red-400",
  catch_all: "border-amber-300 text-amber-700 dark:text-amber-400",
  role_based: "border-amber-300 text-amber-700 dark:text-amber-400",
  unknown: "border-gray-300 text-gray-500",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function EmailVerificationPage() {
  const jobsQuery = trpc.verification.listJobs.useQuery();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const reverifyMutation = trpc.verification.reverifySelected.useMutation();
  const utils = trpc.useUtils();

  const jobs = jobsQuery.data || [];
  const activeJobId = selectedJobId || jobs[0]?.jobId || null;

  const jobStatusQuery = trpc.verification.getJobStatus.useQuery(
    { jobId: activeJobId as string },
    { enabled: !!activeJobId, refetchInterval: (query) => (query.state.data?.status === "in_progress" || query.state.data?.status === "pending" ? 2000 : false) }
  );
  const resultsQuery = trpc.verification.listResults.useQuery(
    { jobId: activeJobId as string, status: statusFilter === "all" ? undefined : (statusFilter as any) },
    { enabled: !!activeJobId }
  );

  const job = jobStatusQuery.data;
  const results = resultsQuery.data || [];
  const inProgress = job?.status === "in_progress" || job?.status === "pending";

  const toggleSelected = (leadId: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const handleReverify = async () => {
    if (selectedLeadIds.size === 0) return;
    try {
      const result = await reverifyMutation.mutateAsync({ leadIds: Array.from(selectedLeadIds) });
      toast.success(`Re-verification started (${result.totalToVerify} lead(s))`);
      setSelectedLeadIds(new Set());
      utils.verification.listJobs.invalidate();
      setSelectedJobId(result.jobId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to start re-verification");
    }
  };

  const handleExport = () => {
    if (results.length === 0) return;
    const header = ["Email", "Status", "Provider", "Score", "Reason", "Should Send", "Verified At"];
    const rows = results.map((r: any) => [r.email, STATUS_LABELS[r.normalizedStatus] || r.normalizedStatus, r.provider, r.score ?? "", r.reason || "", r.shouldSend ? "Yes" : "No", r.verifiedAt]);
    const csv = [header, ...rows].map((row) => row.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-verification-${activeJobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary" /> Email Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">
          In-house verification (format, MX/DNS, disposable domains, role-based addresses), automatically cross-checked by Bouncer when configured in Settings.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={activeJobId || ""} onValueChange={setSelectedJobId}>
          <SelectTrigger className="w-96"><SelectValue placeholder="Select a verification job..." /></SelectTrigger>
          <SelectContent>
            {jobs.map((j: any) => (
              <SelectItem key={j.jobId} value={j.jobId}>
                {formatDate(j.createdAt)} &middot; {j.totalEmails} email(s) &middot; {j.mode} &middot; {j.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!activeJobId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No verification jobs yet. Run "Verify Emails" from the Leads page or the AI Agent wizard.</CardContent></Card>
      ) : job ? (
        <>
          {inProgress && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...</span>
                  <span>{job.processedCount} / {job.totalEmails}</span>
                </div>
                <Progress value={job.totalEmails ? (job.processedCount / job.totalEmails) * 100 : 0} />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(["valid", "invalid", "catch_all", "role_based", "disposable", "unknown"] as const).map((s) => (
              <Card key={s}>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-xl font-bold">{job[`${s === "catch_all" ? "catchAll" : s === "role_based" ? "roleBased" : s}Count` as keyof typeof job] as any ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Results</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleReverify} disabled={selectedLeadIds.size === 0 || reverifyMutation.isPending}>
                  {reverifyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Re-verify Selected
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Should Send</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.leadId && <Checkbox checked={selectedLeadIds.has(r.leadId)} onCheckedChange={() => toggleSelected(r.leadId)} />}
                        </TableCell>
                        <TableCell className="text-sm">{r.email}</TableCell>
                        <TableCell><Badge variant="outline" className={STATUS_COLORS[r.normalizedStatus]}>{STATUS_LABELS[r.normalizedStatus] || r.normalizedStatus}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.provider}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.reason}>{r.reason}</TableCell>
                        <TableCell className="text-xs">{r.shouldSend ? "Yes" : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {results.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No results for this filter.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}
    </div>
  );
}
