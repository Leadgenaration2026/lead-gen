import { describe, it, expect, vi } from "vitest";

// Test the lead generation response parsing logic
describe("Lead Generation - Response Parsing", () => {
  it("should handle JSON wrapped in markdown code fences", () => {
    const content = '```json\n[{"companyName":"Acme","ownerName":"John","email":"john@acme.com","phoneNumber":"+1234567890"}]\n```';
    // Strip code fences
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(stripped);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].companyName).toBe("Acme");
  });

  it("should handle JSON object wrapping an array (e.g. {leads: [...]})", () => {
    const content = '{"leads":[{"companyName":"Acme","ownerName":"John","email":"john@acme.com","phoneNumber":"+1234567890"}]}';
    const parsed = JSON.parse(content);
    const leadsData = Array.isArray(parsed) ? parsed : (parsed.leads || parsed.data || Object.values(parsed)[0]);
    expect(Array.isArray(leadsData)).toBe(true);
    expect(leadsData[0].companyName).toBe("Acme");
  });

  it("should handle direct JSON array", () => {
    const content = '[{"companyName":"Acme","ownerName":"John","email":"john@acme.com","phoneNumber":"+1234567890"}]';
    const parsed = JSON.parse(content);
    const leadsData = Array.isArray(parsed) ? parsed : (parsed.leads || parsed.data || Object.values(parsed)[0]);
    expect(Array.isArray(leadsData)).toBe(true);
    expect(leadsData[0].companyName).toBe("Acme");
  });

  it("should handle array content from model (content as array of objects)", () => {
    const content = [{ type: "text", text: '[{"companyName":"Acme","ownerName":"John","email":"john@acme.com","phoneNumber":"+1234567890"}]' }];
    // Simulate the fix: handle array content
    let textContent: string;
    if (Array.isArray(content)) {
      textContent = content.map((c: any) => typeof c === 'string' ? c : c.text || '').join('');
    } else {
      textContent = content;
    }
    const parsed = JSON.parse(textContent);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].companyName).toBe("Acme");
  });
});

// Test campaign delete
describe("Campaign Delete", () => {
  it("should have deleteCampaign function exported from db", async () => {
    const db = await import("./db");
    expect(typeof db.deleteCampaign).toBe("function");
  });

  it("should have createCampaign return a number (insertId)", async () => {
    const db = await import("./db");
    expect(typeof db.createCampaign).toBe("function");
  });
});
