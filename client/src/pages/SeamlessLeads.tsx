import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowRight, Trash2, RotateCcw, History, Archive } from "lucide-react";
import { toast } from "sonner";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function filtersSummary(s: any): string {
  const parts = [s.country, s.state, s.companySize ? `${s.companySize} employees` : null, s.industryOverride].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No extra filters";
}

export default function SeamlessLeadsPage() {
  const [, navigate] = useLocation();

  const searchesQuery = trpc.seamlessSearches.list.useQuery();
  const deleteSearchMutation = trpc.seamlessSearches.delete.useMutation();

  const deletedLeadsQuery = trpc.deletedLeads.list.useQuery();
  const restoreLeadMutation = trpc.deletedLeads.restore.useMutation();
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<number>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<number>>(new Set());

  const handleContinueSearch = (id: number) => {
    navigate(`/all-leads?resumeSearchId=${id}`);
  };

  const handleDeleteSearch = async (id: number) => {
    try {
      await deleteSearchMutation.mutateAsync({ id });
      toast.success("Removed from search history");
      searchesQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove search");
    }
  };

  const toggleArchiveSelection = (id: number) => {
    setSelectedArchiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleRestoreSelected = async () => {
    const ids = Array.from(selectedArchiveIds);
    if (ids.length === 0) return;
    setRestoringIds(new Set(ids));
    let restored = 0;
    for (const archiveId of ids) {
      try {
        await restoreLeadMutation.mutateAsync({ archiveId });
        restored++;
      } catch (error: any) {
        toast.error(error?.message || `Failed to restore lead #${archiveId}`);
      }
    }
    setRestoringIds(new Set());
    setSelectedArchiveIds(new Set());
    toast.success(`Restored ${restored} of ${ids.length} lead(s) back to your active data`);
    deletedLeadsQuery.refetch();
  };

  const handleRestoreOne = async (archiveId: number) => {
    setRestoringIds(new Set([archiveId]));
    try {
      await restoreLeadMutation.mutateAsync({ archiveId });
      toast.success("Lead restored to your active data");
      deletedLeadsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "Failed to restore lead");
    } finally {
      setRestoringIds(new Set());
    }
  };

  const searches = searchesQuery.data || [];
  const deletedLeads = deletedLeadsQuery.data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seamless Leads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every Seamless.AI search you've run, so you can pick up exactly where you left off -- even a different day -- plus a record of anything deleted so you can bring individual leads back.
        </p>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history" className="gap-1.5"><History className="w-4 h-4" /> Search History</TabsTrigger>
          <TabsTrigger value="deleted" className="gap-1.5"><Archive className="w-4 h-4" /> Deleted Leads {deletedLeads.length > 0 ? `(${deletedLeads.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Search History</CardTitle>
              <CardDescription>Every search is saved automatically. Click Continue on any search that still has more results on Seamless.</CardDescription>
            </CardHeader>
            <CardContent>
              {searchesQuery.isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : searches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No searches yet -- run a Seamless.AI search from the All Leads page to see it here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instruction</TableHead>
                        <TableHead>Lead Set / Tag</TableHead>
                        <TableHead>Filters</TableHead>
                        <TableHead>Extracted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searches.map((s: any) => {
                        const remaining = typeof s.totalAvailable === "number" ? Math.max(0, s.totalAvailable - (s.extractedSoFar || 0)) : null;
                        // A search can lose its own pagination cursor
                        // (nextToken) while Seamless's totalAvailable estimate
                        // still shows more -- their pagination for a query
                        // doesn't always reach the exact count they report.
                        // Only treat it as a genuine dead end when we KNOW
                        // there's nothing left (remaining === 0); otherwise
                        // Continue still works, it just starts a fresh search
                        // with the same criteria instead of resuming the old
                        // cursor (the backend's dedup keeps it from repeating
                        // already-extracted leads).
                        const knownExhausted = remaining === 0;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="max-w-[280px] truncate" title={s.instruction}>{s.instruction}</TableCell>
                            <TableCell className="max-w-[160px] truncate text-sm" title={s.leadSetName || undefined}>
                              {s.leadSetName ? (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 font-normal">{s.leadSetName}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not named</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={filtersSummary(s)}>{filtersSummary(s)}</TableCell>
                            <TableCell className="text-sm">
                              {s.extractedSoFar || 0}
                              {typeof s.totalAvailable === "number" ? ` / ${s.totalAvailable.toLocaleString()}` : ""}
                              {remaining !== null && remaining > 0 && (
                                <span className="text-xs text-muted-foreground"> ({remaining.toLocaleString()} left)</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {knownExhausted ? (
                                <Badge variant="outline" className="border-gray-300 text-gray-500">Exhausted</Badge>
                              ) : (
                                <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-400">More available</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(s.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  disabled={knownExhausted}
                                  onClick={() => handleContinueSearch(s.id)}
                                  title={knownExhausted ? "Seamless has no more results for this search" : s.nextToken ? undefined : "No saved cursor -- this will run a fresh search with the same criteria"}
                                >
                                  Continue <ArrowRight className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                  onClick={() => handleDeleteSearch(s.id)}
                                  title="Remove from history"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deleted" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Deleted Leads</CardTitle>
              <CardDescription>
                Leads deleted from an imported list are excluded from Seamless permanently. Leads deleted via a tag are freed up so Seamless can offer them again on a future search.
                Either way, nothing is truly gone -- select any lead below and restore it back into your active data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deletedLeadsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : deletedLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nothing deleted yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">{selectedArchiveIds.size} selected</p>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={selectedArchiveIds.size === 0 || restoringIds.size > 0}
                      onClick={handleRestoreSelected}
                    >
                      {restoringIds.size > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore Selected
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Lead</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Deleted From</TableHead>
                          <TableHead>Effect</TableHead>
                          <TableHead>Deleted</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deletedLeads.map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedArchiveIds.has(d.id)}
                                onCheckedChange={() => toggleArchiveSelection(d.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{d.leadName || "—"}</div>
                              <div className="text-xs text-muted-foreground">{d.leadCompany || ""}</div>
                            </TableCell>
                            <TableCell className="text-xs">{d.leadEmail || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.sourceListName || d.leadSetName || "—"}</TableCell>
                            <TableCell>
                              {d.deletedVia === "list" ? (
                                <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400">Excluded from Seamless</Badge>
                              ) : (
                                <Badge variant="outline" className="border-green-300 text-green-700 dark:text-green-400">Free to re-extract</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(d.deletedAt)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={restoringIds.has(d.id)}
                                onClick={() => handleRestoreOne(d.id)}
                              >
                                {restoringIds.has(d.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                Restore
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
