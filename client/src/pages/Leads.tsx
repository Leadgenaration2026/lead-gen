import { useState, useRef, useMemo, useEffect } from "react";
import Papa from "papaparse";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Loader2, Plus, Wand2, Trash2, UserPlus, Upload, Tag, Filter, FileSpreadsheet, AlertTriangle, FolderPlus, Layers, Download, Pencil, Globe, Linkedin, Instagram, Facebook, ArrowUpDown, TrendingUp, TrendingDown, Zap, ExternalLink, CheckCircle2, ArrowRight, Building2, X, Check, ChevronsUpDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { LeadDetailDrawer } from "@/components/LeadDetailDrawer";
import { downloadCSVTemplate } from "@/utils/csvTemplate";

// Format phone number for display: +1XXXXXXXXXX → (XXX) XXX-XXXX
function formatUSPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/[^0-9]/g, "");
  // Handle +1XXXXXXXXXX or 1XXXXXXXXXX format
  let local = digits;
  if (local.length === 11 && local.startsWith("1")) {
    local = local.slice(1);
  }
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  // Return as-is if not a standard US number
  return phone;
}

const TAG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  hot: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Hot" },
  warm: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Warm" },
  cold: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Cold" },
  follow_up: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Follow Up" },
  none: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", label: "No Tag" },
};

