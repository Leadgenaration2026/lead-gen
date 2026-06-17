/**
 * Engagement Scoring System (Unified)
 * 
 * Scores leads based on their social media activity (LinkedIn + Instagram).
 * Uses the built-in Manus LinkedIn Data API for reliable LinkedIn data.
 * Uses Instagram public profile scraping for Instagram data.
 * 
 * Higher score = more active/influential = should be contacted first.
 * 
 * Score breakdown (0-100):
 * - LinkedIn activity: up to 60 points
 *   - Creator badge: +10
 *   - Top Voice badge: +10
 *   - Premium account: +5
 *   - High endorsements (>50): +8
 *   - Multiple positions (3+): +5
 *   - Leadership role in headline: +7
 *   - Detailed profile (summary >100 chars): +5
 *   - Has LinkedIn profile at all: +10
 * - Instagram activity: up to 30 points
 *   - Followers-based: up to 15 points
 *   - Post count: up to 10 points
 *   - Engagement rate: up to 5 points
 * - Website presence: up to 10 points
 *   - Has website: +7
 *   - Website has social links: +3
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
  instagram?: {
    followers?: number;
    posts?: number;
    isPublic?: boolean;
    engagementRate?: number;
  };
  website?: {
    exists: boolean;
    hasSocialLinks?: boolean;
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
 * Scrape basic Instagram profile metrics from a public profile
 */
async function scrapeInstagramMetrics(instagramUrl: string): Promise<EngagementMetrics["instagram"] | null> {
  try {
    let username = "";
    if (instagramUrl.includes("instagram.com/")) {
      username = instagramUrl.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || "";
    }
    if (!username) return null;

    const response = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { isPublic: false };
    }

    const html = await response.text();
    let followers: number | undefined;
    let posts: number | undefined;

    // Try meta description: "123 Followers, 45 Following, 67 Posts"
    const metaMatch = html.match(/content="([\d,.]+[KkMm]?) Followers, ([\d,.]+[KkMm]?) Following, ([\d,.]+[KkMm]?) Posts/i);
    if (metaMatch) {
      followers = parseMetricNumber(metaMatch[1]);
      posts = parseMetricNumber(metaMatch[3]);
    }

    // Try og:description
    if (!followers) {
      const ogMatch = html.match(/og:description[^>]*content="([\d,.]+[KkMm]?) Followers/i);
      if (ogMatch) {
        followers = parseMetricNumber(ogMatch[1]);
      }
    }

    // Try JSON-LD
    if (!followers) {
      const jsonMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
      if (jsonMatch) followers = parseInt(jsonMatch[1]);
    }
    if (!posts) {
      const postsMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/);
      if (postsMatch) posts = parseInt(postsMatch[1]);
    }

    const isPublic = !html.includes("This Account is Private") && !html.includes("is_private\":true");

    // Estimate engagement rate
    let engagementRate: number | undefined;
    if (followers && followers > 0) {
      if (followers < 1000) engagementRate = 8;
      else if (followers < 10000) engagementRate = 5;
      else if (followers < 100000) engagementRate = 3;
      else engagementRate = 1.5;
    }

    return { followers, posts, isPublic, engagementRate };
  } catch (error: any) {
    console.log(`[Engagement] Instagram scrape failed: ${error.message}`);
    return null;
  }
}

/**
 * Parse numbers like "1.2K", "15.3M", "1,234" into integers
 */
function parseMetricNumber(str: string): number {
  if (!str) return 0;
  str = str.replace(/,/g, "").trim();
  const multiplierMatch = str.match(/^([\d.]+)\s*([KkMm])?$/);
  if (multiplierMatch) {
    const num = parseFloat(multiplierMatch[1]);
    const mult = multiplierMatch[2]?.toLowerCase();
    if (mult === "k") return Math.round(num * 1000);
    if (mult === "m") return Math.round(num * 1000000);
    return Math.round(num);
  }
  return parseInt(str) || 0;
}

/**
 * Calculate engagement score (0-100) from collected metrics
 */
function calculateScore(metrics: EngagementMetrics): number {
  let score = 0;

  // LinkedIn scoring (up to 60 points)
  if (metrics.linkedin) {
    const li = metrics.linkedin;
    if (li.hasProfile) score += 10;
    if (li.isCreator) score += 10;
    if (li.isTopVoice) score += 10;
    if (li.isPremium) score += 5;
    if (li.endorsements && li.endorsements > 50) score += 8;
    if (li.positions && li.positions >= 3) score += 5;
    if (li.hasLeadershipRole) score += 7;
    if (li.hasDetailedProfile) score += 5;
  }

  // Instagram scoring (up to 30 points)
  if (metrics.instagram) {
    const ig = metrics.instagram;
    if (ig.isPublic !== false) {
      // Follower-based score (up to 15 points)
      if (ig.followers) {
        if (ig.followers >= 100000) score += 15;
        else if (ig.followers >= 50000) score += 13;
        else if (ig.followers >= 10000) score += 11;
        else if (ig.followers >= 5000) score += 9;
        else if (ig.followers >= 1000) score += 7;
        else if (ig.followers >= 500) score += 5;
        else if (ig.followers >= 100) score += 3;
        else score += 1;
      }
      // Post count (up to 10 points)
      if (ig.posts) {
        if (ig.posts >= 500) score += 10;
        else if (ig.posts >= 200) score += 8;
        else if (ig.posts >= 100) score += 6;
        else if (ig.posts >= 50) score += 4;
        else if (ig.posts >= 10) score += 2;
        else score += 1;
      }
      // Engagement rate bonus (up to 5 points)
      if (ig.engagementRate) {
        if (ig.engagementRate >= 6) score += 5;
        else if (ig.engagementRate >= 4) score += 4;
        else if (ig.engagementRate >= 2) score += 3;
        else score += 1;
      }
    } else {
      // Private account — still has presence
      score += 3;
    }
  }

  // Website scoring (up to 10 points)
  if (metrics.website?.exists) {
    score += 7;
    if (metrics.website.hasSocialLinks) score += 3;
  }

  return Math.min(100, score);
}

/**
 * Score a single lead's engagement based on their social profiles.
 * Uses LinkedIn Data API + Instagram scraping + website check.
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

  // 2. Score Instagram (secondary signal — may fail due to blocking)
  if ((lead as any).instagramUrl) {
    const igMetrics = await scrapeInstagramMetrics((lead as any).instagramUrl);
    if (igMetrics) {
      metrics.instagram = igMetrics;
    }
  }

  // 3. Score Website (tertiary signal)
  if (lead.website) {
    metrics.website = { exists: true };
    try {
      const response = await fetch(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (response.ok) {
        const html = await response.text();
        metrics.website.hasSocialLinks = html.includes("instagram.com") || html.includes("linkedin.com") || html.includes("facebook.com");
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
