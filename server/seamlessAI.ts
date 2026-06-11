/**
 * Seamless.AI API Integration
 * Implements the Search → Research → Poll flow to get real, verified contacts.
 * API Docs: https://docs.seamless.ai
 */

const SEAMLESS_API_BASE = "https://api.seamless.ai/api/client/v1";

interface SeamlessSearchResult {
  searchResultId: string;
  name?: string;
  company?: string;
  title?: string;
  location?: string;
}

interface SeamlessContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  personalEmail?: string;
  company?: string;
  title?: string;
  contactLocation?: {
    city?: string;
    state?: string;
    country?: string;
  };
  lIProfileUrl?: string;
}

interface SeamlessSearchResponse {
  data: SeamlessSearchResult[];
  supplementalData?: {
    nextToken?: string;
    totalResults?: number;
  };
}

interface SeamlessResearchResponse {
  success: boolean;
  requestIds: string[];
}

interface SeamlessPollResult {
  requestId: string;
  searchResultId?: string;
  status: "researching" | "done" | "missing" | "error" | "duplicate";
  message?: string;
  contact?: SeamlessContact;
}

async function seamlessRequest(
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, any>
): Promise<any> {
  const url = `${SEAMLESS_API_BASE}${path}`;
  // Use "Token" header as primary auth (works with Seamless.AI API keys)
  const headers: Record<string, string> = {
    "Token": apiKey,
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body && method === "POST") {
    options.body = JSON.stringify(body);
  }

  console.log(`[Seamless.AI] ${method} ${url}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(`[Seamless.AI] Error ${response.status}: ${errorText}`);
    throw new Error(`Seamless.AI API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Step 1: Search contacts by filters derived from the user's instruction.
 */
export async function searchContacts(
  apiKey: string,
  filters: {
    companyName?: string[];
    jobTitle?: string[];
    department?: string[];
    seniority?: string[];
    industry?: string[];
    contactCountry?: string[];
    contactState?: string[];
    limit?: number;
  }
): Promise<SeamlessSearchResponse> {
  const body: Record<string, any> = {};

  if (filters.companyName?.length) body.companyName = filters.companyName;
  if (filters.jobTitle?.length) body.jobTitle = filters.jobTitle;
  if (filters.department?.length) body.department = filters.department;
  if (filters.seniority?.length) body.seniority = filters.seniority;
  if (filters.industry?.length) body.industry = filters.industry;
  if (filters.contactCountry?.length) body.contactCountry = filters.contactCountry;
  if (filters.contactState?.length) body.contactState = filters.contactState;
  if (filters.limit) body.limit = filters.limit;

  return seamlessRequest(apiKey, "POST", "/search/contacts", body);
}

/**
 * Step 2: Submit searchResultIds for research (enrichment).
 */
export async function researchContacts(
  apiKey: string,
  searchResultIds: string[]
): Promise<SeamlessResearchResponse> {
  return seamlessRequest(apiKey, "POST", "/contacts/research", {
    searchResultIds,
  });
}

/**
 * Step 3: Poll for research results until done or timeout.
 */
export async function pollContactResults(
  apiKey: string,
  requestIds: string[],
  maxAttempts = 24,
  pollIntervalMs = 5000
): Promise<SeamlessPollResult[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const idsParam = requestIds.join(",");
    const response = await seamlessRequest(
      apiKey,
      "GET",
      `/contacts/research/poll?requestIds=${encodeURIComponent(idsParam)}`,
    );

    const results: SeamlessPollResult[] = Array.isArray(response) ? response : (response.data || [response]);

    // Check if all are done
    const allDone = results.every(
      (r: any) => r.status === "done" || r.status === "missing" || r.status === "error" || r.status === "duplicate"
    );

    if (allDone) {
      return results;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Seamless.AI research polling timed out after " + maxAttempts + " attempts");
}

/**
 * Full flow: Search → Research → Poll → Return enriched contacts.
 * Uses LLM to parse the user's instruction into Seamless.AI search filters.
 */
export async function getSeamlessLeads(
  apiKey: string,
  filters: {
    companyName?: string[];
    jobTitle?: string[];
    department?: string[];
    seniority?: string[];
    industry?: string[];
    contactCountry?: string[];
    contactState?: string[];
  },
  count: number
): Promise<{
  contacts: Array<{
    companyName: string;
    ownerName: string;
    email: string;
    phoneNumber: string;
    website?: string;
    industry?: string;
    linkedinUrl?: string;
    timezone?: string;
  }>;
  totalSearchResults: number;
}> {
  // Step 1: Search
  const searchResponse = await searchContacts(apiKey, {
    ...filters,
    limit: Math.min(count, 100),
  });

  if (!searchResponse.data || searchResponse.data.length === 0) {
    throw new Error("No contacts found matching your criteria on Seamless.AI. Try broadening your search.");
  }

  console.log(`[Seamless.AI] Search returned ${searchResponse.data.length} results`);

  // Step 2: Research (enrich) — take up to `count` results
  const searchResultIds = searchResponse.data
    .slice(0, count)
    .map((r) => r.searchResultId);

  const researchResponse = await researchContacts(apiKey, searchResultIds);

  if (!researchResponse.success || !researchResponse.requestIds?.length) {
    throw new Error("Seamless.AI research request failed. Check your API credits.");
  }

  console.log(`[Seamless.AI] Research submitted for ${researchResponse.requestIds.length} contacts`);

  // Step 3: Poll for results
  const pollResults = await pollContactResults(apiKey, researchResponse.requestIds);

  // Convert to our lead format
  const contacts = pollResults
    .filter((r) => r.status === "done" && r.contact)
    .map((r) => {
      const c = r.contact!;
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
      return {
        companyName: c.company || "Unknown",
        ownerName: fullName,
        email: c.email || c.personalEmail || "",
        phoneNumber: c.phone || "",
        linkedinUrl: c.lIProfileUrl || undefined,
        industry: undefined as string | undefined,
        website: undefined as string | undefined,
        timezone: undefined as string | undefined,
      };
    })
    .filter((c) => c.email); // Only include contacts with verified emails

  console.log(`[Seamless.AI] Got ${contacts.length} verified contacts with emails`);

  return {
    contacts,
    totalSearchResults: searchResponse.data.length,
  };
}

/**
 * Use LLM to parse user's natural language instruction into Seamless.AI search filters.
 */
export async function parseInstructionToFilters(
  instruction: string,
  country?: string
): Promise<{
  companyName?: string[];
  jobTitle?: string[];
  department?: string[];
  seniority?: string[];
  industry?: string[];
  contactCountry?: string[];
  contactState?: string[];
}> {
  const { invokeLLM } = await import("./_core/llm");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a B2B lead search filter parser. Convert the user's natural language instruction into Seamless.AI search filters.

Return a JSON object with these optional fields (only include fields that are clearly specified):
- companyName: string[] (specific company names to search)
- jobTitle: string[] (job titles like "CEO", "Marketing Director")
- department: string[] (one of: Sales, Marketing, Engineering, Human Resources, Finance, IT, Operations, Support, Legal, Project Management, Other)
- seniority: string[] (one of: C-Level, VP, Director, Manager, Senior, Entry Level, Mid-Level, Other)
- industry: string[] (industry categories)
- contactCountry: string[] (countries)
- contactState: string[] (US states)

Return ONLY valid JSON, no other text.`,
      },
      {
        role: "user",
        content: `Parse this lead generation instruction into search filters: "${instruction}"${country ? ` (Country: ${country})` : ""}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "search_filters",
        strict: true,
        schema: {
          type: "object",
          properties: {
            companyName: { type: "array", items: { type: "string" }, description: "Specific company names" },
            jobTitle: { type: "array", items: { type: "string" }, description: "Job titles" },
            department: { type: "array", items: { type: "string" }, description: "Departments" },
            seniority: { type: "array", items: { type: "string" }, description: "Seniority levels" },
            industry: { type: "array", items: { type: "string" }, description: "Industries" },
            contactCountry: { type: "array", items: { type: "string" }, description: "Countries" },
            contactState: { type: "array", items: { type: "string" }, description: "US states" }
          },
          required: ["companyName", "jobTitle", "department", "seniority", "industry", "contactCountry", "contactState"],
          additionalProperties: false
        }
      }
    },
  }) as any;

  let content = response.choices[0]?.message?.content;
  if (Array.isArray(content)) {
    content = content.map((c: any) => typeof c === "string" ? c : c.text || "").join("");
  }
  if (!content) return {};

  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(content);
  
  // Filter out empty arrays — only pass non-empty filters to the API
  const filtered: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value) && value.length > 0) {
      filtered[key] = value as string[];
    }
  }
  
  console.log(`[Seamless.AI] Parsed filters:`, JSON.stringify(filtered));
  return filtered;
}
