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

import { createSeamlessError, logSeamlessError } from "./seamlessAIErrorLogger";
import { parseSearchInstruction } from "./titleExpansionMap";
import { logSeamlessAIRequest } from "./seamlessAIDebug";

const SEAMLESS_API_BASE = "https://api.seamless.ai/api/client/v1";

// Exact enum values Seamless.AI's companySize search filter accepts, confirmed via
// their official API docs (docs.seamless.ai/searchcontacts). This is the real
// employee-count filter — a predefined range string, not a numeric min/max pair.
export const SEAMLESS_COMPANY_SIZE_OPTIONS = [
  "0 - 1 (Self-employed)",
  "2 - 10",
  "11 - 50",
  "51 - 200",
  "201 - 500",
  "501 - 1,000",
  "1,001 - 5,000",
  "5,001 - 10,000",
  "10,001+",
] as const;

// Exact enum values Seamless.AI's industry search filter accepts, confirmed via
// their official API docs (docs.seamless.ai/searchcontacts). Unlike jobTitle
// (relevance/partial matching), this is a strict predefined list — sending a
// value that isn't in here (e.g. "E-commerce" instead of "Internet & E-Commerce")
// doesn't get ignored, it zeroes out the search entirely.
export const SEAMLESS_INDUSTRY_OPTIONS = [
  "Aerospace & Defense", "Airlines & Aviation", "Aviation & Aerospace", "Defense & Space", "Military",
  "Agriculture", "Farming", "Horticulture", "Ranching", "Tobacco",
  "Apparel & Fashion", "Textiles",
  "Automotive",
  "Chemicals & Materials", "Chemicals", "Plastics",
  "Consumer Goods & Retail", "Consumer Goods", "Luxury Goods & Jewelry", "Retail", "Sporting Goods",
  "Education & Training", "E-Learning", "Education Management", "Higher Education", "Libraries", "Primary/Secondary Education",
  "Electronics & Hardware", "Computer Hardware", "Consumer Electronics", "Electrical & Electronic Manufacturing", "Semiconductors",
  "Energy & Utilities", "Oil & Energy", "Utilities",
  "Entertainment", "Animation", "Arts & Crafts", "Computer Games", "Fine Art", "Gambling & Casinos", "Mobile Games", "Motion Pictures & Film", "Music", "Performing Arts", "Photography", "Recreational Facilities & Services", "Sports",
  "Environmental", "Environmental Services", "Renewables & Environment",
  "Finance & Banking", "Banking", "Capital Markets", "Financial Services", "Investment Banking", "Investment Management", "Venture Capital & Private Equity",
  "Food & Beverage", "Dairy", "Fishery", "Food & Beverages", "Food Production", "Restaurants", "Supermarkets", "Wine & Spirits",
  "Government & Public Policy", "Executive Office", "Government Administration", "Government Relations", "Judiciary", "Law Enforcement", "Legislative Office", "Political Organization", "Public Policy", "Public Safety",
  "Health & Wellness", "Alternative Medicine", "Health Wellness and Fitness", "Hospital & Health Care", "Medical Practice", "Mental Health Care", "Veterinary",
  "Hospitality & Tourism", "Events Services", "Hospitality", "Leisure Travel & Tourism", "Museums & Institutions",
  "Household Personal & Beauty", "Consumer Services", "Cosmetics", "Furniture", "Individual & Family Services",
  "Insurance",
  "Internet & E-Commerce", "Internet",
  "Manufacturing & Engineering", "Civil Engineering", "Industrial Automation", "Machinery", "Mechanical or Industrial Engineering", "Railroad Manufacture", "Shipbuilding",
  "Marketing & Media", "Broadcast Media", "Graphic Design", "Marketing & Advertising", "Media Production", "Newspapers", "Online Media", "Printing", "Public Relations & Communications", "Publishing", "Writing & Editing",
  "Metals Mining & Materials", "Building Materials", "Glass Ceramics & Concrete", "Mining & Metals", "Paper & Forest Products",
  "Non-Profit", "Fund-Raising", "Non-Profit Organization Management", "Philanthropy", "Religious Institutions",
  "Pharmaceuticals & Medical Devices", "Biotechnology", "Medical Devices", "Nanotechnology", "Pharmaceuticals",
  "Professional Services & Consulting", "Accounting", "Alternative Dispute Resolution", "Civic & Social Organization", "Design", "Human Resources", "International Affairs", "International Trade & Development", "Law Practice", "Legal Services", "Management Consulting", "Market Research", "Outsourcing/Offshoring", "Professional Training & Coaching", "Program Development", "Research", "Security & Investigations", "Staffing & Recruiting", "Think Tanks",
  "Real Estate & Construction", "Architecture & Planning", "Commercial Real Estate", "Construction", "Facilities Services", "Real Estate",
  "Software & Information Technology", "Computer & Network Security", "Computer Software", "Information Services", "Information Technology & Services", "Software Development",
  "Telecommunications & Networking", "Computer Networking", "Telecommunications", "Wireless",
  "Transportation & Logistics", "Logistics & Supply Chain", "Maritime", "Package/Freight Delivery", "Packaging & Containers", "Translation & Localization", "Transportation/Trucking/Railroad",
  "Wholesale & Distribution", "Business Supplies & Equipment", "Import & Export", "Warehousing", "Wholesale",
] as const;

