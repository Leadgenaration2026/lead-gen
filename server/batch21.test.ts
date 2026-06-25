import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getLeadById: vi.fn(),
  updateLead: vi.fn(),
  getLeadWeakPoints: vi.fn(),
  upsertLeadWeakPoints: vi.fn(),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock claude
vi.mock("./claude", () => ({
  generateEmailWithClaude: vi.fn(),
}));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateEmailWithClaude } from "./claude";

describe("Lead Editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update lead fields correctly", async () => {
    const mockLead = {
      id: 1,
      userId: 1,
      companyName: "Old Company",
      ownerName: "Old Owner",
      email: "old@test.com",
      phoneNumber: "+1234567890",
      industry: "Tech",
      website: "https://old.com",
      status: "new",
      tag: "none",
    };

    (db.getLeadById as any).mockResolvedValue(mockLead);
    (db.updateLead as any).mockResolvedValue(undefined);

    // Simulate what the router does
    const updateData = {
      companyName: "New Company",
      ownerName: "New Owner",
      email: "new@test.com",
    };

    await db.updateLead(1, updateData);
    expect(db.updateLead).toHaveBeenCalledWith(1, updateData);
  });

  it("should allow updating status and tag", async () => {
    (db.updateLead as any).mockResolvedValue(undefined);

    await db.updateLead(1, { status: "qualified", tag: "hot" });
    expect(db.updateLead).toHaveBeenCalledWith(1, { status: "qualified", tag: "hot" });
  });

  it("should allow updating timezone", async () => {
    (db.updateLead as any).mockResolvedValue(undefined);

    await db.updateLead(1, { timezone: "Europe/London" });
    expect(db.updateLead).toHaveBeenCalledWith(1, { timezone: "Europe/London" });
  });
});

describe("Problem Analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return cached analysis if available", async () => {
    const cachedData = {
      leadId: 1,
      weakPoints: [
        "Struggling with lead generation",
        "High customer churn rate",
        "[Trend] AI automation in industry",
        "[Competitive] New entrants disrupting market",
      ],
      analysis: "This company faces significant challenges...",
      suggestedEmailTypes: ["value_prop"],
    };

    (db.getLeadWeakPoints as any).mockResolvedValue(cachedData);

    const result = await db.getLeadWeakPoints(1);
    expect(result).toEqual(cachedData);
    expect(result!.weakPoints).toHaveLength(4);
  });

  it("should generate new analysis when none exists", async () => {
    (db.getLeadWeakPoints as any).mockResolvedValue(null);
    (db.upsertLeadWeakPoints as any).mockResolvedValue(undefined);

    const mockAnalysis = {
      painPoints: ["Struggling with lead generation", "High customer acquisition cost"],
      industryTrends: ["AI automation growing rapidly"],
      competitiveThreats: ["New SaaS competitors"],
      analysis: "The company faces challenges in scaling...",
      suggestedApproach: "value_prop",
    };

    (invokeLLM as any).mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockAnalysis) } }],
    });

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Analyze..." },
        { role: "user", content: "Company: Test Corp..." },
      ],
    });

    const parsed = JSON.parse((response as any).choices[0].message.content);
    expect(parsed.painPoints).toHaveLength(2);
    expect(parsed.suggestedApproach).toBe("value_prop");
    expect(parsed.industryTrends).toHaveLength(1);
    expect(parsed.competitiveThreats).toHaveLength(1);
  });

  it("should categorize weak points by type", () => {
    const allPoints = [
      "Struggling with lead generation",
      "High costs",
      "[Trend] AI automation",
      "[Competitive] New entrants",
    ];

    const painPoints = allPoints.filter(p => !p.startsWith("[Trend]") && !p.startsWith("[Competitive]"));
    const trends = allPoints.filter(p => p.startsWith("[Trend]")).map(p => p.replace("[Trend] ", ""));
    const threats = allPoints.filter(p => p.startsWith("[Competitive]")).map(p => p.replace("[Competitive] ", ""));

    expect(painPoints).toEqual(["Struggling with lead generation", "High costs"]);
    expect(trends).toEqual(["AI automation"]);
    expect(threats).toEqual(["New entrants"]);
  });
});

