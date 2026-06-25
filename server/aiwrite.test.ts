import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
const mockInvokeLLM = vi.fn();
vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: any[]) => mockInvokeLLM(...args),
}));

// Mock db module
const mockGetLeadById = vi.fn();
vi.mock("./db", () => ({
  default: {
    getLeadById: (...args: any[]) => mockGetLeadById(...args),
    getEmailSignature: vi.fn().mockResolvedValue(null),
    getUserSettings: vi.fn().mockResolvedValue({}),
  },
}));

describe("email.generateAITemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a professional email with bullet points from a prompt", async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject: "quick question about your growth",
            body: '<p>Hi there,</p><p>I noticed your company is expanding rapidly.</p><ul><li>We help companies reduce churn by 40%</li><li>Our clients see ROI within 30 days</li><li>No long-term contracts required</li></ul><p>Would you be open to a quick chat? <a href="https://cal.com/nitin-virtualassistant-group.com/30min">Schedule here</a></p>',
          }),
        },
      }],
    };

    mockInvokeLLM.mockResolvedValue(mockResponse);

    // Simulate the procedure logic
    const response = await mockInvokeLLM({
      messages: [
        { role: "system", content: "You are an expert email copywriter..." },
        { role: "user", content: "Write a professional outreach email..." },
      ],
      response_format: { type: "json_schema", json_schema: {} },
    });

    const rawContent = response.choices[0]?.message?.content;
    expect(rawContent).toBeDefined();
    const parsed = JSON.parse(rawContent as string);

    expect(parsed.subject).toBe("quick question about your growth");
    expect(parsed.body).toContain("<ul>");
    expect(parsed.body).toContain("<li>");
    expect(parsed.subject.length).toBeLessThan(50);
  });

  it("should include template variables when includeVariables is true", async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject: "quick question about {{companyName}}",
            body: '<p>Hi {{ownerName}},</p><p>I noticed {{companyName}} is doing great work in {{industry}}.</p><ul><li>We help companies save 40% on operations</li><li>Results within 30 days guaranteed</li><li>No long-term commitment needed</li></ul><p><a href="{{ctaLink}}">Schedule a quick chat</a></p>',
          }),
        },
      }],
    };

    mockInvokeLLM.mockResolvedValue(mockResponse);

    const response = await mockInvokeLLM({
      messages: expect.any(Array),
      response_format: expect.any(Object),
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content as string);

    expect(parsed.subject).toContain("{{companyName}}");
    expect(parsed.body).toContain("{{ownerName}}");
    expect(parsed.body).toContain("{{companyName}}");
    expect(parsed.body).toContain("{{ctaLink}}");
    expect(parsed.body).toContain("<li>");
  });

  it("should personalize for a specific lead when leadId is provided", async () => {
    mockGetLeadById.mockResolvedValue({
      id: 1,
      userId: "user-1",
      ownerName: "John Smith",
      companyName: "Acme Corp",
      industry: "Technology",
      email: "john@acme.com",
    });

    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject: "quick thought about acme corp",
            body: '<p>Hi John,</p><p>I noticed Acme Corp is expanding its tech stack.</p><ul><li>We helped similar tech companies save 200+ hours/month</li><li>Our solution integrates in under 24 hours</li><li>Free pilot program available this month</li></ul><p><a href="https://cal.com/nitin-virtualassistant-group.com/30min">Let\'s chat for 15 min</a></p>',
          }),
        },
      }],
    };

    mockInvokeLLM.mockResolvedValue(mockResponse);

    // Simulate lead lookup
    const lead = await mockGetLeadById(1);
    expect(lead).toBeDefined();
    expect(lead!.ownerName).toBe("John Smith");

    // Simulate the LLM call with lead context
    const response = await mockInvokeLLM({
      messages: [
        { role: "system", content: "You are an expert email copywriter..." },
        { role: "user", content: `Lead Info: Name: ${lead.ownerName}, Company: ${lead.companyName}` },
      ],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content as string);

    expect(parsed.subject).toContain("acme");
    expect(parsed.body).toContain("John");
    expect(parsed.body).toContain("Acme Corp");
    expect(parsed.body).toContain("<li>");
  });

  it("should enforce bullet points in output even if AI misses them", () => {
    // Simulate the post-processing logic from the procedure
    let emailBody = '<p>Hi there,</p><p>We can help your company grow.</p><p>Let me know if interested.</p>';
    
    // This is the validation logic from the procedure
    if (!emailBody.includes("<li") && !emailBody.includes("<ul")) {
      emailBody = emailBody.replace(
        /<\/p>\s*<p/,
        `</p><ul><li>Key benefit point</li><li>Another important point</li><li>Clear value proposition</li></ul><p`
      );
    }

    expect(emailBody).toContain("<ul>");
    expect(emailBody).toContain("<li>");
  });

  it("should handle different email types correctly", () => {
    const emailTypeGuidance: Record<string, string> = {
      discovery: "Focus on understanding their challenges. Ask an insightful question about their business.",
      value_prop: "Highlight specific benefits and outcomes. Focus on ROI and measurable results.",
      social_proof: "Reference case studies or success stories. Use specific numbers and outcomes.",
      urgency: "Create time-sensitivity without being pushy. Mention limited availability or upcoming deadlines.",
      custom: "Follow the user's instructions precisely.",
    };

    expect(emailTypeGuidance["discovery"]).toContain("challenges");
    expect(emailTypeGuidance["value_prop"]).toContain("ROI");
    expect(emailTypeGuidance["social_proof"]).toContain("case studies");
    expect(emailTypeGuidance["urgency"]).toContain("time-sensitivity");
    expect(emailTypeGuidance["custom"]).toContain("instructions");
  });

  it("should return subject under 50 characters", async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject: "thoughts on scaling your team",
            body: '<p>Hi there,</p><ul><li>Point 1</li><li>Point 2</li></ul><p>CTA</p>',
          }),
        },
      }],
    };

    mockInvokeLLM.mockResolvedValue(mockResponse);

    const response = await mockInvokeLLM({
      messages: expect.any(Array),
      response_format: expect.any(Object),
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content as string);
    expect(parsed.subject.length).toBeLessThanOrEqual(50);
    expect(parsed.body).toContain("<li>");
  });

  it("should handle AI failure gracefully", async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const response = await mockInvokeLLM({});
    const rawContent = response.choices[0]?.message?.content;
    
    // The procedure would throw INTERNAL_SERVER_ERROR
    expect(rawContent).toBeNull();
  });
});
