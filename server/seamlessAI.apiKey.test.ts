import { describe, it, expect } from "vitest";
import { searchContacts } from "./seamlessAI";

describe("Seamless.AI API Key Validation", () => {
  it("should validate that SEAMLESS_AI_API_KEY is set", () => {
    const apiKey = process.env.SEAMLESS_AI_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).toBeTruthy();
    expect(apiKey?.length).toBeGreaterThan(0);
  });

  it("should successfully call Seamless.AI Search API with valid credentials", async () => {
    const apiKey = process.env.SEAMLESS_AI_API_KEY;
    if (!apiKey) {
      throw new Error("SEAMLESS_AI_API_KEY not set");
    }

    const filters = {
      jobTitle: ["Owner", "Founder", "CEO", "President"],
      contactCountry: ["United States"],
    };

    const result = await searchContacts(apiKey, filters, 10);

    // Verify the response structure
    expect(result).toBeDefined();
    expect(result.supplementalData).toBeDefined();
    expect(result.supplementalData.total).toBeGreaterThan(0);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);

    console.log(`✅ API Key Valid - Found ${result.supplementalData.total} results`);
  });
});