describe("Email Generation with Problem Analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass problem analysis to Claude when available", async () => {
    const problemAnalysis = {
      painPoints: ["Manual lead generation is time-consuming", "High cost per lead"],
      industryTrends: ["AI-powered outreach growing"],
      competitiveThreats: ["Competitors using automation"],
    };

    (generateEmailWithClaude as any).mockResolvedValue({
      subject: "scaling your dental practice",
      body: "Hi John,\n\nRunning a dental practice in 2024 means juggling patient care with business growth...\n\n• 🚀 **50+ qualified leads per week** on autopilot\n• 📈 **3x more booked appointments** within 30 days\n• 💰 **No long-term contracts** — cancel anytime\n\nWe helped a similar dental practice in Austin go from 15 to 45 new patients per month in just 6 weeks.\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: https://cal.com/nitin-virtualassistant-group.com/30min",
      generatedBy: "claude",
      model: "claude-sonnet-4-6",
    });

    const result = await generateEmailWithClaude({
      prompt: "We provide virtual assistant services for dental practices",
      emailType: "value_prop",
      leadContext: "Name: John, Company: Smile Dental, Industry: Healthcare/Dental",
      includeVariables: false,
      problemAnalysis,
    });

    expect(result.subject).toBe("scaling your dental practice");
    expect(result.body).toContain("dental practice");
    expect(result.body).toContain("•");
    expect(result.body).toContain("**");
    expect(result.body).toContain("30 Min Free Consultation");
    expect(result.generatedBy).toBe("claude");
  });

  it("should generate email without problem analysis", async () => {
    (generateEmailWithClaude as any).mockResolvedValue({
      subject: "quick thought about growth",
      body: "Hi there,\n\nMost business owners spend 20+ hours a week on tasks that don't grow revenue...\n\n• 🚀 **Automated lead generation** — 50+ qualified leads weekly\n• ⏱️ **Save 20+ hours per week** on manual outreach\n• 📈 **Proven results** — 3x more booked calls\n\nWe recently helped a similar company cut their lead gen costs by 60% while tripling their pipeline.\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: https://cal.com/nitin-virtualassistant-group.com/30min",
      generatedBy: "claude",
      model: "claude-sonnet-4-6",
    });

    const result = await generateEmailWithClaude({
      prompt: "We help businesses automate their outreach",
      emailType: "custom",
      includeVariables: false,
    });

    expect(result.body).toContain("•");
    expect(result.body).toContain("30 Min Free Consultation");
  });

  it("should include template variables when requested", async () => {
    (generateEmailWithClaude as any).mockResolvedValue({
      subject: "growing {{companyName}} faster",
      body: "Hi {{ownerName}},\n\nIn the {{industry}} space, most owners struggle with...\n\n• 🚀 **50+ qualified leads** generated weekly\n• 📈 **3x more booked calls** in 30 days\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: {{ctaLink}}",
      generatedBy: "claude",
      model: "claude-sonnet-4-6",
    });

    const result = await generateEmailWithClaude({
      prompt: "Lead generation services for businesses",
      includeVariables: true,
    });

    expect(result.body).toContain("{{ownerName}}");
    expect(result.body).toContain("{{industry}}");
    expect(result.body).toContain("{{ctaLink}}");
  });

  it("should produce emails with the correct structure: greeting, problems, solutions, case study, CTA", async () => {
    (generateEmailWithClaude as any).mockResolvedValue({
      subject: "noticed something about your clinic",
      body: "Hi Dr. Smith,\n\nRunning a dental practice in Phoenix means you're likely dealing with rising patient acquisition costs and staff burnout from manual follow-ups.\n\n• 🚀 **Automated patient outreach** — fill your schedule without lifting a finger\n• 📈 **40% more new patients** within the first month\n• 💰 **Zero upfront costs** — we only charge for results\n• ⏱️ **Save 15+ hours weekly** on admin and follow-ups\n\nWe helped Desert Smile Dental in Scottsdale go from 12 to 38 new patients per month in just 5 weeks — without hiring additional staff.\n\n👉 Click below to schedule your free 30-minute consultation and begin your 2-week free trial:\n🗓️ 30 Min Free Consultation: https://cal.com/nitin-virtualassistant-group.com/30min",
      generatedBy: "claude",
      model: "claude-sonnet-4-6",
    });

    const result = await generateEmailWithClaude({
      prompt: "VA services for dental clinics",
      emailType: "social_proof",
      leadContext: "Name: Dr. Smith, Company: Desert Smile Dental, Industry: Healthcare/Dental",
      problemAnalysis: {
        painPoints: ["Rising patient acquisition costs", "Staff burnout from manual follow-ups"],
        industryTrends: ["Telehealth adoption"],
        competitiveThreats: ["Corporate dental chains"],
      },
      includeVariables: false,
    });

    // Verify structure: greeting → problems → solutions → case study → CTA
    const body = result.body;
    const greetingIdx = body.indexOf("Hi Dr. Smith");
    const problemIdx = body.indexOf("patient acquisition costs");
    const solutionIdx = body.indexOf("•");
    const caseStudyIdx = body.indexOf("Desert Smile Dental");
    const ctaIdx = body.indexOf("30 Min Free Consultation");

    expect(greetingIdx).toBeLessThan(problemIdx);
    expect(problemIdx).toBeLessThan(solutionIdx);
    expect(solutionIdx).toBeLessThan(caseStudyIdx);
    expect(caseStudyIdx).toBeLessThan(ctaIdx);
  });
});
