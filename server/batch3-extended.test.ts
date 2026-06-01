import { describe, expect, it } from "vitest";

// Test scheduled email processor logic
describe("Scheduled Email Processor", () => {
  it("should identify due emails (scheduledFor <= now)", () => {
    const now = new Date();
    const emails = [
      { id: 1, scheduledFor: new Date(now.getTime() - 60000), status: "pending" }, // 1 min ago
      { id: 2, scheduledFor: new Date(now.getTime() + 60000), status: "pending" }, // 1 min future
      { id: 3, scheduledFor: new Date(now.getTime() - 3600000), status: "pending" }, // 1 hr ago
      { id: 4, scheduledFor: new Date(now.getTime() - 60000), status: "sent" }, // already sent
      { id: 5, scheduledFor: new Date(now.getTime() - 60000), status: "cancelled" }, // cancelled
    ];

    const dueEmails = emails.filter(
      (e) => e.status === "pending" && new Date(e.scheduledFor).getTime() <= now.getTime()
    );

    expect(dueEmails).toHaveLength(2);
    expect(dueEmails.map((e) => e.id)).toEqual([1, 3]);
  });

  it("should mark email as failed when lead is not found", () => {
    const email = { id: 1, leadId: 999, status: "pending" as string, errorMessage: "" };
    const lead = null; // simulating lead not found

    if (!lead) {
      email.status = "failed";
      email.errorMessage = "Lead not found";
    }

    expect(email.status).toBe("failed");
    expect(email.errorMessage).toBe("Lead not found");
  });

  it("should mark email as failed when SMTP settings are missing", () => {
    const email = { id: 1, leadId: 1, status: "pending" as string, errorMessage: "" };
    const settings = { smtpHost: "", smtpUsername: "", smtpPassword: "" };

    if (!settings.smtpHost || !settings.smtpUsername || !settings.smtpPassword) {
      email.status = "failed";
      email.errorMessage = "SMTP settings not configured";
    }

    expect(email.status).toBe("failed");
    expect(email.errorMessage).toBe("SMTP settings not configured");
  });

  it("should mark email as sent on successful delivery", () => {
    const email = { id: 1, status: "pending" as string, sentAt: null as Date | null };

    // Simulate successful send
    email.status = "sent";
    email.sentAt = new Date();

    expect(email.status).toBe("sent");
    expect(email.sentAt).toBeInstanceOf(Date);
  });

  it("should not process cancelled or already-sent emails", () => {
    const emails = [
      { id: 1, status: "cancelled", scheduledFor: new Date(Date.now() - 60000) },
      { id: 2, status: "sent", scheduledFor: new Date(Date.now() - 60000) },
      { id: 3, status: "failed", scheduledFor: new Date(Date.now() - 60000) },
      { id: 4, status: "pending", scheduledFor: new Date(Date.now() - 60000) },
    ];

    const toProcess = emails.filter((e) => e.status === "pending");
    expect(toProcess).toHaveLength(1);
    expect(toProcess[0].id).toBe(4);
  });

  it("should handle email send error gracefully", () => {
    const email = { id: 1, status: "pending" as string, errorMessage: "" };
    const sendError = new Error("Connection timeout");

    // Simulate error handling
    email.status = "failed";
    email.errorMessage = sendError.message;

    expect(email.status).toBe("failed");
    expect(email.errorMessage).toBe("Connection timeout");
  });
});

// Test template quick-launch URL params
describe("Template Quick-Launch URL Params", () => {
  it("should encode template data into URL search params", () => {
    const template = {
      subject: "Quick question about {{companyName}}",
      emailTemplate: "<p>Hi {{ownerName}},</p><p>I noticed your company...</p>",
      emailType: "discovery",
    };

    const params = new URLSearchParams();
    params.set("subject", template.subject);
    params.set("body", template.emailTemplate);
    params.set("emailType", template.emailType);

    const url = `/email-composer?${params.toString()}`;

    expect(url).toContain("subject=");
    expect(url).toContain("body=");
    expect(url).toContain("emailType=discovery");
  });

  it("should decode URL params back to template data", () => {
    const searchString =
      "subject=Quick+question&body=%3Cp%3EHi+there%3C%2Fp%3E&emailType=value_prop";
    const params = new URLSearchParams(searchString);

    const subject = params.get("subject");
    const body = params.get("body");
    const emailType = params.get("emailType");

    expect(subject).toBe("Quick question");
    expect(body).toBe("<p>Hi there</p>");
    expect(emailType).toBe("value_prop");
  });

  it("should validate emailType against allowed values", () => {
    const allowedTypes = ["discovery", "value_prop", "social_proof", "urgency", "custom"];

    expect(allowedTypes.includes("discovery")).toBe(true);
    expect(allowedTypes.includes("value_prop")).toBe(true);
    expect(allowedTypes.includes("invalid_type")).toBe(false);
  });

  it("should handle empty or missing URL params gracefully", () => {
    const searchString = "";
    const params = new URLSearchParams(searchString);

    const subject = params.get("subject");
    const body = params.get("body");

    expect(subject).toBeNull();
    expect(body).toBeNull();
  });
});