/**
 * Map a free-text industry guess (from the LLM or elsewhere) to the closest
 * real Seamless.AI industry enum value. Returns null if nothing reasonably
 * matches, in which case the industry filter should be dropped entirely
 * rather than sent with an invalid value (which zeroes out the search).
 */
export function mapToValidSeamlessIndustry(guess: string): string | null {
  const guessLower = guess.trim().toLowerCase();
  if (!guessLower) return null;

  // Strip spaces, hyphens, and "&"/"and" so wording differences like
  // "healthcare" vs "Health Care", or "e-commerce" vs "E-Commerce", don't
  // block an otherwise-obvious match.
  const normalize = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[\s-]/g, "");
  const guessNormalized = normalize(guessLower);

  // Exact match first
  const exact = SEAMLESS_INDUSTRY_OPTIONS.find((opt) => opt.toLowerCase() === guessLower);
  if (exact) return exact;

  // Substring match either direction (e.g. "software" -> "Computer Software")
  const substringMatch = SEAMLESS_INDUSTRY_OPTIONS.find(
    (opt) => opt.toLowerCase().includes(guessLower) || guessLower.includes(opt.toLowerCase())
  );
  if (substringMatch) return substringMatch;

  // Normalized substring match (e.g. "healthcare" -> "Hospital & Health Care",
  // "e-commerce" -> "Internet & E-Commerce")
  const normalizedMatch = SEAMLESS_INDUSTRY_OPTIONS.find((opt) => {
    const optNormalized = normalize(opt);
    return optNormalized.includes(guessNormalized) || guessNormalized.includes(optNormalized);
  });
  if (normalizedMatch) return normalizedMatch;

  // Word-overlap match: catches multi-word guesses like "Travel Agency" or
  // "Tourism Company" that share no contiguous substring with the matching
  // option (e.g. "Leisure Travel & Tourism") because of the extra generic
  // word, but do share one real, meaningful word. Without this, a guess like
  // "Travel Agency" fails every check above and the industry filter gets
  // silently dropped -- which doesn't just return no results, it returns
  // OTHER industries entirely (the search falls back to matching on job
  // title alone, e.g. "Owner", across every industry Seamless has).
  const GENERIC_WORDS = new Set([
    "and", "the", "for", "services", "service", "company", "companies",
    "industry", "business", "businesses", "agency", "agencies", "management", "group",
  ]);
  const significantWords = (s: string) =>
    s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERIC_WORDS.has(w));
  const guessWords = significantWords(guessLower);
  if (guessWords.length > 0) {
    const wordMatch = SEAMLESS_INDUSTRY_OPTIONS.find((opt) => {
      const optWords = new Set(significantWords(opt));
      return guessWords.some((w) => optWords.has(w));
    });
    if (wordMatch) return wordMatch;
  }

  return null;
}

export interface SeamlessSearchResult {
  id: string;
  // The real Seamless.AI /search/contacts response identifies each result by
  // searchResultId, not id — confirmed via test-rest-api-enrichment.ts and
  // test-seamless-poll.ts live API captures. `id` is kept for backward
  // compatibility with existing typed call sites but is not populated by the API.
  searchResultId?: string;
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  country?: string;
  city?: string;
  state?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  linkedinUrl?: string;
  companyName?: string;
  website?: string;
  industry?: string;
  companyEmployeeCount?: number | string;
  contactLocation?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface SeamlessContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  personalEmail?: string;
  workEmail?: string;
  allEmails?: string[];
  title?: string;
  contactLocation?: {
    city?: string;
    state?: string;
    country?: string;
  };
  linkedinUrl?: string;
  jobTitle?: string;
  position?: string;
  phoneNumber?: string;
  workPhone?: string;
  industry?: string;
  companyIndustry?: string;
  website?: string;
  companyWebsite?: string;
  companyUrl?: string;
  timezone?: string;
  companyTimezone?: string;
  companySize?: string;
  employeeCount?: string | number;
  employees?: string | number;
  contactPhone1?: string;
  contactPhone1TotalAI?: number;
  contactPhone1IsDnc?: boolean;
  contactPhone2?: string;
  contactPhone2IsDnc?: boolean;
  contactPhone3?: string;
  contactPhone3IsDnc?: boolean;
  companyPhone1?: string;
  companyPhone1TotalAI?: number;
  companyPhone1IsDnc?: boolean;
  companyStaffCount?: number;
  companyStaffCountRange?: string;
  companyAnnualRevenue?: string;
  companyDomain?: string;
  companyRevenueRange?: string;
  companyLinkedInId?: string;
  contactId?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
  middleName?: string;
  fullName?: string;
  name?: string;
  nameOriginal?: string;
  email1?: string;
  email2?: string;
  email3?: string;
  department?: string;
  seniority?: string;
  lISalesNavUrl?: string;
  lIRecruiterUrl?: string;
  companyLocation?: string;
  companyOriginal?: string;
  companyDescription?: string;
  companyFounded?: string;
  companyType?: string;
  formerCompany?: string;
  formerTitle?: string;
  formerStartedAt?: string;
  formerEndedAt?: string;
  titleStartedAt?: string;
  startedAtCurrentCompany?: string;
  timeAtRole?: string;
  timeAtCompany?: string;
}

