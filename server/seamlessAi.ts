/**
 * Seamless.ai API Integration
 * 
 * Provides search and research capabilities for B2B contacts and companies.
 * API Flow: Search → Research → Poll for results
 * 
 * Docs: https://docs.seamless.ai/introduction
 */

const SEAMLESS_BASE_URL = "https://api.seamless.ai/v1";

interface SeamlessSearchFilters {
  companyName?: string;
  companyDomain?: string;
  jobTitle?: string;
  department?: string;
  seniority?: string;
  industry?: string;
  contactCountry?: string;
  companySize?: string;
  limit?: number;
  nextToken?: string;
}

interface SeamlessContactResult {
  searchResultId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  company?: string;
  title?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

interface SeamlessResearchedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  personalEmail?: string;
  company?: string;
  title?: string;
  lIProfileUrl?: string;
  contactLocation?: {
    city?: string;
    state?: string;
    country?: string;
  };
  jobHistory?: Array<{
    company: string;
    title: string;
  }>;
}

interface SeamlessSearchResponse {
  data: SeamlessContactResult[];
  supplementalData?: {
    nextToken?: string;
    totalResults?: number;
  };
}

interface SeamlessResearchResponse {
  requestIds: string[];
}

interface SeamlessPollResponse {
  data: SeamlessResearchedContact[];
  status: "complete" | "pending" | "failed";
}

export async function searchContacts(apiKey: string, filters: SeamlessSearchFilters): Promise<SeamlessSearchResponse> {
  const params = new URLSearchParams();
  
  if (filters.companyName) params.append("company_name", filters.companyName);
  if (filters.companyDomain) params.append("company_domain", filters.companyDomain);
  if (filters.jobTitle) params.append("job_title", filters.jobTitle);
  if (filters.department) params.append("department", filters.department);
  if (filters.seniority) params.append("seniority", filters.seniority);
  if (filters.industry) params.append("industry", filters.industry);
  if (filters.contactCountry) params.append("contact_country", filters.contactCountry);
  if (filters.companySize) params.append("company_size", filters.companySize);
  if (filters.limit) params.append("limit", String(filters.limit));
  if (filters.nextToken) params.append("next_token", filters.nextToken);

  const response = await fetch(`${SEAMLESS_BASE_URL}/contacts/search?${params.toString()}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Seamless.ai search failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function researchContacts(apiKey: string, searchResultIds: string[]): Promise<SeamlessResearchResponse> {
  const response = await fetch(`${SEAMLESS_BASE_URL}/contacts/research`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ searchResultIds }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Seamless.ai research failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function pollContactResults(apiKey: string, requestIds: string[]): Promise<SeamlessPollResponse> {
  const params = new URLSearchParams();
  params.append("request_ids", requestIds.join(","));

  const response = await fetch(`${SEAMLESS_BASE_URL}/contacts/poll?${params.toString()}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Seamless.ai poll failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Full flow: Search → Research → Poll (with retry)
 * Returns enriched contacts with email, phone, LinkedIn, etc.
 */
export async function searchAndResearchContacts(
  apiKey: string,
  filters: SeamlessSearchFilters,
  maxPollAttempts = 12,
  pollIntervalMs = 5000
): Promise<SeamlessResearchedContact[]> {
  // Step 1: Search
  const searchResults = await searchContacts(apiKey, filters);
  
  if (!searchResults.data || searchResults.data.length === 0) {
    return [];
  }

  // Step 2: Research (submit for enrichment)
  const searchResultIds = searchResults.data.map(c => c.searchResultId).filter(Boolean);
  if (searchResultIds.length === 0) {
    // Return basic search results without enrichment
    return searchResults.data.map(c => ({
      firstName: c.firstName || c.name?.split(" ")[0],
      lastName: c.lastName || c.name?.split(" ").slice(1).join(" "),
      company: c.company,
      title: c.title,
      contactLocation: c.location,
    }));
  }

  const researchResponse = await researchContacts(apiKey, searchResultIds);
  
  if (!researchResponse.requestIds || researchResponse.requestIds.length === 0) {
    throw new Error("Seamless.ai research returned no request IDs");
  }

  // Step 3: Poll until complete
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    
    const pollResponse = await pollContactResults(apiKey, researchResponse.requestIds);
    
    if (pollResponse.status === "complete") {
      return pollResponse.data || [];
    }
    
    if (pollResponse.status === "failed") {
      throw new Error("Seamless.ai research failed during polling");
    }
  }

  throw new Error("Seamless.ai research timed out after polling");
}

/**
 * Quick search without research (faster, less data)
 */
export async function quickSearchContacts(apiKey: string, filters: SeamlessSearchFilters): Promise<SeamlessContactResult[]> {
  const searchResults = await searchContacts(apiKey, filters);
  return searchResults.data || [];
}
