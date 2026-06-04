import { describe, it, expect } from "vitest";
import { generateEmailWithClaude } from "./claude";

describe("Claude Email Generation (Live)", () => {
  it("should generate a plain text email with bullet points, CTA, and Claude metadata", async () => {
    const result = await generateEmailWithClaude({
      prompt: "We help small businesses save 10 hours per week with our virtual assistant services",
      emailType: "value_prop",
      includeVariables: false,
    });

    // Verify metadata
    expect(result.generatedBy).toBe("claude");
    expect(result.model).toBe("claude-sonnet-4-6");

    // Subject line
    expect(result.subject).toBeDefined();
    expect(result.subject.length).toBeLessThanOrEqual(50);

    // Body is plain text
    expect(result.body).toBeDefined();
    expect(result.body).toContain("•"); // Has bullet points
    expect(result.body).toContain("calendly.com"); // Has CTA link

    // Should NOT contain HTML tags
    expect(result.body).not.toContain("<p>");
    expect(result.body).not.toContain("<ul>");
    expect(result.body).not.toContain("<li>");
    expect(result.body).not.toContain("<a ");
    expect(result.body).not.toContain("</p>");

    // Should not contain template variables
    expect(result.body).not.toContain("{{ownerName}}");
  }, 30000);

  it("should generate a template with variables when includeVariables is true", async () => {
    const result = await generateEmailWithClaude({
      prompt: "We provide AI-powered lead generation that helps agencies get 3x more qualified leads",
      emailType: "discovery",
      includeVariables: true,
    });

    // Verify metadata
    expect(result.generatedBy).toBe("claude");
    expect(result.model).toBe("claude-sonnet-4-6");

    // Body checks
    expect(result.body).toBeDefined();
    expect(result.body).toContain("•"); // Has bullet points

    // Should NOT contain HTML tags
    expect(result.body).not.toContain("<p>");
    expect(result.body).not.toContain("<ul>");
    expect(result.body).not.toContain("<li>");

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

    // Verify metadata
    expect(result.generatedBy).toBe("claude");

    // Body checks
    expect(result.body).toBeDefined();
    expect(result.body).toContain("•"); // Has bullet points

    // Should NOT contain HTML
    expect(result.body).not.toContain("<p>");
    expect(result.body).not.toContain("<ul>");

    // Should reference the lead's info
    const isPersonalized = result.body.includes("Sarah") || 
                           result.body.includes("TechFlow") ||
                           result.body.includes("SaaS");
    expect(isPersonalized).toBe(true);
  }, 30000);
});