interface SeamlessSearchResponse {
  data: SeamlessSearchResult[];
  supplementalData?: {
    nextToken?: string;
    // Confirmed via live response envelope: the real field is "total", not
    // "totalResults" — the latter was always undefined, silently falling back
    // to just the count of results actually retrieved (looked identical to
    // "that's all there is" even when millions more existed).
    total?: number;
    isMore?: boolean;
    perPage?: number;
  };
}

export interface SeamlessResearchResponse {
  success: boolean;
  requestIds: string[];
  email?: string;
  phoneNumber?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  companyName?: string;
  website?: string;
  industry?: string;
  contactLocation?: {
    city?: string;
    state?: string;
    country?: string;
  };
  companySize?: string;
  personalEmail?: string;
  workEmail?: string;
  allEmails?: string[];
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
  const startTime = Date.now();
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
  if (body) {
    const redactedBody = { ...body };
    if (redactedBody.apiKey) redactedBody.apiKey = "[REDACTED]";
    console.log(`[Seamless.AI] Request body:`, JSON.stringify(redactedBody, null, 2));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  const contentType = response.headers.get("content-type");

  console.log(`[Seamless.AI] Response status: ${response.status}`);
  const elapsedTime = Date.now() - startTime;
  console.log(`[Seamless.AI] Content-Type: ${contentType}`);
  // Confirmed live: no "x-publicapi-credits" header is actually sent, despite being
  // documented. Log every header the response actually has instead of guessing another
  // specific name — this reveals the real credit-usage header (if any exists under a
  // different name) or confirms none is sent at all for this endpoint.
  const allHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { allHeaders[key] = value; });
  console.log(`[Seamless.AI] ALL RESPONSE HEADERS (${method} ${path}):`, JSON.stringify(allHeaders, null, 2));
  if (responseText) {
    console.log(`[Seamless.AI] Response body (first 500 chars):`, responseText.substring(0, 500));
  }
  console.log(`[Seamless.AI] Elapsed Time: ${elapsedTime}ms`);

  // Validate response is JSON before parsing
  if (!contentType?.includes("application/json")) {
    const errorDetails = {
      step: (path.includes("/search/") ? "Search" : path.includes("/research") ? "Research" : path.includes("/poll") ? "Poll" : "Unknown") as "Search" | "Research" | "Poll" | "Unknown",
      endpoint: path,
      method,
      statusCode: response.status,
      contentType: contentType || "unknown",
      requestBody: body ? { ...body, apiKey: "[REDACTED]" } : undefined,
      responseBody: responseText.substring(0, 500),
      timestamp: new Date().toISOString(),
    };
    
    logSeamlessError(errorDetails);
    
    throw createSeamlessError({
      ...errorDetails,
      error: `Expected JSON response but got ${contentType || "unknown"} (Status: ${response.status}). This usually means: authentication expired, rate limited, or wrong endpoint.`,
    });
  }

  if (!response.ok) {
    const stepName = path.includes("/search/") ? "Search" : path.includes("/research") ? "Research" : path.includes("/poll") ? "Poll" : "Unknown";
    const errorDetails = {
      step: stepName as "Search" | "Research" | "Poll" | "Unknown",
      endpoint: path,
      method,
      statusCode: response.status,
      requestBody: body ? { ...body, apiKey: "[REDACTED]" } : undefined,
      responseBody: responseText,
      timestamp: new Date().toISOString(),
    };
    
    logSeamlessError(errorDetails);
    
    // Parse specific error codes from Seamless.AI
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.code === "insufficientCredits" || errorData.msg?.includes("Insufficient credit")) {
        throw createSeamlessError({ ...errorDetails, error: "Insufficient credits" });
      }
      if (errorData.code === "unauthorized" || response.status === 401) {
        throw createSeamlessError({ ...errorDetails, error: "Unauthorized - Invalid or expired API key" });
      }
      if (errorData.code === "rateLimited" || response.status === 429) {
        throw createSeamlessError({ ...errorDetails, error: "Rate limited - Too many requests" });
      }
    } catch (parseError: any) {
      // If it's our own thrown error, re-throw it
      if (parseError.message?.includes("[SEAMLESS.AI ERROR")) throw parseError;
    }
    
    throw createSeamlessError({ ...errorDetails, error: `API error: ${responseText}` });
  }

  return JSON.parse(responseText);
}

/**
 * Step 1: Search contacts by filters — with PAGINATION to get ALL results.
 * Uses nextToken to fetch subsequent pages until we have enough results
 * or there are no more pages.
 */
