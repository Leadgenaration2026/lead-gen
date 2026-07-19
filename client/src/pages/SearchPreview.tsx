import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Loader2, Search, Download, Building2, Mail, Phone, User, Globe, Linkedin, UserPlus, X } from "lucide-react";

// Same title variants used for the "owner" keyword everywhere else in the app
// (TITLE_EXPANSION_MAP["owner"] in server/titleExpansionMap.ts) -- duplicated
// here rather than imported since server code isn't bundled into the client.
const OWNER_TITLES = ["Owner", "Founder", "CEO", "President", "Managing Director", "Principal", "Co-Founder", "Business Owner", "Partner"];

type OwnerCandidate = {
  searchResultId: string;
  ownerName: string;
  companyName: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  website?: string;
  linkedinUrl?: string;
};

type RevealedContact = {
  email?: string;
  phoneNumber?: string;
};

export default function SearchPreview() {
  const [instruction, setInstruction] = useState("");
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("");
  const [importCount, setImportCount] = useState(50);
  const [activeTab, setActiveTab] = useState("search");

  // Search state
  const [searchId, setSearchId] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);

  // Queries and mutations
  const searchMutation = trpc.searchPreview.search.useMutation();
  const getPreviewQuery = trpc.searchPreview.getPreview.useQuery(
    searchId ? { searchId, pageSize: 50 } : undefined,
    { enabled: !!searchId }
  );
  const importMutation = trpc.searchPreview.importResults.useMutation();
  const getImportStatusQuery = trpc.searchPreview.getImportStatus.useQuery(
    importId ? { importId } : undefined,
    { enabled: !!importId }
  );

  // "Find a Business's Owner" -- a separate, targeted single-company lookup,
  // distinct from the bulk instruction-driven search below.
  const [businessName, setBusinessName] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [businessZip, setBusinessZip] = useState("");
  // Editable title chips, same pattern as the Job Title Keyword picker in the
  // Generate Leads (AI) flow on the Leads page -- defaults to the common
  // owner-type titles but the user can remove/add their own.
  const [ownerTitles, setOwnerTitles] = useState<string[]>(OWNER_TITLES);
  const [ownerTitleInput, setOwnerTitleInput] = useState("");
  const [ownerCandidates, setOwnerCandidates] = useState<OwnerCandidate[]>([]);
  const [ownerSearchError, setOwnerSearchError] = useState<string | null>(null);
  const [revealedContacts, setRevealedContacts] = useState<Record<string, RevealedContact>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const findOwnerMutation = trpc.leads.searchSeamlessPreview.useMutation();
  const revealContactMutation = trpc.leads.enrichSeamlessSelection.useMutation();

  const handleAddOwnerTitleChip = () => {
    const value = ownerTitleInput.trim();
    if (!value) return;
    if (ownerTitles.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setOwnerTitleInput("");
      return;
    }
    if (ownerTitles.length >= 10) {
      setOwnerTitleInput("");
      return;
    }
    setOwnerTitles([...ownerTitles, value]);
    setOwnerTitleInput("");
  };

  const handleRemoveOwnerTitleChip = (title: string) => {
    setOwnerTitles(ownerTitles.filter((t) => t !== title));
  };

  const handleFindOwner = async () => {
    if (!businessName.trim() && !businessWebsite.trim()) return;
    setOwnerSearchError(null);
    setOwnerCandidates([]);
    setRevealedContacts({});
    try {
      const result = await findOwnerMutation.mutateAsync({
        instruction: `Find the owner of ${businessName.trim() || businessWebsite.trim()}`,
        count: 10,
        country: "United States",
        state: businessState.trim() || undefined,
        companyNameOverride: businessName.trim() || undefined,
        companyDomainOverride: businessWebsite.trim() || undefined,
        zipCode: businessZip.trim() || undefined,
        titlesOverride: ownerTitles.length > 0 ? ownerTitles : undefined,
      });
      if (result.candidates.length === 0) {
        setOwnerSearchError(`No match found for "${businessName.trim() || businessWebsite.trim()}" on Seamless.AI. Try without the state/ZIP to broaden it, or double-check the spelling/URL.`);
        return;
      }
      setOwnerCandidates(result.candidates);
    } catch (error: any) {
      setOwnerSearchError(error?.message || error?.data?.message || "Search failed");
    }
  };

  const handleRevealContact = async (candidate: OwnerCandidate) => {
    setRevealingId(candidate.searchResultId);
    try {
      const result = await revealContactMutation.mutateAsync({
        leadSetName: `Business Owner Lookup - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        candidates: [{
          searchResultId: candidate.searchResultId,
          ownerName: candidate.ownerName,
          companyName: candidate.companyName,
          jobTitle: candidate.jobTitle,
          city: candidate.city,
          state: candidate.state,
          country: candidate.country,
          website: candidate.website,
          industry: candidate.industry,
          linkedinUrl: candidate.linkedinUrl,
        }],
      });
      const enriched = result.leads?.[0];
      setRevealedContacts((prev) => ({
        ...prev,
        [candidate.searchResultId]: {
          email: enriched?.email || undefined,
          phoneNumber: enriched?.phoneNumber || undefined,
        },
      }));
    } catch (error: any) {
      setOwnerSearchError(error?.message || error?.data?.message || "Failed to reveal contact info");
    } finally {
      setRevealingId(null);
    }
  };

  const handleSearch = async () => {
    if (!instruction.trim()) {
      alert("Please enter a search instruction");
      return;
    }

    try {
      const result = await searchMutation.mutateAsync({
        instruction,
        country,
        state: state || undefined,
      });

      setSearchId(result.searchId);
      setActiveTab("preview");
      console.log(`[SearchPreview] Search complete: ${result.totalResults} leads found`);
    } catch (error) {
      console.error("[SearchPreview] Search failed:", error);
    }
  };

  const handleImport = async () => {
    if (!searchId) return;

    try {
      const result = await importMutation.mutateAsync({
        searchId,
        importCount,
      });

      setImportId(result.importId);
      setActiveTab("import");
      console.log(`[SearchPreview] Import created: ${result.importedCount} leads`);
    } catch (error) {
      console.error("[SearchPreview] Import failed:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Lead Search & Preview</h1>
        <p className="text-muted-foreground mt-2">
          Search for leads, preview results, and import without consuming credits
        </p>
      </div>

      {/* Find a Business's Owner -- a targeted single-company lookup, separate
          from the bulk instruction-driven search below. Business name and
          state/ZIP are real Seamless.AI filters (companyName, contactState,
          contactZipCode); city and phone-number search are NOT supported by
          Seamless's API at all, so they're deliberately not offered here. */}
      <Card className="p-6 border-violet-200 bg-gradient-to-b from-violet-50/40 to-transparent dark:border-violet-900/50 dark:from-violet-950/10">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-violet-600" />
          <h2 className="text-xl font-semibold">Find a Business's Owner</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Look up one specific business and reveal the owner's name, email, and phone number.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Business Name</label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g., Acme Plumbing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Website</label>
              <Input
                value={businessWebsite}
                onChange={(e) => setBusinessWebsite(e.target.value)}
                placeholder="e.g., acmeplumbing.com"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Enter at least one of Business Name or Website — giving both narrows the match further.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">State (Optional)</label>
              <Input
                value={businessState}
                onChange={(e) => setBusinessState(e.target.value)}
                placeholder="e.g., Texas"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">ZIP / Postal Code (Optional)</label>
              <Input
                value={businessZip}
                onChange={(e) => setBusinessZip(e.target.value)}
                placeholder="e.g., 78701"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Seamless.AI has no city or phone-number search of its own — state and ZIP code are the most precise location filters it supports.
          </p>

          <div>
            <label className="block text-sm font-medium mb-2">Titles to look for (up to 10)</label>
            <div className="flex flex-wrap items-center gap-1.5 border rounded-md p-2 min-h-10">
              {ownerTitles.map((title) => (
                <Badge key={title} variant="secondary" className="gap-1 pr-1">
                  {title}
                  <button
                    type="button"
                    onClick={() => handleRemoveOwnerTitleChip(title)}
                    className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={ownerTitleInput}
                onChange={(e) => setOwnerTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    handleAddOwnerTitleChip();
                  }
                }}
                onBlur={handleAddOwnerTitleChip}
                placeholder={ownerTitles.length === 0 ? "e.g., CEO, Owner, Partner — type and press Enter" : "Add another title..."}
                className="flex-1 min-w-32 bg-transparent outline-none text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Defaults to common owner-type titles — remove any that aren't relevant, or add your own (e.g. CFO, General Manager).
            </p>
          </div>

          <Button
            onClick={handleFindOwner}
            disabled={(!businessName.trim() && !businessWebsite.trim()) || findOwnerMutation.isPending}
            className="w-full gap-2"
          >
            {findOwnerMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Searching...</>
            ) : (
              <><Search className="w-4 h-4" />Find Owner</>
            )}
          </Button>

          {ownerSearchError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{ownerSearchError}</p>
            </Alert>
          )}
        </div>

        {ownerCandidates.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-sm">
              Found {ownerCandidates.length} possible match{ownerCandidates.length !== 1 ? "es" : ""}
            </h3>
            {ownerCandidates.map((c) => {
              const revealed = revealedContacts[c.searchResultId];
              return (
                <div key={c.searchResultId} className="p-4 border rounded-lg flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {c.ownerName || "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.jobTitle || "—"} at {c.companyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}
                    </p>
                    {/* Free to check, no credit spent -- confirms this is the right
                        business before paying a credit to reveal/save the contact. */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {c.website ? (
                        <a
                          href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" />
                          Website
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          No website on file
                        </span>
                      )}
                      {c.linkedinUrl ? (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Linkedin className="w-3 h-3" />
                          LinkedIn
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Linkedin className="w-3 h-3" />
                          No LinkedIn on file
                        </span>
                      )}
                    </div>
                  </div>
                  {revealed ? (
                    <div className="text-right text-sm shrink-0">
                      <p className="flex items-center justify-end gap-1.5 text-xs font-medium text-green-700 dark:text-green-500 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Added to your leads
                      </p>
                      <p className="flex items-center justify-end gap-1.5 font-medium">
                        <Mail className="w-3.5 h-3.5" />
                        {revealed.email || "No email found"}
                      </p>
                      <p className="flex items-center justify-end gap-1.5 text-muted-foreground mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        {revealed.phoneNumber || "No phone found"}
                      </p>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5"
                      onClick={() => handleRevealContact(c)}
                      disabled={revealingId === c.searchResultId}
                    >
                      {revealingId === c.searchResultId ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Adding...</>
                      ) : (
                        <><UserPlus className="w-3.5 h-3.5" />Add Lead (1 credit)</>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search">
            <Search className="w-4 h-4 mr-2" />
            Search
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!searchId}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="import" disabled={!importId}>
            <Download className="w-4 h-4 mr-2" />
            Import
          </TabsTrigger>
        </TabsList>

        {/* PHASE 1: SEARCH */}
        <TabsContent value="search" className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Search Criteria</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Search Instruction
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., small business owners with company size 2-10, CEO in technology"
                  className="w-full h-24 p-3 border rounded-md border-input bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Describe the type of leads you're looking for
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Country</label>
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="United States"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    State (Optional)
                  </label>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g., California"
                  />
                </div>
              </div>

              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                className="w-full"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  "Search Leads"
                )}
              </Button>

              {searchMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <div>
                    <p className="font-semibold">Search failed</p>
                    <p className="text-sm">{searchMutation.error.message}</p>
                  </div>
                </Alert>
              )}
            </div>
          </Card>

          {searchMutation.data && (
            <Card className="p-6 bg-green-50 border-green-200">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900">Search Complete</h3>
                  <div className="mt-2 space-y-1 text-sm text-green-800">
                    <p>
                      <strong>Leads Found:</strong> {searchMutation.data.totalResults.toLocaleString()}
                    </p>
                    <p>
                      <strong>Leads Retrieved:</strong> {searchMutation.data.leadsRetrieved}
                    </p>
                    <p>
                      <strong>Credits Consumed:</strong> {searchMutation.data.creditsConsumed} (None!)
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* PHASE 2: PREVIEW */}
        <TabsContent value="preview" className="space-y-4">
          {getPreviewQuery.isLoading ? (
            <Card className="p-12 flex items-center justify-center">
              <div className="text-center">
                <Spinner className="w-8 h-8 mx-auto mb-4" />
                <p className="text-muted-foreground">Loading preview...</p>
              </div>
            </Card>
          ) : getPreviewQuery.data ? (
            <>
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Search Results</h2>

                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-muted-foreground">Leads Found</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {getPreviewQuery.data.totalResults.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-muted-foreground">Retrieved</p>
                    <p className="text-2xl font-bold text-green-900">
                      {getPreviewQuery.data.leadsRetrieved.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-sm text-muted-foreground">Remaining</p>
                    <p className="text-2xl font-bold text-orange-900">
                      {getPreviewQuery.data.leadsRemaining.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-muted-foreground">Credits Used</p>
                    <p className="text-2xl font-bold text-purple-900">0</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    How many leads to import?
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={importCount}
                      onChange={(e) => setImportCount(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                      min="1"
                      max="1000"
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground py-2">
                      {importCount} leads = {importCount} credits
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    You can import up to {Math.min(1000, getPreviewQuery.data.leadsRemaining)} leads
                  </p>
                </div>

                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || importCount > getPreviewQuery.data.leadsRemaining}
                  className="w-full mt-4"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Import...
                    </>
                  ) : (
                    `Import ${importCount} Leads`
                  )}
                </Button>
              </Card>

              {getPreviewQuery.data.results && getPreviewQuery.data.results.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Sample Results</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {getPreviewQuery.data.results.slice(0, 10).map((lead: any, idx: number) => (
                      <div key={idx} className="p-3 bg-muted rounded text-sm">
                        <p className="font-medium">{lead.firstName} {lead.lastName}</p>
                        <p className="text-muted-foreground">{lead.jobTitle} at {lead.companyName}</p>
                      </div>
                    ))}
                    {getPreviewQuery.data.results.length > 10 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ... and {getPreviewQuery.data.results.length - 10} more
                      </p>
                    )}
                  </div>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>

        {/* PHASE 3: IMPORT */}
        <TabsContent value="import" className="space-y-4">
          {getImportStatusQuery.isLoading ? (
            <Card className="p-12 flex items-center justify-center">
              <div className="text-center">
                <Spinner className="w-8 h-8 mx-auto mb-4" />
                <p className="text-muted-foreground">Loading import status...</p>
              </div>
            </Card>
          ) : getImportStatusQuery.data ? (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Import Status</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-muted-foreground">Leads Imported</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {getImportStatusQuery.data.importedCount}
                  </p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm text-muted-foreground">Credits Estimated</p>
                  <p className="text-2xl font-bold text-orange-900">
                    {getImportStatusQuery.data.creditsEstimated}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mb-6">
                <p className="text-sm font-semibold text-yellow-900">
                  Ready to enrich {getImportStatusQuery.data.importedCount} leads?
                </p>
                <p className="text-sm text-yellow-800 mt-1">
                  This will consume {getImportStatusQuery.data.creditsEstimated} credits from your account.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1">
                  Go to Enrichment
                </Button>
                <Button className="flex-1">
                  Proceed with Enrichment
                </Button>
              </div>

              <div className="mt-6 p-4 bg-muted rounded text-sm">
                <p className="font-semibold mb-2">Import Details</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status:</dt>
                    <dd className="font-medium capitalize">{getImportStatusQuery.data.status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Created:</dt>
                    <dd className="font-medium">
                      {new Date(getImportStatusQuery.data.createdAt).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
