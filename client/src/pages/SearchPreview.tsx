import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Loader2, Search, Download } from "lucide-react";

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