export async function searchContacts(
  apiKey: string,
  filters: {
    firstName?: string;
    lastName?: string;
    email?: string;
    city?: string;
    state?: string;
    country?: string;
    linkedinUrl?: string;
    companyName?: string[];
    jobTitle?: string[];
    contactKeyword?: string[];
    department?: string[];
    seniority?: string[];
    industry?: string[];
    contactCountry?: string[];
    contactState?: string[];
    companySize?: string[];
    companyEmployeeCountMin?: number;
    companyEmployeeCountMax?: number;
    limit?: number;
  },
  maxResults?: number
): Promise<SeamlessSearchResponse> {
  const targetCount = maxResults || filters.limit || 50;
  // Only ask the API for as many results as we actually need, instead of always
  // requesting a full page of 50. Confirmed live across two tests: Seamless.AI's
  // search step consumes ~1 credit per result returned, separate from and in
  // addition to the ~1 credit per contact spent during research/enrichment
  // (5 requested leads cost 10 credits: 5 for search + 5 for research). No buffer
  // is added here for country filtering — the API's own contactCountry filter
  // (sent in the request body below) already does that server-side, so the
  // client-side re-check rarely discards anything. If it ever does fall short,
  // the pagination loop will fetch another tightly-sized page via nextToken
  // rather than paying for a buffer upfront on every search.
  const pageSize = Math.min(50, targetCount); // Seamless.AI max is 50/page
  
  const body: Record<string, any> = {};
  if (filters.companyName?.length) body.companyName = filters.companyName;
  if (filters.jobTitle?.length) body.jobTitle = filters.jobTitle;
  if (filters.contactKeyword?.length) body.contactKeyword = filters.contactKeyword;
  if (filters.department?.length) body.department = filters.department;
  if (filters.seniority?.length) body.seniority = filters.seniority;
  // "industry" is the real API parameter name (confirmed via docs.seamless.ai/searchcontacts);
  // an earlier version of this code used "industryName", which isn't a real parameter and
  // was silently ignored by the API.
  if (filters.industry?.length) body.industry = filters.industry;
  if (filters.email) body.email = filters.email;
  if (filters.city) body.city = filters.city;
  if (filters.state) body.state = filters.state;
  if (filters.country) body.country = filters.country;
  if (filters.contactCountry?.length) body.contactCountry = filters.contactCountry;
  if (filters.contactState?.length) body.contactState = filters.contactState;
  // Confirmed via Seamless.AI's official docs: the real employee-count filter is
  // "companySize", an array of specific predefined range strings (e.g. "201 - 500"),
  // not a numeric min/max pair — companyEmployeeCountMin/Max below are unrelated to
  // this and are not real API parameters (kept only for the separate free-text size
  // parsing feature, not applied to search).
  if (filters.companySize?.length) body.companySize = filters.companySize;
  if (filters.firstName) body.firstName = filters.firstName;
  if (filters.lastName) body.lastName = filters.lastName;
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
    
    if (pageCount === 1) {
      console.log("\n[DEBUG] FIRST API REQUEST:");
      console.log(JSON.stringify(requestBody, null, 2));
      if (filters.companyEmployeeCountMin || filters.companyEmployeeCountMax) {
        console.log("\n[DEBUG] EMPLOYEE COUNT FILTERS (will be applied post-search):");
        console.log(`  Min: ${filters.companyEmployeeCountMin}`);
        console.log(`  Max: ${filters.companyEmployeeCountMax}`);
      }
    }
    
    const response = await seamlessRequest(apiKey, "POST", "/search/contacts", requestBody);
    
    if (pageCount === 1) {
      console.log("\n[DEBUG] FIRST API RESPONSE:");
      console.log("Total Results:", response.supplementalData?.total);
      console.log("Data Length:", response.data?.length || 0);
      console.log("Has Next Token:", !!response.supplementalData?.nextToken);
      console.log("\n[DEBUG] FIRST 3 RESULTS (checking company sizes):");
      (response.data || []).slice(0, 3).forEach((result: any, idx: number) => {
        console.log(`  Result ${idx + 1}: ${result.firstName} ${result.lastName} @ ${result.company} (employees: ${result.companyEmployeeCount || 'N/A'})`);
      });
    }

    let pageData: SeamlessSearchResult[] = response.data || [];

    // Option A: No automatic company-size filtering during search.
    // All leads are returned regardless of size; enrichment happens later.
    // Company sizes are shown per-lead for manual review/filtering by user.

    allResults.push(...pageData);

    // Track total available results from API — confirmed via live response
    // envelope that the real field is "total" (e.g. { total: 15280941, isMore:
    // true, perPage: 50 }), not "totalResults" as previously assumed.
    if (response.supplementalData?.total !== undefined) {
      totalResults = response.supplementalData.total;
    }
    
    // Get nextToken for pagination
    nextToken = response.supplementalData?.nextToken;
    
    console.log(`[Seamless.AI] Page ${pageCount}: got ${pageData.length} results. Total so far: ${allResults.length}${totalResults !== undefined ? ` / ${totalResults} available` : ""}`);
    
    // Stop if we have enough results
    if (allResults.length >= targetCount) {
      console.log(`[Seamless.AI] Reached target count (${targetCount}), stopping pagination`);
      break;
    }
    
    // If this page had no results after filtering, we might need more pages
    if (pageData.length === 0 && (response.data || []).length > 0) {
      console.log(`[Seamless.AI] Page ${pageCount} had results but all filtered out by employee count, continuing...`);
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
export async function researchContact(
  apiKey: string,
  searchResultIds: string[]
): Promise<SeamlessResearchResponse & { requestIdToSearchResultId: Record<string, string> }> {
  const BATCH_SIZE = 100; // API maximum per request
  const allRequestIds: string[] = [];
  // The API returns requestIds in the same order as the submitted searchResultIds
  // within a single batch call, so we can zip them to recover which request
  // corresponds to which original contact (needed since poll results don't
  // reliably echo back searchResultId).
  const requestIdToSearchResultId: Record<string, string> = {};

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
      response.requestIds.forEach((reqId: string, idx: number) => {
        if (batch[idx]) {
          requestIdToSearchResultId[reqId] = batch[idx];
        }
      });
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
    requestIdToSearchResultId,
  };
}

/**
 * Step 3: Poll for research results until done or timeout.
 * Handles large sets by polling in batches if needed.
 */
export async function pollContactResults(
  apiKey: string,
  requestIds: string[],
  maxAttempts = 120,
  pollIntervalMs = 2000
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

      // Parse response - handle multiple formats
      // API can return: Array, {contacts: []}, {data: []}, or single object
      let results: SeamlessPollResult[] = [];
      
      if (!response) {
        console.warn(`[Seamless.AI] Null/undefined poll response`);
        results = [];
      } else if (Array.isArray(response)) {
        results = response;
      } else if (response.contacts && Array.isArray(response.contacts)) {
        // Format: {contacts: [{...}, {...}]}
        results = response.contacts;
      } else if (response.data && Array.isArray(response.data)) {
        // Format: {data: [{...}, {...}]}
        results = response.data;
      } else if (response.requestId || response.status) {
        // Single contact object
        results = [response];
      } else {
        console.warn(`[Seamless.AI] Unexpected poll response format:`, JSON.stringify(response));
        results = [];
      }

      for (const result of results) {
        if (result.status === "done" || result.status === "error" || result.status === "duplicate" || result.status === "missing") {
          completedResults.push(result);
        } else {
          newPending.push(result.requestId);
        }
      }
    }

    pendingIds = newPending;

    if (pendingIds.length === 0) {
      console.log(`[Seamless.AI] All research results are done.`);
      break;
    }

    console.log(`[Seamless.AI] Still polling for ${pendingIds.length} results. Attempt ${attempt + 1}/${maxAttempts}`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (pendingIds.length > 0) {
    console.warn(`[Seamless.AI] Polling timed out. ${pendingIds.length} results still pending.`);
  }

  return completedResults;
}




interface LLMParsedInstruction {
  titles: string[];
  industries: string[];
}

/**
 * Both the job-title and industry keyword lists in parseSearchInstruction() only
 * cover a small fixed set of options (~20 generic business roles, ~15 industries)
 * and have no way to recognize anything outside that list (e.g. "motivational
 * speaker" as a title, or an industry that isn't in the hardcoded list). This asks
 * the LLM to interpret the full instruction directly instead, so any profession or
 * industry works, not just the ones we happened to hardcode.
 */
async function parseInstructionWithLLM(instruction: string): Promise<LLMParsedInstruction | null> {
  try {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Extract structured search criteria from a lead-generation request for a B2B contact database. Respond with ONLY a JSON object: {"titles": ["..."], "industries": ["..."]}
- "titles": UP TO 10 title variants (Seamless.AI's own search caps job titles at 10 per query, so use the full budget) as they would actually appear on a business card or LinkedIn profile, not just the literal words the user typed. Seamless.AI's title filter appears to match close to exact wording, so real-world title variance matters a lot — cover as much genuine phrasing diversity as you can, not just 2-3 close synonyms. Examples: "motivational speaker" -> ["Motivational Speaker","Keynote Speaker","Professional Speaker","Inspirational Speaker","Public Speaker","Speaker","Keynote Speaker & Author","International Speaker","Conference Speaker","TEDx Speaker"]; "business owners" -> ["Owner","Founder","CEO","President","Managing Director","Principal","Co-Founder","Business Owner","Proprietor","Entrepreneur"]. Always include at least one title if any role or profession is mentioned or implied.
- "industries": 0-3 industry names, ONLY if explicitly mentioned in the request (e.g. "restaurant owners" -> ["Restaurant"]). Do not infer an industry that was not stated.
No explanation, no markdown, no extra fields.`,
        },
        { role: "user", content: instruction },
      ],
      response_format: { type: "json_object" },
    }) as any;

    let content = response?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      content = content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("");
    }
    if (!content) return null;
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(content);
    const titles = Array.isArray(parsed.titles)
      ? parsed.titles.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 10)
      : [];
    const industries = Array.isArray(parsed.industries)
      ? parsed.industries.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 3)
      : [];
    return { titles, industries };
  } catch (error: any) {
    console.warn("[Seamless.AI] LLM instruction parsing failed:", error.message);
    return null;
  }
}

export function parseInstructionToFilters(instruction: string, country?: string) {
  // Parse user instruction into Seamless.AI search filters
  // This converts natural language like "small business owners" into structured API filters

  const parsed = parseSearchInstruction(instruction);

  const filters: any = {};

  // Add expanded job titles (critical for search quality)
  if (parsed.titles && parsed.titles.length > 0) {
    filters.jobTitle = parsed.titles;
    console.log(`[Seamless.AI] Expanded job titles: ${JSON.stringify(parsed.titles)}`);
  }

  // Option A: Company size is NOT applied as a filter during search.
  // Sizes are shown per-lead for manual review; user can filter/delete out-of-range leads in UI.
  // Parsed company size is available in parsed.companySize but not applied to filters.
  // (Parsing logic in titleExpansionMap.ts is preserved for future UI dropdown use)
  
  // Add industries if detected — mapped to Seamless.AI's exact enum values (see
  // mapToValidSeamlessIndustry), since an unrecognized value zeroes out the
  // entire search rather than being ignored.
  if (parsed.industries && parsed.industries.length > 0) {
    const validIndustries = parsed.industries
      .map((guess) => mapToValidSeamlessIndustry(guess))
      .filter((v): v is string => v !== null);
    if (validIndustries.length > 0) {
      filters.industry = [...new Set(validIndustries)];
      console.log(`[Seamless.AI] Industries mapped to valid enum: ${JSON.stringify(filters.industry)}`);
    }
  }
  
  // Add countries (use provided country or parsed countries)
  if (country) {
    filters.contactCountry = [country];
  } else if (parsed.countries && parsed.countries.length > 0) {
    filters.contactCountry = parsed.countries;
    console.log(`[Seamless.AI] Countries: ${JSON.stringify(parsed.countries)}`);
  } else {
    // Default to United States if not specified
    filters.contactCountry = ["United States"];
  }
  
  console.log(`[Seamless.AI] Generated filters:`, JSON.stringify(filters, null, 2));

  return filters;
}

/**
 * Same as parseInstructionToFilters(), but uses the LLM as the primary interpreter
 * for job titles and industries (covering any profession or industry, not just the
 * ~20 titles / ~15 industries hardcoded in parseSearchInstruction()'s keyword
 * lists), falling back to the keyword-based result only if the LLM call fails.
 * Kept separate from parseInstructionToFilters() (rather than making it async)
 * since several other call sites — searchPreviewRouter.ts and existing unit tests —
 * call that function synchronously and expect a plain object back, not a Promise.
 */
export async function parseInstructionToFiltersWithLLM(instruction: string, country?: string) {
  // Keyword-based parse as a safety-net fallback if the LLM call fails.
  const filters = parseInstructionToFilters(instruction, country);

  const llmResult = await parseInstructionWithLLM(instruction);
  if (!llmResult) {
    console.warn("[Seamless.AI] LLM parsing unavailable, using keyword-based filters");
    return filters;
  }

  if (llmResult.titles.length > 0) {
    filters.jobTitle = llmResult.titles;
    // NOTE: previously also sent these same terms as contactKeyword to try to
    // broaden matching, but combining it with jobTitle appears to narrow results
    // (likely AND logic between the two filter types rather than OR), causing
    // "No contacts found" on searches that worked fine with jobTitle alone.
    // Reverted — contactKeyword needs isolated testing before reintroducing.
    console.log(`[Seamless.AI] LLM-parsed job titles: ${JSON.stringify(llmResult.titles)}`);
  }
  if (llmResult.industries.length > 0) {
    // The LLM guesses free-text industry names (e.g. "E-commerce"), but Seamless.AI's
    // industry filter only accepts an exact predefined enum (e.g. "Internet & E-Commerce")
    // and zeroes out the entire search if given an unrecognized value — it does not
    // just ignore it. Map each guess to the closest real enum value, or drop it.
    const validIndustries = llmResult.industries
      .map((guess) => mapToValidSeamlessIndustry(guess))
      .filter((v): v is string => v !== null);
    if (validIndustries.length > 0) {
      filters.industry = [...new Set(validIndustries)];
      console.log(`[Seamless.AI] LLM-parsed industries mapped to valid enum: ${JSON.stringify(filters.industry)} (from: ${JSON.stringify(llmResult.industries)})`);
    } else {
      console.log(`[Seamless.AI] LLM-parsed industries had no valid enum match, dropping industry filter: ${JSON.stringify(llmResult.industries)}`);
    }
  }

  return filters;
}

export interface SeamlessCandidatePreview {
  searchResultId: string;
  ownerName: string;
  companyName: string;
  jobTitle?: string;
  email?: string; // occasionally present directly on the raw search result
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  industry?: string;
  companySize?: string; // from employeeSizeRange — documented as available pre-enrichment
  linkedinUrl?: string;
}

/**
 * Phase 1 of the search -> select -> enrich flow: search + all the same
 * country/title filtering used by leads.generate, but stops before spending any
 * enrichment credits. Returns lightweight preview candidates the user can review
 * and select from; only the selected ones get passed to
 * enrichSeamlessCandidatesToLeadData() afterward.
 */
export async function searchAndFilterSeamlessCandidates(
  apiKey: string,
  instruction: string,
  count: number,
  country?: string,
  state?: string,
  companySize?: string
): Promise<{ candidates: SeamlessCandidatePreview[]; totalAvailable?: number; estimatedSearchCredits: number }> {
  const filters = await parseInstructionToFiltersWithLLM(instruction, country);
  if (country) {
    filters.contactCountry = [country];
  }
  if (state) {
    filters.contactState = [state];
  }
  if (companySize) {
    filters.companySize = [companySize];
  }

  const result = await getSeamlessLeads(apiKey, filters, count);
  let candidates: any[] = result.contacts;
  const totalAvailable = result.totalResults;
  // Confirmed live via credit-balance tracking: search costs 1 credit per 10 raw
  // results returned (5 credits per 50-result page), separate from and in addition
  // to enrichment's 1 credit per contact. This is real Seamless.AI billing behavior,
  // not documented anywhere we could find, and not a bug in our own request logic
  // (verified the pagination loop makes exactly the minimum number of calls needed).
  // Estimated from the raw count fetched, before our own country/title filtering,
  // since credits are charged on what Seamless.AI actually returned, not on what we
  // keep afterward.
  const estimatedSearchCredits = Math.ceil(candidates.length / 10);

  if (country) {
    const countryLower = country.toLowerCase();
    const countryAliases: Record<string, string[]> = {
      "united states": ["united states", "usa", "us", "united states of america"],
      "united kingdom": ["united kingdom", "uk", "great britain", "england"],
      "india": ["india"],
    };
    const matchTerms = countryAliases[countryLower] || [countryLower];
    const before = candidates.length;
    candidates = candidates.filter((c: any) => {
      if (c.country) {
        return matchTerms.some((term) => c.country.toLowerCase().includes(term));
      }
      return true;
    });
    console.log(`[Seamless.AI] Preview: after country filter: ${candidates.length} of ${before}`);
  }

  if (filters.jobTitle?.length) {
    const titleRegexes = filters.jobTitle.map(
      (t: string) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
    );
    const before = candidates.length;
    candidates = candidates.filter((c: any) => {
      const title = c.title || c.jobTitle || "";
      if (!title) return false;
      return titleRegexes.some((re: RegExp) => re.test(title));
    });
    console.log(`[Seamless.AI] Preview: after strict title filter: ${candidates.length} of ${before}`);
  }

  // Strict industry filter: Seamless.AI's own search doesn't reliably restrict
  // results to the requested industry either (same unreliability documented
  // above for job titles) -- re-check each candidate's actual industry
  // client-side, canonicalizing both sides through mapToValidSeamlessIndustry
  // so wording differences (e.g. "Travel" vs "Leisure Travel & Tourism") don't
  // cause false rejections. Without this, a search for "Travel Agency" could
  // come back full of unrelated industries Seamless returned anyway.
  if (filters.industry?.length) {
    const targetIndustries = new Set(filters.industry as string[]);
    const before = candidates.length;
    candidates = candidates.filter((c: any) => {
      const rawIndustry = Array.isArray(c.industries) ? c.industries[0] : (c.industries || c.industry || undefined);
      if (!rawIndustry) return false; // Can't verify — exclude rather than risk a mismatch
      const canonical = mapToValidSeamlessIndustry(rawIndustry);
      return canonical ? targetIndustries.has(canonical) : false;
    });
    console.log(`[Seamless.AI] Preview: after strict industry filter: ${candidates.length} of ${before}`);
  }

  candidates = candidates.slice(0, count);

  const preview: SeamlessCandidatePreview[] = candidates
    .filter((c: any) => c.searchResultId)
    .map((c: any) => ({
      searchResultId: c.searchResultId,
      ownerName: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "",
      companyName: c.company || "Unknown",
      jobTitle: c.title || c.jobTitle || undefined,
      email: c.email || undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      country: c.country || undefined,
      // Confirmed against Seamless.AI's official API docs (docs.seamless.ai/searchcontacts):
      // website is a bare domain string field called "domain" (e.g. "pwc.com"), LinkedIn
      // is "liUrl", industry is a plural array field called "industries" (not "industry"),
      // and company size is "employeeSizeRange" — none of these matched the field names
      // the SeamlessSearchResult type originally assumed. All are available pre-enrichment
      // at no credit cost.
      website: c.domain ? `https://${c.domain}` : (c.website || undefined),
      industry: Array.isArray(c.industries) ? c.industries[0] : (c.industries || c.industry || undefined),
      companySize: c.employeeSizeRange || undefined,
      linkedinUrl: c.liUrl || c.linkedinUrl || undefined,
    }));

  return { candidates: preview, totalAvailable, estimatedSearchCredits };
}

