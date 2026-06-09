import { invokeLLM } from "./_core/llm";

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

export interface CompetitorData {
  domain: string;
  totalVisits: number | null;
  bounceRate: number | null;
  topKeywords: string[];
}

export interface CompetitorGap {
  area: string;
  competitorAdvantage: string;
  vagSolution: string;
}

/**
 * Extract clean domain from a URL (removes protocol, www, path)
 */
function extractDomain(urlOrDomain: string): string {
  let domain = urlOrDomain.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.split("/")[0].split("?")[0].split("#")[0];
  return domain;
}

/**
 * AI-powered website analysis using LLM to research and analyze a website.
 * Replaces SimilarWeb API dependency - works for any website regardless of traffic level.
 */
export async function analyzeWebsite(websiteUrl: string): Promise<WebsiteInsights> {
  const domain = extractDomain(websiteUrl);
  const errors: string[] = [];

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert digital marketing analyst and SEO specialist. Analyze the given website domain and provide realistic estimates based on your knowledge of the industry, company size, and typical metrics for similar businesses. Be specific and data-driven in your estimates. If you know the company, use real data. If not, provide reasonable estimates based on the industry and company type.`
        },
        {
          role: "user",
          content: `Analyze the website: ${domain}

Based on your knowledge of this company/website, provide:
1. Estimated monthly traffic (total visits and unique visitors)
2. Estimated bounce rate (as decimal 0-1)
3. Estimated global rank
4. Top 5 likely keywords they rank for (with estimated positions and traffic share)
5. Traffic source breakdown (organic, paid, direct, referral, social, email, display - as percentages totaling 100)
6. Top 3 landing pages

Return ONLY valid JSON. If you cannot determine specific data, provide your best estimates. Never return all nulls.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "website_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              totalVisits: { type: "number", description: "Estimated monthly visits" },
              uniqueVisitors: { type: "number", description: "Estimated unique monthly visitors" },
              bounceRate: { type: "number", description: "Bounce rate as decimal 0-1" },
              globalRank: { type: "number", description: "Estimated global rank" },
              topKeywords: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    trafficShare: { type: "number" },
                    position: { type: "number" },
                    source: { type: "string" }
                  },
                  required: ["keyword", "trafficShare", "position", "source"],
                  additionalProperties: false
                }
              },
              trafficSources: {
                type: "object",
                properties: {
                  organic: { type: "number" },
                  paid: { type: "number" },
                  direct: { type: "number" },
                  referral: { type: "number" },
                  social: { type: "number" },
                  email: { type: "number" },
                  display: { type: "number" }
                },
                required: ["organic", "paid", "direct", "referral", "social", "email", "display"],
                additionalProperties: false
              },
              topLandingPages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    trafficShare: { type: "number" },
                    keywords: { type: "number" }
                  },
                  required: ["url", "trafficShare", "keywords"],
                  additionalProperties: false
                }
              }
            },
            required: ["totalVisits", "uniqueVisitors", "bounceRate", "globalRank", "topKeywords", "trafficSources", "topLandingPages"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        domain,
        totalVisits: parsed.totalVisits,
        uniqueVisitors: parsed.uniqueVisitors,
        bounceRate: parsed.bounceRate,
        globalRank: parsed.globalRank,
        topKeywords: (parsed.topKeywords || []).map((kw: any) => ({
          ...kw,
          source: kw.source === "paid" ? "paid" as const : "organic" as const,
        })),
        trafficSources: parsed.trafficSources || null,
        topLandingPages: parsed.topLandingPages || [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };
    }
  } catch (e: any) {
    errors.push(`AI analysis failed: ${e.message}`);
  }

  return {
    domain,
    totalVisits: null,
    uniqueVisitors: null,
    bounceRate: null,
    globalRank: null,
    topKeywords: [],
    trafficSources: null,
    topLandingPages: [],
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

/**
 * AI-powered competitor analysis - identifies real competitors and analyzes gaps.
 * No paid API dependency - uses LLM knowledge to identify competitors.
 */
export async function analyzeCompetitors(domain: string): Promise<{
  competitors: CompetitorData[];
  gaps: CompetitorGap[];
}> {
  const cleanDomain = extractDomain(domain);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a competitive intelligence analyst. Given a company's website domain, identify their top 3 direct competitors and analyze competitive gaps. Be specific - use real competitor names and domains that actually compete in the same market. Provide realistic traffic estimates.`
        },
        {
          role: "user",
          content: `Analyze competitors for: ${cleanDomain}

Identify their top 3 direct competitors (real companies that compete for the same customers).
For each competitor, provide:
- Their actual domain name
- Estimated monthly traffic
- Estimated bounce rate (decimal 0-1)
- Their top 3 keywords they rank for

Also identify 3 specific competitive gaps where competitors have an advantage over ${cleanDomain}.
For each gap, explain what the competitor does better and how a virtual assistant/growth service could help close it.

Return ONLY valid JSON.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "competitor_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              competitors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    domain: { type: "string" },
                    totalVisits: { type: "number" },
                    bounceRate: { type: "number" },
                    topKeywords: { type: "array", items: { type: "string" } }
                  },
                  required: ["domain", "totalVisits", "bounceRate", "topKeywords"],
                  additionalProperties: false
                }
              },
              gaps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string" },
                    competitorAdvantage: { type: "string" },
                    vagSolution: { type: "string" }
                  },
                  required: ["area", "competitorAdvantage", "vagSolution"],
                  additionalProperties: false
                }
              }
            },
            required: ["competitors", "gaps"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        competitors: parsed.competitors || [],
        gaps: parsed.gaps || [],
      };
    }
  } catch (e: any) {
    console.warn("[WebsiteAnalysis] AI competitor analysis failed:", e.message);
  }

  return { competitors: [], gaps: [] };
}

/**
 * AI-powered industry insights and news generation
 */
export async function fetchIndustryInsights(companyName: string, industry: string, domain: string): Promise<{
  recentNews: Array<{ title: string; relevance: string; angle: string }>;
  industryInsights: string[];
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a business intelligence analyst specializing in ${industry}. Generate realistic and relevant recent industry news and insights that would be applicable to a company in this space. These will be used to personalize outreach emails. Make them specific, timely, and actionable. Reference real trends, technologies, and market shifts happening in 2024-2025.`
        },
        {
          role: "user",
          content: `Generate industry intelligence for ${companyName} (${domain}) in the ${industry} industry.

Provide:
1. 3 recent industry news/trends (reference real market shifts, regulatory changes, or technology trends)
2. 3 key industry insights about challenges/opportunities

For each news item, explain:
- The headline/trend
- Why it's relevant to THIS specific company
- How a virtual assistant/growth service could help them capitalize on or respond to this trend

Return ONLY valid JSON.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "industry_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recentNews: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    relevance: { type: "string" },
                    angle: { type: "string" }
                  },
                  required: ["title", "relevance", "angle"],
                  additionalProperties: false
                }
              },
              industryInsights: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["recentNews", "industryInsights"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        recentNews: parsed.recentNews || [],
        industryInsights: parsed.industryInsights || [],
      };
    }
  } catch (e: any) {
    console.warn("[WebsiteAnalysis] Failed to fetch industry insights:", e.message);
  }

  return { recentNews: [], industryInsights: [] };
}

/**
 * Full analysis: website + competitors + news (for auto-analyze on lead import)
 * All AI-powered - no paid API dependencies required
 */
export async function fullWebsiteAnalysis(domain: string, companyName: string, industry: string): Promise<{
  insights: WebsiteInsights;
  competitors: CompetitorData[];
  competitorGaps: CompetitorGap[];
  recentNews: Array<{ title: string; relevance: string; angle: string }>;
  industryInsights: string[];
  summary: string;
}> {
  // Run all analyses in parallel
  const [insights, competitorResult, newsResult] = await Promise.all([
    analyzeWebsite(domain),
    analyzeCompetitors(domain),
    fetchIndustryInsights(companyName, industry || "general business", domain),
  ]);

  // Generate enhanced summary including competitor and news data
  const baseSummary = generateInsightsSummary(insights);
  let enhancedSummary = baseSummary;

  if (competitorResult.competitors.length > 0) {
    enhancedSummary += "\n\nCOMPETITOR ANALYSIS:";
    for (const comp of competitorResult.competitors) {
      enhancedSummary += `\n- ${comp.domain}: ~${formatTraffic(comp.totalVisits)} monthly visits`;
      if (comp.topKeywords.length > 0) {
        enhancedSummary += ` | Top keywords: ${comp.topKeywords.join(", ")}`;
      }
    }
    if (competitorResult.gaps.length > 0) {
      enhancedSummary += "\n\nCOMPETITOR GAPS (what competitors do that this company doesn't):";
      for (const gap of competitorResult.gaps) {
        enhancedSummary += `\n- ${gap.area}: ${gap.competitorAdvantage} → VAG Solution: ${gap.vagSolution}`;
      }
    }
  }

  if (newsResult.recentNews.length > 0) {
    enhancedSummary += "\n\nRECENT INDUSTRY NEWS & TRENDS:";
    for (const news of newsResult.recentNews) {
      enhancedSummary += `\n- ${news.title} (Relevance: ${news.relevance}) → Angle: ${news.angle}`;
    }
  }

  if (newsResult.industryInsights.length > 0) {
    enhancedSummary += "\n\nINDUSTRY INSIGHTS:";
    for (const insight of newsResult.industryInsights) {
      enhancedSummary += `\n- ${insight}`;
    }
  }

  return {
    insights,
    competitors: competitorResult.competitors,
    competitorGaps: competitorResult.gaps,
    recentNews: newsResult.recentNews,
    industryInsights: newsResult.industryInsights,
    summary: enhancedSummary,
  };
}

function formatTraffic(visits: number | null): string {
  if (!visits) return "unknown";
  if (visits >= 1000000) return `${(visits / 1000000).toFixed(1)}M`;
  if (visits >= 1000) return `${(visits / 1000).toFixed(1)}K`;
  return visits.toString();
}
