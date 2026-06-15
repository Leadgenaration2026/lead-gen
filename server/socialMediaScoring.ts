/**
 * Social Media Scoring Module
 * 
 * Checks LinkedIn activity for leads and assigns "high" or "low" activity score.
 * Uses the built-in Manus LinkedIn Data API (free, no external API key needed).
 * 
 * Scoring criteria for "High Activity":
 * - Has Creator badge (isCreator)
 * - Has Top Voice badge (isTopVoice)
 * - Has Premium account (isPremium)
 * - High endorsement count (>50 total endorsements)
 * - Multiple positions (active career)
 * - Has a headline with keywords indicating thought leadership
 * 
 * If 2+ signals are positive → "high", otherwise → "low"
 */

import { callDataApi } from "./_core/dataApi";

export interface LinkedInProfileData {
  firstName?: string;
  lastName?: string;
  headline?: string;
  username?: string;
  isCreator?: boolean;
  isTopVoice?: boolean;
  isPremium?: boolean;
  skills?: Array<{ name: string; endorsementsCount?: number }>;
  position?: Array<{ title?: string; companyName?: string }>;
  summary?: string;
  geo?: { full?: string };
}

export interface ScoringResult {
  score: "high" | "low";
  signals: string[];
  profileData?: Partial<LinkedInProfileData>;
}

/**
 * Extract LinkedIn username from a LinkedIn URL
 */
export function extractLinkedInUsername(linkedinUrl: string): string | null {
  if (!linkedinUrl) return null;
  
  // Handle various LinkedIn URL formats
  // https://www.linkedin.com/in/username
  // https://linkedin.com/in/username/
  // linkedin.com/in/username
  const patterns = [
    /linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i,
    /linkedin\.com\/pub\/([a-zA-Z0-9\-_%]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = linkedinUrl.match(pattern);
    if (match && match[1]) {
      // Remove trailing slash or query params
      return match[1].replace(/\/$/, "").split("?")[0];
    }
  }
  
  return null;
}

/**
 * Fetch LinkedIn profile data using the built-in Data API
 */
async function fetchLinkedInProfile(username: string): Promise<LinkedInProfileData | null> {
  try {
    const result = await callDataApi("LinkedIn/get_user_profile_by_username", {
      query: { username },
    });
    
    if (!result || typeof result !== "object") return null;
    
    // The API may return data directly or wrapped in a data field
    const data = (result as any).data || result;
    
    return data as LinkedInProfileData;
  } catch (error) {
    console.error(`[SocialScoring] Failed to fetch LinkedIn profile for ${username}:`, error);
    return null;
  }
}

/**
 * Score a lead's LinkedIn activity based on profile signals
 */
export function scoreLinkedInProfile(profile: LinkedInProfileData): ScoringResult {
  const signals: string[] = [];
  let score = 0;
  
  // Signal 1: Creator badge
  if (profile.isCreator) {
    signals.push("LinkedIn Creator");
    score += 2;
  }
  
  // Signal 2: Top Voice badge
  if (profile.isTopVoice) {
    signals.push("Top Voice");
    score += 2;
  }
  
  // Signal 3: Premium account
  if (profile.isPremium) {
    signals.push("Premium Member");
    score += 1;
  }
  
  // Signal 4: High endorsements
  const totalEndorsements = (profile.skills || []).reduce(
    (sum, skill) => sum + (skill.endorsementsCount || 0),
    0
  );
  if (totalEndorsements > 50) {
    signals.push(`${totalEndorsements} endorsements`);
    score += 1;
  }
  
  // Signal 5: Multiple positions (active career, networker)
  if (profile.position && profile.position.length >= 3) {
    signals.push("Multiple positions");
    score += 1;
  }
  
  // Signal 6: Headline indicates thought leadership
  const headline = (profile.headline || "").toLowerCase();
  const leadershipKeywords = [
    "founder", "ceo", "speaker", "author", "coach", "consultant",
    "advisor", "influencer", "thought leader", "mentor", "evangelist",
    "director", "vp", "head of", "chief", "president"
  ];
  if (leadershipKeywords.some(kw => headline.includes(kw))) {
    signals.push("Leadership role");
    score += 1;
  }
  
  // Signal 7: Has a summary/about section (engaged with profile)
  if (profile.summary && profile.summary.length > 100) {
    signals.push("Detailed profile");
    score += 1;
  }
  
  // High Activity = 2+ positive signals
  const activityLevel: "high" | "low" = score >= 2 ? "high" : "low";
  
  return {
    score: activityLevel,
    signals,
    profileData: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      headline: profile.headline,
      isCreator: profile.isCreator,
      isTopVoice: profile.isTopVoice,
      isPremium: profile.isPremium,
    },
  };
}

/**
 * Score a single lead by their LinkedIn URL or name
 * Returns "high" or "low" activity score
 */
export async function scoreLeadSocialMedia(
  linkedinUrl?: string | null,
  ownerName?: string | null,
  companyName?: string | null
): Promise<ScoringResult> {
  // Try to get username from LinkedIn URL first
  let username = linkedinUrl ? extractLinkedInUsername(linkedinUrl) : null;
  
  // If no LinkedIn URL, try searching by name (less reliable)
  if (!username && ownerName) {
    try {
      const searchResult = await callDataApi("LinkedIn/search_people", {
        query: {
          keywords: `${ownerName} ${companyName || ""}`.trim(),
        },
      });
      
      const data = (searchResult as any)?.data || searchResult;
      const items = data?.items || [];
      
      if (items.length > 0 && items[0]?.username) {
        username = items[0].username;
      }
    } catch (error) {
      console.error(`[SocialScoring] LinkedIn search failed for ${ownerName}:`, error);
    }
  }
  
  // If we still don't have a username, return low by default
  if (!username) {
    return {
      score: "low",
      signals: ["No LinkedIn profile found"],
    };
  }
  
  // Fetch and score the profile
  const profile = await fetchLinkedInProfile(username);
  
  if (!profile) {
    return {
      score: "low",
      signals: ["Could not fetch LinkedIn data"],
    };
  }
  
  return scoreLinkedInProfile(profile);
}