export interface SeamlessEnrichmentResult {
  phoneNumber: string;
  email: string;
  companySize: string;
  industry: string;
}

/**
 * Enrich contacts via research + poll flow.
 * Returns a map of searchResultId -> { phoneNumber, email, companySize, industry },
 * using the field names confirmed against the live API (test-rest-api-enrichment.ts):
 * phone: contactPhone1 > contactPhone2 > contactPhone3 > companyPhone1
 * email: email > personalEmail
 * companySize: companyStaffCountRange > companyStaffCount
 * industry: companyIndustry > industry
 */
export async function enrichContacts(
  apiKey: string,
  contacts: SeamlessSearchResult[]
): Promise<Record<string, SeamlessEnrichmentResult>> {
  if (!contacts.length) return {};

  try {
    console.log(`[Seamless.AI] Enriching ${contacts.length} contacts...`);

    // Step 1: Research - submit searchResultIds for enrichment
    const searchResultIds = contacts.map(c => (c as any).searchResultId).filter(Boolean);
    if (!searchResultIds.length) {
      console.warn("[Seamless.AI] No searchResultIds to enrich");
      return {};
    }

    const researchResult = await researchContact(apiKey, searchResultIds);
    if (!researchResult.success || !researchResult.requestIds?.length) {
      console.warn("[Seamless.AI] Research failed or returned no request IDs");
      return {};
    }

    // Step 2: Poll - wait for research results
    console.log(`[Seamless.AI] Polling ${researchResult.requestIds.length} research requests...`);
    const pollResults = await pollContactResults(apiKey, researchResult.requestIds, 60, 1000);

    // Step 3: Map results back to searchResultId using the requestId association
    // captured at submission time (poll results don't reliably echo searchResultId).
    const enrichmentMap: Record<string, SeamlessEnrichmentResult> = {};
    for (const result of pollResults) {
      const searchResultId = researchResult.requestIdToSearchResultId[result.requestId];
      const contact = result.contact;
      if (!searchResultId || !contact) continue;

      const phoneNumber = contact.contactPhone1 || contact.contactPhone2 || contact.contactPhone3 || contact.companyPhone1 || "";
      const email = contact.email || contact.personalEmail || "";
      const companySize = contact.companyStaffCountRange || (contact.companyStaffCount ? String(contact.companyStaffCount) : "");
      const industry = contact.companyIndustry || contact.industry || "";

      enrichmentMap[searchResultId] = { phoneNumber, email, companySize, industry };
    }

    const withPhone = Object.values(enrichmentMap).filter(e => e.phoneNumber).length;
    console.log(`[Seamless.AI] Enrichment complete: ${withPhone} of ${contacts.length} contacts have phone numbers`);
    return enrichmentMap;
  } catch (error: any) {
    console.error("[Seamless.AI] Enrichment failed:", error.message);
    return {};
  }
}

