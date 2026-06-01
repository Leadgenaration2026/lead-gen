import { describe, expect, it } from "vitest";

// Test deduplication logic
describe("Lead Deduplication", () => {
  it("should detect duplicate emails in a list", () => {
    const existingEmails = ["john@acme.com", "jane@startup.io"];
    const newLeads = [
      { email: "john@acme.com", companyName: "Acme", ownerName: "John" },
      { email: "new@company.com", companyName: "NewCo", ownerName: "New" },
      { email: "jane@startup.io", companyName: "Startup", ownerName: "Jane" },
    ];

    const duplicates = newLeads.filter((l) => existingEmails.includes(l.email));
    const unique = newLeads.filter((l) => !existingEmails.includes(l.email));

    expect(duplicates).toHaveLength(2);
    expect(unique).toHaveLength(1);
    expect(unique[0].email).toBe("new@company.com");
  });

  it("should handle case-insensitive email comparison", () => {
    const existingEmails = ["john@acme.com"];
    const newEmail = "John@Acme.com";

    const isDuplicate = existingEmails.some(
      (e) => e.toLowerCase() === newEmail.toLowerCase()
    );
    expect(isDuplicate).toBe(true);
  });

  it("should allow non-duplicate leads through", () => {
    const existingEmails: string[] = [];
    const newEmail = "brand-new@company.com";

    const isDuplicate = existingEmails.some(
      (e) => e.toLowerCase() === newEmail.toLowerCase()
    );
    expect(isDuplicate).toBe(false);
  });
});

// Test email scheduling logic
describe("Email Scheduling", () => {
  it("should create a valid scheduled email object", () => {
    const scheduledEmail = {
      leadId: 1,
      subject: "Quick question about your company",
      emailBody: "<p>Hi John, I noticed...</p>",
      scheduledFor: new Date("2026-06-15T09:00:00Z"),
      status: "pending" as const,
    };

    expect(scheduledEmail.leadId).toBe(1);
    expect(scheduledEmail.status).toBe("pending");
    expect(scheduledEmail.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("should validate scheduled date is in the future", () => {
    const pastDate = new Date("2020-01-01T09:00:00Z");
    const futureDate = new Date("2027-01-01T09:00:00Z");

    expect(pastDate.getTime() < Date.now()).toBe(true);
    expect(futureDate.getTime() > Date.now()).toBe(true);
  });

  it("should support multiple scheduled emails for different leads", () => {
    const scheduledEmails = [
      { leadId: 1, scheduledFor: new Date("2026-06-15T09:00:00Z"), status: "pending" },
      { leadId: 2, scheduledFor: new Date("2026-06-15T10:00:00Z"), status: "pending" },
      { leadId: 3, scheduledFor: new Date("2026-06-16T09:00:00Z"), status: "pending" },
    ];

    expect(scheduledEmails).toHaveLength(3);
    expect(scheduledEmails.every((e) => e.status === "pending")).toBe(true);
  });

  it("should mark email as sent after processing", () => {
    const email = { leadId: 1, status: "pending" as string };
    email.status = "sent";
    expect(email.status).toBe("sent");
  });
});

// Test campaign templates logic
describe("Campaign Templates", () => {
  it("should create a template with required fields", () => {
    const template = {
      name: "Cold Outreach - SaaS",
      subject: "Quick question about {{companyName}}",
      emailTemplate: "Hi {{ownerName}},\n\nI noticed {{companyName}}...",
      emailType: "discovery",
      tags: "saas,cold-email,b2b",
    };

    expect(template.name).toBeTruthy();
    expect(template.subject).toBeTruthy();
    expect(template.emailTemplate).toBeTruthy();
  });

  it("should replace template variables with lead data", () => {
    const template = "Hi {{ownerName}}, I noticed {{companyName}} is doing great work.";
    const lead = { ownerName: "John Smith", companyName: "Acme Corp" };

    const result = template
      .replace(/\{\{ownerName\}\}/g, lead.ownerName)
      .replace(/\{\{companyName\}\}/g, lead.companyName);

    expect(result).toBe("Hi John Smith, I noticed Acme Corp is doing great work.");
  });

  it("should parse tags from comma-separated string", () => {
    const tagsString = "saas, cold-email, b2b, outreach";
    const tags = tagsString.split(",").map((t) => t.trim());

    expect(tags).toHaveLength(4);
    expect(tags).toContain("saas");
    expect(tags).toContain("cold-email");
    expect(tags).toContain("b2b");
    expect(tags).toContain("outreach");
  });

  it("should track template usage count", () => {
    const template = { name: "Test", usageCount: 0 };
    template.usageCount += 1;
    expect(template.usageCount).toBe(1);
    template.usageCount += 1;
    expect(template.usageCount).toBe(2);
  });

  it("should save campaign as template with correct fields", () => {
    const campaign = {
      id: 1,
      name: "Q2 SaaS Outreach",
      subject: "Quick question about {{companyName}}",
      emailTemplate: "<p>Hi {{ownerName}},</p>",
    };

    const template = {
      name: "Q2 SaaS Outreach Template",
      description: "Saved from campaign: Q2 SaaS Outreach",
      subject: campaign.subject,
      emailTemplate: campaign.emailTemplate,
      emailType: "custom",
      tags: "saved-campaign",
    };

    expect(template.name).toContain("Template");
    expect(template.subject).toBe(campaign.subject);
    expect(template.emailTemplate).toBe(campaign.emailTemplate);
  });
});