export default function LeadsPage({ showOnlyUnassigned = false }: { showOnlyUnassigned?: boolean } = {}) {
  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [filterSourceListId, setFilterSourceListId] = useState<string>("all"); // For imported lists
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ totalSearchResults: number; extracted: number; requested: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  const allLeadsQuery = trpc.leads.list.useQuery({ page: currentPage, pageSize }, { enabled: !showOnlyUnassigned });
  const unassignedLeadsQuery = trpc.leads.listUnassigned.useQuery(undefined, { enabled: showOnlyUnassigned });
  const leadsQuery = showOnlyUnassigned ? unassignedLeadsQuery : allLeadsQuery;
  const generateLeadsMutation = trpc.leads.generate.useMutation();
  const searchSeamlessPreviewMutation = trpc.leads.searchSeamlessPreview.useMutation();
  const seamlessIndustriesQuery = trpc.leads.listSeamlessIndustries.useQuery();
  const seamlessIndustries = seamlessIndustriesQuery.data || [];
  const detectIndustryFromKeywordMutation = trpc.leads.detectIndustryFromKeyword.useMutation();
  const detectTitlesFromKeywordMutation = trpc.leads.detectTitlesFromKeyword.useMutation();
  const enrichSeamlessSelectionMutation = trpc.leads.enrichSeamlessSelection.useMutation();
  const scoreSeamlessEngagementMutation = trpc.leads.scoreSeamlessCandidatesEngagement.useMutation();
  const excludeSeamlessContactsMutation = trpc.leads.excludeSeamlessContacts.useMutation();
  const clearExcludedSeamlessContactsMutation = trpc.leads.clearExcludedSeamlessContacts.useMutation();
  const deleteLeadMutation = trpc.leads.delete.useMutation();
  const addLeadMutation = trpc.leads.addManual.useMutation();
  const addLeadOverwriteMutation = trpc.leads.addManualOverwrite.useMutation();
  const csvImportMutation = trpc.leads.csvImport.useMutation();
  const csvImportOverwriteMutation = trpc.leads.csvImportOverwrite.useMutation();
  const updateTagMutation = trpc.leads.updateTag.useMutation();
  const dedupCheckMutation = trpc.dedup.check.useMutation();
  const deleteListMutation = trpc.leadSets.delete.useMutation();
  const assignLeadsToSetMutation = trpc.leadSets.assignLeads.useMutation();
  // DISABLED: Browser automation mutations - using REST API instead
  // const autoEnrichMutation = trpc.seamlessAIAutomation.startAutoEnrichment.useMutation();
  // const autoEnrichSelectedMutation = trpc.seamlessAIAutomation.startAutoEnrichmentSelected.useMutation();
  const apiFirstEnrichMutation = trpc.seamlessAIEnrichment.enrichLeads.useMutation();
  const leadSetsQuery = trpc.leadSets.listTags.useQuery();
  const importedListsQuery = trpc.leadSets.list.useQuery(); // Get all lists including imported ones
  const searchString = useSearch();
  const [filterLeadSet, setFilterLeadSet] = useState<string>("all");
  const [tagComboboxOpen, setTagComboboxOpen] = useState(false);
  const [filterIndustry, setFilterIndustry] = useState<string>("all");
  const [filterHasPhone, setFilterHasPhone] = useState<string>("all"); // "all", "has-phone", "no-phone"
  // Support URL param ?setId=123 to pre-filter by lead set
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const setId = params.get("setId");
    if (setId) {
      setFilterLeadSet(setId);
    }
    const action = params.get("action");
    if (action === "delete-all") {
      setDeleteAllDialogOpen(true);
    }
  }, [searchString]);

  // Handle lead selection
  const toggleLeadSelection = (leadId: number) => {
    const newSelection = new Set(selectedLeadIds);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    setSelectedLeadIds(newSelection);
  };

  const selectAllLeads = () => {
    if (leadsQuery.data) {
      setSelectedLeadIds(new Set(leadsQuery.data.map(l => l.id)));
    }
  };

  const deselectAllLeads = () => {
    setSelectedLeadIds(new Set());
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteListDialogOpen, setDeleteListDialogOpen] = useState(false);
  const [deleteTagDialogOpen, setDeleteTagDialogOpen] = useState(false);
  const [deleteTagId, setDeleteTagId] = useState<number | null>(null);
  const [deleteListId, setDeleteListId] = useState<number | null>(null);
  const [assignAllDialogOpen, setAssignAllDialogOpen] = useState(false);
  const [assignAllListId, setAssignAllListId] = useState<number | null>(null);
  const [assignAllTagId, setAssignAllTagId] = useState<string>("");
  const [assignAllCountInput, setAssignAllCountInput] = useState<string>("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvEngagementScores, setCsvEngagementScores] = useState<Record<number, { score: number; metrics: any }>>({});
  const [csvScoringIndices, setCsvScoringIndices] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualLead, setManualLead] = useState({
    companyName: "",
    ownerName: "",
    jobTitle: "",
    email: "",
    phoneNumber: "",
    industry: "",
    companySize: "",
    website: "",
    linkedinUrl: "",
    instagramUrl: "",
    facebookUrl: "",
  });
  const [manualLeadTagId, setManualLeadTagId] = useState<string>("");
  const [manualLeadNewTag, setManualLeadNewTag] = useState(false);
  const [manualLeadNewTagName, setManualLeadNewTagName] = useState("");

  // Lead set name for AI generation and CSV import
  const [generateLeadSetName, setGenerateLeadSetName] = useState("");
  const [generateSource, setGenerateSource] = useState<"ai" | "seamless" | "seamless_csv">("ai");
  const [generateCountry, setGenerateCountry] = useState("");
  const [generateState, setGenerateState] = useState("");
  const [generateCompanySize, setGenerateCompanySize] = useState("");
  const [csvLeadSetName, setCsvLeadSetName] = useState("");

  // Industry detection suggestion (shown before an actual search runs, so the
  // user can confirm or correct what industry filter their instruction maps to)
  const [industryOverride, setIndustryOverride] = useState("");
  const [industryDetected, setIndustryDetected] = useState(false);
  const [industryComboboxOpen, setIndustryComboboxOpen] = useState(false);
  // True once the user has explicitly picked an industry themselves (as
  // opposed to it being auto-filled from detection) -- a manual pick is
  // "sticky" and must survive further edits to the instruction text, unlike
  // an auto-detected suggestion which should be invalidated by them.
  const [industryManuallySet, setIndustryManuallySet] = useState(false);

  // Job title suggestion -- same idea as industry above, but titles aren't a
  // fixed enum (Seamless.AI matches on relevance, up to 10 free-text titles),
  // so this is an editable list of chips rather than a picker from a fixed list.
  const [titlesOverride, setTitlesOverride] = useState<string[]>([]);
  const [titlesDetected, setTitlesDetected] = useState(false);
  const [titleInputValue, setTitleInputValue] = useState("");
  // Same "sticky once touched by hand" idea as industryManuallySet above.
  const [titlesManuallySet, setTitlesManuallySet] = useState(false);

  // Dedicated keyword boxes that directly drive industryOverride/titlesOverride,
  // replacing the old "detect from one big free-text instruction" flow (users
  // found it confusing/unreliable -- one narrow box per field is much more
  // predictable). Each resolves instantly via a local keyword map when
  // possible, falling back to an LLM call only for wording the local map
  // doesn't recognize; *NotFound tracks when neither found anything, so the UI
  // can ask for a more specific keyword instead of silently finding nothing.
  const [industryKeywordInput, setIndustryKeywordInput] = useState("");
  const [industryKeywordNotFound, setIndustryKeywordNotFound] = useState(false);
  const [titleKeywordInput, setTitleKeywordInput] = useState("");
  const [titleKeywordNotFound, setTitleKeywordNotFound] = useState(false);
  // True once the user has typed directly into "Your Instructions" -- until
  // then it's auto-built from the two keyword boxes above, so filling those in
  // is enough on its own and no separate sentence is required.
  const [instructionManuallyEdited, setInstructionManuallyEdited] = useState(false);

  // Seamless.AI search -> select -> enrich preview flow
  const [seamlessPreviewDialogOpen, setSeamlessPreviewDialogOpen] = useState(false);
  const [seamlessCandidates, setSeamlessCandidates] = useState<Array<{
    searchResultId: string;
    ownerName: string;
    companyName: string;
    jobTitle?: string;
    email?: string;
    city?: string;
    state?: string;
    country?: string;
    website?: string;
    industry?: string;
    companySize?: string;
    linkedinUrl?: string;
  }>>([]);
  const [selectedSeamlessIds, setSelectedSeamlessIds] = useState<Set<string>>(new Set());
  const [isSearchingSeamless, setIsSearchingSeamless] = useState(false);
  const [seamlessTotalAvailable, setSeamlessTotalAvailable] = useState<number | undefined>(undefined);
  const [seamlessSearchCredits, setSeamlessSearchCredits] = useState<number | undefined>(undefined);
  const [seamlessEngagementScores, setSeamlessEngagementScores] = useState<Record<string, { score: number; metrics: any }>>({});
  const [scoringEngagementIds, setScoringEngagementIds] = useState<Set<string>>(new Set());
  const [seamlessDetailIndex, setSeamlessDetailIndex] = useState<number | null>(null);
  const [selectFirstNInput, setSelectFirstNInput] = useState("");

  // Checkbox selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Sort state
  const [sortBy, setSortBy] = useState<string>("newest");
  const scoreEngagementBatchMutation = trpc.leads.scoreEngagementBatch.useMutation();
  const verifyEmailsMutation = trpc.verification.verifyEmails.useMutation();
  const deleteByStatusMutation = trpc.leads.deleteByVerificationStatus.useMutation();
  const deleteAllMutation = trpc.leads.deleteAll.useMutation();
  const [deleteRiskyDialogOpen, setDeleteRiskyDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [riskyLeadsToDelete, setRiskyLeadsToDelete] = useState<Set<number>>(new Set());

  // Bulk assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const bulkDeleteMutation = trpc.leads.bulkDelete.useMutation();
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
    linkedinUrl: "",
    instagramUrl: "",
    facebookUrl: "",
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
      linkedinUrl: editingLead.linkedinUrl || "",
      instagramUrl: editingLead.instagramUrl || "",
      facebookUrl: editingLead.facebookUrl || "",
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
        linkedinUrl: editForm.linkedinUrl || undefined,
        instagramUrl: editForm.instagramUrl || undefined,
        facebookUrl: editForm.facebookUrl || undefined,
      },
    });
  };

  // Clears the instruction and every search-criteria field back to a blank
  // slate -- used both after a successful generate and by the manual "Reset"
  // button for when the user wants to abandon the current search and start a
  // completely different one without closing/reopening the dialog.
  const resetGenerateForm = () => {
    setInstruction("");
    setInstructionManuallyEdited(false);
    setGenerateLeadSetName("");
    setIndustryOverride("");
    setIndustryDetected(false);
    setIndustryManuallySet(false);
    setIndustryKeywordInput("");
    setIndustryKeywordNotFound(false);
    setTitlesOverride([]);
    setTitlesDetected(false);
    setTitlesManuallySet(false);
    setTitleInputValue("");
    setTitleKeywordInput("");
    setTitleKeywordNotFound(false);
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
        industryOverride: industryOverride.trim() || undefined,
        titlesOverride: titlesOverride.length > 0 ? titlesOverride : undefined,
      });

      // Handle different response scenarios
      if (result.count === 0 && result.duplicatesSkipped && result.duplicatesSkipped > 0) {
        // All results were duplicates
        toast.error(result.message || `All ${result.duplicatesSkipped} contacts found are already in your system. Try different search criteria.`, { duration: 8000 });
      } else if (result.count > 0) {
        const dupMsg = result.duplicatesSkipped ? ` (${result.duplicatesSkipped} duplicates skipped)` : "";
        const seamlessMsg = result.extractedFromSeamless ? ` - ${result.extractedFromSeamless} extracted from Seamless.AI` : "";
        toast.success(`Generated ${result.count} new leads!${dupMsg}${seamlessMsg}`);
        resetGenerateForm();
        // New leads sort newest-first and land on page 1 — jump there so they're
        // visible immediately instead of only after manually navigating back.
        setCurrentPage(1);
      } else {
        toast.success(`Lead generation complete!`);
        resetGenerateForm();
      }
      leadsQuery.refetch();
      leadSetsQuery.refetch();
      importedListsQuery.refetch();
    } catch (error: any) {
      const msg = error?.message || error?.data?.message || "Failed to generate leads";
      toast.error(msg, { duration: 8000 });
    } finally {
      setIsGenerating(false);
    }
  };

  // Search Seamless.AI without spending any enrichment credits, then let the
  // user pick which candidates to actually enrich and save as leads.
  const handleSearchSeamless = async () => {
    if (!instruction.trim()) {
      toast.error("Please enter an instruction");
      return;
    }
    setIsSearchingSeamless(true);
    try {
      const result = await searchSeamlessPreviewMutation.mutateAsync({
        instruction,
        count,
        country: generateCountry && generateCountry !== "any" ? generateCountry : undefined,
        state: generateState && generateState !== "any" ? generateState : undefined,
        companySize: generateCompanySize && generateCompanySize !== "any" ? generateCompanySize : undefined,
        industryOverride: industryOverride.trim() || undefined,
        titlesOverride: titlesOverride.length > 0 ? titlesOverride : undefined,
      });

      if (result.candidates.length === 0) {
        const reasons = [
          result.skippedAlreadyOwned > 0 ? `${result.skippedAlreadyOwned} already in your system` : null,
          result.skippedExcluded > 0 ? `${result.skippedExcluded} previously deleted by you` : null,
        ].filter(Boolean);
        const ownedMsg = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";
        toast.error(`No new contacts found${ownedMsg}. Try different search criteria or location.`, {
          duration: 10000,
          // If the only reason nothing came back is your own past "discard"
          // clicks, offer a one-click way to undo that instead of a dead end --
          // this matters most right after a search-quality fix, since a
          // previously-discarded bad batch can include the only real matches.
          action: result.skippedExcluded > 0 ? {
            label: "Clear excluded list & retry",
            onClick: async () => {
              try {
                const clearResult = await clearExcludedSeamlessContactsMutation.mutateAsync();
                toast.success(`Cleared ${clearResult.cleared} previously discarded contact(s). Searching again...`);
                handleSearchSeamless();
              } catch (err: any) {
                toast.error(err?.message || "Failed to clear excluded contacts");
              }
            },
          } : undefined,
        });
        return;
      }

      setSeamlessCandidates(result.candidates);
      setSelectedSeamlessIds(new Set(result.candidates.map((c) => c.searchResultId))); // default: all selected
      setSeamlessTotalAvailable(result.totalAvailable);
      setSeamlessSearchCredits(result.estimatedSearchCredits);
      setSeamlessEngagementScores({});
      setSeamlessPreviewDialogOpen(true);
      const skipMessages = [
        result.skippedAlreadyOwned > 0 ? `${result.skippedAlreadyOwned} already in your system` : null,
        result.skippedExcluded > 0 ? `${result.skippedExcluded} previously deleted by you` : null,
      ].filter(Boolean);
      if (skipMessages.length > 0) {
        toast(`Skipped ${skipMessages.join(" and ")}.`);
      }
      // Auto-score engagement for the first several results in the background —
      // this needs a real LinkedIn + website lookup per candidate, so scoring
      // everything from a large search up front would make the popup slow.
      // Kept small (10) so the initial auto-score feels fast; "Score More"
      // covers the rest.
      scoreEngagementForCandidates(result.candidates.slice(0, 10));
    } catch (error: any) {
      const msg = error?.message || error?.data?.message || "Failed to search Seamless.AI";
      toast.error(msg, { duration: 8000 });
    } finally {
      setIsSearchingSeamless(false);
    }
  };

  // Tracks the keyword text the most recently *fired* request of each kind was
  // for, so a response can tell if it's still the latest one once it comes
  // back -- network/LLM latency doesn't guarantee responses arrive in the same
  // order requests were sent, so without this an older request for earlier
  // text could resolve after a newer one and clobber it with a worse answer.
  const latestIndustryKeywordRequestRef = useRef("");
  const latestTitleKeywordRequestRef = useRef("");

  // Resolves the Industry Keyword box to a real Seamless.AI industry value.
  // Runs on every debounced pause in typing (see the effect below) so it's
  // always in sync with the latest text, not just on blur.
  const handleDetectIndustryKeyword = async () => {
    const keyword = industryKeywordInput.trim();
    if (keyword.length < 2) return;
    const requestedFor = keyword;
    latestIndustryKeywordRequestRef.current = requestedFor;
    try {
      const result = await detectIndustryFromKeywordMutation.mutateAsync({ keyword });
      if (latestIndustryKeywordRequestRef.current !== requestedFor) return;
      setIndustryOverride(result.industry || "");
      setIndustryDetected(true);
      setIndustryKeywordNotFound(!result.industry);
    } catch (error: any) {
      console.warn("Industry keyword detection failed:", error?.message);
      setIndustryKeywordNotFound(true);
    }
  };

  // Resolves the Job Title Keyword box to a list of equivalent title variants.
  // Same debounced-on-every-pause pattern as industry above.
  const handleDetectTitleKeyword = async () => {
    const keyword = titleKeywordInput.trim();
    if (keyword.length < 2) return;
    const requestedFor = keyword;
    latestTitleKeywordRequestRef.current = requestedFor;
    try {
      const result = await detectTitlesFromKeywordMutation.mutateAsync({ keyword });
      if (latestTitleKeywordRequestRef.current !== requestedFor) return;
      setTitlesOverride(result.titles);
      setTitlesDetected(true);
      setTitleKeywordNotFound(result.titles.length === 0);
    } catch (error: any) {
      console.warn("Title keyword detection failed:", error?.message);
      setTitleKeywordNotFound(true);
    }
  };

  useEffect(() => {
    if (industryKeywordInput.trim().length < 2) {
      setIndustryOverride("");
      setIndustryDetected(false);
      setIndustryKeywordNotFound(false);
      return;
    }
    const timer = setTimeout(() => {
      handleDetectIndustryKeyword();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industryKeywordInput]);

  useEffect(() => {
    if (titleKeywordInput.trim().length < 2) {
      setTitlesOverride([]);
      setTitlesDetected(false);
      setTitleKeywordNotFound(false);
      return;
    }
    const timer = setTimeout(() => {
      handleDetectTitleKeyword();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKeywordInput]);

  // Auto-builds "Your Instructions" from the two keyword boxes so a basic
  // search never requires typing a separate sentence -- only stops once the
  // user has typed into that box directly, so a deliberate manual edit isn't
  // silently overwritten on the next keyword keystroke.
  //
  // Deliberately uses industryOverride (the RESOLVED industry) rather than the
  // raw industryKeywordInput text -- a keyword that doesn't match any real
  // Seamless.AI industry (e.g. "motivational speaker", which is a profession,
  // not an industry) correctly leaves industryOverride empty so the search
  // runs on title alone, but if this sentence still said "...in the
  // motivational speaker industry" it would misrepresent what's actually
  // being searched, and could feed a wrong guess into the backend's own
  // separate LLM parsing of this same sentence.
  useEffect(() => {
    if (instructionManuallyEdited) return;
    const title = titleKeywordInput.trim();
    if (!title && !industryOverride) {
      setInstruction("");
      return;
    }
    const parts = [`Generate leads for ${title || "business contacts"}`];
    if (industryOverride) parts.push(`in the ${industryOverride} industry`);
    setInstruction(parts.join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKeywordInput, industryOverride, instructionManuallyEdited]);

  const handleAddTitleChip = () => {
    const value = titleInputValue.trim();
    if (!value) return;
    if (titlesOverride.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setTitleInputValue("");
      return;
    }
    if (titlesOverride.length >= 10) {
      toast.error("Seamless.AI allows up to 10 titles per search");
      return;
    }
    setTitlesOverride([...titlesOverride, value]);
    setTitlesDetected(true);
    setTitlesManuallySet(true);
    setTitleInputValue("");
  };

  const handleRemoveTitleChip = (title: string) => {
    setTitlesOverride(titlesOverride.filter((t) => t !== title));
    setTitlesManuallySet(true);
  };

  // Score engagement (LinkedIn + website) for a batch of preview candidates that
  // haven't been scored yet. Runs in the background — doesn't block the UI.
  const scoreEngagementForCandidates = async (candidates: typeof seamlessCandidates) => {
    const toScore = candidates.filter(
      (c) => !seamlessEngagementScores[c.searchResultId] && !scoringEngagementIds.has(c.searchResultId)
    );
    if (toScore.length === 0) return;

    setScoringEngagementIds((prev) => new Set([...prev, ...toScore.map((c) => c.searchResultId)]));
    try {
      const result = await scoreSeamlessEngagementMutation.mutateAsync({
        candidates: toScore.map((c) => ({
          searchResultId: c.searchResultId,
          linkedinUrl: c.linkedinUrl,
          ownerName: c.ownerName,
          companyName: c.companyName,
          website: c.website,
        })),
      });
      setSeamlessEngagementScores((prev) => ({ ...prev, ...result.results }));
    } catch (error: any) {
      console.warn("Engagement scoring failed:", error?.message);
    } finally {
      setScoringEngagementIds((prev) => {
        const next = new Set(prev);
        toScore.forEach((c) => next.delete(c.searchResultId));
        return next;
      });
    }
  };

  // Same preview-scoring approach as the Seamless.AI candidate flow above,
  // but for CSV rows -- these aren't saved leads yet either, so we score
  // them by row index (stable for the life of this preview dialog) instead
  // of a database id.
  const scoreEngagementForCsvRows = async (rows: Array<{ index: number; row: any }>) => {
    const toScore = rows.filter(
      ({ index }) => csvEngagementScores[index] === undefined && !csvScoringIndices.has(index)
    );
    if (toScore.length === 0) return;

    setCsvScoringIndices((prev) => new Set([...prev, ...toScore.map((r) => r.index)]));
    try {
      const result = await scoreSeamlessEngagementMutation.mutateAsync({
        candidates: toScore.map(({ index, row }) => ({
          searchResultId: String(index),
          linkedinUrl: row.linkedinUrl,
          ownerName: row.ownerName,
          companyName: row.companyName,
          website: row.website,
        })),
      });
      setCsvEngagementScores((prev) => {
        const next = { ...prev };
        for (const [key, val] of Object.entries(result.results)) {
          next[Number(key)] = val as any;
        }
        return next;
      });
    } catch (error: any) {
      console.warn("CSV engagement scoring failed:", error?.message);
    } finally {
      setCsvScoringIndices((prev) => {
        const next = new Set(prev);
        toScore.forEach(({ index }) => next.delete(index));
        return next;
      });
    }
  };

  // Enrich + save only the candidates the user left checked
  // Navigate the engagement-score detail view, auto-scoring the target candidate
  // if it hasn't been scored yet.
  const goToSeamlessDetail = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= seamlessCandidates.length) return;
    setSeamlessDetailIndex(newIndex);
    const next = seamlessCandidates[newIndex];
    if (next && !seamlessEngagementScores[next.searchResultId] && !scoringEngagementIds.has(next.searchResultId)) {
      scoreEngagementForCandidates([next]);
    }
  };

  // Left/right arrow keys move through candidates while the detail view is open
  useEffect(() => {
    if (seamlessDetailIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToSeamlessDetail(seamlessDetailIndex - 1);
      else if (e.key === "ArrowRight") goToSeamlessDetail(seamlessDetailIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seamlessDetailIndex, seamlessCandidates, seamlessEngagementScores, scoringEngagementIds]);

  const handleEnrichSeamlessSelection = async () => {
    const selected = seamlessCandidates.filter((c) => selectedSeamlessIds.has(c.searchResultId));
    if (selected.length === 0) {
      toast.error("Select at least one contact to enrich");
      return;
    }
    try {
      const result = await enrichSeamlessSelectionMutation.mutateAsync({
        leadSetName: generateLeadSetName.trim() || undefined,
        candidates: selected,
      });

      if (result.count === 0) {
        toast.error((result as any).message || "None of the selected contacts could be saved.", { duration: 8000 });
      } else {
        const dupMsg = result.duplicatesSkipped ? ` (${result.duplicatesSkipped} duplicates skipped)` : "";
        const droppedMsg = result.droppedForMissingContact ? ` (${result.droppedForMissingContact} dropped for missing phone/email/name)` : "";
        toast.success(`Saved ${result.count} new lead${result.count !== 1 ? "s" : ""}!${dupMsg}${droppedMsg}`);
        // New leads sort newest-first and land on page 1 — jump there so they're
        // visible immediately instead of only after manually navigating back.
        setCurrentPage(1);
        // Engagement scoring runs as a background job after this response
        // returns (real LinkedIn + website lookups per lead take real time),
        // so an immediate refetch below will still show "Pending". Re-check a
        // few times over the next half-minute to pick up the score once it's
        // actually done, without the user needing to manually refresh.
        [4000, 10000, 20000, 30000].forEach((delay) => setTimeout(() => leadsQuery.refetch(), delay));
      }

      // Remove only the candidates that were just submitted for enrichment —
      // they already consumed credits (whether they became a lead or got
      // dropped/deduped), so leaving them selectable again risks accidentally
      // re-enriching and re-charging for the same contacts. Everything else
      // stays in the list so you can keep working through a large search
      // without re-searching (and paying search credits again).
      const attemptedIds = new Set(selected.map((c) => c.searchResultId));
      const remaining = seamlessCandidates.filter((c) => !attemptedIds.has(c.searchResultId));
      setSeamlessCandidates(remaining);
      setSelectedSeamlessIds((prev) => {
        const next = new Set(prev);
        attemptedIds.forEach((id) => next.delete(id));
        return next;
      });
      setSeamlessEngagementScores((prev) => {
        const next = { ...prev };
        attemptedIds.forEach((id) => delete next[id]);
        return next;
      });

      if (remaining.length === 0) {
        setSeamlessPreviewDialogOpen(false);
        setInstruction("");
        setGenerateLeadSetName("");
        setIndustryOverride("");
        setIndustryDetected(false);
        setIndustryManuallySet(false);
        setTitlesOverride([]);
        setTitlesDetected(false);
        setTitlesManuallySet(false);
      }

      leadsQuery.refetch();
      leadSetsQuery.refetch();
      importedListsQuery.refetch();
    } catch (error: any) {
      const msg = error?.message || error?.data?.message || "Failed to enrich selected contacts";
      toast.error(msg, { duration: 8000 });
    }
  };

  // Permanently discard a candidate the user doesn't want, without enriching it.
  // Recorded server-side so it never shows up again in a future search.
  const handleRemoveSeamlessCandidate = (searchResultId: string) => {
    const remaining = seamlessCandidates.filter((c) => c.searchResultId !== searchResultId);
    setSeamlessCandidates(remaining);
    setSelectedSeamlessIds((prev) => {
      const next = new Set(prev);
      next.delete(searchResultId);
      return next;
    });
    setSeamlessEngagementScores((prev) => {
      const next = { ...prev };
      delete next[searchResultId];
      return next;
    });
    excludeSeamlessContactsMutation.mutate({ searchResultIds: [searchResultId] });
    if (remaining.length === 0) {
      setSeamlessPreviewDialogOpen(false);
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
    } catch (error: any) {
      console.error("Delete lead error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to delete lead", { duration: 8000 });
    }
  };

  const handleAddManualLead = async () => {
    if (!manualLead.companyName || !manualLead.ownerName || !manualLead.email || !manualLead.phoneNumber) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (manualLeadNewTag && !manualLeadNewTagName.trim()) {
      toast.error("Please enter a name for the new tag");
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
      let leadSetId: number | undefined = manualLeadTagId ? Number(manualLeadTagId) : undefined;
      if (manualLeadNewTag && manualLeadNewTagName.trim()) {
        const newTag = await createLeadSetMutation.mutateAsync({ name: manualLeadNewTagName.trim() });
        leadSetId = newTag.id || undefined;
      }
      await addLeadMutation.mutateAsync({
        companyName: manualLead.companyName,
        ownerName: manualLead.ownerName,
        jobTitle: manualLead.jobTitle || undefined,
        email: manualLead.email,
        phoneNumber: manualLead.phoneNumber,
        industry: manualLead.industry || "Unknown",
        companySize: manualLead.companySize || "Unknown",
        website: manualLead.website || undefined,
        linkedinUrl: manualLead.linkedinUrl || undefined,
        instagramUrl: manualLead.instagramUrl || undefined,
        facebookUrl: manualLead.facebookUrl || undefined,
        leadSetId,
      });
      toast.success("Lead added successfully");
      setManualLead({ companyName: "", ownerName: "", jobTitle: "", email: "", phoneNumber: "", industry: "", companySize: "", website: "", linkedinUrl: "", instagramUrl: "", facebookUrl: "" });
      setManualLeadTagId("");
      setManualLeadNewTag(false);
      setManualLeadNewTagName("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error: any) {
      console.error("Add lead error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to add lead", { duration: 8000 });
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
      setCsvEngagementScores({});
      setCsvScoringIndices(new Set());
      leadsQuery.refetch();
      leadSetsQuery.refetch();
      importedListsQuery.refetch();
    } catch (error: any) {
      console.error("Import leads error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to import leads", { duration: 8000 });
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
        setManualLead({ companyName: "", ownerName: "", jobTitle: "", email: "", phoneNumber: "", industry: "", companySize: "", website: "", linkedinUrl: "", instagramUrl: "", facebookUrl: "" });
        leadsQuery.refetch();
      } catch (error: any) {
        console.error("Overwrite lead error:", error);
        toast.error(error?.message || error?.data?.message || "Failed to overwrite lead", { duration: 8000 });
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
        setCsvEngagementScores({});
        setCsvScoringIndices(new Set());
        leadsQuery.refetch();
        leadSetsQuery.refetch();
        importedListsQuery.refetch();
      } catch (error: any) {
        console.error("Overwrite import error:", error);
        toast.error(error?.message || error?.data?.message || "Failed to import leads", { duration: 8000 });
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
    } catch (error: any) {
      console.error("Update tag error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to update tag", { duration: 8000 });
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
      transformHeader: (header: string) => header.trim(),
      complete: (results: any) => {
        if (!results.data || results.data.length === 0) {
          toast.error("CSV file is empty or has no valid data rows");
          return;
        }

        // Get original headers (preserving case for detection)
        const rawHeaders = Object.keys(results.data[0] || {});
        const headersLower = rawHeaders.map((h: string) => h.toLowerCase().trim());
        
        // Detect Seamless.AI format by checking for their specific column patterns
        const isSeamlessFormat = (
          headersLower.some((h: string) => h === "first name" || h === "first_name") && 
          headersLower.some((h: string) => h === "last name" || h === "last_name")
        ) || headersLower.some((h: string) => h === "full name" || h === "contact full name");
        
        if (isSeamlessFormat) {
          toast.info("Seamless.AI format detected — auto-mapping columns", { duration: 3000 });
        }

        const rows: any[] = [];
        const errors: string[] = [];

        results.data.forEach((record: any, idx: number) => {
          const row: any = {};
          let firstName = "";
          let lastName = "";
          let phones: string[] = [];
          
          for (const [key, val] of Object.entries(record)) {
            const header = (key as string).toLowerCase().trim();
            const value = ((val as string) || "").trim();
            if (!value || value === "N/A" || value === "n/a" || value === "NA") continue;

            // === NAME FIELDS ===
            if (header === "first name" || header === "first_name" || header === "firstname") {
              firstName = value;
            } else if (header === "last name" || header === "last_name" || header === "lastname") {
              lastName = value;
            } else if (header === "full name" || header === "full_name" || header === "fullname" || header === "contact full name") {
              row.ownerName = value;
            }
            // === EMAIL FIELDS (Seamless uses Email 1, Email 2, Email 3, Work Email, Personal Email) ===
            else if (
              header === "email 1" || header === "email1" || 
              header === "work email" || header === "work e-mail" ||
              header === "email" || header === "e-mail"
            ) {
              row.email = value;
            } else if (
              (header === "email 2" || header === "email2" || 
               header === "email 3" || header === "email3" ||
               header === "contact email" ||
               header === "personal email 1" || header === "personal email 2" || header === "personal email 3") && !row.email
            ) {
              // Only set email from known email columns, NOT from "Email Validation" or "Total AI" columns
              if (!header.includes("validation") && !header.includes("total ai")) {
                row.email = value;
              }
            }
            // === PHONE FIELDS (Seamless uses Contact Phone 1-10, Company Phone 1-10, Contact Mobile Phone) ===
            else if (
              header.match(/^contact phone\s*\d*$/) ||
              header.match(/^contact_phone\s*\d*$/) ||
              header === "direct phone" || header === "direct number" ||
              header === "mobile phone" || header === "mobile" ||
              header === "contact mobile phone" ||
              header.match(/^contact mobile phone\s*\d*$/) ||
              header.match(/^phone\s*\d*$/) ||
              header === "phone" || header === "phone number"
            ) {
              if (value.replace(/[^0-9]/g, "").length >= 7) {
                phones.push(value);
              }
            } else if (
              header.match(/^company phone\s*\d*$/) ||
              header.match(/^company_phone\s*\d*$/)
            ) {
              if (value.replace(/[^0-9]/g, "").length >= 7) {
                phones.push(value);
              }
            }
            // === COMPANY FIELDS (Seamless uses "Company Name - Cleaned") ===
            else if (
              header === "company name" || header === "company_name" || header === "company" ||
              header === "company name - cleaned" || header.startsWith("company name")
            ) {
              row.companyName = value;
            } else if (header === "title" || header === "job title" || header === "job_title") {
              row.jobTitle = value;
            } else if (header === "company industry" || header === "industry") {
              row.industry = value;
            } else if (
              header === "company employee size" || header === "company employee size range" ||
              header === "# employees" || header === "employee count" ||
              header === "employees" || header.includes("employee size")
            ) {
              row.companySize = value;
            } else if (
              header === "website" || header === "company website" || header === "company url" ||
              header === "company website domain"
            ) {
              row.website = value;
            } else if (
              header === "company staff count" || header === "company staff count range"
            ) {
              row.companySize = value;
            }
            // === SOCIAL FIELDS (Seamless uses "Contact LI Profile URL", "Company LI Profile Url") ===
            else if (
              header === "linkedin profile url" || header === "linkedin url" || header === "linkedin" ||
              header === "company linkedin url" || header === "contact li profile url" ||
              header === "company li profile url" || header.includes("li profile url")
            ) {
              if (!row.linkedinUrl) row.linkedinUrl = value;
            } else if (header.includes("instagram")) {
              row.instagramUrl = value;
            } else if (header.includes("facebook")) {
              row.facebookUrl = value;
            }
            // === LOCATION FIELDS (Seamless uses "Contact City", "Contact State", "Company City", etc.) ===
            else if (
              header === "city" || header === "company location - city" ||
              header === "contact location - city" || header === "contact city" ||
              header === "company city"
            ) {
              if (!row.city) row.city = value;
            } else if (
              header === "state" || header === "state/region" ||
              header === "company location - state" || header === "contact location - state" ||
              header === "company location - state abbreviation" || header === "contact location - state abbreviation" ||
              header === "contact state" || header === "contact state abbr" ||
              header === "company state" || header === "company state abbr"
            ) {
              if (!row.state) row.state = value;
            } else if (
              header === "country" || 
              header === "company location - country" || header === "contact location - country" ||
              header === "company location - country alpha-2 code" || header === "contact location - country alpha-2 code" ||
              header === "contact country" || header === "company country" ||
              header === "contact country (alpha 2)" || header === "company country (alpha 2)"
            ) {
              if (!row.country) row.country = value;
            }
            // === GENERIC FALLBACKS (only if not already matched) ===
            else if (header === "owner name" || header === "owner" || header === "contact name" || header === "name") {
              if (!row.ownerName) row.ownerName = value;
            } else if (header.includes("tag") || header.includes("label") || header.includes("priority")) {
              const tagVal = value.toLowerCase().replace(/[\s-]+/g, "_");
              if (["hot", "warm", "cold", "follow_up"].includes(tagVal)) row.tag = tagVal;
            }
            // NOTE: We intentionally do NOT match "location", "street address", "zip" etc. to ownerName
          }

          // Combine first + last name for Seamless.AI format
          if ((firstName || lastName) && !row.ownerName) {
            row.ownerName = `${firstName} ${lastName}`.trim();
          }

          // Assign phones: first valid = primary, second = secondary
          if (phones.length > 0) {
            row.phoneNumber = phones[0];
            if (phones.length > 1 && phones[1] !== phones[0]) {
              row.secondaryPhone = phones[1];
            }
          }

          // Only use positional fallback for NON-Seamless formats
          if (!isSeamlessFormat) {
            const values = Object.values(record).map((v) => ((v as string) || "").trim());
            if (!row.companyName && values[0]) row.companyName = values[0];
            if (!row.ownerName && values[1]) row.ownerName = values[1];
            if (!row.email && values[2]) row.email = values[2];
            if (!row.phoneNumber && values[3]) row.phoneNumber = values[3];
          }

          // Require name + company + email + phone
          if (!row.companyName || !row.ownerName) {
            errors.push(`Row ${idx + 2}: Missing company name or contact name`);
            return;
          }
          if (!row.email) {
            errors.push(`Row ${idx + 2}: Missing email address — skipping`);
            return;
          }
          if (!row.phoneNumber) {
            errors.push(`Row ${idx + 2}: Missing phone number — skipping`);
            return;
          }

          // Validate email if present
          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            row.email = ""; // Invalid email, clear it
          }

          // Validate and format phone number if present
          if (row.phoneNumber) {
            const phoneDigits = row.phoneNumber.replace(/[^0-9]/g, "");
            if (phoneDigits.length >= 10) {
              // Auto-format phone number to +1XXXXXXXXXX (for Retell.AI)
              let normalizedDigits = phoneDigits;
              if (normalizedDigits.length === 11 && normalizedDigits.startsWith("1")) {
                normalizedDigits = normalizedDigits.slice(1); // Remove leading country code
              } else if (normalizedDigits.length > 10) {
                normalizedDigits = normalizedDigits.slice(-10); // Take last 10 digits
              }
              // Store as +1XXXXXXXXXX for Retell.AI calling compatibility
              row.phoneNumber = `+1${normalizedDigits}`;
              row.phoneDisplay = `(${normalizedDigits.slice(0, 3)}) ${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
            } else {
              row.phoneNumber = ""; // Invalid phone, clear it
            }
          }

          // After validation, ensure we have both valid email AND phone
          if (!row.email) {
            errors.push(`Row ${idx + 2}: Invalid email — skipping`);
            return;
          }
          if (!row.phoneNumber) {
            errors.push(`Row ${idx + 2}: Invalid phone number — skipping`);
            return;
          }

          // Format secondary phone if present
          if (row.secondaryPhone) {
            const secDigits = row.secondaryPhone.replace(/[^0-9]/g, "");
            if (secDigits.length >= 10) {
              let secNormalized = secDigits;
              if (secNormalized.length === 11 && secNormalized.startsWith("1")) {
                secNormalized = secNormalized.slice(1);
              } else if (secNormalized.length > 10) {
                secNormalized = secNormalized.slice(-10);
              }
              row.secondaryPhone = `+1${secNormalized}`;
              row.secondaryPhoneDisplay = `(${secNormalized.slice(0, 3)}) ${secNormalized.slice(3, 6)}-${secNormalized.slice(6)}`;
            } else {
              row.secondaryPhone = null; // Invalid secondary phone, discard
            }
          }

          rows.push(row);
        });

        if (rows.length === 0) {
          toast.error("No valid leads found. Ensure CSV has: Name + Company Name + Email + Phone Number");
          if (errors.length > 0) toast.error(errors.slice(0, 3).join("\n"));
          return;
        }

        if (errors.length > 0) {
          toast.warning(`${errors.length} rows skipped (missing valid email or phone number)`, { duration: 6000 });
        }

        if (isSeamlessFormat) {
          toast.success(`${rows.length} Seamless.AI contacts with email + phone ready to import!`);
        }

        setCsvPreview(rows);
        setCsvEngagementScores({});
        setCsvScoringIndices(new Set());
        setCsvDialogOpen(true);
        // Kept small (10) so the initial preview feels fast -- "Score More"
        // covers the rest, same pattern as the Seamless.AI candidate preview.
        scoreEngagementForCsvRows(rows.slice(0, 10).map((row, index) => ({ index, row })));
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
      const dedupResult = emails.length > 0 
        ? await dedupCheckMutation.mutateAsync({ emails })
        : { duplicates: [] };
      const dupSet = new Set(dedupResult.duplicates);
      // Leads without email are always considered unique
      const uniqueLeads = csvPreview.filter((r: any) => !r.email || !dupSet.has(r.email));
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
      const summaryParts = [`Imported ${result.imported} leads`];
      if (result.duplicatesSkipped && result.duplicatesSkipped > 0) {
        summaryParts.push(`${result.duplicatesSkipped} duplicates skipped`);
      }
      toast.success(summaryParts.join(' | '));
      
      if (result.duplicates && result.duplicates.length > 0) {
        const dupList = result.duplicates.slice(0, 3).map(d => `${d.name} (${d.company})`).join(', ');
        const moreText = result.duplicates.length > 3 ? ` + ${result.duplicates.length - 3} more` : '';
        toast.info(`Skipped: ${dupList}${moreText}`, { duration: 6000 });
      }
      
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} rows had errors`);
      }
      setCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
      setCsvLeadSetName("");
      setCsvEngagementScores({});
      setCsvScoringIndices(new Set());
      leadsQuery.refetch();
      leadSetsQuery.refetch();
      importedListsQuery.refetch();

      // Auto-trigger engagement scoring for newly imported leads
      if (result.imported > 0 && result.leadIds && result.leadIds.length > 0) {
        toast.info("Scoring engagement for imported leads (LinkedIn + Website)...", { duration: 5000 });
        try {
          const scoringResult = await scoreEngagementBatchMutation.mutateAsync({ leadIds: result.leadIds });
          toast.success(scoringResult.message || "Scoring leads in background...", { duration: 8000 });
          // Refetch after a delay to see updated scores
          setTimeout(() => leadsQuery.refetch(), 3000);
        } catch (err: any) {
          console.error("Auto-scoring error:", err);
          toast.info("Leads imported, but engagement scoring failed to start automatically.");
        }
      }
    } catch (error: any) {
      console.error("CSV import error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to import CSV leads", { duration: 8000 });
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

  const assignLeadsMutation = trpc.leadSets.assignLeads.useMutation();
  const createLeadSetMutation = trpc.leadSets.create.useMutation();
  const [newTagName, setNewTagName] = useState("");
  const [showCreateTag, setShowCreateTag] = useState(false);

  const handleBulkAssign = async () => {
    if (selectedLeadIds.size === 0) return;

    if (!assignToSetId) {
      toast.error("Please select a tag");
      return;
    }

    try {
      await assignLeadsMutation.mutateAsync({
        leadIds: Array.from(selectedLeadIds),
        leadSetId: parseInt(assignToSetId),
      });
      const setName = leadSets.find((s: any) => s.id === parseInt(assignToSetId))?.name || assignToSetId;
      toast.success(`${selectedLeadIds.size} lead(s) assigned to "${setName}"`);
      setSelectedLeadIds(new Set());
      setAssignDialogOpen(false);
      setAssignToSetId("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error: any) {
      console.error("Assign leads error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to assign leads", { duration: 8000 });
    }
  };

  const handleCreateTagAndAssign = async () => {
    if (!newTagName.trim()) {
      toast.error("Please enter a tag name");
      return;
    }
    try {
      const result = await createLeadSetMutation.mutateAsync({ name: newTagName.trim() });
      // Now assign leads to the newly created set
      await assignLeadsMutation.mutateAsync({
        leadIds: Array.from(selectedLeadIds),
        leadSetId: result.id,
      });
      toast.success(`Created "${newTagName.trim()}" and assigned ${selectedLeadIds.size} lead(s)`);
      setSelectedLeadIds(new Set());
      setAssignDialogOpen(false);
      setAssignToSetId("");
      setNewTagName("");
      setShowCreateTag(false);
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error: any) {
      console.error("Create tag error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to create tag", { duration: 8000 });
    }
  };

  const handleRemoveFromTag = async () => {
    if (selectedLeadIds.size === 0) return;
    try {
      await assignLeadsMutation.mutateAsync({
        leadIds: Array.from(selectedLeadIds),
        leadSetId: null,
      });
      toast.success(`${selectedLeadIds.size} lead(s) removed from tag (now untagged)`);
      setSelectedLeadIds(new Set());
      setAssignDialogOpen(false);
      setAssignToSetId("");
      leadsQuery.refetch();
      leadSetsQuery.refetch();
    } catch (error: any) {
      console.error("Remove from tag error:", error);
      toast.error(error?.message || error?.data?.message || "Failed to remove from tag", { duration: 8000 });
    }
  };

  // Filter leads
  // Get unique industries for filter dropdown
  const industries = useMemo(() => {
    const industrySet = new Set<string>();
    (leadsQuery.data || []).forEach((lead: any) => {
      if (lead.industry && lead.industry !== "Unknown") {
        industrySet.add(lead.industry);
      }
    });
    return Array.from(industrySet).sort();
  }, [leadsQuery.data]);

  const filteredLeads = useMemo(() => {
    const filtered = (leadsQuery.data || []).filter((lead: any) => {
      const matchesSearch =
        !searchQuery ||
        lead.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.ownerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
      let matchesListFilter = true;
      if (filterSourceListId !== "all") {
        const listId = parseInt(filterSourceListId);
        // Once a lead has been assigned a tag (leadSetId), it should only show
        // up under that tag filter, not keep appearing in the imported list it
        // originally came from. The `!lead.sourceListId` branch is a backward-
        // compatibility fallback for older records created before sourceListId
        // existed, where leadSetId doubled as the list identifier.
        matchesListFilter = (lead.sourceListId === listId && !lead.leadSetId) || (!lead.sourceListId && lead.leadSetId === listId);
      } else if (filterLeadSet === "unassigned") {
        matchesListFilter = !lead.leadSetId;
      } else if (filterLeadSet !== "all") {
        matchesListFilter = lead.leadSetId === parseInt(filterLeadSet);
      } else if (searchQuery.trim() || filterIndustry !== "all" || filterHasPhone !== "all") {
        // Neither the Imported List nor Tag filter is engaged, but the user is
        // actively searching/filtering some other way -- still show untagged
        // leads so search results aren't wiped out by this rule.
        matchesListFilter = !lead.leadSetId;
      } else {
        // Nothing selected at all -- "All Imported Lists" is not a real,
        // browsable bucket on its own; a lead should only ever be found by
        // explicitly picking its specific list (or a specific tag, or
        // "Unassigned"), never through a generic combined view.
        matchesListFilter = false;
      }
      const matchesIndustry =
        filterIndustry === "all" || lead.industry === filterIndustry;
      
      // Check phone filter
      const hasPhone = lead.phoneNumber && lead.phoneNumber.trim().length > 0;
      const hasEmail = lead.email && lead.email.trim().length > 0;
      let matchesPhoneFilter = true;
      if (filterHasPhone === "has-phone") {
        matchesPhoneFilter = hasPhone && hasEmail; // Both email AND phone
      } else if (filterHasPhone === "no-phone") {
        matchesPhoneFilter = !hasPhone || !hasEmail; // Missing either
      }
      
      return matchesListFilter && matchesSearch && matchesIndustry && matchesPhoneFilter;
    });

    // Apply sorting
    if (sortBy === "engagement_desc") {
      return [...filtered].sort((a: any, b: any) => {
        const scoreA = a.engagementScore || (a.socialMediaScore === "high" ? 50 : a.socialMediaScore === "low" ? 10 : 0);
        const scoreB = b.engagementScore || (b.socialMediaScore === "high" ? 50 : b.socialMediaScore === "low" ? 10 : 0);
        return scoreB - scoreA;
      });
    } else if (sortBy === "engagement_asc") {
      return [...filtered].sort((a: any, b: any) => {
        const scoreA = a.engagementScore || (a.socialMediaScore === "high" ? 50 : a.socialMediaScore === "low" ? 10 : 0);
        const scoreB = b.engagementScore || (b.socialMediaScore === "high" ? 50 : b.socialMediaScore === "low" ? 10 : 0);
        return scoreA - scoreB;
      });
    } else if (sortBy === "name_asc") {
      return [...filtered].sort((a: any, b: any) => (a.ownerName || "").localeCompare(b.ownerName || ""));
    } else if (sortBy === "newest") {
      return [...filtered].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return filtered;
  }, [leadsQuery.data, filterSourceListId, searchQuery, filterLeadSet, filterIndustry, filterHasPhone, sortBy]);

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

      {/* Bulk Assign to Tag Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => { setAssignDialogOpen(open); if (!open) { setShowCreateTag(false); setNewTagName(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5" />
              Assign Leads to a Tag
            </DialogTitle>
            <DialogDescription>
              Assign {selectedLeadIds.size} selected lead(s) to a tag for batch sending
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!showCreateTag ? (
              <>
                <div>
                  <label className="text-sm font-medium">Choose Tag</label>
                  <Select value={assignToSetId} onValueChange={setAssignToSetId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSets.map((set: any) => (
                        <SelectItem key={set.id} value={String(set.id)}>
                          <span className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-primary" />
                            {set.name}
                            <span className="text-xs text-muted-foreground">({set.leadCount || 0} leads)</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleBulkAssign}
                    disabled={!assignToSetId || assignLeadsMutation.isPending}
                    className="flex-1"
                  >
                    {assignLeadsMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" />Assigning...</>
                    ) : (
                      `Assign ${selectedLeadIds.size} Lead(s)`
                    )}
                  </Button>
                </div>
                <div className="border-t pt-3 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateTag(true)}
                    className="flex-1 gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Tag
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemoveFromTag}
                    disabled={assignLeadsMutation.isPending}
                    className="flex-1 gap-2 text-destructive hover:text-destructive"
                  >
                    {assignLeadsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    Remove from Tag
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">New Tag Name</label>
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="e.g., Motivational Speaker Set 1"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Create a custom tag to group leads for batch email sending</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setShowCreateTag(false); setNewTagName(""); }}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleCreateTagAndAssign}
                    disabled={!newTagName.trim() || createLeadSetMutation.isPending || assignLeadsMutation.isPending}
                    className="flex-1"
                  >
                    {(createLeadSetMutation.isPending || assignLeadsMutation.isPending) ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</>
                    ) : (
                      `Create & Assign ${selectedLeadIds.size} Lead(s)`
                    )}
                  </Button>
                </div>
              </>
            )}
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

      {/* Delete Risky/Unknown Leads Dialog — with selective skip */}
      <Dialog open={deleteRiskyDialogOpen} onOpenChange={setDeleteRiskyDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Risky & Unknown Email Leads
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <p className="text-sm text-muted-foreground">
              Uncheck any leads you want to <strong>keep</strong>. Only checked leads will be deleted.
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {riskyLeadsToDelete.size} of {(leadsQuery.data || []).filter((l: any) => l.emailVerificationStatus === "risky" || l.emailVerificationStatus === "unknown").length} selected for deletion
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => {
                  const all = (leadsQuery.data || []).filter((l: any) => l.emailVerificationStatus === "risky" || l.emailVerificationStatus === "unknown");
                  setRiskyLeadsToDelete(new Set(all.map((l: any) => l.id)));
                }}>Select All</Button>
                <Button variant="ghost" size="sm" onClick={() => setRiskyLeadsToDelete(new Set())}>Deselect All</Button>
              </div>
            </div>
            <div className="border rounded-md overflow-auto flex-1 max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 w-10"></th>
                    <th className="p-2 text-left font-medium">Contact</th>
                    <th className="p-2 text-left font-medium">Company</th>
                    <th className="p-2 text-left font-medium">Email</th>
                    <th className="p-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadsQuery.data || []).filter((l: any) => l.emailVerificationStatus === "risky" || l.emailVerificationStatus === "unknown").map((lead: any) => (
                    <tr key={lead.id} className={`border-t hover:bg-muted/30 transition-colors ${!riskyLeadsToDelete.has(lead.id) ? 'opacity-50' : ''}`}>
                      <td className="p-2 text-center">
                        <Checkbox
                          checked={riskyLeadsToDelete.has(lead.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(riskyLeadsToDelete);
                            if (checked) next.add(lead.id);
                            else next.delete(lead.id);
                            setRiskyLeadsToDelete(next);
                          }}
                        />
                      </td>
                      <td className="p-2">{lead.ownerName}</td>
                      <td className="p-2 text-muted-foreground">{lead.companyName}</td>
                      <td className="p-2 text-muted-foreground text-xs">{lead.email}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${lead.emailVerificationStatus === 'risky' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          {lead.emailVerificationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setDeleteRiskyDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending || riskyLeadsToDelete.size === 0}
              onClick={async () => {
                try {
                  const result = await bulkDeleteMutation.mutateAsync({ leadIds: Array.from(riskyLeadsToDelete) });
                  toast.success(`Deleted ${result.deleted} leads (kept ${(leadsQuery.data || []).filter((l: any) => (l.emailVerificationStatus === "risky" || l.emailVerificationStatus === "unknown") && !riskyLeadsToDelete.has(l.id)).length} leads you unchecked)`);
                  leadsQuery.refetch();
                  setDeleteRiskyDialogOpen(false);
                } catch (err: any) {
                  toast.error(err.message || "Failed to delete leads");
                }
              }}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete {riskyLeadsToDelete.size} Lead{riskyLeadsToDelete.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Seamless.AI Search Results — select which candidates to enrich and save */}
      <Dialog open={seamlessPreviewDialogOpen} onOpenChange={setSeamlessPreviewDialogOpen}>
        <DialogContent className="max-w-[98vw] w-full sm:max-w-7xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              Seamless.AI Search Results
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <p className="text-sm text-muted-foreground">
              Uncheck any contacts you don't want. Only checked contacts will be enriched (phone and email lookup) and cost credits.
            </p>
            <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 rounded-md p-3 text-sm flex-wrap">
              <div>
                Available on Seamless.AI: <strong className="text-base">{typeof seamlessTotalAvailable === "number" ? seamlessTotalAvailable.toLocaleString() : "—"}</strong>
              </div>
              <div className="text-blue-400 dark:text-blue-700">|</div>
              <div>
                Extracted now: <strong className="text-base">{seamlessCandidates.length.toLocaleString()}</strong>
              </div>
              {typeof seamlessSearchCredits === "number" && (
                <>
                  <div className="text-blue-400 dark:text-blue-700">|</div>
                  <div>
                    Search cost: <strong className="text-base">{seamlessSearchCredits}</strong> credit{seamlessSearchCredits !== 1 ? "s" : ""}
                  </div>
                </>
              )}
              {typeof seamlessTotalAvailable === "number" && seamlessTotalAvailable > seamlessCandidates.length && (
                <span className="text-xs text-blue-700 dark:text-blue-400">Increase "Number of Leads" and search again to pull more.</span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm flex-wrap gap-y-2">
              <span className="font-medium">
                {selectedSeamlessIds.size} of {seamlessCandidates.length} selected
              </span>
              <div className="flex items-center flex-wrap gap-3">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSeamlessIds(new Set(seamlessCandidates.map((c) => c.searchResultId)))}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSeamlessIds(new Set())}>Deselect All</Button>
                </div>
                <div className="flex items-center gap-1.5 border-l pl-3">
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 20"
                    value={selectFirstNInput}
                    onChange={(e) => setSelectFirstNInput(e.target.value)}
                    className="h-8 w-24 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const n = parseInt(selectFirstNInput, 10);
                      if (!n || n < 1) {
                        toast.error("Enter a number of leads to select");
                        return;
                      }
                      setSelectedSeamlessIds(new Set(seamlessCandidates.slice(0, n).map((c) => c.searchResultId)));
                    }}
                  >
                    Select First N
                  </Button>
                </div>
                {seamlessCandidates.some((c) => !seamlessEngagementScores[c.searchResultId] && !scoringEngagementIds.has(c.searchResultId)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border-l pl-3 rounded-l-none"
                    disabled={scoringEngagementIds.size > 0}
                    onClick={() => scoreEngagementForCandidates(seamlessCandidates.filter((c) => !seamlessEngagementScores[c.searchResultId]).slice(0, 10))}
                  >
                    {scoringEngagementIds.size > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                    Score More
                  </Button>
                )}
              </div>
            </div>
            <div className="border rounded-md overflow-auto flex-1 max-h-[65vh]">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr>
                    <th className="p-3 w-10 sticky top-0 z-10 bg-muted/95 backdrop-blur"></th>
                    <th className="p-3 text-left font-medium w-36 sticky top-0 z-10 bg-muted/95 backdrop-blur">Contact</th>
                    <th className="p-3 text-left font-medium w-24 sticky top-0 z-10 bg-muted/95 backdrop-blur">Engagement</th>
                    <th className="p-3 text-left font-medium w-56 sticky top-0 z-10 bg-muted/95 backdrop-blur">Title</th>
                    <th className="p-3 text-left font-medium w-40 sticky top-0 z-10 bg-muted/95 backdrop-blur">Company</th>
                    <th className="p-3 text-left font-medium w-40 sticky top-0 z-10 bg-muted/95 backdrop-blur">Industry</th>
                    <th className="p-3 text-left font-medium w-24 sticky top-0 z-10 bg-muted/95 backdrop-blur">Company Size</th>
                    <th className="p-3 text-left font-medium w-40 sticky top-0 z-10 bg-muted/95 backdrop-blur">Location</th>
                    <th className="p-3 text-left font-medium w-16 sticky top-0 z-10 bg-muted/95 backdrop-blur">Website</th>
                    <th className="p-3 text-left font-medium w-16 sticky top-0 z-10 bg-muted/95 backdrop-blur">LinkedIn</th>
                    <th className="p-3 w-10 sticky top-0 z-10 bg-muted/95 backdrop-blur"></th>
                  </tr>
                </thead>
                <tbody>
                  {seamlessCandidates.map((c, idx) => {
                    const engagement = seamlessEngagementScores[c.searchResultId];
                    const isScoring = scoringEngagementIds.has(c.searchResultId);
                    return (
                    <tr key={c.searchResultId} className={`border-t hover:bg-muted/30 transition-colors ${!selectedSeamlessIds.has(c.searchResultId) ? 'opacity-50' : ''}`}>
                      <td className="p-3 text-center align-top">
                        <Checkbox
                          checked={selectedSeamlessIds.has(c.searchResultId)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedSeamlessIds);
                            if (checked) next.add(c.searchResultId);
                            else next.delete(c.searchResultId);
                            setSelectedSeamlessIds(next);
                          }}
                        />
                      </td>
                      <td className="p-3 font-medium align-top break-words">{c.ownerName || "Unknown"}</td>
                      <td className="p-3 align-top">
                        {isScoring ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : engagement ? (
                          <button
                            onClick={() => setSeamlessDetailIndex(idx)}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold cursor-pointer hover:ring-2 hover:ring-offset-1 ${
                              engagement.score >= 50 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" :
                              engagement.score >= 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" :
                              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {engagement.score}
                          </button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => scoreEngagementForCandidates([c])}>Score</Button>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground align-top break-words">{c.jobTitle || "—"}</td>
                      <td className="p-3 text-muted-foreground align-top break-words">{c.companyName}</td>
                      <td className="p-3 text-muted-foreground align-top break-words">{c.industry || "—"}</td>
                      <td className="p-3 text-muted-foreground align-top break-words">{c.companySize || "—"}</td>
                      <td className="p-3 text-muted-foreground align-top break-words">{[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="p-3 text-muted-foreground align-top">
                        {c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>Link</a> : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground align-top">
                        {c.linkedinUrl ? <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>Link</a> : "—"}
                      </td>
                      <td className="p-3 text-center align-top">
                        <button
                          onClick={() => handleRemoveSeamlessCandidate(c.searchResultId)}
                          className="text-muted-foreground hover:text-red-600"
                          title="Remove this contact from the list"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Phone and email aren't fetched yet — those are only looked up (and only cost credits) for the contacts you enrich below. Company size shown here comes directly from Seamless.AI's search results where available. Engagement score reflects LinkedIn profile strength + real website presence (not post/like activity, which Seamless.AI's data does not provide) — click a score to see the full breakdown.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setSeamlessPreviewDialogOpen(false)}>Close (keep results)</Button>
            <Button
              disabled={enrichSeamlessSelectionMutation.isPending || selectedSeamlessIds.size === 0}
              onClick={handleEnrichSeamlessSelection}
            >
              {enrichSeamlessSelectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enrich {selectedSeamlessIds.size} Selected
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Engagement score detail view — navigate left/right through candidates without closing the popup */}
      <Dialog open={seamlessDetailIndex !== null} onOpenChange={(open) => { if (!open) setSeamlessDetailIndex(null); }}>
        <DialogContent className="max-w-md">
          {seamlessDetailIndex !== null && seamlessCandidates[seamlessDetailIndex] && (() => {
            const candidate = seamlessCandidates[seamlessDetailIndex];
            const engagement = seamlessEngagementScores[candidate.searchResultId];
            const metrics = engagement?.metrics;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span>{candidate.ownerName || "Unknown"}</span>
                    <span className="text-xs font-normal text-muted-foreground">{seamlessDetailIndex + 1} of {seamlessCandidates.length}</span>
                  </DialogTitle>
                  <DialogDescription>{candidate.jobTitle || "—"} at {candidate.companyName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {scoringEngagementIds.has(candidate.searchResultId) ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> Scoring engagement...
                    </div>
                  ) : engagement ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Engagement Score</span>
                        <span className={`text-sm font-bold ${
                          engagement.score >= 50 ? "text-green-600" :
                          engagement.score >= 30 ? "text-yellow-600" :
                          "text-gray-600"
                        }`}>{engagement.score}/100</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          engagement.score >= 50 ? "bg-green-500" :
                          engagement.score >= 30 ? "bg-yellow-500" :
                          "bg-gray-400"
                        }`} style={{ width: `${engagement.score}%` }} />
                      </div>
                      <div className="space-y-1.5 pt-1 border-t">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LinkedIn (up to 75 pts)</p>
                        {metrics?.linkedin ? (
                          <div className="space-y-0.5">
                            {metrics.linkedin.hasProfile && <div className="flex justify-between text-xs"><span>Has LinkedIn profile</span><span className="text-green-600 font-medium">+15</span></div>}
                            {metrics.linkedin.isCreator && <div className="flex justify-between text-xs"><span>Creator badge</span><span className="text-green-600 font-medium">+12</span></div>}
                            {metrics.linkedin.isTopVoice && <div className="flex justify-between text-xs"><span>Top Voice badge</span><span className="text-green-600 font-medium">+12</span></div>}
                            {metrics.linkedin.isPremium && <div className="flex justify-between text-xs"><span>Premium account</span><span className="text-green-600 font-medium">+8</span></div>}
                            {metrics.linkedin.endorsements > 50 && <div className="flex justify-between text-xs"><span>High endorsements ({metrics.linkedin.endorsements})</span><span className="text-green-600 font-medium">+10</span></div>}
                            {metrics.linkedin.positions >= 3 && <div className="flex justify-between text-xs"><span>Multiple positions ({metrics.linkedin.positions})</span><span className="text-green-600 font-medium">+6</span></div>}
                            {metrics.linkedin.hasLeadershipRole && <div className="flex justify-between text-xs"><span>Leadership role</span><span className="text-green-600 font-medium">+7</span></div>}
                            {metrics.linkedin.hasDetailedProfile && <div className="flex justify-between text-xs"><span>Detailed profile</span><span className="text-green-600 font-medium">+5</span></div>}
                            {metrics.linkedin.headline && <div className="text-xs text-muted-foreground mt-1 italic truncate">"{metrics.linkedin.headline}"</div>}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No LinkedIn data available</p>
                        )}
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Website (up to 25 pts)</p>
                        {metrics?.website?.loadsSuccessfully ? (
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-xs"><span>Real website confirmed</span><span className="text-green-600 font-medium">+15</span></div>
                            {metrics.website.hasSocialLinks && <div className="flex justify-between text-xs"><span>Social links on site</span><span className="text-green-600 font-medium">+5</span></div>}
                            <div className="flex justify-between text-xs"><span>Loads successfully</span><span className="text-green-600 font-medium">+5</span></div>
                          </div>
                        ) : metrics?.website?.exists ? (
                          <div className="flex justify-between text-xs"><span className="text-red-500">Website doesn't load / parked domain</span><span className="text-red-500 font-medium">+0</span></div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No website found</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-6">
                      <p className="text-sm text-muted-foreground">Not scored yet</p>
                      <Button size="sm" onClick={() => scoreEngagementForCandidates([candidate])}>Score Now</Button>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <Button variant="outline" size="sm" disabled={seamlessDetailIndex === 0} onClick={() => goToSeamlessDetail(seamlessDetailIndex - 1)}>
                    ← Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Use ← → arrow keys too</span>
                  <Button variant="outline" size="sm" disabled={seamlessDetailIndex === seamlessCandidates.length - 1} onClick={() => goToSeamlessDetail(seamlessDetailIndex + 1)}>
                    Next →
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete All Leads Confirmation Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete All Leads?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  This will permanently delete <strong>all {(leadsQuery.data || []).length} leads</strong> from your account.
                </p>
                <p className="text-sm font-medium text-destructive">
                  All lead data, engagement scores, email verification status, and lead set assignments will be lost.
                </p>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteAllMutation.isPending}
              onClick={async () => {
                try {
                  const result = await deleteAllMutation.mutateAsync();
                  toast.success(`Deleted all ${result.deleted} leads`);
                  leadsQuery.refetch();
                  setDeleteAllDialogOpen(false);
                } catch (err: any) {
                  toast.error(err.message || "Failed to delete leads");
                }
              }}
            >
              {deleteAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete All Leads
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
              <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                  <DialogDescription>Enter the details of the lead you want to add</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 flex-1 overflow-y-auto pr-1 -mr-1">
                  <div>
                    <label className="text-sm font-medium">Company Name *</label>
                    <Input placeholder="e.g., Acme Corporation" value={manualLead.companyName} onChange={(e) => setManualLead({ ...manualLead, companyName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Owner/Contact Name *</label>
                    <Input placeholder="e.g., John Smith" value={manualLead.ownerName} onChange={(e) => setManualLead({ ...manualLead, ownerName: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Job Title</label>
                    <Input placeholder="e.g., CEO, Marketing Director" value={manualLead.jobTitle || ""} onChange={(e) => setManualLead({ ...manualLead, jobTitle: e.target.value })} className="mt-1" />
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
                  <div>
                    <label className="text-sm font-medium">Tag</label>
                    {!manualLeadNewTag ? (
                      <Select
                        value={manualLeadTagId}
                        onValueChange={(v) => { if (v === "__new__") { setManualLeadNewTag(true); } else { setManualLeadTagId(v); } }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select a tag (optional)..." />
                        </SelectTrigger>
                        <SelectContent>
                          {leadSets.map((set: any) => (
                            <SelectItem key={set.id} value={String(set.id)}>{set.name}</SelectItem>
                          ))}
                          <SelectItem value="__new__">+ Create New Tag</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2 mt-1">
                        <Input
                          placeholder="New tag name"
                          value={manualLeadNewTagName}
                          onChange={(e) => setManualLeadNewTagName(e.target.value)}
                        />
                        <Button type="button" variant="outline" onClick={() => { setManualLeadNewTag(false); setManualLeadNewTagName(""); }}>
                          Cancel
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Leads are grouped by tag for batch email sending</p>
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
                </div>
                <DialogFooter className="shrink-0 pt-3 border-t">
                  <Button onClick={handleAddManualLead} disabled={addLeadMutation.isPending} className="w-full">
                    {addLeadMutation.isPending ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding...</>) : "Add Lead"}
                  </Button>
                </DialogFooter>
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
              onClick={() => downloadCSVTemplate()}
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
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5" />AI Lead Generation</DialogTitle>
                  <DialogDescription>Describe what leads you want and AI will generate them</DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Two keywords, detected instantly — no need to write a sentence.
                    </p>
                    {(instruction || industryKeywordInput || titleKeywordInput) && (
                      <button
                        type="button"
                        onClick={resetGenerateForm}
                        className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                      >
                        Reset form
                      </button>
                    )}
                  </div>
                  {(generateSource === "seamless" || generateSource === "ai") && (
                    <div className="rounded-lg border bg-muted/30 p-3.5 space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Industry Keyword</label>
                          {detectIndustryFromKeywordMutation.isPending && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                            </span>
                          )}
                        </div>
                        <Input
                          placeholder="e.g., travel agency, real estate, e-commerce..."
                          value={industryKeywordInput}
                          onChange={(e) => setIndustryKeywordInput(e.target.value)}
                          className="mt-1.5 bg-background"
                        />
                        <Popover open={industryComboboxOpen} onOpenChange={setIndustryComboboxOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={
                                "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
                                (industryOverride
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                                  : industryKeywordNotFound
                                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                                  : "border-dashed text-muted-foreground hover:text-foreground hover:bg-muted")
                              }
                            >
                              {industryOverride ? (
                                <Check className="w-3 h-3 shrink-0" />
                              ) : industryKeywordNotFound ? (
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                              ) : null}
                              <span className="truncate">
                                {industryOverride
                                  ? industryOverride
                                  : industryKeywordNotFound
                                  ? "No match — will search all industries"
                                  : "Pick an industry manually"}
                              </span>
                              <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-60" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search industries..." />
                              <CommandList>
                                <CommandEmpty>No industry found</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem value="clear industry filter" onSelect={() => { setIndustryOverride(""); setIndustryManuallySet(false); setIndustryComboboxOpen(false); }}>
                                    Clear (no industry filter)
                                  </CommandItem>
                                  {seamlessIndustries.map((ind: string) => (
                                    <CommandItem key={ind} value={ind} onSelect={() => { setIndustryOverride(ind); setIndustryManuallySet(true); setIndustryComboboxOpen(false); }}>
                                      {ind}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {industryKeywordNotFound && (
                          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                            That's fine — the search will still run on your job title, just across every industry.
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Job Title Keyword</label>
                          {detectTitlesFromKeywordMutation.isPending && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                            </span>
                          )}
                        </div>
                        <Input
                          placeholder="e.g., owners, CEO, marketing director..."
                          value={titleKeywordInput}
                          onChange={(e) => setTitleKeywordInput(e.target.value)}
                          className="mt-1.5 bg-background"
                        />
                        {titleKeywordNotFound && (
                          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            No title match for "{titleKeywordInput.trim()}" — try being more specific, or add titles directly below.
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border rounded-md p-2 min-h-10 bg-background">
                          {titlesOverride.map((title) => (
                            <Badge key={title} variant="secondary" className="gap-1 pr-1">
                              {title}
                              <button
                                type="button"
                                onClick={() => handleRemoveTitleChip(title)}
                                className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                          <input
                            value={titleInputValue}
                            onChange={(e) => setTitleInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault();
                                handleAddTitleChip();
                              }
                            }}
                            onBlur={handleAddTitleChip}
                            placeholder={titlesOverride.length === 0 ? "Detected titles show here — or type your own and press Enter" : "Add another title..."}
                            className="flex-1 min-w-32 bg-transparent outline-none text-sm"
                          />
                        </div>
                        {titlesDetected && titlesOverride.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Detected from your keyword — remove any that aren't specific enough, or add your own.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <details className="group">
                    <summary className="text-sm font-medium cursor-pointer list-none flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <span className="group-open:rotate-90 transition-transform">▸</span> Additional details (optional)
                    </summary>
                    <Textarea
                      placeholder="Auto-filled from the keywords above — edit to add more context (e.g. specific cities, company details)..."
                      value={instruction}
                      onChange={(e) => {
                        setInstruction(e.target.value);
                        setInstructionManuallyEdited(true);
                      }}
                      className="mt-2 min-h-20"
                    />
                  </details>
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
                    {generateSource === "seamless" && (
                      <div>
                        <label className="text-sm font-medium">Company Size</label>
                        <Select value={generateCompanySize || "any"} onValueChange={setGenerateCompanySize}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Any Size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any Size</SelectItem>
                            <SelectItem value="0 - 1 (Self-employed)">0 - 1 (Self-employed)</SelectItem>
                            <SelectItem value="2 - 10">2 - 10</SelectItem>
                            <SelectItem value="11 - 50">11 - 50</SelectItem>
                            <SelectItem value="51 - 200">51 - 200</SelectItem>
                            <SelectItem value="201 - 500">201 - 500</SelectItem>
                            <SelectItem value="501 - 1,000">501 - 1,000</SelectItem>
                            <SelectItem value="1,001 - 5,000">1,001 - 5,000</SelectItem>
                            <SelectItem value="5,001 - 10,000">5,001 - 10,000</SelectItem>
                            <SelectItem value="10,001+">10,001+</SelectItem>
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
                  {generateSource === "ai" && (
                    <>
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                        AI will also extract <strong>website</strong>, <strong>LinkedIn</strong>, <strong>Instagram</strong>, and <strong>Facebook</strong> profile URLs when available.
                      </p>
                      <Button onClick={handleGenerateLeads} disabled={isGenerating} className="w-full gap-2">
                        {isGenerating ? (<><Loader2 className="w-4 h-4 animate-spin" />Generating...</>) : (<><Wand2 className="w-4 h-4" />Generate Leads</>)}
                      </Button>
                    </>
                  )}
                  {generateSource === "seamless" && (
                    <>
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                        This searches Seamless.AI <strong>without spending any credits</strong>. You'll pick which results to enrich (phone, email, company size) next — only your selections cost credits.
                      </p>
                      <Button onClick={handleSearchSeamless} disabled={isSearchingSeamless} className="w-full gap-2">
                        {isSearchingSeamless ? (<><Loader2 className="w-4 h-4 animate-spin" />Searching...</>) : (<><Wand2 className="w-4 h-4" />Search Seamless.AI</>)}
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
            {!seamlessPreviewDialogOpen && seamlessCandidates.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-violet-600 hover:text-violet-700"
                  onClick={() => setSeamlessPreviewDialogOpen(true)}
                >
                  Resume Seamless.AI Results ({seamlessCandidates.length} pending)
                </Button>
                <button
                  onClick={() => {
                    excludeSeamlessContactsMutation.mutate({
                      searchResultIds: seamlessCandidates.map((c) => c.searchResultId),
                    });
                    setSeamlessCandidates([]);
                    setSelectedSeamlessIds(new Set());
                    setSeamlessEngagementScores({});
                    setScoringEngagementIds(new Set());
                    toast("Discarded pending Seamless.AI results — they won't show up in future searches");
                  }}
                  className="text-muted-foreground hover:text-red-600 p-1"
                  title="Discard these pending results"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
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
            <DialogDescription className="flex items-center justify-between gap-2">
              <span>{csvFileName} — {csvPreview.length} leads found. Review before importing.</span>
              {csvPreview.slice(0, 20).some((_, i) => csvEngagementScores[i] === undefined && !csvScoringIndices.has(i)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={csvScoringIndices.size > 0}
                  onClick={() => scoreEngagementForCsvRows(
                    csvPreview.slice(0, 20)
                      .map((row, index) => ({ index, row }))
                      .filter(({ index }) => csvEngagementScores[index] === undefined)
                      .slice(0, 10)
                  )}
                >
                  {csvScoringIndices.size > 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Score More
                </Button>
              )}
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
                  <TableHead className="w-20">Engagement</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreview.slice(0, 20).map((row, i) => {
                  const engagement = csvEngagementScores[i];
                  const isScoring = csvScoringIndices.has(i);
                  return (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell>
                      {isScoring ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : engagement ? (
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                            engagement.score >= 50 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" :
                            engagement.score >= 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" :
                            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {engagement.score}
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => scoreEngagementForCsvRows([{ index: i, row }])}>Score</Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{row.companyName}</TableCell>
                    <TableCell className="text-sm">{row.ownerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="text-sm">{row.phoneDisplay || formatUSPhone(row.phoneNumber)}</TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
            {csvPreview.length > 20 && (
              <p className="text-sm text-muted-foreground text-center py-2">...and {csvPreview.length - 20} more leads</p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => { setCsvDialogOpen(false); setCsvPreview([]); setCsvLeadSetName(""); setCsvEngagementScores({}); setCsvScoringIndices(new Set()); }}>Cancel</Button>
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
                Assign Leads to a Tag
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

      {/* Risky/Unknown Selection Action Bar */}
      {riskyLeadsToDelete.size > 0 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {riskyLeadsToDelete.size} risky/unknown lead(s) marked for deletion
            </span>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  try {
                    const result = await bulkDeleteMutation.mutateAsync({ leadIds: Array.from(riskyLeadsToDelete) });
                    toast.success(`Deleted ${result.deleted} risky/unknown leads`);
                    setRiskyLeadsToDelete(new Set());
                    leadsQuery.refetch();
                  } catch (err: any) {
                    toast.error(err.message || "Failed to delete leads");
                  }
                }}
                disabled={bulkDeleteMutation.isPending}
                className="gap-1.5"
              >
                {bulkDeleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete {riskyLeadsToDelete.size} Lead{riskyLeadsToDelete.size !== 1 ? 's' : ''}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRiskyLeadsToDelete(new Set())}
              >
                Clear
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
              <Select value={filterSourceListId} onValueChange={setFilterSourceListId}>
                <SelectTrigger className="w-44">
                  <Layers className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Filter by list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Imported Lists</SelectItem>
                  {(importedListsQuery.data || []).filter((list: any) => list.type === "list").map((list: any) => (
                    <SelectItem key={list.id} value={String(list.id)}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={tagComboboxOpen} onOpenChange={setTagComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tagComboboxOpen}
                    className="w-44 justify-between font-normal"
                  >
                    <span className="flex items-center min-w-0">
                      <Layers className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">
                        {filterLeadSet === "all" ? "All Tags" :
                          filterLeadSet === "unassigned" ? "Unassigned" :
                          leadSets.find((s: any) => String(s.id) === filterLeadSet)?.name || "Filter by tag"}
                      </span>
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                      <CommandEmpty>No tag found</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => { setFilterLeadSet("all"); setTagComboboxOpen(false); }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${filterLeadSet === "all" ? "opacity-100" : "opacity-0"}`} />
                          All Tags
                        </CommandItem>
                        <CommandItem
                          value="unassigned"
                          onSelect={() => { setFilterLeadSet("unassigned"); setTagComboboxOpen(false); }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${filterLeadSet === "unassigned" ? "opacity-100" : "opacity-0"}`} />
                          Unassigned
                        </CommandItem>
                        {leadSets.map((set: any) => (
                          <CommandItem
                            key={set.id}
                            value={set.name}
                            onSelect={() => { setFilterLeadSet(String(set.id)); setTagComboboxOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${filterLeadSet === String(set.id) ? "opacity-100" : "opacity-0"}`} />
                            {set.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                <SelectTrigger className="w-40">
                  <Building2 className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Filter by industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {industries.map((industry: string) => (
                    <SelectItem key={industry} value={industry}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterHasPhone} onValueChange={setFilterHasPhone}>
                <SelectTrigger className="w-44">
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  <SelectValue placeholder="Filter by phone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Contact Status</SelectItem>
                  <SelectItem value="has-phone">Has Email & Phone</SelectItem>
                  <SelectItem value="no-phone">Missing Email or Phone</SelectItem>
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
                onClick={() => {
                  const newSelection = new Set(filteredLeads.map((l: any) => l.id));
                  setSelectedLeadIds(newSelection);
                  toast.success(`Selected ${newSelection.size} leads`);
                }}
                className="gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedLeadIds(new Set());
                  toast.info("Deselected all leads");
                }}
                className="gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Deselect All
              </Button>
              {filterSourceListId !== "all" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAssignAllListId(parseInt(filterSourceListId));
                      setAssignAllDialogOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign All to Tag
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeleteListId(parseInt(filterSourceListId));
                      setDeleteListDialogOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete List
                  </Button>
                </>
              )}
              {filterLeadSet !== "all" && filterLeadSet !== "unassigned" && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteTagId(parseInt(filterLeadSet));
                    setDeleteTagDialogOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Tag
                </Button>
              )}
              <Button
                variant={sortBy === "engagement_desc" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (sortBy === "engagement_desc") {
                    setSortBy("newest");
                  } else {
                    setSortBy("engagement_desc");
                    toast.success("Sorted by engagement score: highest first");
                  }
                }}
                className="gap-1.5"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortBy === "engagement_desc" ? "Sorted by Score" : "Sort by Score"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const pendingLeads = filteredLeads.filter((l: any) => l.emailVerificationStatus === "pending" && l.email);
                  if (pendingLeads.length === 0) {
                    toast.info("All visible leads are already verified!");
                    return;
                  }
                  toast.info(`Verifying ${pendingLeads.length} emails via Bouncer... This may take a moment.`);
                  try {
                    const result = await verifyEmailsMutation.mutateAsync({
                      leadIds: pendingLeads.map((l: any) => String(l.id)),
                    });
                    toast.success(`Verified ${result.results?.length || 0} emails: ${result.deliverable || 0} deliverable, ${result.undeliverable || 0} undeliverable, ${result.risky || 0} risky`);
                    leadsQuery.refetch();
                  } catch (err: any) {
                    toast.error(err.message || "Failed to verify emails");
                  }
                }}
                disabled={verifyEmailsMutation.isPending}
                className="gap-1.5"
              >
                {verifyEmailsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Verify Emails
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (selectedLeadIds.size === 0) {
                    toast.info("Please select leads to enrich");
                    return;
                  }
                  try {
                    const requestedExtraction = selectedLeadIds.size;
                    // Show initial progress with API-driven metrics (0 processed, awaiting totalResults from API)
                    setEnrichmentProgress({ 
                      totalSearchResults: 0, // Will be populated from API
                      extracted: 0, 
                      requested: requestedExtraction,
                    });
                    toast.loading(`Starting REST API enrichment for ${requestedExtraction} leads...`);
                    
                    // Call the enrichment service
                    const result = await apiFirstEnrichMutation.mutateAsync({
                      leadIds: Array.from(selectedLeadIds),
                      confidenceThreshold: 80,
                    });
                    
                    // Update progress with actual results from API
                    setEnrichmentProgress({
                      totalSearchResults: result.stats.totalSearchResults || 0, // API-driven total
                      extracted: result.stats.extracted || 0,
                      requested: requestedExtraction,
                    });
                    
                    // Clear loading toast
                    toast.dismiss();
                    
                    // Show success with stats
                    toast.success(`REST API enrichment completed: ${result.stats.enrichedLeads} successful, ${result.stats.failedLeads} failed`);
                    
                    // Clear state immediately
                    setSelectedLeadIds(new Set());
                    setEnrichmentProgress(null);
                    
                    // Refetch leads
                    await leadsQuery.refetch();
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : "Unknown error";
                    console.error("Enrichment error:", error);
                    
                    // Display detailed error information
                    if (errorMsg.includes("[SEAMLESS.AI ERROR")) {
                      // Extract the detailed error info
                      toast.error(errorMsg, { duration: 10000 });
                    } else {
                      toast.error(`Enrichment failed: ${errorMsg}`);
                    }
                    setEnrichmentProgress(null);
                  }
                }}
                disabled={apiFirstEnrichMutation.isPending || selectedLeadIds.size === 0}
                className="gap-1.5"
              >
                {apiFirstEnrichMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Enrich via REST API ({selectedLeadIds.size})
              </Button>
              {enrichmentProgress && (
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <div>Total Leads Found: <strong>{enrichmentProgress.totalSearchResults.toLocaleString()}</strong></div>
                  <div>Requested: <strong>{enrichmentProgress.requested}</strong></div>
                  <div>Extracted: <strong>{enrichmentProgress.extracted}/{enrichmentProgress.requested}</strong></div>
                  <div>Remaining: <strong>{Math.max(0, enrichmentProgress.requested - enrichmentProgress.extracted)}</strong></div>
                  <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                    <div>Estimated Credits: <strong>{enrichmentProgress.requested}</strong> (1 per lead for phone verification)</div>
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const riskyUnknown = (leadsQuery.data || []).filter((l: any) => l.emailVerificationStatus === "risky" || l.emailVerificationStatus === "unknown");
                  if (riskyUnknown.length === 0) {
                    toast.info("No leads with risky or unknown email status found");
                    return;
                  }
                  setRiskyLeadsToDelete(new Set(riskyUnknown.map((l: any) => l.id)));
                  setDeleteRiskyDialogOpen(true);
                }}
                disabled={deleteByStatusMutation.isPending}
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              >
                {deleteByStatusMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Risky/Unknown
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
                    <TableHead>Job Title</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Company Size</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Socials</TableHead>
                    <TableHead className="text-center">Engagement Score</TableHead>
                     <TableHead className="text-center">Email Status</TableHead>
                     <TableHead>Country</TableHead>
                    <TableHead className="text-center">Credits Used</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">{(lead as any).jobTitle || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.industry || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.companySize || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col gap-1">
                          {lead.phoneNumber && (
                            <div className="flex items-center gap-2">
                              <span>{formatUSPhone(lead.phoneNumber)}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                {(lead as any).phoneType === 'cell' ? 'Cell' : (lead as any).phoneType === 'office' ? 'Office' : 'Unknown'}
                              </span>
                            </div>
                          )}
                          {(lead as any).secondaryPhone && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{formatUSPhone((lead as any).secondaryPhone)}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                {(lead as any).secondaryPhoneType === 'cell' ? 'Cell' : (lead as any).secondaryPhoneType === 'office' ? 'Office' : 'Unknown'}
                              </span>
                            </div>
                          )}
                          {!(lead.phoneNumber || (lead as any).secondaryPhone) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {lead.website && (
                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" title="Website" className="text-muted-foreground hover:text-blue-600 transition-colors">
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
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <div className="flex items-center justify-center gap-1.5 cursor-pointer">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                  lead.engagementScore >= 50 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" :
                                  lead.engagementScore >= 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" :
                                  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                }`}>
                                  {lead.engagementScore}
                                </div>
                                <span className={`text-xs font-medium ${
                                  lead.engagementScore >= 50 ? "text-green-600 dark:text-green-400" :
                                  lead.engagementScore >= 30 ? "text-yellow-600 dark:text-yellow-400" :
                                  "text-gray-500 dark:text-gray-400"
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
                                      ) : (
                                        <p className="text-xs text-muted-foreground">No LinkedIn data available</p>
                                      )}
                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Website (up to 25 pts)</p>
                                      {data.website?.loadsSuccessfully ? (
                                        <div className="space-y-0.5">
                                          <div className="flex justify-between text-xs"><span>Real website confirmed</span><span className="text-green-600 font-medium">+15</span></div>
                                          {data.website.hasSocialLinks && <div className="flex justify-between text-xs"><span>Social links on site</span><span className="text-green-600 font-medium">+5</span></div>}
                                          <div className="flex justify-between text-xs"><span>Loads successfully</span><span className="text-green-600 font-medium">+5</span></div>
                                        </div>
                                      ) : data.website?.exists ? (
                                        <div className="space-y-0.5">
                                          <div className="flex justify-between text-xs"><span className="text-red-500">Website doesn't load / parked domain</span><span className="text-red-500 font-medium">+0</span></div>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">No website found</p>
                                      )}
                                      {data.scoredAt && <p className="text-[10px] text-muted-foreground pt-1 border-t">Scored: {new Date(data.scoredAt).toLocaleDateString()}</p>}
                                    </div>
                                  );
                                })() : (
                                  <p className="text-xs text-muted-foreground pt-1 border-t">Hover for details. Re-score this lead for a full breakdown.</p>
                                )}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ) : lead.socialMediaScore === "high" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800 text-xs gap-1">
                            <TrendingUp className="w-3 h-3" />
                            High
                          </Badge>
                        ) : lead.socialMediaScore === "low" ? (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs gap-1">
                            <TrendingDown className="w-3 h-3" />
                            Low
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs gap-1">
                            <Loader2 className="w-3 h-3" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {(lead.emailVerificationStatus === "risky" || lead.emailVerificationStatus === "unknown") && (
                            <Checkbox
                              checked={riskyLeadsToDelete.has(lead.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(riskyLeadsToDelete);
                                if (checked) next.add(lead.id);
                                else next.delete(lead.id);
                                setRiskyLeadsToDelete(next);
                              }}
                              className="w-3.5 h-3.5"
                              aria-label="Mark for deletion"
                            />
                          )}
                          {lead.emailVerificationStatus === "deliverable" ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800 text-xs gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Verified
                            </Badge>
                          ) : lead.emailVerificationStatus === "undeliverable" ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800 text-xs gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Blocked
                            </Badge>
                          ) : lead.emailVerificationStatus === "risky" ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Risky
                            </Badge>
                          ) : lead.emailVerificationStatus === "unknown" ? (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs gap-1">
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
                      <TableCell className="text-center">
                        {(lead as any).enrichmentCreditsUsed > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium">{(lead as any).enrichmentCreditsUsed}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                {searchQuery || filterSourceListId !== "all" || filterLeadSet !== "all" || filterIndustry !== "all"
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
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Lead
            </DialogTitle>
            <DialogDescription>
              Update the lead's contact information and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 flex-1 overflow-y-auto pr-1 -mr-1">
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
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Social Profiles (for Social Outreach)</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">LinkedIn</Label>
                <Input
                  value={editForm.linkedinUrl}
                  onChange={(e) => setEditForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                  placeholder="https://linkedin.com/in/johnsmith"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Instagram</Label>
                  <Input
                    value={editForm.instagramUrl}
                    onChange={(e) => setEditForm(f => ({ ...f, instagramUrl: e.target.value }))}
                    placeholder="https://instagram.com/john"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Facebook</Label>
                  <Input
                    value={editForm.facebookUrl}
                    onChange={(e) => setEditForm(f => ({ ...f, facebookUrl: e.target.value }))}
                    placeholder="https://facebook.com/john"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 shrink-0 border-t">
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
      
      {/* Assign All to Tag Dialog */}
      <Dialog open={assignAllDialogOpen} onOpenChange={setAssignAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Leads to Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select a tag to assign untagged leads from this list:</p>
            <Select value={assignAllTagId} onValueChange={setAssignAllTagId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tag" />
              </SelectTrigger>
              <SelectContent>
                {leadSets.map((set: any) => (
                  <SelectItem key={set.id} value={String(set.id)}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <label className="text-sm font-medium">Number of leads (optional)</label>
              <Input
                type="number"
                min="1"
                placeholder="Leave blank to assign all"
                value={assignAllCountInput}
                onChange={(e) => setAssignAllCountInput(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Assigns the first N untagged leads from this list, oldest first. Leave blank to assign every untagged lead.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignAllDialogOpen(false); setAssignAllCountInput(""); }}>Cancel</Button>
            <Button onClick={async () => {
              if (!assignAllTagId) return;
              try {
                const listId = assignAllListId;
                let leads = (leadsQuery.data || []).filter((l: any) => l.sourceListId === listId && !l.leadSetId);
                const n = parseInt(assignAllCountInput, 10);
                if (n > 0) {
                  leads = leads.slice(0, n);
                }
                await assignLeadsToSetMutation.mutateAsync({
                  leadIds: leads.map((l: any) => l.id),
                  leadSetId: parseInt(assignAllTagId)
                });
                toast.success(`Assigned ${leads.length} leads to tag`);
                leadsQuery.refetch();
                setAssignAllDialogOpen(false);
                setAssignAllTagId("");
                setAssignAllCountInput("");
              } catch (err: any) {
                toast.error(err.message || "Failed to assign leads");
              }
            }}>{assignAllCountInput && parseInt(assignAllCountInput, 10) > 0 ? `Assign First ${assignAllCountInput}` : "Assign All"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete List Dialog */}
      <Dialog open={deleteListDialogOpen} onOpenChange={setDeleteListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Imported List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this imported list? All leads from this list will become unassigned and move back to "All Imported Lists".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteListDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deleteListId) return;
              try {
                await deleteListMutation.mutateAsync({ id: deleteListId });
                setDeleteListDialogOpen(false);
                setDeleteListId(null);
                setFilterSourceListId("all");
                toast.success("List deleted successfully");
                // Refetch after dialog closes to avoid re-renders
                setTimeout(() => {
                  leadsQuery.refetch();
                  importedListsQuery.refetch();
                  leadSetsQuery.refetch();
                }, 100);
              } catch (err: any) {
                toast.error(err.message || "Failed to delete list");
              }
            }}>Delete List</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Dialog */}
      <Dialog open={deleteTagDialogOpen} onOpenChange={setDeleteTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tag</DialogTitle>
            <DialogDescription>Are you sure you want to delete this tag? Leads will be unassigned but not deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTagDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deleteTagId) return;
              try {
                await deleteListMutation.mutateAsync({ id: deleteTagId });
                toast.success("Tag deleted successfully");
                leadsQuery.refetch();
                leadSetsQuery.refetch();
                setDeleteTagDialogOpen(false);
                setDeleteTagId(null);
                setFilterLeadSet("all");
              } catch (err: any) {
                toast.error(err.message || "Failed to delete tag");
              }
            }}>Delete Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
