import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, FolderPlus, Pencil, Trash2, Merge, Users, ChevronDown, ChevronRight, Save, X, Plus, CheckCircle2, AlertTriangle, ShieldAlert, HelpCircle, Search, Globe, Linkedin, Instagram, Facebook, TrendingUp, TrendingDown } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { toast } from "sonner";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

// Format phone number for display
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Email verification status badge
function EmailStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "pending") return <Badge variant="secondary" className="text-xs">Pending</Badge>;
  if (status === "deliverable") return <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
  if (status === "undeliverable") return <Badge variant="destructive" className="text-xs"><ShieldAlert className="w-3 h-3 mr-1" />Blocked</Badge>;
  if (status === "risky") return <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100"><AlertTriangle className="w-3 h-3 mr-1" />Risky</Badge>;
  return <Badge variant="secondary" className="text-xs"><HelpCircle className="w-3 h-3 mr-1" />Unknown</Badge>;
}

// Engagement score badge
function EngagementBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  let color = "bg-gray-100 text-gray-700";
  let label = "Low";
  if (score >= 70) { color = "bg-green-100 text-green-800"; label = "High"; }
  else if (score >= 40) { color = "bg-amber-100 text-amber-800"; label = "Medium"; }
  return (
    <Badge className={`text-xs ${color} hover:${color}`}>
      {score} - {label}
    </Badge>
  );
}

