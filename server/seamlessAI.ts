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

const SEAMLESS_API_BASE = "https://api.seamless.ai/api/client/v1";

export interface SeamlessSearchResult {
  id: string;
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
    totalResults?: number;
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
  if (filters.email) body.email = filters.email;
  if (filters.city) body.city = filters.city;
  if (filters.state) body.state = filters.state;
  if (filters.country) body.country = filters.country;
  if (filters.contactCountry?.length) body.contactCountry = filters.contactCountry;
  if (filters.contactState?.length) body.contactState = filters.contactState;
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
export async function researchContact(
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




export function parseInstructionToFilters(instruction: string, country?: string) {
  // Parse user instruction into Seamless.AI search filters
  const filters: any = {};
  
  if (instruction) {
    filters.instruction = instruction;
  }
  
  if (country) {
    filters.country = country;
  }
  
  return filters;
}

export async function getSeamlessLeads(
  apiKey: string,
  filters: any,
  count?: number
) {
  // Search for leads using Seamless.AI API with filters
  // This is called from routers.ts for lead generation
  try {
    const response = await seamlessRequest(apiKey, "POST", "/contacts/search", filters);
    return response || { contacts: [] };
  } catch (error) {
    console.error("[Seamless.AI] Error searching leads:", error);
    return { contacts: [] };
  }
}
