import { useState, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Wand2, Trash2, UserPlus, Upload, Tag, Filter, FileSpreadsheet, AlertTriangle, FolderPlus, Layers, Download, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const TAG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  hot: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Hot" },
  warm: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Warm" },
  cold: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Cold" },
  follow_up: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Follow Up" },
  none: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", label: "No Tag" },
};

export default function LeadsPage() {
  const leadsQuery = trpc.leads.list.useQuery();
  const generateLeadsMutation = trpc.leads.generate.useMutation();
  const deleteLeadMutation = trpc.leads.delete.useMutation();
  const addLeadMutation = trpc.leads.addManual.useMutation();
  const addLeadOverwriteMutation = trpc.leads.addManualOverwrite.useMutation();
  const csvImportMutation = trpc.leads.csvImport.useMutation();
  const csvImportOverwriteMutation = trpc.leads.csvImportOverwrite.useMutation();
  const updateTagMutation = trpc.leads.updateTag.useMutation();
  const dedupCheckMutation = trpc.dedup.check.useMutation();
  const leadSetsQuery = trpc.leadSets.list.useQuery();
  const createLeadSetMutation = trpc.leadSets.create.useMutation();
  const assignLeadsMutation = trpc.leadSets.assignLeads.useMutation();

  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filterTag, setFilterTag] = useState<string>("all");
  const searchString = useSearch();
  const [filterLeadSet, setFilterLeadSet] = useState<string>("all");

  // Support URL param ?setId=123 to pre-filter by lead set
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const setId = params.get("setId");
    if (setId) {
      setFilterLeadSet(setId);
    }
  }, [searchString]);
  const [searchQuery, setSearchQuery] = useState("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualLead, setManualLead] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    phoneNumber: "",
    industry: "",
    companySize: "",
  });

  // Lead set name for AI generation and CSV import
  const [generateLeadSetName, setGenerateLeadSetName] = useState("");
  const [generateSource, setGenerateSource] = useState<"ai" | "seamless">("ai");
  const [generateCountry, setGenerateCountry] = useState("");
  const [csvLeadSetName, setCsvLeadSetName] = useState("");

  // Checkbox selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Bulk assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const bulkDeleteMutation = trpc.leads.bulkDelete.useMutation();
  const [newSetName, setNewSetName] = useState("");
  const [assignToSetId, setAssignToSetId] = useState<string>("");

  // Duplicate warning dialog state
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupDialogData, setDupDialogData] = useState<{
    mode: "manual" | "csv";
    duplicateEmails: string[];
    allLeads: any[];
    uniqueLeads: any[];
  } | null>(null);

  // Edit lead state
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    phoneNumber: "",
    website: "",
    industry: "",
    timezone: "",
  });
  const updateLeadMutation = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.success("Lead updated successfully");
      setEditingLead(null);
      leadsQuery.refetch();
    },
    onError: () => toast.error("Failed to update lead"),
  });

  // Sync edit form when editingLead changes
  const prevEditingLeadId = useRef<number | null>(null);
  if (editingLead && editingLead.id !== prevEditingLeadId.current) {
    prevEditingLeadId.current = editingLead.id;
    setEditForm({
      companyName: editingLead.companyName || "",
      ownerName: editingLead.ownerName || "",
      email: editingLead.email || "",
      phoneNumber: editingLead.phoneNumber || "",
      website: editingLead.website || "",
      industry: editingLead.industry || "",
      timezone: editingLead.timezone || "America/New_York",
    });
  }
  if (!editingLead && prevEditingLeadId.current !== null) {
    prevEditingLeadId.current = null;
  }

  const handleSaveEditLead = () => {
    if (!editingLead) return;
    updateLeadMutation.mutate({
      id: editingLead.id,
      data: {
        companyName: editForm.companyName || undefined,
        ownerName: editForm.ownerName || undefined,
        email: editForm.email || undefined,
        phoneNumber: editForm.phoneNumber || undefined,
        website: editForm.website || undefined,
        industry: editForm.industry || undefined,
        timezone: editForm.timezone || undefined,
      },
    });
  };

  const handleGenerateLeads = async () => {
    if (!instruction.trim()) {
      toast.error("Please enter an instruction");
      return;
    }
    setIsGenerating(true);
    try {
      await generateLeadsMutation.mutateAsync({
        instruction,
        count,
        leadSetName: generateLeadSetName.trim() || undefined,
        source: generateSource,
        country: generateCountry && generateCountry !== "any" ? generateCountry : undefined,
      });
      toast.success(`Generated ${count} leads successfully`);
      setInstruction("");
      setGenerateLeadSetName("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error) {
      toast.error("Failed to generate leads");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    try {
      await deleteLeadMutation.mutateAsync(leadId);
      toast.success("Lead deleted");
      setSelectedLeadIds(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to delete lead");
    }
  };

  const handleAddManualLead = async () => {
    if (!manualLead.companyName || !manualLead.ownerName || !manualLead.email || !manualLead.phoneNumber) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      const dedupResult = await dedupCheckMutation.mutateAsync({ emails: [manualLead.email] });
      if (dedupResult.duplicates.length > 0) {
        setDupDialogData({
          mode: "manual",
          duplicateEmails: dedupResult.duplicates,
          allLeads: [manualLead],
          uniqueLeads: [],
        });
        setDupDialogOpen(true);
        return;
      }
      await addLeadMutation.mutateAsync({
        companyName: manualLead.companyName,
        ownerName: manualLead.ownerName,
        email: manualLead.email,
        phoneNumber: manualLead.phoneNumber,
        industry: manualLead.industry || "Unknown",
        companySize: manualLead.companySize || "Unknown",
      });
      toast.success("Lead added successfully");
      setManualLead({ companyName: "", ownerName: "", email: "", phoneNumber: "", industry: "", companySize: "" });
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to add lead");
    }
  };

  const handleDupSkip = async () => {
    if (!dupDialogData) return;
    if (dupDialogData.mode === "manual") {
      toast.info("Duplicate lead skipped");
      setDupDialogOpen(false);
      setDupDialogData(null);
      return;
    }
    if (dupDialogData.uniqueLeads.length === 0) {
      toast.error("All leads are duplicates — nothing to import");
      setDupDialogOpen(false);
      setDupDialogData(null);
      return;
    }
    try {
      const result = await csvImportMutation.mutateAsync({
        leads: dupDialogData.uniqueLeads,
        leadSetName: csvLeadSetName.trim() || undefined,
      });
      toast.success(`Imported ${result.imported} leads (${dupDialogData.duplicateEmails.length} duplicates skipped)`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} rows had errors`);
      }
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      setCsvLeadSetName("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error) {
      toast.error("Failed to import leads");
    }
    setDupDialogOpen(false);
    setDupDialogData(null);
  };

  const handleDupOverwrite = async () => {
    if (!dupDialogData) return;
    if (dupDialogData.mode === "manual") {
      try {
        const lead = dupDialogData.allLeads[0];
        await addLeadOverwriteMutation.mutateAsync({
          companyName: lead.companyName,
          ownerName: lead.ownerName,
          email: lead.email,
          phoneNumber: lead.phoneNumber,
          industry: lead.industry || "Unknown",
          companySize: lead.companySize || "Unknown",
        });
        toast.success("Lead updated (existing record overwritten)");
        setManualLead({ companyName: "", ownerName: "", email: "", phoneNumber: "", industry: "", companySize: "" });
        leadsQuery.refetch();
      } catch (error) {
        toast.error("Failed to overwrite lead");
      }
    } else {
      try {
        const result = await csvImportOverwriteMutation.mutateAsync({ leads: dupDialogData.allLeads });
        toast.success(`Imported ${result.imported} leads (duplicates overwritten)`);
        if (result.errors.length > 0) {
          toast.warning(`${result.errors.length} rows had errors`);
        }
        setCsvDialogOpen(false);
        setCsvPreview([]);
        setCsvFileName("");
        setCsvLeadSetName("");
        leadsQuery.refetch();
        leadSetsQuery.refetch();
      } catch (error) {
        toast.error("Failed to import leads");
      }
    }
    setDupDialogOpen(false);
    setDupDialogData(null);
  };

  const handleUpdateTag = async (leadId: number, tag: string) => {
    try {
      await updateTagMutation.mutateAsync({ leadId, tag: tag as any });
      toast.success(`Tag updated to "${TAG_COLORS[tag]?.label || tag}"`);
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to update tag");
    }
  };

  // CSV file handling
  const handleCSVFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase().replace(/[\s_]+/g, " "),
      complete: (results: any) => {
        if (!results.data || results.data.length === 0) {
          toast.error("CSV file is empty or has no valid data rows");
          return;
        }

        const rows: any[] = [];
        const errors: string[] = [];

        results.data.forEach((record: any, idx: number) => {
          const row: any = {};
          for (const [key, val] of Object.entries(record)) {
            const header = (key as string).toLowerCase();
            const value = ((val as string) || "").trim();
            if (!value) continue;

            if (header.includes("company") && (header.includes("name") || header === "company")) row.companyName = value;
            else if (header === "company") row.companyName = value;
            else if (header.includes("owner") || header.includes("contact") || header === "name" || header === "full name") row.ownerName = value;
            else if (header.includes("email") || header.includes("e-mail")) row.email = value;
            else if (header.includes("phone") || header.includes("mobile") || header.includes("tel")) row.phoneNumber = value;
            else if (header.includes("website") || header.includes("url")) row.website = value;
            else if (header.includes("industry") || header.includes("sector") || header.includes("vertical")) row.industry = value;
            else if (header.includes("size") || header.includes("employees")) row.companySize = value;
            else if (header.includes("tag") || header.includes("label") || header.includes("priority")) {
              const tagVal = value.toLowerCase().replace(/[\s-]+/g, "_");
              if (["hot", "warm", "cold", "follow_up"].includes(tagVal)) row.tag = tagVal;
            }
          }

          const values = Object.values(record).map((v) => ((v as string) || "").trim());
          if (!row.companyName && values[0]) row.companyName = values[0];
          if (!row.ownerName && values[1]) row.ownerName = values[1];
          if (!row.email && values[2]) row.email = values[2];
          if (!row.phoneNumber && values[3]) row.phoneNumber = values[3];

          if (!row.companyName || !row.ownerName || !row.email || !row.phoneNumber) {
            errors.push(`Row ${idx + 2}: Missing required fields`);
            return;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            errors.push(`Row ${idx + 2}: Invalid email "${row.email}"`);
            return;
          }

          rows.push(row);
        });

        if (rows.length === 0) {
          toast.error("No valid leads found. Ensure columns: Company Name, Owner Name, Email, Phone Number");
          if (errors.length > 0) toast.error(errors.slice(0, 3).join("\n"));
          return;
        }

        if (errors.length > 0) {
          toast.warning(`${errors.length} rows skipped due to errors`);
        }

        setCsvPreview(rows);
        setCsvDialogOpen(true);
      },
      error: (error: any) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCSVImport = async () => {
    if (csvPreview.length === 0) return;
    try {
      const emails = csvPreview.map((r: any) => r.email).filter(Boolean);
      const dedupResult = await dedupCheckMutation.mutateAsync({ emails });
      const dupSet = new Set(dedupResult.duplicates);
      const uniqueLeads = csvPreview.filter((r: any) => !dupSet.has(r.email));
      const dupCount = csvPreview.length - uniqueLeads.length;

      if (dupCount > 0) {
        setDupDialogData({
          mode: "csv",
          duplicateEmails: dedupResult.duplicates,
          allLeads: csvPreview,
          uniqueLeads,
        });
        setDupDialogOpen(true);
        return;
      }

      const result = await csvImportMutation.mutateAsync({
        leads: csvPreview,
        leadSetName: csvLeadSetName.trim() || undefined,
      });
      toast.success(`Successfully imported ${result.imported} leads`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} rows had errors`);
      }
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      setCsvLeadSetName("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error) {
      toast.error("Failed to import CSV leads");
    }
  };

  // Selection handlers
  const handleToggleSelect = (leadId: number) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l: any) => l.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedLeadIds.size === 0) return;

    let targetSetId: number | null = null;

    if (assignToSetId === "new" && newSetName.trim()) {
      try {
        const result = await createLeadSetMutation.mutateAsync({ name: newSetName.trim() });
        targetSetId = result.id as number;
      } catch (error) {
        toast.error("Failed to create lead set");
        return;
      }
    } else if (assignToSetId === "remove") {
      targetSetId = null;
    } else if (assignToSetId && assignToSetId !== "new") {
      targetSetId = parseInt(assignToSetId);
    } else {
      toast.error("Please select a lead set");
      return;
    }

    try {
      await assignLeadsMutation.mutateAsync({
        leadIds: Array.from(selectedLeadIds),
        leadSetId: targetSetId,
      });
      toast.success(`${selectedLeadIds.size} lead(s) assigned to set`);
      setSelectedLeadIds(new Set());
      setAssignDialogOpen(false);
      setNewSetName("");
      setAssignToSetId("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error) {
      toast.error("Failed to assign leads");
    }
  };

  // Filter leads
  const filteredLeads = useMemo(() => {
    return (leadsQuery.data || []).filter((lead: any) => {
      const matchesTag = filterTag === "all" || lead.tag === filterTag;
      const matchesSearch =
        !searchQuery ||
        lead.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSet =
        filterLeadSet === "all" ||
        (filterLeadSet === "unassigned" ? !lead.leadSetId : lead.leadSetId === parseInt(filterLeadSet));
      return matchesTag && matchesSearch && matchesSet;
    });
  }, [leadsQuery.data, filterTag, searchQuery, filterLeadSet]);

  const leadSets = leadSetsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Duplicate Warning Dialog */}
      <AlertDialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicate Leads Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {dupDialogData?.mode === "manual"
                    ? "A lead with this email already exists in your database:"
                    : `${dupDialogData?.duplicateEmails.length} lead(s) already exist in your database:`}
                </p>
                <div className="bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto">
                  {dupDialogData?.duplicateEmails.map((email, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-sm font-mono">{email}</span>
                    </div>
                  ))}
                </div>
                {dupDialogData?.mode === "csv" && dupDialogData.uniqueLeads.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {dupDialogData.uniqueLeads.length} unique lead(s) can still be imported.
                  </p>
                )}
                <p className="text-sm font-medium">What would you like to do?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            <AlertDialogCancel onClick={() => { setDupDialogOpen(false); setDupDialogData(null); }}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleDupSkip}
              disabled={csvImportMutation.isPending}
              className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
            >
              {dupDialogData?.mode === "manual" ? "Skip Duplicate" : `Skip ${dupDialogData?.duplicateEmails.length} Duplicate(s)`}
            </Button>
            <Button
              onClick={handleDupOverwrite}
              disabled={addLeadMutation.isPending || addLeadOverwriteMutation.isPending || csvImportMutation.isPending || csvImportOverwriteMutation.isPending}
              className="bg-primary"
            >
              {(addLeadMutation.isPending || addLeadOverwriteMutation.isPending || csvImportMutation.isPending || csvImportOverwriteMutation.isPending) ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</>
              ) : (
                dupDialogData?.mode === "manual" ? "Add Anyway" : "Import All (Overwrite)"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Assign to Lead Set Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5" />
              Assign to Lead Set
            </DialogTitle>
            <DialogDescription>
              Assign {selectedLeadIds.size} selected lead(s) to a lead set
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Choose Lead Set</label>
              <Select value={assignToSetId} onValueChange={setAssignToSetId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a lead set..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <span className="flex items-center gap-2"><FolderPlus className="w-3.5 h-3.5" /> Create New Set</span>
                  </SelectItem>
                  <SelectItem value="remove">
                    <span className="flex items-center gap-2 text-muted-foreground">Remove from set</span>
                  </SelectItem>
                  {leadSets.map((set: any) => (
                    <SelectItem key={set.id} value={String(set.id)}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assignToSetId === "new" && (
              <div>
                <label className="text-sm font-medium">New Set Name</label>
                <Input
                  placeholder="e.g., SaaS Companies Q1"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <Button
              onClick={handleBulkAssign}
              disabled={assignLeadsMutation.isPending || createLeadSetMutation.isPending}
              className="w-full"
            >
              {(assignLeadsMutation.isPending || createLeadSetMutation.isPending) ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Assigning...</>
              ) : (
                `Assign ${selectedLeadIds.size} Lead(s)`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete {selectedLeadIds.size} Lead(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All selected leads and their associated data (emails, calls, campaign links) will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={async () => {
                try {
                  const ids = Array.from(selectedLeadIds);
                  await bulkDeleteMutation.mutateAsync({ leadIds: ids });
                  toast.success(`Deleted ${ids.length} lead(s)`);
                  setSelectedLeadIds(new Set());
                  setBulkDeleteDialogOpen(false);
                  leadsQuery.refetch();
                } catch (error: any) {
                  toast.error(error?.message || "Failed to delete leads");
                }
              }}
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deleting...</>
              ) : (
                `Delete ${selectedLeadIds.size} Lead(s)`
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Buttons Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Manual Lead Entry */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-20 flex-col gap-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all">
                  <UserPlus className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium">Add Lead Manually</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                  <DialogDescription>Enter the details of the lead you want to add</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Company Name *</label>
                    <Input placeholder="e.g., Acme Corporation" value={manualLead.companyName} onChange={(e) => setManualLead({ ...manualLead, companyName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Owner/Contact Name *</label>
                    <Input placeholder="e.g., John Smith" value={manualLead.ownerName} onChange={(e) => setManualLead({ ...manualLead, ownerName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email Address *</label>
                    <Input type="email" placeholder="e.g., john@acme.com" value={manualLead.email} onChange={(e) => setManualLead({ ...manualLead, email: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phone Number *</label>
                    <Input placeholder="e.g., +1-555-123-4567" value={manualLead.phoneNumber} onChange={(e) => setManualLead({ ...manualLead, phoneNumber: e.target.value })} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Industry</label>
                      <Input placeholder="e.g., SaaS" value={manualLead.industry} onChange={(e) => setManualLead({ ...manualLead, industry: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Company Size</label>
                      <Input placeholder="e.g., 50-100" value={manualLead.companySize} onChange={(e) => setManualLead({ ...manualLead, companySize: e.target.value })} className="mt-1" />
                    </div>
                  </div>
                  <Button onClick={handleAddManualLead} disabled={addLeadMutation.isPending} className="w-full">
                    {addLeadMutation.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding...</>) : "Add Lead"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* CSV Import */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleCSVFileSelect} className="hidden" />
            <Button variant="outline" className="w-full h-20 flex-col gap-2 border-dashed hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium">Import from CSV</span>
            </Button>
          </CardContent>
        </Card>

        {/* AI Generation */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-20 flex-col gap-2 border-dashed hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all">
                  <Wand2 className="w-6 h-6 text-violet-600" />
                  <span className="text-sm font-medium">Generate with AI</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5" />AI Lead Generation</DialogTitle>
                  <DialogDescription>Describe what leads you want and AI will generate them</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Your Instructions</label>
                    <Textarea placeholder="E.g., Generate leads for SaaS companies in the US with 50-500 employees in the tech industry..." value={instruction} onChange={(e) => setInstruction(e.target.value)} className="mt-1 min-h-24" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Lead Source</label>
                      <Select value={generateSource} onValueChange={(v) => setGenerateSource(v as "ai" | "seamless")}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai">AI Generated</SelectItem>
                          <SelectItem value="seamless">Seamless.ai (Real Data)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Country</label>
                      <Select value={generateCountry || "any"} onValueChange={setGenerateCountry}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="All Countries" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All Countries</SelectItem>
                          <SelectItem value="United States">United States</SelectItem>
                          <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                          <SelectItem value="Canada">Canada</SelectItem>
                          <SelectItem value="Australia">Australia</SelectItem>
                          <SelectItem value="India">India</SelectItem>
                          <SelectItem value="Germany">Germany</SelectItem>
                          <SelectItem value="France">France</SelectItem>
                          <SelectItem value="Singapore">Singapore</SelectItem>
                          <SelectItem value="UAE">UAE</SelectItem>
                          <SelectItem value="Netherlands">Netherlands</SelectItem>
                          <SelectItem value="Japan">Japan</SelectItem>
                          <SelectItem value="Brazil">Brazil</SelectItem>
                          <SelectItem value="South Africa">South Africa</SelectItem>
                          <SelectItem value="New Zealand">New Zealand</SelectItem>
                          <SelectItem value="Ireland">Ireland</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Number of Leads</label>
                      <Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(parseInt(e.target.value) || 10)} className="mt-1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Lead Set Name</label>
                      <Input
                        placeholder="e.g., SaaS Q1 Batch"
                        value={generateLeadSetName}
                        onChange={(e) => setGenerateLeadSetName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  {generateLeadSetName && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Generated leads will be added to set: <span className="font-medium">{generateLeadSetName}</span>
                    </p>
                  )}
                  <Button onClick={handleGenerateLeads} disabled={isGenerating} className="w-full gap-2">
                    {isGenerating ? (<><Loader2 className="w-4 h-4 animate-spin" />Generating...</>) : (<><Wand2 className="w-4 h-4" />Generate Leads</>)}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* CSV Preview Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              CSV Import Preview
            </DialogTitle>
            <DialogDescription>
              {csvFileName} — {csvPreview.length} leads found. Review before importing.
            </DialogDescription>
          </DialogHeader>
          {/* Lead Set Name for CSV Import */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Assign to Lead Set (optional)
            </label>
            <Input
              placeholder="e.g., Imported Leads June 2026"
              value={csvLeadSetName}
              onChange={(e) => setCsvLeadSetName(e.target.value)}
              className="mt-1.5"
            />
            {csvLeadSetName && (
              <p className="text-xs text-muted-foreground mt-1">
                All imported leads will be assigned to: <span className="font-medium">{csvLeadSetName}</span>
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreview.slice(0, 20).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{row.companyName}</TableCell>
                    <TableCell className="text-sm">{row.ownerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="text-sm">{row.phoneNumber}</TableCell>
                    <TableCell>
                      {row.tag && row.tag !== "none" ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TAG_COLORS[row.tag]?.bg || ""} ${TAG_COLORS[row.tag]?.text || ""}`}>
                          {TAG_COLORS[row.tag]?.label || row.tag}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {csvPreview.length > 20 && (
              <p className="text-sm text-muted-foreground text-center py-2">...and {csvPreview.length - 20} more leads</p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => { setCsvDialogOpen(false); setCsvPreview([]); setCsvLeadSetName(""); }}>Cancel</Button>
            <Button onClick={handleCSVImport} disabled={csvImportMutation.isPending || dedupCheckMutation.isPending} className="gap-2">
              {(csvImportMutation.isPending || dedupCheckMutation.isPending) ? (<><Loader2 className="w-4 h-4 animate-spin" />Checking...</>) : (<><Upload className="w-4 h-4" />Import {csvPreview.length} Leads</>)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selection Action Bar */}
      {selectedLeadIds.size > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedLeadIds.size} lead(s) selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignDialogOpen(true)}
                className="gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Assign to Set
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
                className="gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLeadIds(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leads List with Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Your Leads ({filteredLeads.length})</CardTitle>
              <CardDescription>Manage, tag, and organize your leads</CardDescription>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search leads..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-48" />
              </div>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="w-36">
                  <Tag className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Filter by tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  <SelectItem value="hot">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> Hot</span>
                  </SelectItem>
                  <SelectItem value="warm">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" /> Warm</span>
                  </SelectItem>
                  <SelectItem value="cold">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Cold</span>
                  </SelectItem>
                  <SelectItem value="follow_up">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500" /> Follow Up</span>
                  </SelectItem>
                  <SelectItem value="none">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" /> No Tag</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterLeadSet} onValueChange={setFilterLeadSet}>
                <SelectTrigger className="w-40">
                  <Layers className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Filter by set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sets</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {leadSets.map((set: any) => (
                    <SelectItem key={set.id} value={String(set.id)}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (filteredLeads.length === 0) {
                    toast.error("No leads to export");
                    return;
                  }
                  const headers = ["Company", "Owner", "Email", "Phone", "Industry", "Tag", "Lead Set"];
                  const rows = filteredLeads.map((lead: any) => [
                    lead.companyName || "",
                    lead.ownerName || "",
                    lead.email || "",
                    lead.phone || "",
                    lead.industry || "",
                    lead.tag || "",
                    leadSets.find((s: any) => s.id === lead.leadSetId)?.name || "Unassigned",
                  ]);
                  const csvContent = [headers, ...rows]
                    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
                    .join("\n");
                  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  const setName = filterLeadSet !== "all"
                    ? (filterLeadSet === "unassigned" ? "unassigned" : leadSets.find((s: any) => s.id === parseInt(filterLeadSet))?.name || "leads")
                    : "all-leads";
                  link.download = `${setName}-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${filteredLeads.length} leads to CSV`);
                }}
                className="gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {leadsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLeads.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: any) => (
                    <TableRow key={lead.id} className={`group ${selectedLeadIds.has(lead.id) ? "bg-primary/5" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeadIds.has(lead.id)}
                          onCheckedChange={() => handleToggleSelect(lead.id)}
                          aria-label={`Select ${lead.companyName}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.companyName}</TableCell>
                      <TableCell>{lead.ownerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                      <TableCell className="text-sm">{lead.phoneNumber}</TableCell>
                      <TableCell>
                        {lead.leadSetId ? (
                          <Badge variant="outline" className="text-xs">
                            {leadSets.find((s: any) => s.id === lead.leadSetId)?.name || "Set"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                      <TableCell>
                        <Select value={lead.tag || "none"} onValueChange={(val) => handleUpdateTag(lead.id, val)}>
                          <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent hover:bg-muted/50 transition-colors">
                            <span className={`inline-flex items-center gap-1.5 ${TAG_COLORS[lead.tag || "none"]?.text || ""}`}>
                              <span className={`w-2 h-2 rounded-full ${
                                lead.tag === "hot" ? "bg-red-500" :
                                lead.tag === "warm" ? "bg-orange-500" :
                                lead.tag === "cold" ? "bg-blue-500" :
                                lead.tag === "follow_up" ? "bg-purple-500" :
                                "bg-gray-400"
                              }`} />
                              {TAG_COLORS[lead.tag || "none"]?.label || "No Tag"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hot">
                              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> Hot</span>
                            </SelectItem>
                            <SelectItem value="warm">
                              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" /> Warm</span>
                            </SelectItem>
                            <SelectItem value="cold">
                              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /> Cold</span>
                            </SelectItem>
                            <SelectItem value="follow_up">
                              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500" /> Follow Up</span>
                            </SelectItem>
                            <SelectItem value="none">
                              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" /> No Tag</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditingLead(lead)}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteLead(lead.id)} disabled={deleteLeadMutation.isPending}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Plus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">
                {searchQuery || filterTag !== "all" || filterLeadSet !== "all"
                  ? "No leads match your filters"
                  : "No leads yet. Add manually, import CSV, or generate with AI!"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV Format Guide */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">CSV Import Format</p>
              <p className="text-xs text-muted-foreground mb-2">Your CSV file should have these columns (header names are flexible):</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block">
                Company Name, Owner Name, Email, Phone Number, Website, Industry, Tag
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Valid tags: <span className="text-red-600 font-medium">hot</span>, <span className="text-orange-600 font-medium">warm</span>, <span className="text-blue-600 font-medium">cold</span>, <span className="text-purple-600 font-medium">follow_up</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Edit Lead Dialog */}
      <Dialog open={!!editingLead} onOpenChange={(open) => { if (!open) setEditingLead(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Lead
            </DialogTitle>
            <DialogDescription>
              Update the lead's contact information and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Company Name</Label>
                <Input
                  value={editForm.companyName}
                  onChange={(e) => setEditForm(f => ({ ...f, companyName: e.target.value }))}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Owner Name</Label>
                <Input
                  value={editForm.ownerName}
                  onChange={(e) => setEditForm(f => ({ ...f, ownerName: e.target.value }))}
                  placeholder="Owner name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone Number</Label>
                <Input
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm(f => ({ ...f, phoneNumber: e.target.value }))}
                  placeholder="+1234567890"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Website</Label>
                <Input
                  value={editForm.website}
                  onChange={(e) => setEditForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Industry</Label>
                <Input
                  value={editForm.industry}
                  onChange={(e) => setEditForm(f => ({ ...f, industry: e.target.value }))}
                  placeholder="Technology, Healthcare, etc."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Timezone</Label>
              <Input
                value={editForm.timezone}
                onChange={(e) => setEditForm(f => ({ ...f, timezone: e.target.value }))}
                placeholder="America/New_York"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
            <Button onClick={handleSaveEditLead} disabled={updateLeadMutation.isPending}>
              {updateLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