export interface SeamlessLeadData {
  companyName: string;
  ownerName: string;
  jobTitle?: string;
  email: string;
  phoneNumber: string;
  website?: string;
  industry?: string;
  companySize?: string;
  timezone?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  seamlessId: string;
  enrichmentCreditsUsed: number;
}

/**
 * Phase 2 of the search -> select -> enrich flow: takes only the candidates the
 * user actually selected (as returned by searchAndFilterSeamlessCandidates) and
 * enriches just those via research + poll, mapping the result to the lead schema.
 * Mirrors the mapping logic in routers.ts's leads.generate Seamless.AI branch so
 * both flows produce identically-shaped leads.
 */
export async function enrichSeamlessCandidatesToLeadData(
  apiKey: string,
  candidates: SeamlessCandidatePreview[]
): Promise<{ leadsData: SeamlessLeadData[]; seamlessCreditsSpent: number; droppedForMissingContact: number }> {
  const seamlessCreditsSpent = candidates.length; // 1 research credit per contact attempted

  const enrichmentMap = await enrichContacts(
    apiKey,
    candidates.map((c) => ({ searchResultId: c.searchResultId } as any))
  );

  let leadsData: SeamlessLeadData[] = candidates.map((c) => {
    const enrichment = enrichmentMap[c.searchResultId] || ({} as Partial<SeamlessEnrichmentResult>);
    return {
      companyName: c.companyName || "Unknown",
      ownerName: c.ownerName || "",
      jobTitle: c.jobTitle || undefined,
      email: c.email || enrichment.email || "",
      phoneNumber: enrichment.phoneNumber || "",
      website: c.website || undefined,
      industry: c.industry || enrichment.industry || undefined,
      companySize: c.companySize || enrichment.companySize || "1-10",
      timezone: undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      country: c.country || undefined,
      linkedinUrl: c.linkedinUrl || undefined,
      // Seamless.AI's contact/search API doesn't return Instagram or Facebook
      // profiles at all (it's LinkedIn-focused) -- these stay empty here and
      // can be filled in manually via the Edit Lead form for social outreach.
      instagramUrl: undefined,
      facebookUrl: undefined,
      seamlessId: c.searchResultId,
      enrichmentCreditsUsed: 1,
    };
  });

  const before = leadsData.length;
  // Same completeness requirement as the auto-generate flow: phone, email, and a
  // known owner name, or the lead isn't useful.
  leadsData = leadsData.filter((l) => l.phoneNumber && l.email && l.ownerName);
  const droppedForMissingContact = before - leadsData.length;

  return { leadsData, seamlessCreditsSpent, droppedForMissingContact };
}

export async function getSeamlessLeads(
  apiKey: string,
  filters: any,
  count?: number
) {
  // Search for leads using Seamless.AI API with filters
  // This is called from routers.ts for lead generation
  // Uses searchContacts() which has proper pagination and field handling
  try {
    const response = await searchContacts(apiKey, filters, count || 50);
    
    // Convert response to expected format: { contacts: [...] }
    return {
      contacts: response.data || [],
      totalResults: response.supplementalData?.totalResults,
      nextToken: response.supplementalData?.nextToken,
    };
  } catch (error) {
    console.error("[Seamless.AI] Error searching leads:", error);
    return { contacts: [] };
  }
}
