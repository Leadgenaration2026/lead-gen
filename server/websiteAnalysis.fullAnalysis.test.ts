import { describe, it, expect, vi } from "vitest";

vi.mock("./_core/dataApi", () => ({
  makeRequest: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          competitors: [
            { domain: "competitor1.com", totalVisits: 50000, bounceRate: 0.35, globalRank: 15000, topKeywords: ["seo", "marketing"] },
          ],
          competitorGaps: [
            { area: "Content Marketing", competitorAdvantage: "Publishes 5 blog posts per week", recommendation: "VAG content VAs can create weekly blog content", impact: "high" },
          ],
          recentNews: [
            { title: "Industry sees 30% growth", source: "TechCrunch", date: "2026-06-01", relevance: "Company should capitalize" },
          ],
          industryInsights: "The industry is shifting towards AI-powered automation."
        })
      }
    }]
  }),
}));

describe("Full Website Analysis", () => {
  it("should export fullWebsiteAnalysis function", async () => {
    const mod = await import("./websiteAnalysis");
    expect(mod.fullWebsiteAnalysis).toBeDefined();
    expect(typeof mod.fullWebsiteAnalysis).toBe("function");
  });

  it("should export analyzeWebsite function", async () => {
    const mod = await import("./websiteAnalysis");
    expect(mod.analyzeWebsite).toBeDefined();
    expect(typeof mod.analyzeWebsite).toBe("function");
  });

  it("should export generateInsightsSummary function", async () => {
    const mod = await import("./websiteAnalysis");
    expect(mod.generateInsightsSummary).toBeDefined();
    expect(typeof mod.generateInsightsSummary).toBe("function");
  });

  it("should export analyzeCompetitors function", async () => {
    const mod = await import("./websiteAnalysis");
    expect(mod.analyzeCompetitors).toBeDefined();
    expect(typeof mod.analyzeCompetitors).toBe("function");
  });

  it("should export fetchIndustryInsights function", async () => {
    const mod = await import("./websiteAnalysis");
    expect(mod.fetchIndustryInsights).toBeDefined();
    expect(typeof mod.fetchIndustryInsights).toBe("function");
  });

  it("generateInsightsSummary should return a string with domain name", async () => {
    const { generateInsightsSummary } = await import("./websiteAnalysis");
    const mockInsights = {
      domain: "example.com",
      totalVisits: 5000,
      uniqueVisitors: 3000,
      bounceRate: 0.65,
      globalRank: 500000,
      topKeywords: [
        { keyword: "test", trafficShare: 0.2, position: 5, source: "organic" as const },
      ],
      trafficSources: {
        organic: 30,
        paid: 10,
        direct: 40,
        referral: 10,
        social: 5,
        email: 3,
        display: 2,
      },
      topLandingPages: [
        { url: "/", trafficShare: 0.5, keywords: 10 },
      ],
      analysisDate: new Date().toISOString(),
      errors: [],
    };
    const summary = generateInsightsSummary(mockInsights);
    expect(summary).toContain("example.com");
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(50);
  });

  it("db helpers for websiteInsights should be defined", async () => {
    const db = await import("./db");
    expect(db.upsertWebsiteInsights).toBeDefined();
    expect(db.getWebsiteInsights).toBeDefined();
    expect(typeof db.upsertWebsiteInsights).toBe("function");
    expect(typeof db.getWebsiteInsights).toBe("function");
  });
});
