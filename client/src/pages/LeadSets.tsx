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
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderPlus, Pencil, Trash2, Merge, Users, ChevronDown, ChevronRight, Plus, CheckCircle2, AlertTriangle, ShieldAlert, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function LeadSetsPage() {
  const { user, isLoading: authLoading } = useAuth() as any;
  const [, navigate] = useLocation();

  const leadSetsQuery = trpc.leadSets.listTags.useQuery(undefined, { enabled: !!user });
  const leadsQuery = trpc.leads.list.useQuery(undefined, { enabled: !!user });
  const createMutation = trpc.leadSets.create.useMutation();
  const renameMutation = trpc.leadSets.rename.useMutation();
  const deleteMutation = trpc.leadSets.delete.useMutation();
  const mergeMutation = trpc.leadSets.merge.useMutation();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSetId, setRenameSetId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSetId, setDeleteSetId] = useState<number | null>(null);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const [expandedSetId, setExpandedSetId] = useState<number | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSetName, setNewSetName] = useState("");

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

  const getLeadCount = (setId: number) => allLeads.filter((l: any) => l.leadSetId === setId).length;
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

  const handleCreateSet = async () => {
    if (!newSetName.trim()) return;
    try {
      await createMutation.mutateAsync({ name: newSetName.trim() });
      toast.success("Lead set created");
      setCreateDialogOpen(false);
      setNewSetName("");
      leadSetsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create");
    }
  };

  const toggleExpand = (setId: number) => {
    setExpandedSetId(expandedSetId === setId ? null : setId);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lead Sets (Tags)</h1>
            <p className="text-muted-foreground text-sm">Manage your custom tags to organize leads into batches for email campaigns</p>
          </div>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Create New Tag
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
                  <p className="text-xs text-muted-foreground">Tags Created</p>
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
                  <p className="text-xs text-muted-foreground">Untagged Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tags List */}
        <Card>
          <CardHeader>
            <CardTitle>All Tags</CardTitle>
            <CardDescription>Click a tag to see email verification breakdown. Use tags to select leads when sending bulk campaigns.</CardDescription>
          </CardHeader>
          <CardContent>
            {leadSets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No tags yet</p>
                <p className="text-sm mt-1">Create a tag and assign leads to it from the All Leads page</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leadSets.map((set: any) => (
                  <div key={set.id} className="border rounded-lg overflow-hidden">
                    {/* Tag Row */}
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
                            title="Merge into another tag"
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

                    {/* Expanded: verification breakdown */}
                    {expandedSetId === set.id && (
                      <div className="border-t bg-muted/20 px-4 py-3">
                        {(() => {
                          const setLeads = allLeads.filter((l: any) => l.leadSetId === set.id);
                          const verified = setLeads.filter((l: any) => l.emailVerificationStatus === "deliverable").length;
                          const undeliverable = setLeads.filter((l: any) => l.emailVerificationStatus === "undeliverable").length;
                          const risky = setLeads.filter((l: any) => l.emailVerificationStatus === "risky").length;
                          const pending = setLeads.filter((l: any) => !l.emailVerificationStatus || l.emailVerificationStatus === "pending").length;
                          return (
                            <div className="flex flex-wrap gap-4 items-center">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span className="text-sm"><span className="font-medium text-green-700">{verified}</span> verified</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-red-600" />
                                <span className="text-sm"><span className="font-medium text-red-700">{undeliverable}</span> undeliverable</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                                <span className="text-sm"><span className="font-medium text-amber-700">{risky}</span> risky</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm"><span className="font-medium">{pending}</span> pending</span>
                              </div>
                              <div className="ml-auto">
                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/all-leads?setId=${set.id}`); }}>
                                  View Leads in All Leads
                                </Button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Tag Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create New Tag</DialogTitle>
              <DialogDescription>
                Create a tag name to group leads for batch email sending (e.g., "Motivational Speaker Set 1")
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Tag name..."
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateSet(); }}
              />
              <Button onClick={handleCreateSet} disabled={createMutation.isPending || !newSetName.trim()} className="w-full">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Tag
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Tag</DialogTitle>
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
                Merge Tag
              </DialogTitle>
              <DialogDescription>
                Move all leads from "{leadSets.find((s: any) => s.id === mergeSourceId)?.name}" into another tag, then delete the source tag.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Merge into:</label>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select target tag..." />
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

        {/* Delete Tag Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Delete Tag?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the tag "{leadSets.find((s: any) => s.id === deleteSetId)?.name}". The leads inside will be kept but become untagged. This action cannot be undone.
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
                Delete Tag
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
