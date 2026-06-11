/**
 * Seamless.AI API Integration
 * Implements the Search → Research → Poll flow to get real, verified contacts.
 * API Docs: https://docs.seamless.ai
 * 
 * Key API limits:
 * - Search: default 50 per page, uses nextToken for pagination
 * - Research: max 100 searchResultIds per batch, each consumes 1 credit
 * - Poll: returns results for requested IDs
 * - Rate limit: 60 requests/minute per endpoint
 */

const SEAMLESS_API_BASE = "https://api.seamless.ai/api/client/v1";

interface SeamlessSearchResult {
  searchResultId: string;
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  country?: string;
  city?: string;
  state?: string;
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
 * Step 1: Search contacts by filters — with PAGINATION to get ALL results.
 * Uses nextToken to fetch subsequent pages until we have enough results
 * or there are no more pages.
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
  },
  maxResults?: number
): Promise<SeamlessSearchResponse> {
  const pageSize = 50; // Seamless.AI default/max per page
  const targetCount = maxResults || filters.limit || 50;
  
  const body: Record<string, any> = {};
  if (filters.companyName?.length) body.companyName = filters.companyName;
  if (filters.jobTitle?.length) body.jobTitle = filters.jobTitle;
  if (filters.department?.length) body.department = filters.department;
  if (filters.seniority?.length) body.seniority = filters.seniority;
  if (filters.industry?.length) body.industry = filters.industry;
  if (filters.contactCountry?.length) body.contactCountry = filters.contactCountry;
  if (filters.contactState?.length) body.contactState = filters.contactState;
  body.limit = pageSize;

  const allResults: SeamlessSearchResult[] = [];
  let nextToken: string | undefined = undefined;
  let totalResults: number | undefined = undefined;
  let pageCount = 0;
  const maxPages = 20; // Safety limit to prevent infinite loops (20 * 50 = 1000 max)

  while (pageCount < maxPages) {
    pageCount++;
    
    const requestBody = { ...body };
    if (nextToken) {
      requestBody.nextToken = nextToken;
    }

    console.log(`[Seamless.AI] Search page ${pageCount}${nextToken ? " (with nextToken)" : ""}, have ${allResults.length} results so far`);
    
    const response = await seamlessRequest(apiKey, "POST", "/search/contacts", requestBody);
    
    const pageData: SeamlessSearchResult[] = response.data || [];
    allResults.push(...pageData);
    
    // Track total available results from API
    if (response.supplementalData?.totalResults !== undefined) {
      totalResults = response.supplementalData.totalResults;
    }
    
    // Get nextToken for pagination
    nextToken = response.supplementalData?.nextToken;
    
    console.log(`[Seamless.AI] Page ${pageCount}: got ${pageData.length} results. Total so far: ${allResults.length}${totalResults !== undefined ? ` / ${totalResults} available` : ""}`);
    
    // Stop if we have enough results
    if (allResults.length >= targetCount) {
      console.log(`[Seamless.AI] Reached target count (${targetCount}), stopping pagination`);
      break;
    }
    
    // Stop if no more pages
    if (!nextToken) {
      console.log(`[Seamless.AI] No more pages (nextToken is empty)`);
      break;
    }
    
    // Stop if this page returned fewer results than page size (last page)
    if (pageData.length < pageSize) {
      console.log(`[Seamless.AI] Last page (got ${pageData.length} < ${pageSize})`);
      break;
    }
    
    // Small delay between pages to respect rate limits (60 req/min)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`[Seamless.AI] Search complete: ${allResults.length} total results across ${pageCount} pages`);

  return {
    data: allResults,
    supplementalData: {
      nextToken,
      totalResults: totalResults || allResults.length,
    },
  };
}

/**
 * Step 2: Submit searchResultIds for research (enrichment).
 * Handles batching — API allows max 100 IDs per request.
 */
export async function researchContacts(
  apiKey: string,
  searchResultIds: string[]
): Promise<SeamlessResearchResponse> {
  const BATCH_SIZE = 100; // API maximum per request
  const allRequestIds: string[] = [];
  
  // Split into batches of 100
  for (let i = 0; i < searchResultIds.length; i += BATCH_SIZE) {
    const batch = searchResultIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(searchResultIds.length / BATCH_SIZE);
    
    console.log(`[Seamless.AI] Research batch ${batchNum}/${totalBatches}: submitting ${batch.length} contacts`);
    
    const response = await seamlessRequest(apiKey, "POST", "/contacts/research", {
      searchResultIds: batch,
    });
    
    if (response.requestIds?.length) {
      allRequestIds.push(...response.requestIds);
    } else if (!response.success) {
      console.error(`[Seamless.AI] Research batch ${batchNum} failed:`, JSON.stringify(response));
    }
    
    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < searchResultIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    success: allRequestIds.length > 0,
    requestIds: allRequestIds,
  };
}

/**
 * Step 3: Poll for research results until done or timeout.
 * Handles large sets by polling in batches if needed.
 */
export async function pollContactResults(
  apiKey: string,
  requestIds: string[],
  maxAttempts = 30,
  pollIntervalMs = 3000
): Promise<SeamlessPollResult[]> {
  const completedResults: SeamlessPollResult[] = [];
  let pendingIds = [...requestIds];
  
  console.log(`[Seamless.AI] Polling for ${pendingIds.length} research results...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (pendingIds.length === 0) break;
    
    // Poll in batches to avoid URL length limits
    const POLL_BATCH_SIZE = 50;
    const newPending: string[] = [];
    
    for (let i = 0; i < pendingIds.length; i += POLL_BATCH_SIZE) {
      const batch = pendingIds.slice(i, i + POLL_BATCH_SIZE);
      const idsParam = batch.join(",");
      
      const response = await seamlessRequest(
        apiKey,
        "GET",
        `/contacts/research/poll?requestIds=${encodeURIComponent(idsParam)}`,
      );

      const results: SeamlessPollResult[] = Array.isArray(response) 
        ? response 
        : (response.data || [response]);

      for (const r of results) {
        if (r.status === "done" || r.status === "missing" || r.status === "error" || r.status === "duplicate") {
          completedResults.push(r);
        } else {
          // Still researching — keep polling
          newPending.push(r.requestId);
        }
      }
      
      // Small delay between poll batches
      if (i + POLL_BATCH_SIZE < pendingIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    
    pendingIds = newPending;
    
    if (pendingIds.length === 0) {
      console.log(`[Seamless.AI] All ${completedResults.length} results completed after ${attempt + 1} poll attempts`);
      break;
    }
    
    console.log(`[Seamless.AI] Poll attempt ${attempt + 1}: ${completedResults.length} done, ${pendingIds.length} still researching`);

    // Wait before next poll cycle
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  
  if (pendingIds.length > 0) {
    console.warn(`[Seamless.AI] Polling timed out with ${pendingIds.length} still pending. Returning ${completedResults.length} completed results.`);
  }

  return completedResults;
}

/**
 * Generate related/broader job titles for fallback search.
 * If the initial search returns too few results, we expand the search with related titles.
 */
function getRelatedJobTitles(jobTitles: string[]): string[] {
  const relatedTitleMap: Record<string, string[]> = {
    "motivational speaker": ["keynote speaker", "public speaker", "inspirational speaker", "life coach", "executive coach", "leadership speaker", "corporate trainer"],
    "keynote speaker": ["motivational speaker", "public speaker", "conference speaker", "thought leader", "corporate speaker"],
    "public speaker": ["motivational speaker", "keynote speaker", "presenter", "trainer", "facilitator"],
    "life coach": ["executive coach", "business coach", "career coach", "wellness coach", "personal development coach", "motivational speaker"],
    "executive coach": ["leadership coach", "business coach", "life coach", "performance coach"],
    "business coach": ["executive coach", "startup advisor", "business consultant", "mentor"],
    "real estate agent": ["realtor", "real estate broker", "property manager", "real estate consultant", "real estate advisor"],
    "realtor": ["real estate agent", "real estate broker", "property consultant"],
    "financial advisor": ["financial planner", "wealth manager", "investment advisor", "financial consultant"],
    "marketing director": ["marketing manager", "head of marketing", "vp marketing", "chief marketing officer", "digital marketing director"],
    "sales director": ["sales manager", "head of sales", "vp sales", "chief revenue officer"],
    "ceo": ["founder", "president", "managing director", "chief executive", "owner"],
    "founder": ["ceo", "co-founder", "entrepreneur", "startup founder", "owner"],
    "consultant": ["advisor", "strategist", "specialist", "expert"],
    "personal trainer": ["fitness coach", "strength coach", "wellness coach", "health coach"],
    "therapist": ["counselor", "psychologist", "mental health professional", "clinical therapist"],
    "attorney": ["lawyer", "legal counsel", "solicitor", "legal advisor"],
    "lawyer": ["attorney", "legal counsel", "solicitor", "legal advisor"],
    "dentist": ["dental surgeon", "orthodontist", "dental practitioner"],
    "chiropractor": ["chiropractic physician", "wellness practitioner", "spine specialist"],
    "photographer": ["videographer", "creative director", "visual artist", "content creator"],
  };

  const related: string[] = [];
  for (const title of jobTitles) {
    const titleLower = title.toLowerCase().trim();
    // Check exact match
    if (relatedTitleMap[titleLower]) {
      related.push(...relatedTitleMap[titleLower]);
    } else {
      // Check partial match (e.g., "motivational speakers" matches "motivational speaker")
      for (const [key, values] of Object.entries(relatedTitleMap)) {
        if (titleLower.includes(key) || key.includes(titleLower)) {
          related.push(...values);
          break;
        }
      }
    }
  }

  // Remove duplicates and original titles
  const originalLower = new Set(jobTitles.map(t => t.toLowerCase().trim()));
  return Array.from(new Set(related)).filter(t => !originalLower.has(t.toLowerCase()));
}

/**
 * Full flow: Search → Research → Poll → Return enriched contacts.
 * Fetches ALL available results up to the requested count using pagination.
 * If initial results are too few, automatically retries with related/broader job titles.
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
    country?: string;
  }>;
  totalSearchResults: number;
}> {
  // Step 1: Search — fetch ALL available results up to the requested count
  // Pass the count as maxResults so pagination fetches enough pages
  let searchResponse = await searchContacts(apiKey, filters, count);

  // BROADER SEARCH FALLBACK: If initial results are too few (less than 50% of requested),
  // try expanding with related job titles
  const tooFewThreshold = Math.min(count * 0.5, 10); // At least 50% or 10 results
  if (
    searchResponse.data.length < tooFewThreshold &&
    filters.jobTitle?.length &&
    searchResponse.data.length < count
  ) {
    const relatedTitles = getRelatedJobTitles(filters.jobTitle);
    if (relatedTitles.length > 0) {
      console.log(`[Seamless.AI] Initial search returned only ${searchResponse.data.length} results (need ${count}). Trying broader search with related titles: ${relatedTitles.join(", ")}`);
      
      // Combine original + related titles for a broader search
      const expandedFilters = {
        ...filters,
        jobTitle: [...filters.jobTitle, ...relatedTitles.slice(0, 5)], // Add up to 5 related titles
      };
      
      const expandedResponse = await searchContacts(apiKey, expandedFilters, count);
      
      if (expandedResponse.data.length > searchResponse.data.length) {
        console.log(`[Seamless.AI] Broader search found ${expandedResponse.data.length} results (up from ${searchResponse.data.length})`);
        // Merge: keep original results first, then add new ones
        const existingIds = new Set(searchResponse.data.map(r => r.searchResultId));
        const newResults = expandedResponse.data.filter(r => !existingIds.has(r.searchResultId));
        searchResponse = {
          data: [...searchResponse.data, ...newResults],
          supplementalData: {
            totalResults: (searchResponse.supplementalData?.totalResults || searchResponse.data.length) + newResults.length,
          },
        };
      }
    }
  }

  if (!searchResponse.data || searchResponse.data.length === 0) {
    throw new Error("No contacts found matching your criteria on Seamless.AI. Try broadening your search.");
  }

  console.log(`[Seamless.AI] Search returned ${searchResponse.data.length} total results for requested count of ${count}`);

  // Build a map of searchResultId → country from search results for post-filtering
  const searchCountryMap = new Map<string, string>();
  for (const r of searchResponse.data) {
    if (r.country) {
      searchCountryMap.set(r.searchResultId, r.country);
    }
  }

  // Take up to `count` search results for research
  const searchResultIds = searchResponse.data
    .slice(0, count)
    .map((r) => r.searchResultId);

  console.log(`[Seamless.AI] Submitting ${searchResultIds.length} contacts for research (of ${searchResponse.data.length} found)`);

  // Step 2: Research (enrich) — batched automatically in groups of 100
  const researchResponse = await researchContacts(apiKey, searchResultIds);

  if (!researchResponse.success || !researchResponse.requestIds?.length) {
    throw new Error("Seamless.AI research request failed. Check your API credits.");
  }

  console.log(`[Seamless.AI] Research submitted for ${researchResponse.requestIds.length} contacts`);

  // Step 3: Poll for results — handles large sets with batched polling
  const pollResults = await pollContactResults(apiKey, researchResponse.requestIds);

  // Convert to our lead format — include ALL contacts
  const contacts: Array<{
    companyName: string;
    ownerName: string;
    email: string;
    phoneNumber: string;
    website?: string;
    industry?: string;
    linkedinUrl?: string;
    timezone?: string;
    country?: string;
  }> = [];

  let withEmail = 0;
  let withoutEmail = 0;
  let duplicateCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  for (const r of pollResults) {
    if (r.status === "duplicate") { duplicateCount++; continue; }
    if (r.status === "missing") { missingCount++; continue; }
    if (r.status === "error") { errorCount++; continue; }
    if (r.status !== "done" || !r.contact) continue;
    
    const c = r.contact;
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
    const email = c.email || c.personalEmail || "";
    const contact = {
      companyName: c.company || "Unknown",
      ownerName: fullName,
      email,
      phoneNumber: c.phone || "",
      linkedinUrl: c.lIProfileUrl || undefined,
      industry: undefined as string | undefined,
      website: undefined as string | undefined,
      timezone: undefined as string | undefined,
      country: c.contactLocation?.country || searchCountryMap.get(r.searchResultId || "") || undefined,
    };
    
    contacts.push(contact);
    if (email) withEmail++; else withoutEmail++;
  }

  console.log(`[Seamless.AI] Results: ${contacts.length} contacts (${withEmail} with email, ${withoutEmail} without email). Duplicates: ${duplicateCount}, Missing: ${missingCount}, Errors: ${errorCount}`);

  return {
    contacts,
    totalSearchResults: searchResponse.supplementalData?.totalResults || searchResponse.data.length,
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
  try {
    const { invokeLLM } = await import("./_core/llm");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a B2B lead search filter parser. Convert the user's natural language instruction into Seamless.AI search filters.

Return a JSON object with ONLY the relevant fields (omit fields that don't apply):
- companyName: string[] (specific company names to search)
- jobTitle: string[] (job titles like "CEO", "Marketing Director", "Motivational Speaker")
- department: string[] (one of: Sales, Marketing, Engineering, Human Resources, Finance, IT, Operations, Support, Legal, Project Management, Other)
- seniority: string[] (one of: C-Level, VP, Director, Manager, Senior, Entry Level, Mid-Level, Other)
- industry: string[] (industry categories like "Professional Training & Coaching", "Financial Services")
- contactCountry: string[] (countries like "United States", "India")
- contactState: string[] (US states like "Alabama", "California")

IMPORTANT: The jobTitle field is the most critical. Always extract the job title or role from the instruction.
Return ONLY valid JSON, no markdown, no explanation.`,
        },
        {
          role: "user",
          content: `Parse this lead generation instruction into search filters: "${instruction}"${country ? ` (Country: ${country})` : ""}`,
        },
      ],
    }) as any;

    let content = response.choices[0]?.message?.content;
    if (Array.isArray(content)) {
      content = content.map((c: any) => typeof c === "string" ? c : c.text || "").join("");
    }
    if (!content) {
      console.warn("[Seamless.AI] LLM returned empty content, using fallback");
      return fallbackParseFilters(instruction, country);
    }

    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(content);
    
    // Filter out empty arrays — only pass non-empty filters to the API
    const filtered: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        filtered[key] = value as string[];
      }
    }
    
    // If LLM didn't extract a jobTitle, use the instruction as-is
    if (!filtered.jobTitle || filtered.jobTitle.length === 0) {
      const fallback = fallbackParseFilters(instruction, country);
      if (fallback.jobTitle) filtered.jobTitle = fallback.jobTitle;
    }
    
    console.log(`[Seamless.AI] Parsed filters:`, JSON.stringify(filtered));
    return filtered;
  } catch (error: any) {
    console.warn(`[Seamless.AI] LLM filter parsing failed: ${error.message}. Using fallback.`);
    return fallbackParseFilters(instruction, country);
  }
}

/**
 * Fallback filter parser when LLM is unavailable or fails.
 * Extracts the instruction as a job title and applies country/state from explicit inputs.
 */
function fallbackParseFilters(
  instruction: string,
  country?: string
): {
  companyName?: string[];
  jobTitle?: string[];
  department?: string[];
  seniority?: string[];
  industry?: string[];
  contactCountry?: string[];
  contactState?: string[];
} {
  // Remove common location words from instruction to extract the role
  let jobTitle = instruction.trim();
  
  // Remove trailing location phrases like "in Alabama" or "in USA"
  jobTitle = jobTitle.replace(/\s+(in|from|based in|located in)\s+.+$/i, "").trim();
  
  // Remove leading "find", "search", "get", "look for" etc.
  jobTitle = jobTitle.replace(/^(find|search|get|look for|looking for|i need|i want)\s+/i, "").trim();
  
  const filters: Record<string, string[]> = {};
  if (jobTitle) {
    filters.jobTitle = [jobTitle];
  }
  if (country) {
    filters.contactCountry = [country];
  }
  
  console.log(`[Seamless.AI] Fallback filters:`, JSON.stringify(filters));
  return filters;
}
