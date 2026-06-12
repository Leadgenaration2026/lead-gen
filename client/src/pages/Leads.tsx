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
import { Loader2, Plus, Wand2, Trash2, UserPlus, Upload, Tag, Filter, FileSpreadsheet, AlertTriangle, FolderPlus, Layers, Download, Pencil, Globe, Linkedin, Instagram, Facebook, ArrowUpDown, TrendingUp, Zap, ExternalLink, CheckCircle2, ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";

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
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    website: "",
    linkedinUrl: "",
    instagramUrl: "",
    facebookUrl: "",
  });

  // Lead set name for AI generation and CSV import
  const [generateLeadSetName, setGenerateLeadSetName] = useState("");
  const [generateSource, setGenerateSource] = useState<"ai" | "seamless" | "seamless_csv">("ai");
  const [generateCountry, setGenerateCountry] = useState("");
  const [generateState, setGenerateState] = useState("");
  const [csvLeadSetName, setCsvLeadSetName] = useState("");

  // Checkbox selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Sort state
  const [sortBy, setSortBy] = useState<string>("newest");
  const scoreEngagementBatchMutation = trpc.leads.scoreEngagementBatch.useMutation();

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
      const result = await generateLeadsMutation.mutateAsync({
        instruction,
        count,
        leadSetName: generateLeadSetName.trim() || undefined,
        source: generateSource === "seamless_csv" ? "seamless" : generateSource,
        country: generateCountry && generateCountry !== "any" ? generateCountry : undefined,
        state: generateState && generateState !== "any" ? generateState : undefined,
      });
      
      // Handle different response scenarios
      if (result.count === 0 && result.duplicatesSkipped && result.duplicatesSkipped > 0) {
        // All results were duplicates
        toast.error(result.message || `All ${result.duplicatesSkipped} contacts found are already in your system. Try different search criteria.`, { duration: 8000 });
      } else if (result.count > 0) {
        const dupMsg = result.duplicatesSkipped ? ` (${result.duplicatesSkipped} duplicates skipped)` : "";
        toast.success(`Generated ${result.count} new leads!${dupMsg}`);
        setInstruction("");
        setGenerateLeadSetName("");
      } else {
        toast.success(`Lead generation complete!`);
        setInstruction("");
        setGenerateLeadSetName("");
      }
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error: any) {
      const msg = error?.message || error?.data?.message || "Failed to generate leads";
      toast.error(msg, { duration: 8000 });
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
        website: manualLead.website || undefined,
        linkedinUrl: manualLead.linkedinUrl || undefined,
        instagramUrl: manualLead.instagramUrl || undefined,
        facebookUrl: manualLead.facebookUrl || undefined,
      });
      toast.success("Lead added successfully");
      setManualLead({ companyName: "", ownerName: "", email: "", phoneNumber: "", industry: "", companySize: "", website: "", linkedinUrl: "", instagramUrl: "", facebookUrl: "" });
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
        setManualLead({ companyName: "", ownerName: "", email: "", phoneNumber: "", industry: "", companySize: "", website: "", linkedinUrl: "", instagramUrl: "", facebookUrl: "" });
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

        // Detect if this is a Seamless.AI export by checking for their specific columns
        const headers = Object.keys(results.data[0] || {}).map((h: string) => h.toLowerCase());
        const isSeamlessFormat = headers.some((h: string) => h.includes("first name")) && 
          headers.some((h: string) => h.includes("last name")) &&
          headers.some((h: string) => h.includes("work email") || h.includes("email"));
        
        if (isSeamlessFormat) {
          toast.info("Seamless.AI format detected — auto-mapping columns", { duration: 3000 });
        }

        const rows: any[] = [];
        const errors: string[] = [];

        results.data.forEach((record: any, idx: number) => {
          const row: any = {};
          let firstName = "";
          let lastName = "";
          
          for (const [key, val] of Object.entries(record)) {
            const header = (key as string).toLowerCase();
            const value = ((val as string) || "").trim();
            if (!value) continue;

            // Seamless.AI specific column mappings
            if (header === "first name" || header === "firstname") {
              firstName = value;
            } else if (header === "last name" || header === "lastname") {
              lastName = value;
            } else if (header === "work email" || header === "work e-mail") {
              row.email = value;
            } else if (header === "direct phone" || header === "direct number" || header === "mobile phone") {
              row.phoneNumber = value;
            } else if (header === "company phone" && !row.phoneNumber) {
              row.phoneNumber = value;
            } else if (header === "company name" || (header.includes("company") && (header.includes("name") || header === "company"))) {
              row.companyName = value;
            } else if (header === "company" && !row.companyName) {
              row.companyName = value;
            } else if (header === "title" || header === "job title") {
              row.jobTitle = value;
            } else if (header.includes("linkedin")) {
              row.linkedinUrl = value;
            } else if (header.includes("instagram")) {
              row.instagramUrl = value;
            } else if (header.includes("facebook")) {
              row.facebookUrl = value;
            } else if (header.includes("website") || header === "company website" || header === "company url") {
              row.website = value;
            } else if (header.includes("industry") || header.includes("sector") || header.includes("vertical")) {
              row.industry = value;
            } else if (header.includes("size") || header.includes("employees") || header === "# employees" || header === "employee count") {
              row.companySize = value;
            } else if (header === "city") {
              row.city = value;
            } else if (header === "state" || header === "state/region") {
              row.state = value;
            } else if (header === "country") {
              row.country = value;
            } else if (header.includes("owner") || header.includes("contact") || header === "name" || header === "full name") {
              row.ownerName = value;
            } else if ((header.includes("email") || header.includes("e-mail")) && !row.email) {
              row.email = value;
            } else if ((header.includes("phone") || header.includes("mobile") || header.includes("tel")) && !row.phoneNumber) {
              row.phoneNumber = value;
            } else if (header.includes("tag") || header.includes("label") || header.includes("priority")) {
              const tagVal = value.toLowerCase().replace(/[\s-]+/g, "_");
              if (["hot", "warm", "cold", "follow_up"].includes(tagVal)) row.tag = tagVal;
            }
          }

          // Combine first + last name for Seamless.AI format
          if ((firstName || lastName) && !row.ownerName) {
            row.ownerName = `${firstName} ${lastName}`.trim();
          }

          // Fallback: positional mapping for unknown formats
          const values = Object.values(record).map((v) => ((v as string) || "").trim());
          if (!row.companyName && values[0]) row.companyName = values[0];
          if (!row.ownerName && values[1]) row.ownerName = values[1];
          if (!row.email && values[2]) row.email = values[2];
          if (!row.phoneNumber && values[3]) row.phoneNumber = values[3];

          // For Seamless.AI: phone is optional (many contacts only have email)
          if (!row.phoneNumber && isSeamlessFormat) {
            row.phoneNumber = "N/A";
          }

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

        if (isSeamlessFormat) {
          toast.success(`${rows.length} Seamless.AI contacts ready to import!`);
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
      
      // Auto-trigger engagement scoring for newly imported leads
      if (result.imported > 0 && result.leadIds && result.leadIds.length > 0) {
        toast.info("Scoring engagement for imported leads...", { duration: 5000 });
        try {
          await scoreEngagementBatchMutation.mutateAsync({ leadIds: result.leadIds });
          toast.success("Engagement scores updated! Leads are now ranked by activity.");
          leadsQuery.refetch();
        } catch {
          toast.info("Leads imported. You can score engagement manually from the leads table.");
        }
      }
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
    const filtered = (leadsQuery.data || []).filter((lead: any) => {
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

    // Apply sorting
    if (sortBy === "engagement_desc") {
      return [...filtered].sort((a: any, b: any) => (b.engagementScore || 0) - (a.engagementScore || 0));
    } else if (sortBy === "engagement_asc") {
      return [...filtered].sort((a: any, b: any) => (a.engagementScore || 0) - (b.engagementScore || 0));
    } else if (sortBy === "name_asc") {
      return [...filtered].sort((a: any, b: any) => (a.ownerName || "").localeCompare(b.ownerName || ""));
    } else if (sortBy === "newest") {
      return [...filtered].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return filtered;
  }, [leadsQuery.data, filterTag, searchQuery, filterLeadSet, sortBy]);

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
                  <div className="border-t pt-3 mt-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Social Profiles (Optional)</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-sm font-medium">Website</label>
                        <Input placeholder="e.g., https://acme.com" value={manualLead.website} onChange={(e) => setManualLead({ ...manualLead, website: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">LinkedIn Profile</label>
                        <Input placeholder="e.g., https://linkedin.com/in/johnsmith" value={manualLead.linkedinUrl} onChange={(e) => setManualLead({ ...manualLead, linkedinUrl: e.target.value })} className="mt-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium">Instagram</label>
                          <Input placeholder="e.g., https://instagram.com/john" value={manualLead.instagramUrl} onChange={(e) => setManualLead({ ...manualLead, instagramUrl: e.target.value })} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Facebook</label>
                          <Input placeholder="e.g., https://facebook.com/john" value={manualLead.facebookUrl} onChange={(e) => setManualLead({ ...manualLead, facebookUrl: e.target.value })} className="mt-1" />
                        </div>
                      </div>
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
            <button
              type="button"
              onClick={() => {
                const csvContent = `companyName,ownerName,email,phoneNumber,industry,companySize,website,linkedinUrl,instagramUrl,facebookUrl,tag\nAcme Corp,John Smith,john@acme.com,+1-555-123-4567,SaaS,50-100,https://acme.com,https://linkedin.com/in/johnsmith,https://instagram.com/johnsmith,https://facebook.com/johnsmith,hot\nGlobal Tech,Jane Doe,jane@globaltech.io,+1-555-987-6543,Technology,100-500,https://globaltech.io,https://linkedin.com/in/janedoe,,,warm\nStartup Inc,Bob Wilson,bob@startup.co,+44-20-1234-5678,Fintech,10-50,,https://linkedin.com/in/bobwilson,,,none`;
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'sample-leads.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs text-green-600 hover:text-green-700 hover:underline mt-1 cursor-pointer"
            >
              Download sample CSV format
            </button>
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
                      <Select value={generateSource} onValueChange={(v) => setGenerateSource(v as "ai" | "seamless" | "seamless_csv")}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai">AI Generated</SelectItem>
                          <SelectItem value="seamless">Seamless.AI (API Credits)</SelectItem>
                          <SelectItem value="seamless_csv">Seamless.AI (Free Daily Credits)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Country</label>
                      <Select value={generateCountry || "any"} onValueChange={(val) => { setGenerateCountry(val); setGenerateState(""); }}>
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
                    {generateCountry === "United States" && (
                      <div>
                        <label className="text-sm font-medium">State</label>
                        <Select value={generateState || "any"} onValueChange={setGenerateState}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="All States" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">All States</SelectItem>
                            <SelectItem value="Alabama">Alabama</SelectItem>
                            <SelectItem value="Alaska">Alaska</SelectItem>
                            <SelectItem value="Arizona">Arizona</SelectItem>
                            <SelectItem value="Arkansas">Arkansas</SelectItem>
                            <SelectItem value="California">California</SelectItem>
                            <SelectItem value="Colorado">Colorado</SelectItem>
                            <SelectItem value="Connecticut">Connecticut</SelectItem>
                            <SelectItem value="Delaware">Delaware</SelectItem>
                            <SelectItem value="Florida">Florida</SelectItem>
                            <SelectItem value="Georgia">Georgia</SelectItem>
                            <SelectItem value="Hawaii">Hawaii</SelectItem>
                            <SelectItem value="Idaho">Idaho</SelectItem>
                            <SelectItem value="Illinois">Illinois</SelectItem>
                            <SelectItem value="Indiana">Indiana</SelectItem>
                            <SelectItem value="Iowa">Iowa</SelectItem>
                            <SelectItem value="Kansas">Kansas</SelectItem>
                            <SelectItem value="Kentucky">Kentucky</SelectItem>
                            <SelectItem value="Louisiana">Louisiana</SelectItem>
                            <SelectItem value="Maine">Maine</SelectItem>
                            <SelectItem value="Maryland">Maryland</SelectItem>
                            <SelectItem value="Massachusetts">Massachusetts</SelectItem>
                            <SelectItem value="Michigan">Michigan</SelectItem>
                            <SelectItem value="Minnesota">Minnesota</SelectItem>
                            <SelectItem value="Mississippi">Mississippi</SelectItem>
                            <SelectItem value="Missouri">Missouri</SelectItem>
                            <SelectItem value="Montana">Montana</SelectItem>
                            <SelectItem value="Nebraska">Nebraska</SelectItem>
                            <SelectItem value="Nevada">Nevada</SelectItem>
                            <SelectItem value="New Hampshire">New Hampshire</SelectItem>
                            <SelectItem value="New Jersey">New Jersey</SelectItem>
                            <SelectItem value="New Mexico">New Mexico</SelectItem>
                            <SelectItem value="New York">New York</SelectItem>
                            <SelectItem value="North Carolina">North Carolina</SelectItem>
                            <SelectItem value="North Dakota">North Dakota</SelectItem>
                            <SelectItem value="Ohio">Ohio</SelectItem>
                            <SelectItem value="Oklahoma">Oklahoma</SelectItem>
                            <SelectItem value="Oregon">Oregon</SelectItem>
                            <SelectItem value="Pennsylvania">Pennsylvania</SelectItem>
                            <SelectItem value="Rhode Island">Rhode Island</SelectItem>
                            <SelectItem value="South Carolina">South Carolina</SelectItem>
                            <SelectItem value="South Dakota">South Dakota</SelectItem>
                            <SelectItem value="Tennessee">Tennessee</SelectItem>
                            <SelectItem value="Texas">Texas</SelectItem>
                            <SelectItem value="Utah">Utah</SelectItem>
                            <SelectItem value="Vermont">Vermont</SelectItem>
                            <SelectItem value="Virginia">Virginia</SelectItem>
                            <SelectItem value="Washington">Washington</SelectItem>
                            <SelectItem value="West Virginia">West Virginia</SelectItem>
                            <SelectItem value="Wisconsin">Wisconsin</SelectItem>
                            <SelectItem value="Wyoming">Wyoming</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Number of Leads</label>
                      <Input type="number" min="1" max="1000" value={count} onChange={(e) => setCount(parseInt(e.target.value) || 10)} className="mt-1" />
                      {generateSource === "seamless" && (
                        <p className="text-xs text-muted-foreground mt-1">Set a high number (e.g. 200) to pull all available leads from Seamless.AI</p>
                      )}
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
                  {generateSource !== "seamless_csv" && (
                    <>
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                        AI will also extract <strong>website</strong>, <strong>LinkedIn</strong>, <strong>Instagram</strong>, and <strong>Facebook</strong> profile URLs when available.
                      </p>
                      <Button onClick={handleGenerateLeads} disabled={isGenerating} className="w-full gap-2">
                        {isGenerating ? (<><Loader2 className="w-4 h-4 animate-spin" />Generating...</>) : (<><Wand2 className="w-4 h-4" />Generate Leads</>)}
                      </Button>
                    </>
                  )}
                  {generateSource === "seamless_csv" && (
                    <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-600" />
                        Seamless.AI Free Credits Workflow
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Uses your <strong>1,000 free daily credits</strong> from Seamless.AI web app (no API/Universal credits needed).
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">Step 1</Badge>
                          <span className="text-xs">Click below to open Seamless.AI with your search pre-filled</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">Step 2</Badge>
                          <span className="text-xs">Research contacts in Seamless.AI (uses free daily credits)</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">Step 3</Badge>
                          <span className="text-xs">Export as CSV from Seamless.AI</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">Step 4</Badge>
                          <span className="text-xs">Upload the CSV below — leads auto-import with engagement scoring</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-2">
                        <Button
                          variant="default"
                          className="w-full gap-2"
                          onClick={() => {
                            const title = encodeURIComponent(instruction.trim());
                            const state = generateState && generateState !== "any" ? generateState : "";
                            // Seamless.AI doesn't support URL params for search, so open the search page
                            // and show the user what to search for
                            window.open("https://login.seamless.ai/search", "_blank");
                            toast.info(
                              `In Seamless.AI, search for:\n• Title: ${instruction.trim()}${state ? `\n• State: ${state}` : ""}${generateCountry && generateCountry !== "any" ? `\n• Country: ${generateCountry}` : ""}\n\nThen export as CSV and upload below.`,
                              { duration: 15000 }
                            );
                          }}
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open Seamless.AI Search
                        </Button>
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                          <div className="relative flex justify-center text-xs uppercase"><span className="bg-blue-50 dark:bg-blue-950/20 px-2 text-muted-foreground">then</span></div>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.txt"
                          onChange={handleCSVFileSelect}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          className="w-full gap-2 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/10"
                          onClick={() => {
                            // Pre-set the lead set name for the CSV import
                            if (generateLeadSetName.trim()) {
                              setCsvLeadSetName(generateLeadSetName.trim());
                            }
                            fileInputRef.current?.click();
                          }}
                        >
                          <Upload className="w-4 h-4 text-green-600" />
                          Upload Seamless.AI CSV
                        </Button>
                      </div>
                    </div>
                  )}
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
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="engagement_desc">Engagement: High → Low</SelectItem>
                  <SelectItem value="engagement_asc">Engagement: Low → High</SelectItem>
                  <SelectItem value="name_asc">Name: A → Z</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ids = selectedLeadIds.size > 0 ? Array.from(selectedLeadIds) : filteredLeads.map((l: any) => l.id);
                  if (ids.length === 0) { toast.error("No leads to score"); return; }
                  toast.info(`Scoring engagement for ${ids.length} leads... This may take a moment.`);
                  try {
                    const result = await scoreEngagementBatchMutation.mutateAsync({ leadIds: ids });
                    toast.success(`Scored ${result.scored} leads (${result.errors} errors)`);
                    leadsQuery.refetch();
                  } catch (err: any) {
                    toast.error(err.message || "Failed to score engagement");
                  }
                }}
                disabled={scoreEngagementBatchMutation.isPending}
                className="gap-1.5"
              >
                {scoreEngagementBatchMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                Score Engagement
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (filteredLeads.length === 0) {
                    toast.error("No leads to export");
                    return;
                  }
                  const headers = ["Company", "Owner", "Email", "Phone", "Industry", "Tag", "Lead Set", "Status", "Website", "LinkedIn", "Instagram", "Facebook", "Timezone"];
                  const rows = filteredLeads.map((lead: any) => [
                    lead.companyName || "",
                    lead.ownerName || "",
                    lead.email || "",
                    lead.phone || "",
                    lead.industry || "",
                    lead.tag || "",
                    leadSets.find((s: any) => s.id === lead.leadSetId)?.name || "Unassigned",
                    lead.status || "",
                    lead.website || "",
                    lead.linkedinUrl || "",
                    lead.instagramUrl || "",
                    lead.facebookUrl || "",
                    lead.timezone || "",
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
                    <TableHead>Socials</TableHead>
                    <TableHead className="text-center">Engagement</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: any) => (
                    <TableRow key={lead.id} className={`group cursor-pointer hover:bg-muted/50 ${selectedLeadIds.has(lead.id) ? "bg-primary/5" : ""}`} onClick={() => { setDrawerLeadId(lead.id); setDrawerOpen(true); }}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                        <div className="flex items-center gap-1">
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" title="Website" className="text-muted-foreground hover:text-blue-600 transition-colors">
                              <Globe className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {lead.linkedinUrl && (
                            <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" title="LinkedIn" className="text-muted-foreground hover:text-[#0A66C2] transition-colors">
                              <Linkedin className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {lead.instagramUrl && (
                            <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" title="Instagram" className="text-muted-foreground hover:text-[#E4405F] transition-colors">
                              <Instagram className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {lead.facebookUrl && (
                            <a href={lead.facebookUrl} target="_blank" rel="noopener noreferrer" title="Facebook" className="text-muted-foreground hover:text-[#1877F2] transition-colors">
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
                          <div className="flex items-center justify-center gap-1" title={`Engagement Score: ${lead.engagementScore}/100`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              lead.engagementScore >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" :
                              lead.engagementScore >= 40 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" :
                              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}>
                              {lead.engagementScore}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.country ? lead.country : <span className="text-muted-foreground">—</span>}
                      </TableCell>
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
      <LeadDetailDrawer
        leadId={drawerLeadId}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerLeadId(null); }}
      />
    </div>
  );
}
