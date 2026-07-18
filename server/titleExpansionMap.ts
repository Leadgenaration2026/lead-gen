/**
 * Job Title Expansion Map
 * Maps natural language job titles to all equivalent titles in Seamless.AI
 * This replicates how the Seamless UI expands searches
 */

export const TITLE_EXPANSION_MAP: Record<string, string[]> = {
  // Executive / Owner roles
  "owner": ["Owner", "Founder", "CEO", "President", "Managing Director", "Principal", "Co-Founder", "Business Owner"],
  "founder": ["Founder", "Co-Founder", "CEO", "President", "Owner"],
  "ceo": ["CEO", "Chief Executive Officer", "President", "Founder", "Owner"],
  "president": ["President", "CEO", "Founder", "Owner", "Managing Director"],
  "managing director": ["Managing Director", "Director", "CEO", "President"],
  "principal": ["Principal", "Owner", "Founder", "Managing Director"],
  "co-founder": ["Co-Founder", "Founder", "CEO", "Owner"],
  "business owner": ["Owner", "Founder", "CEO", "President", "Business Owner", "Entrepreneur"],
  
  // Sales roles
  "sales director": ["Sales Director", "VP of Sales", "Head of Sales", "Sales Manager", "Sales Lead"],
  "vp of sales": ["VP of Sales", "Vice President of Sales", "Sales Director", "Head of Sales"],
  "sales manager": ["Sales Manager", "Sales Director", "Regional Sales Manager", "Account Manager"],
  "sales rep": ["Sales Representative", "Account Executive", "Sales Rep", "Business Development Rep"],
  "account executive": ["Account Executive", "Sales Rep", "Account Manager"],
  "business development": ["Business Development Manager", "BD Manager", "Business Development Rep"],
  
  // Marketing roles
  "marketing director": ["Marketing Director", "VP of Marketing", "Head of Marketing", "Marketing Manager"],
  "vp of marketing": ["VP of Marketing", "Vice President of Marketing", "Marketing Director"],
  "marketing manager": ["Marketing Manager", "Marketing Director", "Digital Marketing Manager"],
  "cmo": ["Chief Marketing Officer", "CMO", "VP of Marketing", "Marketing Director"],
  
  // Operations roles
  "operations director": ["Operations Director", "VP of Operations", "Head of Operations", "Operations Manager"],
  "vp of operations": ["VP of Operations", "Vice President of Operations", "Operations Director"],
  "operations manager": ["Operations Manager", "Operations Director", "Operations Coordinator"],
  "coo": ["Chief Operating Officer", "COO", "VP of Operations", "Operations Director"],
  
  // Finance roles
  "cfo": ["Chief Financial Officer", "CFO", "VP of Finance", "Finance Director"],
  "finance director": ["Finance Director", "VP of Finance", "Controller", "Finance Manager"],
  "controller": ["Controller", "Finance Director", "Accounting Manager"],
  
  // HR roles
  "hr director": ["HR Director", "VP of HR", "Head of HR", "HR Manager"],
  "hr manager": ["HR Manager", "HR Director", "Recruiter", "Talent Manager"],
  
  // IT/Tech roles
  "cto": ["Chief Technology Officer", "CTO", "VP of Engineering", "Tech Director"],
  "vp of engineering": ["VP of Engineering", "Engineering Director", "Head of Engineering"],
  "engineering manager": ["Engineering Manager", "Tech Lead", "Development Manager"],
  "it director": ["IT Director", "VP of IT", "Head of IT", "IT Manager"],
  
  // Manager (generic)
  "manager": ["Manager", "Director", "Team Lead", "Supervisor", "Lead"],
  "director": ["Director", "VP", "Vice President", "Senior Director", "Head of"],
  "supervisor": ["Supervisor", "Manager", "Team Lead"],
  "team lead": ["Team Lead", "Lead", "Manager", "Supervisor"],
  
  // Small business specific
  "small business owner": ["Owner", "Founder", "CEO", "President", "Managing Director", "Principal", "Co-Founder", "Business Owner", "Entrepreneur"],
  "entrepreneur": ["Entrepreneur", "Founder", "Owner", "CEO", "Business Owner"],
  
  // Consultant
  "consultant": ["Consultant", "Senior Consultant", "Management Consultant", "Business Consultant"],
  "partner": ["Partner", "Managing Partner", "Principal", "Owner"],
};

/**
 * Company Size Mapping
 * Converts natural language company sizes to Seamless.AI filters
 */
export const COMPANY_SIZE_MAP: Record<string, { min?: number; max?: number; label?: string }> = {
  "startup": { max: 50 },
  "small": { min: 1, max: 50 },
  "small business": { min: 2, max: 50 },
  "medium": { min: 51, max: 500 },
  "large": { min: 501, max: 5000 },
  "enterprise": { min: 5001 },
  "1-10": { min: 1, max: 10 },
  "2-10": { min: 2, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-100": { min: 51, max: 100 },
  "101-500": { min: 101, max: 500 },
  "501-1000": { min: 501, max: 1000 },
  "1000+": { min: 1000 },
  "5000+": { min: 5000 },
};

/**
 * Expand a single job title to all equivalent titles via the static map only
 * (direct or partial key match) -- returns null, rather than falling back to
 * the original text, when nothing genuinely matched. Callers that need to
 * distinguish "found a real match" from "found nothing" (e.g. deciding
 * whether to fall back to an LLM call) should use this instead of
 * expandJobTitle().
 */
export function matchJobTitle(title: string): string[] | null {
  const normalized = title.toLowerCase().trim();
  if (!normalized) return null;

  // Direct match
  if (TITLE_EXPANSION_MAP[normalized]) {
    return TITLE_EXPANSION_MAP[normalized];
  }

  // Partial match (e.g., "sales" matches "sales director", "sales manager", etc.)
  const matches: string[] = [];
  const seen: Record<string, boolean> = {};

  for (const [key, titles] of Object.entries(TITLE_EXPANSION_MAP)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      for (const t of titles) {
        if (!seen[t]) {
          matches.push(t);
          seen[t] = true;
        }
      }
    }
  }

  if (matches.length > 0) {
    // Limit to 10 titles max (Seamless.AI API limit)
    return matches.sort().slice(0, 10);
  }

  return null;
}

