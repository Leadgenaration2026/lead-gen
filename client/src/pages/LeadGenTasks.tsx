import { useState, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, AlertTriangle, RotateCcw, X, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MediaPickerDialog } from "@/components/MediaPickerDialog";
import { COUNTRIES, US_STATES, COMPANY_SIZES, INDUSTRY_OPTIONS, JOB_TITLE_OPTIONS, STYLE_OPTIONS } from "@/lib/seamlessOptions";

const STAGE_LABELS: Record<string, string> = {
  pending: "Waiting to start",
  extracting: "Extracting leads",
  verifying: "Verifying emails",
  tagging: "Tagging leads",
  generating: "Generating landing page + emails",
  creating_campaign: "Creating campaign",
  publishing: "Publishing landing page",
  preflight: "Running pre-flight checks",
  launching: "Launching campaign",
  completed: "Completed",
  failed: "Cancelled",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function progressText(task: any): string {
  if (task.status === "extracting") return `${task.extractedCount || 0} / ${task.targetLeadCount} leads extracted`;
  return STAGE_LABELS[task.status] || task.status;
}

function TaskEvents({ taskId }: { taskId: number }) {
  const eventsQuery = trpc.leadGenTasks.events.useQuery(taskId);
  if (eventsQuery.isLoading) return <div className="py-3 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading activity...</div>;
  const events = eventsQuery.data || [];
  if (events.length === 0) return <p className="py-3 text-xs text-muted-foreground">No activity logged yet.</p>;
  return (
    <div className="py-2 space-y-1.5 max-h-48 overflow-y-auto">
      {events.map((e: any) => (
        <div key={e.id} className="text-xs flex items-center justify-between gap-2 border-b pb-1 last:border-0">
          <span className="text-muted-foreground">{e.eventType.replace(/_/g, " ")}</span>
          <span className="text-muted-foreground shrink-0">{formatDate(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeadGenTasksPage() {
  const utils = trpc.useUtils();
  const tasksQuery = trpc.leadGenTasks.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const tasks = query.state.data || [];
      const stillRunning = tasks.some((t: any) => t.status !== "completed" && t.status !== "failed");
      return stillRunning ? 5000 : false;
    },
  });
  const createTaskMutation = trpc.leadGenTasks.create.useMutation();
  const cancelMutation = trpc.leadGenTasks.cancel.useMutation();
  const retryMutation = trpc.leadGenTasks.retry.useMutation();

  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [industryFilter, setIndustryFilter] = useState("");

  const [form, setForm] = useState({
    name: "",
    country: "United States",
    state: "",
    city: "",
    companySize: "",
    industries: [] as string[],
    jobTitles: [] as string[],
    targetLeadCount: 50,
    offer: "",
    stylePreference: "clean_professional",
    landingPageName: "",
    logoUrl: "",
    scheduledAt: "",
  });

  const resetForm = () => setForm({
    name: "", country: "United States", state: "", city: "", companySize: "",
    industries: [], jobTitles: [], targetLeadCount: 50, offer: "",
    stylePreference: "clean_professional", landingPageName: "", logoUrl: "", scheduledAt: "",
  });

  const toggleIndustry = (industry: string) => {
    setForm((f) => ({
      ...f,
      industries: f.industries.includes(industry) ? f.industries.filter((i) => i !== industry) : [...f.industries, industry],
    }));
  };

  const toggleJobTitle = (title: string) => {
    setForm((f) => ({
      ...f,
      jobTitles: f.jobTitles.includes(title) ? f.jobTitles.filter((t) => t !== title) : [...f.jobTitles, title],
    }));
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.offer.trim() || !form.landingPageName.trim()) {
      toast.error("Name, offer, and landing page name are required.");
      return;
    }
    try {
      await createTaskMutation.mutateAsync({
        name: form.name.trim(),
        country: form.country || undefined,
        state: form.state || undefined,
        city: form.city.trim() || undefined,
        companySize: form.companySize || undefined,
        industries: form.industries,
        jobTitles: form.jobTitles,
        targetLeadCount: form.targetLeadCount,
        offer: form.offer.trim(),
        stylePreference: form.stylePreference || undefined,
        landingPageName: form.landingPageName.trim(),
        logoUrl: form.logoUrl || undefined,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      });
      toast.success("Task created -- it will start" + (form.scheduledAt ? " at the scheduled time." : " within a couple of minutes."));
      setShowNewTaskDialog(false);
      resetForm();
      utils.leadGenTasks.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create task");
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this task? Anything already extracted/created stays as-is -- it just won't progress further.")) return;
    try {
      await cancelMutation.mutateAsync(id);
      utils.leadGenTasks.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel");
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await retryMutation.mutateAsync(id);
      toast.success("Cleared -- it'll resume from where it stopped on the next check-in.");
      utils.leadGenTasks.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Failed to retry");
    }
  };

  const tasks = tasksQuery.data || [];
  const filteredIndustries = industryFilter.trim()
    ? INDUSTRY_OPTIONS.filter((i) => i.toLowerCase().includes(industryFilter.toLowerCase()))
    : INDUSTRY_OPTIONS;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> Lead Gen Head</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Submit one brief -- country, city, company size, industry, lead count, landing page offer -- and it runs the whole pipeline (extract, verify, tag, generate, publish, launch) unattended, picking up automatically every couple of minutes until it's done. Alerts here if anything needs your attention.
          </p>
        </div>
        <Button onClick={() => setShowNewTaskDialog(true)} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {tasksQuery.isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No tasks yet -- click "New Task" to submit your first brief.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task: any) => (
                    <Fragment key={task.id}>
                      <TableRow>
                        <TableCell className="font-medium max-w-[200px] truncate" title={task.name}>{task.name}</TableCell>
                        <TableCell>
                          {task.needsAttention ? (
                            <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400 gap-1">
                              <AlertTriangle className="w-3 h-3" /> Needs Attention
                            </Badge>
                          ) : task.status === "completed" ? (
                            <Badge variant="outline" className="border-green-300 text-green-700 dark:text-green-400">Completed</Badge>
                          ) : task.status === "failed" ? (
                            <Badge variant="outline" className="border-gray-300 text-gray-500">Cancelled</Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-400 gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Running
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.needsAttention ? (
                            <span className="text-red-600 dark:text-red-400">{task.attentionReason}</span>
                          ) : (
                            progressText(task)
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{task.scheduledAt ? formatDate(task.scheduledAt) : "Immediately"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(task.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {task.needsAttention && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleRetry(task.id)} disabled={retryMutation.isPending}>
                                <RotateCcw className="w-3 h-3" /> Retry
                              </Button>
                            )}
                            {task.status !== "completed" && task.status !== "failed" && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => handleCancel(task.id)} title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                              title="Activity log"
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTaskId === task.id ? "rotate-180" : ""}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedTaskId === task.id && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <TaskEvents taskId={task.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Lead Gen Head Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Task name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Travel agencies - Q2" className="mt-1" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Country</label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">State (US)</label>
                <Select value={form.state || "any"} onValueChange={(v) => setForm({ ...form, state: v === "any" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">City (best-effort)</label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Optional" className="mt-1" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Seamless.AI has no real city filter -- country and state narrow the search exactly; city is only a best-effort hint.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Company size</label>
                <Select value={form.companySize || "any"} onValueChange={(v) => setForm({ ...form, companySize: v === "any" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Target lead count</label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={form.targetLeadCount}
                  onChange={(e) => setForm({ ...form, targetLeadCount: Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 1)) })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Industries ({form.industries.length} selected)</label>
              <Input value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} placeholder="Search industries..." className="mt-1 mb-2" />
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                {filteredIndustries.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => toggleIndustry(industry)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      form.industries.includes(industry) ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"
                    }`}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Job titles ({form.jobTitles.length} selected, optional)</label>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto border rounded-md p-2">
                {JOB_TITLE_OPTIONS.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => toggleJobTitle(title)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      form.jobTitles.includes(title) ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Offer / value proposition</label>
              <Textarea value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })} rows={3} placeholder="What are you offering, and why should they care?" className="mt-1" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Landing page style</label>
              <div className="grid gap-1.5 mt-1">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, stylePreference: opt.value })}
                    className={`text-left px-3 py-2 rounded-md border transition-colors ${
                      form.stylePreference === opt.value ? "border-primary bg-primary/5" : "border-input hover:bg-muted"
                    }`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Landing page name</label>
                <Input value={form.landingPageName} onChange={(e) => setForm({ ...form, landingPageName: e.target.value })} placeholder="e.g. Travel Agency Outreach" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Start (leave blank to start ASAP)</label>
                <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Logo (optional)</label>
              <div className="mt-1">
                <MediaPickerDialog
                  value={form.logoUrl || undefined}
                  onSelect={(url) => setForm({ ...form, logoUrl: url })}
                  recommendedSize="Recommended: ~400x120px PNG, transparent background works best"
                  aspect={null}
                  triggerLabel="Choose logo"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createTaskMutation.isPending} className="gap-1.5">
              {createTaskMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
