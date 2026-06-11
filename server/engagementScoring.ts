/**
 * Engagement Scoring System
 * Scores leads based on their social media activity (Instagram, LinkedIn, Facebook).
 * Higher score = more active/influential = should be contacted first.
 * 
 * Score breakdown (0-100):
 * - Instagram presence: up to 40 points (followers, posts, engagement)
 * - LinkedIn presence: up to 35 points (profile completeness, activity indicators)
 * - Facebook presence: up to 15 points
 * - Website presence: up to 10 points
 */

import * as db from "./db";

interface EngagementMetrics {
  instagram?: {
    followers?: number;
    following?: number;
    posts?: number;
    isPublic?: boolean;
    bio?: string;
    engagementRate?: number; // estimated
  };
  linkedin?: {
    hasProfile: boolean;
    connectionCount?: string; // "500+" etc
    hasRecentActivity?: boolean;
  };
  facebook?: {
    hasProfile: boolean;
  };
  website?: {
    exists: boolean;
    hasSocialLinks?: boolean;
  };
  scoredAt: string; // ISO timestamp
}

/**
 * Attempt to scrape basic Instagram profile metrics from a public profile.
 * Uses the public web page (no API key needed for public profiles).
 */
async function scrapeInstagramMetrics(instagramUrl: string): Promise<EngagementMetrics["instagram"] | null> {
  try {
    // Extract username from URL
    let username = "";
    if (instagramUrl.includes("instagram.com/")) {
      username = instagramUrl.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || "";
    }
    if (!username) return null;

    // Try to fetch the profile page
    const response = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[Engagement] Instagram ${username}: HTTP ${response.status}`);
      return { isPublic: false };
    }

    const html = await response.text();

    // Try to extract metrics from meta tags and page content
    let followers: number | undefined;
    let following: number | undefined;
    let posts: number | undefined;
    let bio: string | undefined;

    // Try meta description: "123 Followers, 45 Following, 67 Posts"
    const metaMatch = html.match(/content="([\d,.]+[KkMm]?) Followers, ([\d,.]+[KkMm]?) Following, ([\d,.]+[KkMm]?) Posts/i);
    if (metaMatch) {
      followers = parseMetricNumber(metaMatch[1]);
      following = parseMetricNumber(metaMatch[2]);
      posts = parseMetricNumber(metaMatch[3]);
    }

    // Try og:description
    if (!followers) {
      const ogMatch = html.match(/og:description[^>]*content="([\d,.]+[KkMm]?) Followers/i);
      if (ogMatch) {
        followers = parseMetricNumber(ogMatch[1]);
      }
    }

    // Try JSON-LD or shared data
    if (!followers) {
      const jsonMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
      if (jsonMatch) {
        followers = parseInt(jsonMatch[1]);
      }
    }

    if (!posts) {
      const postsMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/);
      if (postsMatch) {
        posts = parseInt(postsMatch[1]);
      }
    }

    // Extract bio from meta
    const bioMatch = html.match(/property="og:description"[^>]*content="[^"]*?- ([^"]+)"/);
    if (bioMatch) {
      bio = bioMatch[1].substring(0, 200);
    }

    const isPublic = !html.includes("This Account is Private") && !html.includes("is_private\":true");

    // Estimate engagement rate (rough: avg likes per post / followers)
    let engagementRate: number | undefined;
    if (followers && followers > 0 && posts && posts > 0) {
      // Rough estimate: smaller accounts tend to have higher engagement
      if (followers < 1000) engagementRate = 8;
      else if (followers < 10000) engagementRate = 5;
      else if (followers < 100000) engagementRate = 3;
      else engagementRate = 1.5;
    }

    return {
      followers,
      following,
      posts,
      isPublic,
      bio,
      engagementRate,
    };
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
 * Check if a LinkedIn profile URL is valid/accessible
 */
async function checkLinkedInPresence(linkedinUrl: string): Promise<EngagementMetrics["linkedin"] | null> {
  try {
    if (!linkedinUrl) return null;

    // We can't scrape LinkedIn reliably without auth, but we can check if the URL is valid
    // and use the URL structure to infer some info
    const hasProfile = linkedinUrl.includes("linkedin.com/in/");
    
    // Try a HEAD request to check if profile exists
    let profileExists = false;
    try {
      const response = await fetch(linkedinUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      });
      profileExists = response.ok || response.status === 999; // LinkedIn returns 999 for bot detection but profile exists
    } catch {
      profileExists = true; // Assume exists if we can't reach (LinkedIn blocks)
    }

    return {
      hasProfile: hasProfile && profileExists,
      hasRecentActivity: undefined, // Can't determine without auth
    };
  } catch (error: any) {
    console.log(`[Engagement] LinkedIn check failed: ${error.message}`);
    return null;
  }
}

/**
 * Calculate engagement score (0-100) from collected metrics
 */
function calculateScore(metrics: EngagementMetrics): number {
  let score = 0;

  // Instagram scoring (up to 40 points)
  if (metrics.instagram) {
    const ig = metrics.instagram;
    if (ig.isPublic !== false) {
      // Follower-based score (up to 20 points)
      if (ig.followers) {
        if (ig.followers >= 100000) score += 20;
        else if (ig.followers >= 50000) score += 18;
        else if (ig.followers >= 10000) score += 15;
        else if (ig.followers >= 5000) score += 12;
        else if (ig.followers >= 1000) score += 9;
        else if (ig.followers >= 500) score += 6;
        else if (ig.followers >= 100) score += 3;
        else score += 1;
      }

      // Post frequency score (up to 10 points)
      if (ig.posts) {
        if (ig.posts >= 500) score += 10;
        else if (ig.posts >= 200) score += 8;
        else if (ig.posts >= 100) score += 6;
        else if (ig.posts >= 50) score += 4;
        else if (ig.posts >= 10) score += 2;
        else score += 1;
      }

      // Engagement rate bonus (up to 10 points)
      if (ig.engagementRate) {
        if (ig.engagementRate >= 6) score += 10;
        else if (ig.engagementRate >= 4) score += 8;
        else if (ig.engagementRate >= 2) score += 5;
        else score += 3;
      }
    } else {
      // Private account — still has presence (5 points)
      score += 5;
    }
  }

  // LinkedIn scoring (up to 35 points)
  if (metrics.linkedin) {
    if (metrics.linkedin.hasProfile) {
      score += 25; // Having a LinkedIn profile is strong signal for B2B
      if (metrics.linkedin.hasRecentActivity) score += 10;
    }
  }

  // Facebook scoring (up to 15 points)
  if (metrics.facebook?.hasProfile) {
    score += 15;
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
 * Updates the lead's engagementScore and engagementData in the database.
 */
export async function scoreLeadEngagement(leadId: number): Promise<{ score: number; metrics: EngagementMetrics }> {
  const lead = await db.getLeadById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const metrics: EngagementMetrics = {
    scoredAt: new Date().toISOString(),
  };

  // Score Instagram
  if (lead.instagramUrl) {
    const igMetrics = await scrapeInstagramMetrics(lead.instagramUrl);
    if (igMetrics) {
      metrics.instagram = igMetrics;
    }
  }

  // Score LinkedIn
  if (lead.linkedinUrl) {
    const liMetrics = await checkLinkedInPresence(lead.linkedinUrl);
    if (liMetrics) {
      metrics.linkedin = liMetrics;
    }
  }

  // Score Facebook
  if ((lead as any).facebookUrl) {
    metrics.facebook = { hasProfile: true };
  }

  // Score Website
  if (lead.website) {
    metrics.website = { exists: true };
    // Quick check if website has social links
    try {
      const response = await fetch(lead.website, {
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

  return { score, metrics };
}

/**
 * Score multiple leads in batch (with rate limiting to avoid being blocked).
 * Returns the number of leads scored.
 */
export async function scoreLeadsBatch(leadIds: number[]): Promise<{ scored: number; errors: number }> {
  let scored = 0;
  let errors = 0;

  for (const leadId of leadIds) {
    try {
      await scoreLeadEngagement(leadId);
      scored++;
      // Rate limit: wait 2 seconds between requests to avoid being blocked
      if (scored < leadIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`[Engagement] Failed to score lead ${leadId}:`, error.message);
      errors++;
    }
  }

  return { scored, errors };
}
