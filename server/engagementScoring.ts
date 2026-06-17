/**
 * Engagement Scoring System (Unified)
 * 
 * Scores leads based on their LinkedIn activity and website presence.
 * Uses the built-in Manus LinkedIn Data API for reliable LinkedIn data.
 * 
 * Higher score = more active/influential = should be contacted first.
 * 
 * Score breakdown (0-100):
 * - LinkedIn activity: up to 75 points
 *   - Has LinkedIn profile at all: +15
 *   - Creator badge: +12
 *   - Top Voice badge: +12
 *   - Premium account: +8
 *   - High endorsements (>50): +10
 *   - Multiple positions (3+): +6
 *   - Leadership role in headline: +7
 *   - Detailed profile (summary >100 chars): +5
 * - Website presence: up to 25 points
 *   - Has website: +15
 *   - Website has social links: +5
 *   - Website is responsive/loads fast: +5
 */

import * as db from "./db";
import { callDataApi } from "./_core/dataApi";

interface EngagementMetrics {
  linkedin?: {
    hasProfile: boolean;
    isCreator?: boolean;
    isTopVoice?: boolean;
    isPremium?: boolean;
    endorsements?: number;
    positions?: number;
    hasLeadershipRole?: boolean;
    hasDetailedProfile?: boolean;
    headline?: string;
  };
  website?: {
    exists: boolean;
    hasSocialLinks?: boolean;
    loadsSuccessfully?: boolean;
  };
  scoredAt: string;
}

/**
 * Extract LinkedIn username from a LinkedIn URL
 */
function extractLinkedInUsername(linkedinUrl: string): string | null {
  if (!linkedinUrl) return null;
  const patterns = [
    /linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i,
    /linkedin\.com\/pub\/([a-zA-Z0-9\-_%]+)/i,
  ];
  for (const pattern of patterns) {
    const match = linkedinUrl.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/\/$/, "").split("?")[0];
    }
  }
  return null;
}

/**
 * Fetch LinkedIn profile data using the built-in Data API
 */
async function fetchLinkedInProfile(username: string): Promise<any | null> {
  try {
    const result = await callDataApi("LinkedIn/get_user_profile_by_username", {
      query: { username },
    });
    if (!result || typeof result !== "object") return null;
    return (result as any).data || result;
  } catch (error) {
    console.error(`[Engagement] LinkedIn API failed for ${username}:`, error);
    return null;
  }
}

/**
 * Search LinkedIn by name if no URL is available
 */
async function searchLinkedInByName(name: string, company?: string): Promise<string | null> {
  try {
    const keywords = `${name} ${company || ""}`.trim();
    const result = await callDataApi("LinkedIn/search_people", {
      query: { keywords },
    });
    const data = (result as any)?.data || result;
    const items = data?.items || [];
    if (items.length > 0 && items[0]?.username) {
      return items[0].username;
    }
    return null;
  } catch (error) {
    console.error(`[Engagement] LinkedIn search failed for ${name}:`, error);
    return null;
  }
}

/**
 * Calculate engagement score (0-100) from collected metrics
 * Based on LinkedIn activity + Website presence only
 */
function calculateScore(metrics: EngagementMetrics): number {
  let score = 0;

  // LinkedIn scoring (up to 75 points)
  if (metrics.linkedin) {
    const li = metrics.linkedin;
    if (li.hasProfile) score += 15;
    if (li.isCreator) score += 12;
    if (li.isTopVoice) score += 12;
    if (li.isPremium) score += 8;
    if (li.endorsements && li.endorsements > 50) score += 10;
    if (li.positions && li.positions >= 3) score += 6;
    if (li.hasLeadershipRole) score += 7;
    if (li.hasDetailedProfile) score += 5;
  }

  // Website scoring (up to 25 points)
  if (metrics.website?.exists) {
    score += 15;
    if (metrics.website.hasSocialLinks) score += 5;
    if (metrics.website.loadsSuccessfully) score += 5;
  }

  return Math.min(100, score);
}

/**
 * Score a single lead's engagement based on their LinkedIn profile and website.
 * Updates the lead's engagementScore and engagementData in the database.
 */
export async function scoreLeadEngagement(leadId: number): Promise<{ score: number; metrics: EngagementMetrics }> {
  const lead = await db.getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const metrics: EngagementMetrics = {
    scoredAt: new Date().toISOString(),
  };

  // 1. Score LinkedIn (primary signal — uses reliable built-in API)
  let username = lead.linkedinUrl ? extractLinkedInUsername(lead.linkedinUrl) : null;
  
  // If no LinkedIn URL, try searching by name
  if (!username && lead.ownerName) {
    username = await searchLinkedInByName(lead.ownerName, lead.companyName);
  }

  if (username) {
    const profile = await fetchLinkedInProfile(username);
    if (profile) {
      const headline = (profile.headline || "").toLowerCase();
      const leadershipKeywords = [
        "founder", "ceo", "speaker", "author", "coach", "consultant",
        "advisor", "influencer", "thought leader", "mentor", "evangelist",
        "director", "vp", "head of", "chief", "president", "owner"
      ];
      const totalEndorsements = (profile.skills || []).reduce(
        (sum: number, skill: any) => sum + (skill.endorsementsCount || 0), 0
      );

      metrics.linkedin = {
        hasProfile: true,
        isCreator: !!profile.isCreator,
        isTopVoice: !!profile.isTopVoice,
        isPremium: !!profile.isPremium,
        endorsements: totalEndorsements,
        positions: (profile.position || []).length,
        hasLeadershipRole: leadershipKeywords.some(kw => headline.includes(kw)),
        hasDetailedProfile: !!(profile.summary && profile.summary.length > 100),
        headline: profile.headline,
      };
    } else {
      metrics.linkedin = { hasProfile: true }; // URL exists but couldn't fetch details
    }
  }

  // 2. Score Website (secondary signal)
  if (lead.website) {
    metrics.website = { exists: true, loadsSuccessfully: false };
    try {
      const response = await fetch(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (response.ok) {
        metrics.website.loadsSuccessfully = true;
        const html = await response.text();
        metrics.website.hasSocialLinks = html.includes("instagram.com") || html.includes("linkedin.com") || html.includes("facebook.com") || html.includes("twitter.com") || html.includes("x.com");
      }
    } catch {
      // Website check failed, still count as exists
    }
  }

  const score = calculateScore(metrics);

  // Update lead in database
  await db.updateLeadEngagement(leadId, score, metrics);

  // Also update the socialMediaScore field for the High/Low badge
  const socialScore = score >= 30 ? "high" : "low";
  await db.updateLead(leadId, { socialMediaScore: socialScore });

  return { score, metrics };
}

/**
 * Score multiple leads in batch (with rate limiting to avoid being blocked).
 */
export async function scoreLeadsBatch(leadIds: number[]): Promise<{ scored: number; errors: number }> {
  let scored = 0;
  let errors = 0;

  for (const leadId of leadIds) {
    try {
      await scoreLeadEngagement(leadId);
      scored++;
      // Rate limit: wait 1.5 seconds between requests
      if (scored < leadIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error: any) {
      console.error(`[Engagement] Failed to score lead ${leadId}:`, error.message);
      errors++;
    }
  }

  return { scored, errors };
}
