import { describe, expect, it, vi } from "vitest";
import { generateInsightsSummary } from "./websiteAnalysis";
import type { WebsiteInsights } from "./websiteAnalysis";

describe("websiteAnalysis", () => {
  describe("generateInsightsSummary", () => {
    it("generates a summary with all available data", () => {
      const insights: WebsiteInsights = {
        domain: "example.com",
        totalVisits: 15000,
        uniqueVisitors: null,
        bounceRate: 0.65,
        globalRank: 250000,
        topKeywords: [
          { keyword: "virtual assistant", trafficShare: 0.3, position: 5, source: "organic" },
          { keyword: "remote work", trafficShare: 0.2, position: 12, source: "organic" },
          { keyword: "admin support", trafficShare: 0.1, position: 8, source: "paid" },
        ],
        trafficSources: {
          organic: 30,
          paid: 20,
          direct: 25,
          referral: 10,
          social: 5,
          email: 5,
          display: 5,
        },
        topLandingPages: [
          { url: "/services", trafficShare: 0.4, keywords: 12 },
          { url: "/about", trafficShare: 0.2, keywords: 5 },
        ],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("example.com");
      expect(summary).toContain("15.0K");
      expect(summary).toContain("65.0%");
      expect(summary).toContain("HIGH");
      expect(summary).toContain("#250,000");
      expect(summary).toContain("virtual assistant");
      expect(summary).toContain("remote work");
      expect(summary).toContain("30%");
      expect(summary).toContain("/services");
    });

    it("handles null values gracefully", () => {
      const insights: WebsiteInsights = {
        domain: "nodata.com",
        totalVisits: null,
        uniqueVisitors: null,
        bounceRate: null,
        globalRank: null,
        topKeywords: [],
        trafficSources: null,
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: ["Total visits: API error"],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("nodata.com");
      expect(summary).not.toContain("Monthly Traffic");
      expect(summary).not.toContain("Bounce Rate");
      expect(summary).not.toContain("Global Rank");
      expect(summary).toContain("limited keyword visibility");
    });

    it("identifies low traffic as an issue", () => {
      const insights: WebsiteInsights = {
        domain: "smallsite.com",
        totalVisits: 500,
        uniqueVisitors: null,
        bounceRate: 0.45,
        globalRank: null,
        topKeywords: [
          { keyword: "test", trafficShare: 0.5, position: 3, source: "organic" },
        ],
        trafficSources: null,
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("low traffic volume");
      expect(summary).toContain("untapped growth potential");
    });

    it("identifies high bounce rate as an issue", () => {
      const insights: WebsiteInsights = {
        domain: "bouncy.com",
        totalVisits: 50000,
        uniqueVisitors: null,
        bounceRate: 75, // percentage format (>1)
        globalRank: null,
        topKeywords: [
          { keyword: "a", trafficShare: 0.1, position: 1, source: "organic" },
          { keyword: "b", trafficShare: 0.1, position: 2, source: "organic" },
          { keyword: "c", trafficShare: 0.1, position: 3, source: "organic" },
          { keyword: "d", trafficShare: 0.1, position: 4, source: "organic" },
          { keyword: "e", trafficShare: 0.1, position: 5, source: "organic" },
        ],
        trafficSources: null,
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("75.0%");
      expect(summary).toContain("HIGH");
      expect(summary).toContain("poor user engagement");
    });

    it("identifies weak organic traffic as an issue", () => {
      const insights: WebsiteInsights = {
        domain: "paidonly.com",
        totalVisits: 20000,
        uniqueVisitors: null,
        bounceRate: 0.35,
        globalRank: null,
        topKeywords: [
          { keyword: "a", trafficShare: 0.1, position: 1, source: "organic" },
          { keyword: "b", trafficShare: 0.1, position: 2, source: "organic" },
          { keyword: "c", trafficShare: 0.1, position: 3, source: "organic" },
          { keyword: "d", trafficShare: 0.1, position: 4, source: "organic" },
          { keyword: "e", trafficShare: 0.1, position: 5, source: "organic" },
        ],
        trafficSources: {
          organic: 5,
          paid: 60,
          direct: 20,
          referral: 10,
          social: 3,
          email: 1,
          display: 1,
        },
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("weak organic presence");
      expect(summary).toContain("free traffic");
    });

    it("formats large traffic numbers correctly", () => {
      const insights: WebsiteInsights = {
        domain: "bigsite.com",
        totalVisits: 2500000,
        uniqueVisitors: null,
        bounceRate: null,
        globalRank: null,
        topKeywords: [],
        trafficSources: null,
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("2.5M");
    });

    it("identifies keywords ranking below page 1", () => {
      const insights: WebsiteInsights = {
        domain: "seowork.com",
        totalVisits: 10000,
        uniqueVisitors: null,
        bounceRate: null,
        globalRank: null,
        topKeywords: [
          { keyword: "good keyword", trafficShare: 0.3, position: 3, source: "organic" },
          { keyword: "needs work", trafficShare: 0.2, position: 15, source: "organic" },
          { keyword: "also needs work", trafficShare: 0.1, position: 22, source: "organic" },
          { keyword: "another one", trafficShare: 0.1, position: 18, source: "organic" },
          { keyword: "ok keyword", trafficShare: 0.1, position: 7, source: "organic" },
        ],
        trafficSources: null,
        topLandingPages: [],
        analysisDate: new Date().toISOString(),
        errors: [],
      };

      const summary = generateInsightsSummary(insights);

      expect(summary).toContain("SEO Opportunity");
      expect(summary).toContain("3 keywords ranking below page 1");
    });
  });
});
