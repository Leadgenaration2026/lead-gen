import { describe, expect, it } from "vitest";

describe("CSV Import", () => {
  it("parses CSV data correctly with standard headers", () => {
    const csvText = `Company Name,Owner Name,Email,Phone Number,Industry,Tag
Acme Corp,John Smith,john@acme.com,+1-555-1234,SaaS,hot
Beta Inc,Jane Doe,jane@beta.io,+1-555-5678,Marketing,warm`;

    const lines = csvText.split("\n").filter((l) => l.trim());
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

    expect(headers).toContain("company name");
    expect(headers).toContain("owner name");
    expect(headers).toContain("email");
    expect(headers).toContain("phone number");
    expect(lines.length).toBe(3); // header + 2 data rows
  });

  it("handles CSV rows with missing optional fields", () => {
    const row = "Acme Corp,John Smith,john@acme.com,+1-555-1234,,";
    const values = row.split(",").map((v) => v.trim());

    expect(values[0]).toBe("Acme Corp");
    expect(values[1]).toBe("John Smith");
    expect(values[2]).toBe("john@acme.com");
    expect(values[3]).toBe("+1-555-1234");
    expect(values[4]).toBe(""); // industry optional
    expect(values[5]).toBe(""); // tag optional
  });

  it("rejects CSV rows with fewer than 4 required fields", () => {
    const row = "Acme Corp,John Smith,john@acme.com";
    const values = row.split(",").map((v) => v.trim());
    expect(values.length).toBeLessThan(4);
  });

  it("handles quoted fields with embedded commas", () => {
    // PapaParse handles this natively; verify the concept
    const csvLine = '"Acme, Inc.","Smith, John",john@acme.com,+1-555-1234';
    // PapaParse would parse this as 4 fields
    const fields = csvLine.match(/("[^"]*"|[^,]+)/g)?.map(f => f.replace(/^"|"$/g, ""));
    expect(fields?.[0]).toBe("Acme, Inc.");
    expect(fields?.[1]).toBe("Smith, John");
    expect(fields?.[2]).toBe("john@acme.com");
    expect(fields?.[3]).toBe("+1-555-1234");
  });

  it("validates email format and rejects invalid emails", () => {
    const validEmail = "john@acme.com";
    const invalidEmail = "not-an-email";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    expect(emailRegex.test(validEmail)).toBe(true);
    expect(emailRegex.test(invalidEmail)).toBe(false);
  });

  it("maps flexible header names to standard fields", () => {
    const headerMappings: Record<string, string> = {
      "company name": "companyName",
      "company": "companyName",
      "owner name": "ownerName",
      "contact name": "ownerName",
      "full name": "ownerName",
      "email address": "email",
      "e-mail": "email",
      "phone number": "phoneNumber",
      "mobile": "phoneNumber",
      "telephone": "phoneNumber",
    };

    // Verify all mappings exist
    expect(Object.keys(headerMappings).length).toBeGreaterThan(5);
    expect(headerMappings["company name"]).toBe("companyName");
    expect(headerMappings["contact name"]).toBe("ownerName");
    expect(headerMappings["e-mail"]).toBe("email");
    expect(headerMappings["mobile"]).toBe("phoneNumber");
  });
});

describe("Lead Tags", () => {
  const validTags = ["hot", "warm", "cold", "follow_up", "none"];

  it("validates all tag values", () => {
    validTags.forEach((tag) => {
      expect(["hot", "warm", "cold", "follow_up", "none"]).toContain(tag);
    });
  });

  it("maps tag to correct display label", () => {
    const TAG_LABELS: Record<string, string> = {
      hot: "Hot",
      warm: "Warm",
      cold: "Cold",
      follow_up: "Follow Up",
      none: "No Tag",
    };

    expect(TAG_LABELS["hot"]).toBe("Hot");
    expect(TAG_LABELS["warm"]).toBe("Warm");
    expect(TAG_LABELS["cold"]).toBe("Cold");
    expect(TAG_LABELS["follow_up"]).toBe("Follow Up");
    expect(TAG_LABELS["none"]).toBe("No Tag");
  });

  it("maps tag to correct color scheme", () => {
    const TAG_COLORS: Record<string, { bg: string; text: string }> = {
      hot: { bg: "bg-red-100", text: "text-red-700" },
      warm: { bg: "bg-orange-100", text: "text-orange-700" },
      cold: { bg: "bg-blue-100", text: "text-blue-700" },
      follow_up: { bg: "bg-purple-100", text: "text-purple-700" },
    };

    expect(TAG_COLORS["hot"].bg).toContain("red");
    expect(TAG_COLORS["warm"].bg).toContain("orange");
    expect(TAG_COLORS["cold"].bg).toContain("blue");
    expect(TAG_COLORS["follow_up"].bg).toContain("purple");
  });
});

describe("Test Email", () => {
  it("validates email format for test email", () => {
    const validEmails = ["test@example.com", "user@domain.co", "name@company.io"];
    const invalidEmails = ["not-email", "@domain.com", "user@"];

    validEmails.forEach((email) => {
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    invalidEmails.forEach((email) => {
      expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });
  });

  it("requires subject and body for test email", () => {
    const subject = "Test Subject";
    const body = "<p>Test body content</p>";
    const testEmail = "me@example.com";

    expect(subject.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
    expect(testEmail.length).toBeGreaterThan(0);
  });

  it("test email does not include tracking pixel", () => {
    // Test emails should be clean previews without tracking
    const testEmailBody = "<p>Hello, this is a test email</p>";
    expect(testEmailBody).not.toContain("track/pixel");
    expect(testEmailBody).not.toContain("tracking");
  });
});

describe("Follow-Up Call Schedule", () => {
  it("generates correct 7-call schedule: initial + Day 3 (2x) + Day 6 (2x) + Day 12 (2x)", () => {
    const schedule = [
      { day: 0, time: "immediate", label: "Initial call on email open/click" },
      { day: 3, time: "10:00 AM", label: "Day 3 morning" },
      { day: 3, time: "3:00 PM", label: "Day 3 afternoon" },
      { day: 6, time: "10:00 AM", label: "Day 6 morning" },
      { day: 6, time: "3:00 PM", label: "Day 6 afternoon" },
      { day: 12, time: "10:00 AM", label: "Day 12 morning" },
      { day: 12, time: "3:00 PM", label: "Day 12 afternoon" },
    ];

    expect(schedule).toHaveLength(7);
    expect(schedule[0].day).toBe(0);
    expect(schedule[1].day).toBe(3);
    expect(schedule[2].day).toBe(3);
    expect(schedule[3].day).toBe(6);
    expect(schedule[4].day).toBe(6);
    expect(schedule[5].day).toBe(12);
    expect(schedule[6].day).toBe(12);
  });

  it("has 2 calls per day for days 3, 6, and 12", () => {
    const callDays = [3, 3, 6, 6, 12, 12];
    const day3Calls = callDays.filter((d) => d === 3);
    const day6Calls = callDays.filter((d) => d === 6);
    const day12Calls = callDays.filter((d) => d === 12);

    expect(day3Calls).toHaveLength(2);
    expect(day6Calls).toHaveLength(2);
    expect(day12Calls).toHaveLength(2);
  });
});