/**
 * Expand a single job title to all equivalent titles
 */
export function expandJobTitle(title: string): string[] {
  return matchJobTitle(title) ?? [title];
}

/**
 * Parse company size range from natural language
 * Examples: "2-10", "small", "enterprise", "1-50 employees"
 */
export function parseCompanySize(sizeText: string): { min?: number; max?: number } {
  if (!sizeText) return {};
  
  const normalized = sizeText.toLowerCase().trim();
  
  // Direct map lookup
  if (COMPANY_SIZE_MAP[normalized]) {
    return COMPANY_SIZE_MAP[normalized];
  }
  
  // Try to parse numeric range: "2-10", "1-50 employees", etc.
  const rangeMatch = normalized.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }
  
  // Try single number: "50", "1000+"
  const singleMatch = normalized.match(/(\d+)\+?/);
  if (singleMatch) {
    const num = parseInt(singleMatch[1], 10);
    if (normalized.includes("+")) {
      return { min: num };
    }
    return { max: num };
  }
  
  return {};
}

/**
 * Extract keywords from natural language instruction
 * Returns: { titles: [], companySize: {}, industries: [], departments: [] }
 */
export function parseSearchInstruction(instruction: string) {
  const result = {
    titles: [] as string[],
    companySize: {} as { min?: number; max?: number },
    industries: [] as string[],
    departments: [] as string[],
    countries: [] as string[],
  };

  if (!instruction) return result;

  const lower = instruction.toLowerCase();

  // Extract job titles
  // IMPORTANT: Order by specificity (longest/most specific first) to avoid shorter keywords
  // crowding out more specific matches due to the 10-title cap
  const titleKeywords = [
    "small business owner", "business owner", // Most specific phrases first
    "vice president", // Longer than "vp"
    "owner", "founder", "ceo", "president", "director", "manager", "vp",
    "sales", "marketing", "operations", "finance", "hr", "engineering", "it",
    "consultant", "partner", "entrepreneur"
  ];
  
  for (const keyword of titleKeywords) {
    // Use word boundary regex to avoid false positives
    // e.g., "it" should not match inside "with", "hr" should not match inside "chair"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(instruction)) {
      const expanded = expandJobTitle(keyword);
      result.titles.push(...expanded);
      // Stop expanding if we already have 10 titles
      if (result.titles.length >= 10) break;
    }
  }
  
  // Remove duplicates and limit to 10 titles max (Seamless.AI API limit)
  const titleSet: Record<string, boolean> = {};
  result.titles = result.titles.filter(t => {
    if (titleSet[t]) return false;
    titleSet[t] = true;
    return true;
  }).slice(0, 10);

  // Extract company size - prioritize numeric ranges over keywords
  // Check for numeric ranges first (e.g., "2-10", "1-50", "100-500")
  const numericRangeMatch = lower.match(/(\d+)\s*-\s*(\d+)/);
  if (numericRangeMatch) {
    result.companySize = parseCompanySize(`${numericRangeMatch[1]}-${numericRangeMatch[2]}`);
  } else {
    // Fall back to keyword matching
    const sizeKeywords = [
      "startup", "small", "medium", "large", "enterprise",
      "1-10", "2-10", "11-50", "51-100", "101-500", "501-1000", "1000+", "5000+"
    ];
    
    for (const keyword of sizeKeywords) {
      if (lower.includes(keyword)) {
        result.companySize = parseCompanySize(keyword);
        break; // Use first match
      }
    }
  }

  // Extract industries - ONLY if explicitly mentioned
  // Do NOT infer industries from other keywords
  // For example: "small business" should NOT infer "technology"
  // Only explicit mentions like "restaurant owners" or "healthcare CEOs" should add industry
  const industryKeywords = [
    "technology", "finance", "healthcare", "retail", "manufacturing",
    "real estate", "education", "media", "telecom", "energy",
    "restaurant", "construction", "legal", "accounting", "consulting",
    "travel", "tourism", "hospitality", "insurance", "agriculture",
    "automotive", "aerospace", "pharmaceutical", "biotechnology",
    "non-profit", "nonprofit", "logistics", "transportation",
    "e-commerce", "ecommerce", "software"
  ];
  
  // Only add industry if it's explicitly mentioned as a standalone word
  // Use word boundary matching to avoid false positives
  for (const keyword of industryKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(instruction)) {
      result.industries.push(keyword);
    }
  }

  // Extract countries - map to full country names for API
  const countryMap: Record<string, string> = {
    "united states": "United States",
    "us": "United States",
    "canada": "Canada",
    "uk": "United Kingdom",
    "australia": "Australia",
    "india": "India"
  };
  
  for (const keyword of Object.keys(countryMap)) {
    // Use word boundary regex to avoid false positives
    // e.g., "us" should not match inside "business", "uk" should not match inside "duke"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(instruction)) {
      const fullName = countryMap[keyword];
      if (!result.countries.includes(fullName)) {
        result.countries.push(fullName);
      }
    }
  }

  return result;
}