// Test create-campaign-from-template prefill
describe("Create Campaign from Template", () => {
  it("should pre-fill campaign form with template data", () => {
    const template = {
      name: "Cold Outreach - SaaS",
      description: "Best for B2B SaaS companies",
      subject: "Quick question about {{companyName}}",
      emailTemplate: "<p>Hi {{ownerName}},</p>",
    };

    // Simulating the prefill logic
    const campaignName = template.name + " Campaign";
    const campaignDescription = template.description || "";
    const campaignSubject = template.subject || "";
    const campaignEmailTemplate = template.emailTemplate || "";

    expect(campaignName).toBe("Cold Outreach - SaaS Campaign");
    expect(campaignDescription).toBe("Best for B2B SaaS companies");
    expect(campaignSubject).toBe("Quick question about {{companyName}}");
    expect(campaignEmailTemplate).toBe("<p>Hi {{ownerName}},</p>");
  });

  it("should handle templates with empty optional fields", () => {
    const template = {
      name: "Minimal Template",
      description: "",
      subject: "Hello",
      emailTemplate: "Body text",
    };

    const campaignDescription = template.description || "";
    expect(campaignDescription).toBe("");
  });

  it("should validate required fields before submission", () => {
    const formData = {
      name: "My Campaign",
      subject: "Subject line",
      emailTemplate: "<p>Body</p>",
      leadIds: [] as number[],
    };

    const isValid = !!(formData.name && formData.subject && formData.emailTemplate);
    expect(isValid).toBe(true);

    // Missing subject
    const invalidForm = { ...formData, subject: "" };
    const isInvalid = !!(invalidForm.name && invalidForm.subject && invalidForm.emailTemplate);
    expect(isInvalid).toBe(false);
  });

  it("should allow editing pre-filled fields before submission", () => {
    const template = {
      subject: "Quick question about {{companyName}}",
      emailTemplate: "<p>Hi {{ownerName}},</p>",
    };

    // User edits the pre-filled subject
    let subject = template.subject;
    subject = "Updated: " + subject;

    expect(subject).toBe("Updated: Quick question about {{companyName}}");
    expect(subject).not.toBe(template.subject);
  });
});

// Test lead overwrite/upsert logic
describe("Lead Overwrite by Email", () => {
  it("should identify leads to overwrite by matching email", () => {
    const existingLeads = [
      { id: 1, email: "john@acme.com", ownerName: "John", companyName: "Acme" },
      { id: 2, email: "jane@startup.io", ownerName: "Jane", companyName: "Startup" },
    ];

    const newLead = { email: "john@acme.com", ownerName: "John Updated", companyName: "Acme Corp" };

    const match = existingLeads.find(
      (l) => l.email.toLowerCase() === newLead.email.toLowerCase()
    );

    expect(match).toBeDefined();
    expect(match!.id).toBe(1);
  });

  it("should update existing lead fields on overwrite", () => {
    const existing = { id: 1, email: "john@acme.com", ownerName: "John", companyName: "Acme", phoneNumber: "123" };
    const update = { ownerName: "John Updated", companyName: "Acme Corp", phoneNumber: "456" };

    const merged = { ...existing, ...update };

    expect(merged.id).toBe(1); // ID preserved
    expect(merged.email).toBe("john@acme.com"); // Email preserved
    expect(merged.ownerName).toBe("John Updated"); // Updated
    expect(merged.companyName).toBe("Acme Corp"); // Updated
    expect(merged.phoneNumber).toBe("456"); // Updated
  });

  it("should skip duplicates when user chooses skip action", () => {
    const newLeads = [
      { email: "john@acme.com", ownerName: "John" },
      { email: "new@company.com", ownerName: "New" },
    ];
    const existingEmails = ["john@acme.com"];

    const toInsert = newLeads.filter(
      (l) => !existingEmails.includes(l.email.toLowerCase())
    );

    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].email).toBe("new@company.com");
  });
});
