import { callDataApi } from "./_core/dataApi";

export interface WebsiteInsights {
  domain: string;
  totalVisits: number | null;
  uniqueVisitors: number | null;
  bounceRate: number | null;
  globalRank: number | null;
  topKeywords: Array<{
    keyword: string;
    trafficShare: number;
    position: number;
    source: "organic" | "paid";
  }>;
  trafficSources: {
    organic: number;
    paid: number;
    direct: number;
    referral: number;
    social: number;
    email: number;
    display: number;
  } | null;
  topLandingPages: Array<{
    url: string;
    trafficShare: number;
    keywords: number;
  }>;
  analysisDate: string;
  errors: string[];
}

/**
 * Extract clean domain from a URL (removes protocol, www, path)
 */
function extractDomain(urlOrDomain: string): string {
  let domain = urlOrDomain.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");
  // Remove www.
  domain = domain.replace(/^www\./, "");
  // Remove path, query, hash
  domain = domain.split("/")[0].split("?")[0].split("#")[0];
  return domain;
}

/**
 * Analyze a website using SimilarWeb APIs and return comprehensive insights
 */
export async function analyzeWebsite(websiteUrl: string): Promise<WebsiteInsights> {
  const domain = extractDomain(websiteUrl);
  const errors: string[] = [];

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const startDate = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}`;
  const endDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  let totalVisits: number | null = null;
  let uniqueVisitors: number | null = null;
  let bounceRate: number | null = null;
  let globalRank: number | null = null;
  let topKeywords: WebsiteInsights["topKeywords"] = [];
  let trafficSources: WebsiteInsights["trafficSources"] = null;
  let topLandingPages: WebsiteInsights["topLandingPages"] = [];

  // 1. Get total visits
  try {
    const visitsResult = await callDataApi("Similarweb/get_visits_total", {
      pathParams: { domain },
      query: {
        country: "world",
        granularity: "monthly",
        main_domain_only: false,
        start_date: startDate,
        end_date: endDate,
      },
    }) as any;

    if (visitsResult && Array.isArray(visitsResult)) {
      // Get the most recent month's data
      const latest = visitsResult[visitsResult.length - 1];
      totalVisits = latest?.visits || null;
    } else if (visitsResult?.visits) {
      totalVisits = visitsResult.visits;
    }
  } catch (e: any) {
    errors.push(`Total visits: ${e.message}`);
  }

  // 2. Get bounce rate
  try {
    const bounceResult = await callDataApi("Similarweb/get_bounce_rate", {
      pathParams: { domain },
      query: {
        country: "world",
        granularity: "monthly",
        main_domain_only: false,
        start_date: startDate,
        end_date: endDate,
      },
    }) as any;

    if (bounceResult && Array.isArray(bounceResult)) {
      const latest = bounceResult[bounceResult.length - 1];
      bounceRate = latest?.bounce_rate || latest?.value || null;
    } else if (bounceResult?.bounce_rate !== undefined) {
      bounceRate = bounceResult.bounce_rate;
    }
  } catch (e: any) {
    errors.push(`Bounce rate: ${e.message}`);
  }

  // 3. Get global rank
  try {
    const rankResult = await callDataApi("Similarweb/get_global_rank", {
      pathParams: { domain },
      query: {
        main_domain_only: false,
        start_date: startDate,
        end_date: endDate,
      },
    }) as any;

    if (rankResult && Array.isArray(rankResult)) {
      const latest = rankResult[rankResult.length - 1];
      globalRank = latest?.global_rank || latest?.rank || null;
    } else if (rankResult?.global_rank !== undefined) {
      globalRank = rankResult.global_rank;
    }
  } catch (e: any) {
    errors.push(`Global rank: ${e.message}`);
  }

  // 4. Get top keywords
  try {
    const keywordsResult = await callDataApi("Similarweb/website_analysis_keywords", {
      pathParams: { domain },
      query: {
        domain,
        country: "ww",
        web_source: "total",
        traffic_source: "all",
        branded_type: "all",
        granularity: "monthly",
        limit: "10",
        offset: "0",
        start_date: startDate,
        end_date: endDate,
      },
    }) as any;

    if (keywordsResult && Array.isArray(keywordsResult)) {
      topKeywords = keywordsResult.slice(0, 10).map((kw: any) => ({
        keyword: kw.keyword || kw.search_term || "",
        trafficShare: kw.traffic_share || kw.share || 0,
        position: kw.position || kw.avg_position || 0,
        source: kw.traffic_source === "paid" ? "paid" as const : "organic" as const,
      }));
    } else if (keywordsResult?.data && Array.isArray(keywordsResult.data)) {
      topKeywords = keywordsResult.data.slice(0, 10).map((kw: any) => ({
        keyword: kw.keyword || kw.search_term || "",
        trafficShare: kw.traffic_share || kw.share || 0,
        position: kw.position || kw.avg_position || 0,
        source: kw.traffic_source === "paid" ? "paid" as const : "organic" as const,
      }));
    }
  } catch (e: any) {
    errors.push(`Keywords: ${e.message}`);
  }

  // 5. Get traffic sources breakdown
  try {
    const sourcesResult = await callDataApi("Similarweb/get_traffic_sources_desktop", {
      pathParams: { domain },
      query: {
        country: "world",
        granularity: "monthly",
        main_domain_only: false,
        start_date: startDate,
        end_date: endDate,
      },
    }) as any;

    if (sourcesResult) {
      // SimilarWeb returns traffic sources as an object or array
      const parseSource = (data: any) => {
        if (Array.isArray(data)) {
          // Get the latest month
          const latest = data[data.length - 1];
          return latest;
        }
        return data;
      };

      const sources = parseSource(sourcesResult);
      if (sources) {
        trafficSources = {
          organic: sources.organic_search || sources["Organic Search"] || 0,
          paid: sources.paid_search || sources["Paid Search"] || 0,
          direct: sources.direct || sources["Direct"] || 0,
          referral: sources.referrals || sources["Referrals"] || 0,
          social: sources.social || sources["Social"] || 0,
          email: sources.email || sources["Email"] || 0,
          display: sources.display_ads || sources["Display Ads"] || 0,
        };
      }
    }
  } catch (e: any) {
    errors.push(`Traffic sources: ${e.message}`);
  }

  // 6. Get top landing pages
  try {
    const landingResult = await callDataApi("Similarweb/keywords_landing_pages", {
      query: {
        domain,
        country: "ww",
        web_source: "total",
        traffic_source: "organic",
        limit: "5",
        granularity: "monthly",
        start_date: endDate,
        end_date: endDate,
      },
    }) as any;

    if (landingResult && Array.isArray(landingResult)) {
      topLandingPages = landingResult.slice(0, 5).map((page: any) => ({
        url: page.url || page.page || "",
        trafficShare: page.traffic_share || page.share || 0,
        keywords: page.keywords || page.keyword_count || 0,
      }));
    } else if (landingResult?.data && Array.isArray(landingResult.data)) {
      topLandingPages = landingResult.data.slice(0, 5).map((page: any) => ({
        url: page.url || page.page || "",
        trafficShare: page.traffic_share || page.share || 0,
        keywords: page.keywords || page.keyword_count || 0,
      }));
    }
  } catch (e: any) {
    errors.push(`Landing pages: ${e.message}`);
  }

  return {
    domain,
    totalVisits,
    uniqueVisitors,
    bounceRate,
    globalRank,
    topKeywords,
    trafficSources,
    topLandingPages,
    analysisDate: new Date().toISOString(),
    errors,
  };
}

/**
 * Generate a human-readable summary of website insights for Claude to use in email personalization
 */
export function generateInsightsSummary(insights: WebsiteInsights): string {
  const parts: string[] = [];

  parts.push(`Website: ${insights.domain}`);

  if (insights.totalVisits !== null) {
    const formatted = insights.totalVisits >= 1000000
      ? `${(insights.totalVisits / 1000000).toFixed(1)}M`
      : insights.totalVisits >= 1000
      ? `${(insights.totalVisits / 1000).toFixed(1)}K`
      : `${insights.totalVisits}`;
    parts.push(`Monthly Traffic: ~${formatted} visits`);
  }

  if (insights.bounceRate !== null) {
    const pct = insights.bounceRate > 1 ? insights.bounceRate : insights.bounceRate * 100;
    parts.push(`Bounce Rate: ${pct.toFixed(1)}% ${pct > 60 ? "(HIGH - visitors leaving quickly)" : pct > 40 ? "(moderate)" : "(good)"}`);
  }

  if (insights.globalRank !== null) {
    parts.push(`Global Rank: #${insights.globalRank.toLocaleString()}`);
  }

  if (insights.trafficSources) {
    const ts = insights.trafficSources;
    const total = ts.organic + ts.paid + ts.direct + ts.referral + ts.social + ts.email + ts.display;
    if (total > 0) {
      const organicPct = ((ts.organic / total) * 100).toFixed(0);
      const paidPct = ((ts.paid / total) * 100).toFixed(0);
      const socialPct = ((ts.social / total) * 100).toFixed(0);
      const directPct = ((ts.direct / total) * 100).toFixed(0);
      parts.push(`Traffic Sources: ${organicPct}% organic search, ${paidPct}% paid, ${socialPct}% social, ${directPct}% direct`);

      // Identify weaknesses
      const weaknesses: string[] = [];
      if (parseFloat(organicPct) < 20) weaknesses.push("very low organic search traffic (SEO opportunity)");
      if (parseFloat(socialPct) < 5) weaknesses.push("minimal social media presence");
      if (parseFloat(paidPct) > 50) weaknesses.push("over-reliant on paid ads (expensive, not sustainable)");
      if (weaknesses.length > 0) {
        parts.push(`Traffic Weaknesses: ${weaknesses.join(", ")}`);
      }
    }
  }

  if (insights.topKeywords.length > 0) {
    const kwList = insights.topKeywords.slice(0, 5).map(kw => kw.keyword).join(", ");
    parts.push(`Top Keywords: ${kwList}`);
    
    // Check if they're ranking well
    const lowRanking = insights.topKeywords.filter(kw => kw.position > 10);
    if (lowRanking.length > 0) {
      parts.push(`SEO Opportunity: ${lowRanking.length} keywords ranking below page 1 (positions 10+)`);
    }
  }

  if (insights.topLandingPages.length > 0) {
    const pages = insights.topLandingPages.slice(0, 3).map(p => p.url).join(", ");
    parts.push(`Top Pages: ${pages}`);
  }

  // Overall assessment
  const issues: string[] = [];
  if (insights.bounceRate !== null) {
    const pct = insights.bounceRate > 1 ? insights.bounceRate : insights.bounceRate * 100;
    if (pct > 60) issues.push("high bounce rate indicates poor user engagement or irrelevant traffic");
  }
  if (insights.totalVisits !== null && insights.totalVisits < 5000) {
    issues.push("low traffic volume suggests untapped growth potential");
  }
  if (insights.topKeywords.length < 5) {
    issues.push("limited keyword visibility means they're missing search traffic");
  }
  if (insights.trafficSources) {
    const ts = insights.trafficSources;
    const total = ts.organic + ts.paid + ts.direct + ts.referral + ts.social + ts.email + ts.display;
    if (total > 0 && (ts.organic / total) < 0.2) {
      issues.push("weak organic presence means they're leaving free traffic on the table");
    }
  }

  if (issues.length > 0) {
    parts.push(`\nKEY ISSUES Virtual Assistant Group can help with:\n${issues.map(i => `- ${i}`).join("\n")}`);
  }

  return parts.join("\n");
}