export default function LeadSetsPage() {
  const { user, isLoading: authLoading } = useAuth() as any;
  const [, navigate] = useLocation();

  const leadSetsQuery = trpc.leadSets.list.useQuery(undefined, { enabled: !!user });
  const leadsQuery = trpc.leads.list.useQuery(undefined, { enabled: !!user });
  const createMutation = trpc.leadSets.create.useMutation();
  const renameMutation = trpc.leadSets.rename.useMutation();
  const deleteMutation = trpc.leadSets.delete.useMutation();
  const mergeMutation = trpc.leadSets.merge.useMutation();
  const deleteLeadMutation = trpc.leads.delete.useMutation();
  const updateLeadMutation = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      leadsQuery.refetch();
      setEditingLeadId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update lead");
    },
  });

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSetId, setRenameSetId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSetId, setDeleteSetId] = useState<number | null>(null);

  const [deleteLeadDialogOpen, setDeleteLeadDialogOpen] = useState(false);
  const [deleteLeadId, setDeleteLeadId] = useState<number | null>(null);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  // Expanded set and edit lead state
  const [expandedSetId, setExpandedSetId] = useState<number | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const updateTagMutation = trpc.leads.updateTag.useMutation({
    onSuccess: () => { leadsQuery.refetch(); toast.success("Tag updated"); },
    onError: (err: any) => toast.error(err?.message || "Failed to update tag"),
  });
  const handleUpdateTag = async (leadId: number, tag: string) => {
    try { await updateTagMutation.mutateAsync({ leadId, tag: tag as any }); } catch {}
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  const leadSets = leadSetsQuery.data || [];
  const allLeads = leadsQuery.data || [];

  // Count leads per set
  const getLeadCount = (setId: number) => allLeads.filter((l: any) => l.leadSetId === setId).length;
  const getLeadsForSet = (setId: number) => {
    let leads = allLeads.filter((l: any) => l.leadSetId === setId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      leads = leads.filter((l: any) =>
        (l.ownerName || "").toLowerCase().includes(q) ||
        (l.companyName || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.phoneNumber || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
      );
    }
    return leads;
  };
  const unassignedCount = allLeads.filter((l: any) => !l.leadSetId).length;

  const handleRename = async () => {
    if (!renameName.trim() || !renameSetId) return;
    try {
      await renameMutation.mutateAsync({ id: renameSetId, name: renameName.trim() });
      toast.success("Lead set renamed");
      setRenameDialogOpen(false);
      setRenameSetId(null);
      setRenameName("");
      leadSetsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to rename");
    }
  };

  const handleDeleteSet = async () => {
    if (!deleteSetId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteSetId });
      toast.success("Lead set deleted (leads kept as unassigned)");
      setDeleteDialogOpen(false);
      setDeleteSetId(null);
      leadSetsQuery.refetch();
      leadsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete");
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteLeadId) return;
    try {
      await deleteLeadMutation.mutateAsync(deleteLeadId);
      toast.success("Lead deleted permanently");
      setDeleteLeadDialogOpen(false);
      setDeleteLeadId(null);
      leadsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete lead");
    }
  };

  const handleMerge = async () => {
    if (!mergeSourceId || !mergeTargetId) return;
    try {
      const result = await mergeMutation.mutateAsync({
        sourceSetId: mergeSourceId,
        targetSetId: parseInt(mergeTargetId),
      });
      toast.success(`Merged ${result.mergedCount} leads into target set`);
      setMergeDialogOpen(false);
      setMergeSourceId(null);
      setMergeTargetId("");
      leadSetsQuery.refetch();
      leadsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to merge");
    }
  };

  const handleEditLead = (lead: any) => {
    setEditingLeadId(lead.id);
    setEditForm({
      companyName: lead.companyName || "",
      ownerName: lead.ownerName || "",
      jobTitle: lead.jobTitle || "",
      email: lead.email || "",
      phoneNumber: lead.phoneNumber || "",
      website: lead.website || "",
      industry: lead.industry || "",
      linkedinUrl: lead.linkedinUrl || "",
      instagramUrl: lead.instagramUrl || "",
      facebookUrl: lead.facebookUrl || "",
      status: lead.status || "new",
      tag: lead.tag || "none",
    });
  };

  const handleSaveEdit = () => {
    if (!editingLeadId) return;
    updateLeadMutation.mutate({ id: editingLeadId, data: editForm });
  };

  const handleCancelEdit = () => {
    setEditingLeadId(null);
    setEditForm({});
  };

  const toggleExpand = (setId: number) => {
    setExpandedSetId(expandedSetId === setId ? null : setId);
    setEditingLeadId(null);
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lead Sets</h1>
              <p className="text-muted-foreground text-sm">Organize your leads into named groups for better management</p>
            </div>
          </div>
          <Button className="gap-2" onClick={() => navigate("/dashboard?tab=leads")}>
            <Plus className="w-4 h-4" />
            Create New Lead Set
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{allLeads.length}</p>
                  <p className="text-xs text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <FolderPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{leadSets.length}</p>
                  <p className="text-xs text-muted-foreground">Lead Sets</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{unassignedCount}</p>
                  <p className="text-xs text-muted-foreground">Unassigned Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search leads by name, email, phone, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-xs text-muted-foreground mt-2">
                Showing results matching "{searchQuery}" across all lead sets
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lead Sets Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Lead Sets</CardTitle>
            <CardDescription>Click a set to expand and view its leads with full details</CardDescription>
          </CardHeader>
          <CardContent>
            {leadSets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No lead sets yet</p>
                <p className="text-sm mt-1">Import leads via CSV, AI, or manual entry on the Leads page to create sets</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leadSets.map((set: any) => (
                  <div key={set.id} className="border rounded-lg overflow-hidden">
                    {/* Set Row */}
                    <div
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(set.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedSetId === set.id ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          {set.name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{set.description || ""}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{getLeadCount(set.id)} leads</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(set.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenameSetId(set.id);
                              setRenameName(set.name);
                              setRenameDialogOpen(true);
                            }}
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMergeSourceId(set.id);
                              setMergeTargetId("");
                              setMergeDialogOpen(true);
                            }}
                            title="Merge into another set"
                            disabled={leadSets.length < 2}
                          >
                            <Merge className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteSetId(set.id);
                              setDeleteDialogOpen(true);
                            }}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Leads List with full details */}
                    {(expandedSetId === set.id || (searchQuery.trim() && getLeadsForSet(set.id).length > 0)) && (
                      <div className="border-t bg-muted/20 px-4 py-3">
                        {getLeadsForSet(set.id).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No leads in this set</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Company</TableHead>
                                  <TableHead>Owner</TableHead>
                                  <TableHead>Job Title</TableHead>
                                  <TableHead>Industry</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>Phone</TableHead>
                                  <TableHead>Socials</TableHead>
                                  <TableHead className="text-center">Engagement Score</TableHead>
                                  <TableHead className="text-center">Email Status</TableHead>
                                  <TableHead>Country</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Tag</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {getLeadsForSet(set.id).map((lead: any) => (
                                  editingLeadId === lead.id ? (
                                    /* Edit Mode Row */
                                    <TableRow key={lead.id} className="bg-blue-50/50">
                                      <TableCell colSpan={9}>
                                        <div className="space-y-4 py-2">
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                              <Label className="text-xs">Company Name</Label>
                                              <Input
                                                value={editForm.companyName}
                                                onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Contact Name</Label>
                                              <Input
                                                value={editForm.ownerName}
                                                onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Job Title</Label>
                                              <Input
                                                value={editForm.jobTitle}
                                                onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Email</Label>
                                              <Input
                                                value={editForm.email}
                                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Phone</Label>
                                              <Input
                                                value={editForm.phoneNumber}
                                                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Industry</Label>
                                              <Input
                                                value={editForm.industry}
                                                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Website</Label>
                                              <Input
                                                value={editForm.website}
                                                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">LinkedIn URL</Label>
                                              <Input
                                                value={editForm.linkedinUrl}
                                                onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Instagram URL</Label>
                                              <Input
                                                value={editForm.instagramUrl}
                                                onChange={(e) => setEditForm({ ...editForm, instagramUrl: e.target.value })}
                                                className="mt-1 h-8 text-sm"
                                              />
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 justify-end">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={handleCancelEdit}
                                            >
                                              <X className="w-4 h-4 mr-1" /> Cancel
                                            </Button>
                                            <Button
                                              size="sm"
                                              onClick={handleSaveEdit}
                                              disabled={updateLeadMutation.isPending}
                                            >
                                              {updateLeadMutation.isPending ? (
                                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                              ) : (
                                                <Save className="w-4 h-4 mr-1" />
                                              )}
                                              Save
                                            </Button>
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    /* Display Mode Row - Exact match with main Leads page */
                                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setDrawerLeadId(lead.id); setDrawerOpen(true); }}>
                                      <TableCell className="font-medium text-sm">{lead.companyName}</TableCell>
                                      <TableCell className="text-sm">{lead.ownerName}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{lead.jobTitle || "—"}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{lead.industry || "—"}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                                      <TableCell className="text-sm">
                                        <div>{formatPhoneDisplay(lead.phoneNumber)}</div>
                                        {lead.secondaryPhone && <div className="text-xs text-muted-foreground mt-0.5">{formatPhoneDisplay(lead.secondaryPhone)}</div>}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          {lead.website && (
                                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" title="Website" className="text-muted-foreground hover:text-blue-600 transition-colors" onClick={(e) => e.stopPropagation()}>
                                              <Globe className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                          {lead.linkedinUrl && (
                                            <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" title="LinkedIn" className="text-muted-foreground hover:text-[#0A66C2] transition-colors" onClick={(e) => e.stopPropagation()}>
                                              <Linkedin className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                          {lead.instagramUrl && (
                                            <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" title="Instagram" className="text-muted-foreground hover:text-[#E4405F] transition-colors" onClick={(e) => e.stopPropagation()}>
                                              <Instagram className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                          {lead.facebookUrl && (
                                            <a href={lead.facebookUrl} target="_blank" rel="noopener noreferrer" title="Facebook" className="text-muted-foreground hover:text-[#1877F2] transition-colors" onClick={(e) => e.stopPropagation()}>
                                              <Facebook className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                          {!lead.website && !lead.linkedinUrl && !lead.instagramUrl && !lead.facebookUrl && (
                                            <span className="text-xs text-muted-foreground">—</span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {lead.engagementScore != null && lead.engagementScore > 0 ? (
                                          <HoverCard openDelay={200} closeDelay={100}>
                                            <HoverCardTrigger asChild>
                                              <div className="flex items-center justify-center gap-1.5 cursor-pointer">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                  lead.engagementScore >= 50 ? "bg-green-100 text-green-700" :
                                                  lead.engagementScore >= 30 ? "bg-yellow-100 text-yellow-700" :
                                                  "bg-gray-100 text-gray-600"
                                                }`}>
                                                  {lead.engagementScore}
                                                </div>
                                                <span className={`text-xs font-medium ${
                                                  lead.engagementScore >= 50 ? "text-green-600" :
                                                  lead.engagementScore >= 30 ? "text-yellow-600" :
                                                  "text-gray-500"
                                                }`}>
                                                  {lead.engagementScore >= 50 ? "High" : lead.engagementScore >= 30 ? "Medium" : "Low"}
                                                </span>
                                              </div>
                                            </HoverCardTrigger>
                                            <HoverCardContent className="w-72 p-3" side="left">
                                              <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-sm font-semibold">Engagement Score</span>
                                                  <span className={`text-sm font-bold ${
                                                    lead.engagementScore >= 50 ? "text-green-600" :
                                                    lead.engagementScore >= 30 ? "text-yellow-600" :
                                                    "text-gray-600"
                                                  }`}>{lead.engagementScore}/100</span>
                                                </div>
                                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full transition-all ${
                                                    lead.engagementScore >= 50 ? "bg-green-500" :
                                                    lead.engagementScore >= 30 ? "bg-yellow-500" :
                                                    "bg-gray-400"
                                                  }`} style={{ width: `${lead.engagementScore}%` }} />
                                                </div>
                                                {lead.engagementData ? (() => {
                                                  const data = typeof lead.engagementData === 'string' ? JSON.parse(lead.engagementData) : lead.engagementData;
                                                  return (
                                                    <div className="space-y-1.5 pt-1 border-t">
                                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LinkedIn (up to 75 pts)</p>
                                                      {data.linkedin ? (
                                                        <div className="space-y-0.5">
                                                          {data.linkedin.hasProfile && <div className="flex justify-between text-xs"><span>Has LinkedIn profile</span><span className="text-green-600 font-medium">+15</span></div>}
                                                          {data.linkedin.isCreator && <div className="flex justify-between text-xs"><span>Creator badge</span><span className="text-green-600 font-medium">+12</span></div>}
                                                          {data.linkedin.isTopVoice && <div className="flex justify-between text-xs"><span>Top Voice badge</span><span className="text-green-600 font-medium">+12</span></div>}
                                                          {data.linkedin.isPremium && <div className="flex justify-between text-xs"><span>Premium account</span><span className="text-green-600 font-medium">+8</span></div>}
                                                          {data.linkedin.endorsements > 50 && <div className="flex justify-between text-xs"><span>High endorsements ({data.linkedin.endorsements})</span><span className="text-green-600 font-medium">+10</span></div>}
                                                          {data.linkedin.positions >= 3 && <div className="flex justify-between text-xs"><span>Multiple positions ({data.linkedin.positions})</span><span className="text-green-600 font-medium">+6</span></div>}
                                                          {data.linkedin.hasLeadershipRole && <div className="flex justify-between text-xs"><span>Leadership role</span><span className="text-green-600 font-medium">+7</span></div>}
                                                          {data.linkedin.hasDetailedProfile && <div className="flex justify-between text-xs"><span>Detailed profile</span><span className="text-green-600 font-medium">+5</span></div>}
                                                          {data.linkedin.headline && <div className="text-xs text-muted-foreground mt-1 italic truncate">"{data.linkedin.headline}"</div>}
                                                        </div>
                                                      ) : <p className="text-xs text-muted-foreground">No LinkedIn data available</p>}
                                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Website (up to 25 pts)</p>
                                                      {data.website?.loadsSuccessfully ? (
                                                        <div className="space-y-0.5">
                                                          <div className="flex justify-between text-xs"><span>Real website confirmed</span><span className="text-green-600 font-medium">+15</span></div>
                                                          {data.website.hasSocialLinks && <div className="flex justify-between text-xs"><span>Social links on site</span><span className="text-green-600 font-medium">+5</span></div>}
                                                          <div className="flex justify-between text-xs"><span>Loads successfully</span><span className="text-green-600 font-medium">+5</span></div>
                                                        </div>
                                                      ) : data.website?.exists ? (
                                                        <div className="flex justify-between text-xs"><span className="text-red-500">Website doesn't load / parked domain</span><span className="text-red-500 font-medium">+0</span></div>
                                                      ) : <p className="text-xs text-muted-foreground">No website found</p>}
                                                      {data.scoredAt && <p className="text-[10px] text-muted-foreground pt-1 border-t">Scored: {new Date(data.scoredAt).toLocaleDateString()}</p>}
                                                    </div>
                                                  );
                                                })() : <p className="text-xs text-muted-foreground pt-1 border-t">Click row for details & website analysis.</p>}
                                              </div>
                                            </HoverCardContent>
                                          </HoverCard>
                                        ) : lead.socialMediaScore === "high" ? (
                                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs gap-1">
                                            <TrendingUp className="w-3 h-3" /> High
                                          </Badge>
                                        ) : lead.socialMediaScore === "low" ? (
                                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 text-xs gap-1">
                                            <TrendingDown className="w-3 h-3" /> Low
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 text-xs gap-1">
                                            <Loader2 className="w-3 h-3" /> Pending
                                          </Badge>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          {lead.emailVerificationStatus === "deliverable" ? (
                                            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs gap-1">
                                              <CheckCircle2 className="w-3 h-3" /> Verified
                                            </Badge>
                                          ) : lead.emailVerificationStatus === "undeliverable" ? (
                                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs gap-1">
                                              <AlertTriangle className="w-3 h-3" /> Blocked
                                            </Badge>
                                          ) : lead.emailVerificationStatus === "risky" ? (
                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs gap-1">
                                              <AlertTriangle className="w-3 h-3" /> Risky
                                            </Badge>
                                          ) : lead.emailVerificationStatus === "unknown" ? (
                                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 text-xs gap-1">
                                              Unknown
                                            </Badge>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {lead.country ? lead.country : <span className="text-muted-foreground">—</span>}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={
                                          lead.status === "new" ? "secondary" :
                                          lead.status === "contacted" ? "outline" :
                                          lead.status === "qualified" ? "default" :
                                          lead.status === "converted" ? "default" :
                                          "destructive"
                                        }>
                                          {lead.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell onClick={(e) => e.stopPropagation()}>
                                        <Select value={lead.tag || "none"} onValueChange={(val) => handleUpdateTag(lead.id, val)}>
                                          <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent hover:bg-muted/50 transition-colors">
                                            <span className={`inline-flex items-center gap-1.5 ${
                                              lead.tag === "hot" ? "text-red-700" :
                                              lead.tag === "warm" ? "text-orange-700" :
                                              lead.tag === "cold" ? "text-blue-700" :
                                              lead.tag === "follow_up" ? "text-purple-700" :
                                              "text-gray-500"
                                            }`}>
                                              <span className={`w-2 h-2 rounded-full ${
                                                lead.tag === "hot" ? "bg-red-500" :
                                                lead.tag === "warm" ? "bg-orange-500" :
                                                lead.tag === "cold" ? "bg-blue-500" :
                                                lead.tag === "follow_up" ? "bg-purple-500" :
                                                "bg-gray-400"
                                              }`} />
                                              {lead.tag === "hot" ? "Hot" : lead.tag === "warm" ? "Warm" : lead.tag === "cold" ? "Cold" : lead.tag === "follow_up" ? "Follow Up" : "No Tag"}
                                            </span>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="hot"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> Hot</span></SelectItem>
                                            <SelectItem value="warm"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" /> Warm</span></SelectItem>
                                            <SelectItem value="cold"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Cold</span></SelectItem>
                                            <SelectItem value="follow_up"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500" /> Follow Up</span></SelectItem>
                                            <SelectItem value="none"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" /> No Tag</span></SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditLead(lead)}
                                            title="Edit lead"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setDeleteLeadId(lead.id);
                                              setDeleteLeadDialogOpen(true);
                                            }}
                                            title="Delete lead"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Lead Set</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="New name..."
              />
              <Button onClick={handleRename} disabled={renameMutation.isPending} className="w-full">
                {renameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Rename
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Merge Dialog */}
        <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Merge className="w-5 h-5" />
                Merge Lead Set
              </DialogTitle>
              <DialogDescription>
                Move all leads from "{leadSets.find((s: any) => s.id === mergeSourceId)?.name}" into another set, then delete the source set.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Merge into:</label>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select target set..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSets
                      .filter((s: any) => s.id !== mergeSourceId)
                      .map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({getLeadCount(s.id)} leads)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleMerge}
                disabled={mergeMutation.isPending || !mergeTargetId}
                className="w-full"
              >
                {mergeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Merge & Delete Source
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Set Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Delete Lead Set?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the set "{leadSets.find((s: any) => s.id === deleteSetId)?.name}". The leads inside will be kept but become unassigned. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDeleteSet}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete Set
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Lead Confirmation Dialog */}
        <AlertDialog open={deleteLeadDialogOpen} onOpenChange={setDeleteLeadDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Delete Lead?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this lead from your account. It will be removed from both this lead set and the main leads list. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDeleteLead}
                disabled={deleteLeadMutation.isPending}
              >
                {deleteLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete Lead
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Lead Detail Drawer - opens on row click for website analysis & engagement details */}
        <LeadDetailDrawer
          leadId={drawerLeadId}
          open={drawerOpen}
          onClose={() => { setDrawerOpen(false); setDrawerLeadId(null); }}
        />
      </div>
    </DashboardLayout>
  );
}
