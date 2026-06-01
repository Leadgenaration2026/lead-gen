import { useState, useRef } from "react";
import Papa from "papaparse";
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
import { Loader2, Plus, Wand2, Trash2, UserPlus, Upload, Tag, Filter, FileSpreadsheet, AlertTriangle } from "lucide-react";
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

  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filterTag, setFilterTag] = useState<string>("all");
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

  // Duplicate warning dialog state
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupDialogData, setDupDialogData] = useState<{
    mode: "manual" | "csv";
    duplicateEmails: string[];
    allLeads: any[];
    uniqueLeads: any[];
  } | null>(null);

  const handleGenerateLeads = async () => {
    if (!instruction.trim()) {
      toast.error("Please enter an instruction");
      return;
    }
    setIsGenerating(true);
    try {
      await generateLeadsMutation.mutateAsync({ instruction, count });
      toast.success(`Generated ${count} leads successfully`);
      setInstruction("");
      leadsQuery.refetch();
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
      // Check for duplicates first
      const dedupResult = await dedupCheckMutation.mutateAsync({ emails: [manualLead.email] });
      if (dedupResult.duplicates.length > 0) {
        // Show duplicate warning dialog
        setDupDialogData({
          mode: "manual",
          duplicateEmails: dedupResult.duplicates,
          allLeads: [manualLead],
          uniqueLeads: [],
        });
        setDupDialogOpen(true);
        return;
      }
      // No duplicates — proceed directly
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

  // Handle "Skip Duplicates" action — for manual, just close; for CSV, import only unique
  const handleDupSkip = async () => {
    if (!dupDialogData) return;
    if (dupDialogData.mode === "manual") {
      toast.info("Duplicate lead skipped");
      setDupDialogOpen(false);
      setDupDialogData(null);
      return;
    }
    // CSV mode — import only unique leads
    if (dupDialogData.uniqueLeads.length === 0) {
      toast.error("All leads are duplicates — nothing to import");
      setDupDialogOpen(false);
      setDupDialogData(null);
      return;
    }
    try {
      const result = await csvImportMutation.mutateAsync({ leads: dupDialogData.uniqueLeads });
      toast.success(`Imported ${result.imported} leads (${dupDialogData.duplicateEmails.length} duplicates skipped)`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} rows had errors`);
      }
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to import leads");
    }
    setDupDialogOpen(false);
    setDupDialogData(null);
  };

  // Handle "Overwrite Existing" action — upsert leads (update existing by email)
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
      // CSV mode — upsert all leads (update existing, insert new)
      try {
        const result = await csvImportOverwriteMutation.mutateAsync({ leads: dupDialogData.allLeads });
        toast.success(`Imported ${result.imported} leads (duplicates overwritten)`);
        if (result.errors.length > 0) {
          toast.warning(`${result.errors.length} rows had errors`);
        }
        setCsvDialogOpen(false);
        setCsvPreview([]);
        setCsvFileName("");
        leadsQuery.refetch();
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

  // CSV file handling with robust PapaParse
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

          // Map flexible header names to our fields
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

          // Fallback: positional mapping if headers didn't match
          const values = Object.values(record).map((v) => ((v as string) || "").trim());
          if (!row.companyName && values[0]) row.companyName = values[0];
          if (!row.ownerName && values[1]) row.ownerName = values[1];
          if (!row.email && values[2]) row.email = values[2];
          if (!row.phoneNumber && values[3]) row.phoneNumber = values[3];

          // Validate required fields
          if (!row.companyName || !row.ownerName || !row.email || !row.phoneNumber) {
            errors.push(`Row ${idx + 2}: Missing required fields`);
            return;
          }

          // Basic email validation
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

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCSVImport = async () => {
    if (csvPreview.length === 0) return;
    try {
      // Check for duplicates before importing
      const emails = csvPreview.map((r: any) => r.email).filter(Boolean);
      const dedupResult = await dedupCheckMutation.mutateAsync({ emails });
      const dupSet = new Set(dedupResult.duplicates);
      const uniqueLeads = csvPreview.filter((r: any) => !dupSet.has(r.email));
      const dupCount = csvPreview.length - uniqueLeads.length;

      if (dupCount > 0) {
        // Show duplicate warning dialog with Skip/Overwrite options
        setDupDialogData({
          mode: "csv",
          duplicateEmails: dedupResult.duplicates,
          allLeads: csvPreview,
          uniqueLeads,
        });
        setDupDialogOpen(true);
        return;
      }

      // No duplicates — import directly
      const result = await csvImportMutation.mutateAsync({ leads: csvPreview });
      toast.success(`Successfully imported ${result.imported} leads`);
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} rows had errors`);
      }
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      leadsQuery.refetch();
    } catch (error) {
      toast.error("Failed to import CSV leads");
    }
  };

  // Filter leads
  const filteredLeads = (leadsQuery.data || []).filter((lead: any) => {
    const matchesTag = filterTag === "all" || lead.tag === filterTag;
    const matchesSearch =
      !searchQuery ||
      lead.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

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
                  <div>
                    <label className="text-sm font-medium">Number of Leads</label>
                    <Input type="number" min="1" max="100" value={count} onChange={(e) => setCount(parseInt(e.target.value) || 10)} className="mt-1" />
                  </div>
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
            <Button variant="outline" onClick={() => { setCsvDialogOpen(false); setCsvPreview([]); }}>Cancel</Button>
            <Button onClick={handleCSVImport} disabled={csvImportMutation.isPending || dedupCheckMutation.isPending} className="gap-2">
              {(csvImportMutation.isPending || dedupCheckMutation.isPending) ? (<><Loader2 className="w-4 h-4 animate-spin" />Checking...</>) : (<><Upload className="w-4 h-4" />Import {csvPreview.length} Leads</>)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leads List with Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Your Leads ({filteredLeads.length})</CardTitle>
              <CardDescription>Manage, tag, and organize your leads</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
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
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: any) => (
                    <TableRow key={lead.id} className="group">
                      <TableCell className="font-medium">{lead.companyName}</TableCell>
                      <TableCell>{lead.ownerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                      <TableCell className="text-sm">{lead.phoneNumber}</TableCell>
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
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteLead(lead.id)} disabled={deleteLeadMutation.isPending}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
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
                {searchQuery || filterTag !== "all"
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
    </div>
  );
}
