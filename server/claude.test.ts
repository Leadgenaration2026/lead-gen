import { describe, it, expect } from "vitest";
import { generateEmailWithClaude } from "./claude";

describe("Claude Email Generation (Live)", () => {
  it("should generate a professional email with bullet points and CTA", async () => {
    const result = await generateEmailWithClaude({
      prompt: "We help small businesses save 10 hours per week with our virtual assistant services",
      emailType: "value_prop",
      includeVariables: false,
    });

    expect(result.subject).toBeDefined();
    expect(result.subject.length).toBeLessThanOrEqual(50);
    expect(result.body).toBeDefined();
    expect(result.body).toContain("<li");
    expect(result.body).toContain("calendly.com");
    // Should not contain template variables
    expect(result.body).not.toContain("{{ownerName}}");
  }, 30000);

  it("should generate a template with variables when includeVariables is true", async () => {
    const result = await generateEmailWithClaude({
      prompt: "We provide AI-powered lead generation that helps agencies get 3x more qualified leads",
      emailType: "discovery",
      includeVariables: true,
    });

    expect(result.subject).toBeDefined();
    expect(result.body).toBeDefined();
    expect(result.body).toContain("<li");
    // Should contain template variables
    const hasVariables = result.body.includes("{{ownerName}}") || 
                         result.body.includes("{{companyName}}") || 
                         result.body.includes("{{ctaLink}}");
    expect(hasVariables).toBe(true);
  }, 30000);

  it("should personalize when lead context is provided", async () => {
    const result = await generateEmailWithClaude({
      prompt: "We help reduce customer churn with AI-powered retention tools",
      emailType: "social_proof",
      leadContext: "Name: Sarah Johnson, Company: TechFlow Inc, Industry: SaaS, Email: sarah@techflow.io",
      includeVariables: false,
    });

    expect(result.subject).toBeDefined();
    expect(result.body).toBeDefined();
    expect(result.body).toContain("<li");
    // Should reference the lead's info
    const isPersonalized = result.body.includes("Sarah") || 
                           result.body.includes("TechFlow") ||
                           result.body.includes("SaaS");
    expect(isPersonalized).toBe(true);
  }, 30000);
});
