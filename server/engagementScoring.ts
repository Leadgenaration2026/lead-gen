/**
 * Engagement Scoring System (Unified)
 *
 * Scores leads based on LinkedIn PROFILE signals (badges, endorsements, career
 * history, headline seniority/authority keywords) and real website liveness —
 * NOT actual activity like posts, likes, comments, or follower counts. The
 * LinkedIn data source this app uses (Manus's built-in LinkedIn Data API) only
 * returns static profile fields; it does not expose post/engagement activity
 * data at all, so this score should be read as "profile strength + authority
 * signals + real web presence," not "how active they are on LinkedIn."
 *
 * Higher score = stronger/more authoritative profile + real web presence =
 * likely a better-qualified lead to contact first.
 *
 * Score breakdown (0-100):
 * - LinkedIn profile signals: up to 75 points
 *   - Has LinkedIn profile at all: +15
 *   - Creator badge: +12
 *   - Top Voice badge: +12
 *   - Premium account: +8
 *   - High endorsements (>50): +10
 *   - Multiple positions (3+): +6
 *   - Leadership role in headline (keyword match): +7
 *   - Detailed profile (summary >100 chars): +5
 * - Website presence: up to 25 points (ONLY if website actually loads)
 *   - Has a real, functioning website (not parked/expired/placeholder): +15
 *   - Website has real social media links (in href attributes): +5
 *   - Website confirmed loading successfully: +5
 *   - NOTE: Parked domains, expired sites, placeholder pages = 0 points
 *   - NOTE: this checks liveness only, not recency/freshness of content
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
 * Based on LinkedIn profile signals + website liveness only
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
  // Only award points if the website actually loads and is a real site
  if (metrics.website?.exists && metrics.website.loadsSuccessfully) {
    score += 15; // Has a real, functioning website
    if (metrics.website.hasSocialLinks) score += 5; // Has real social links in href attributes
    score += 5; // Confirmed loads successfully
  }

  return Math.min(100, score);
}

/**
 * Core scoring computation, independent of whether the lead is already saved
 * to the database. Used both by scoreLeadEngagement() (saved leads) and by
 * the Seamless.AI search preview (unsaved candidates, scored before the user
 * decides whether to enrich/save them).
 */
export async function computeEngagementMetrics(
  linkedinUrl?: string | null,
  ownerName?: string | null,
  companyName?: string | null,
  website?: string | null
): Promise<{ score: number; metrics: EngagementMetrics }> {
  const metrics: EngagementMetrics = {
    scoredAt: new Date().toISOString(),
  };

  // 1. Score LinkedIn (primary signal — uses reliable built-in API)
  let username = linkedinUrl ? extractLinkedInUsername(linkedinUrl) : null;

  // If no LinkedIn URL, try searching by name
  if (!username && ownerName) {
    username = await searchLinkedInByName(ownerName, companyName || undefined);
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

  // 2. Score Website (secondary signal) — strict validation
  if (website) {
    metrics.website = { exists: false, loadsSuccessfully: false, hasSocialLinks: false };
    try {
      const websiteUrl = website.startsWith("http") ? website : `https://${website}`;
      const response = await fetch(websiteUrl, {
        signal: AbortSignal.timeout(3000),
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });

      // Only count as loading if we get a real 2xx response
      if (response.ok) {
        const html = await response.text();
        const htmlLower = html.toLowerCase();
        const contentLength = html.length;

        // Detect parked/dead/placeholder domains
        const parkedIndicators = [
          "domain is for sale", "buy this domain", "this domain is parked",
          "domain parking", "godaddy", "sedoparking", "hugedomains",
          "this page is under construction", "coming soon", "website expired",
          "account suspended", "account has been suspended",
          "default web page", "apache2 default page", "welcome to nginx",
          "domain has expired", "renewal grace period",
          "this site can't be reached", "page not found",
          "namecheap", "register.com", "afternic"
        ];

        const isParked = parkedIndicators.some(indicator => htmlLower.includes(indicator));
        const isTooShort = contentLength < 500; // Real websites have more than 500 chars of HTML
        const hasNoBody = !htmlLower.includes("<body") || (htmlLower.includes("<body") && html.replace(/<[^>]*>/g, "").trim().length < 50);

        if (!isParked && !isTooShort && !hasNoBody) {
          // This looks like a real, functioning website
          metrics.website.exists = true;
          metrics.website.loadsSuccessfully = true;

          // Check for real social media links (not just mentions in scripts/ads)
          const socialPatterns = [
            /href=["'][^"']*instagram\.com\/[a-zA-Z0-9_.]+/i,
            /href=["'][^"']*linkedin\.com\/(in|company)\/[a-zA-Z0-9_-]+/i,
            /href=["'][^"']*facebook\.com\/[a-zA-Z0-9_.]+/i,
            /href=["'][^"']*twitter\.com\/[a-zA-Z0-9_]+/i,
            /href=["'][^"']*x\.com\/[a-zA-Z0-9_]+/i,
          ];
          metrics.website.hasSocialLinks = socialPatterns.some(pattern => pattern.test(html));
        } else {
          // Parked or placeholder domain — website field has a URL but it's not a real site
          metrics.website.exists = true; // URL exists in lead data
          metrics.website.loadsSuccessfully = false;
          metrics.website.hasSocialLinks = false;
        }
      } else {
        // Got a non-OK status (4xx, 5xx) — website doesn't load
        metrics.website.exists = true; // URL exists in lead data
        metrics.website.loadsSuccessfully = false;
      }
    } catch (err: any) {
      // DNS failure, timeout, connection refused — website is truly unreachable
      metrics.website.exists = true; // URL exists in lead data but doesn't work
      metrics.website.loadsSuccessfully = false;
      metrics.website.hasSocialLinks = false;
    }
  }

  const score = calculateScore(metrics);
  return { score, metrics };
}

/**
 * Score a single lead's engagement based on their LinkedIn profile and website.
 * Updates the lead's engagementScore and engagementData in the database.
 */
export async function scoreLeadEngagement(leadId: number): Promise<{ score: number; metrics: EngagementMetrics }> {
  const lead = await db.getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const { score, metrics } = await computeEngagementMetrics(lead.linkedinUrl, lead.ownerName, lead.companyName, lead.website);

  // Update lead in database
  await db.updateLeadEngagement(leadId, score, metrics);

  // Also update the socialMediaScore field for the High/Low badge
  const socialScore = score >= 30 ? "high" : "low";
  await db.updateLead(leadId, { socialMediaScore: socialScore });

  return { score, metrics };
}

/**
 * Score multiple leads in batch (parallel processing with rate limiting).
 * Processes 3 leads in parallel at a time to balance speed and API rate limits.
 */
export async function scoreLeadsBatch(leadIds: number[]): Promise<{ scored: number; errors: number }> {
  let scored = 0;
  let errors = 0;
  const batchSize = 3; // Process 3 leads in parallel

  for (let i = 0; i < leadIds.length; i += batchSize) {
    const batch = leadIds.slice(i, i + batchSize);
    
    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(leadId => scoreLeadEngagement(leadId))
    );

    // Count successes and failures
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        scored++;
      } else {
        errors++;
        console.error(`[Engagement] Batch scoring failed:`, result.reason?.message || result.reason);
      }
    });

    // Rate limit: wait 500ms between batches (not between individual leads)
    if (i + batchSize < leadIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { scored, errors };
}
