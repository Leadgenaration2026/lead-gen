import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderPlus, Pencil, Trash2, Merge, ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function LeadSetsPage() {
  const { user, isLoading: authLoading } = useAuth() as any;
  const [, navigate] = useLocation();

  const leadSetsQuery = trpc.leadSets.list.useQuery(undefined, { enabled: !!user });
  const leadsQuery = trpc.leads.list.useQuery(undefined, { enabled: !!user });
  const createMutation = trpc.leadSets.create.useMutation();
  const renameMutation = trpc.leadSets.rename.useMutation();
  const deleteMutation = trpc.leadSets.delete.useMutation();
  const mergeMutation = trpc.leadSets.merge.useMutation();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSetId, setRenameSetId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSetId, setDeleteSetId] = useState<number | null>(null);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

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
  const unassignedCount = allLeads.filter((l: any) => !l.leadSetId).length;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    try {
      await createMutation.mutateAsync({ name: newName.trim(), description: newDescription.trim() || undefined });
      toast.success("Lead set created");
      setNewName("");
      setNewDescription("");
      setCreateDialogOpen(false);
      leadSetsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create lead set");
    }
  };

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

  const handleDelete = async () => {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container max-w-5xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lead Sets</h1>
              <p className="text-muted-foreground text-sm">Organize your leads into named groups for better management</p>
            </div>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <FolderPlus className="w-4 h-4" />
                New Lead Set
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Lead Set</DialogTitle>
                <DialogDescription>Create a new group to organize your leads</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    placeholder="e.g., SaaS Companies Q1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    placeholder="Optional description..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Lead Set
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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

        {/* Lead Sets Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Lead Sets</CardTitle>
            <CardDescription>Manage your lead groups — rename, merge, or delete them</CardDescription>
          </CardHeader>
          <CardContent>
            {leadSets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No lead sets yet</p>
                <p className="text-sm mt-1">Create your first lead set to start organizing leads</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadSets.map((set: any) => (
                    <TableRow key={set.id}>
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          {set.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {set.description || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{getLeadCount(set.id)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(set.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

        {/* Delete Confirmation Dialog */}
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
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete Set
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
