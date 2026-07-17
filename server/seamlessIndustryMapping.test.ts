import { describe, it, expect } from "vitest";
import { mapToValidSeamlessIndustry } from "./seamlessAI";

describe("mapToValidSeamlessIndustry", () => {
  it("maps a multi-word guess to the option sharing its meaningful word (regression: 'Travel Agency' silently dropped, falling back to job-title-only search across unrelated industries like real estate/construction)", () => {
    expect(mapToValidSeamlessIndustry("Travel Agency")).toBe("Leisure, Travel & Tourism");
    expect(mapToValidSeamlessIndustry("Travel Agencies")).toBe("Leisure, Travel & Tourism");
  });

  it("still maps single-word guesses that already worked via substring matching", () => {
    expect(mapToValidSeamlessIndustry("Travel")).toBe("Leisure, Travel & Tourism");
    expect(mapToValidSeamlessIndustry("Construction")).toBe("Construction");
    expect(mapToValidSeamlessIndustry("Real Estate")).toBe("Real Estate");
    expect(mapToValidSeamlessIndustry("Restaurant")).toBe("Restaurants");
    expect(mapToValidSeamlessIndustry("Healthcare")).toBe("Hospital & Health Care");
    expect(mapToValidSeamlessIndustry("E-commerce")).toBe("Internet & E-Commerce");
  });

  it("matches enum values whose real name contains an internal comma even when the guess omits it (Seamless.AI's actual enum uses commas in compound names like 'Leisure, Travel & Tourism', 'Glass, Ceramics & Concrete', 'Metals, Mining & Materials', 'Household, Personal, & Beauty')", () => {
    expect(mapToValidSeamlessIndustry("Fitness")).toBe("Health, Wellness and Fitness");
    expect(mapToValidSeamlessIndustry("Ceramics")).toBe("Glass, Ceramics & Concrete");
    expect(mapToValidSeamlessIndustry("Mining")).toBe("Metals, Mining & Materials");
    expect(mapToValidSeamlessIndustry("Beauty")).toBe("Household, Personal, & Beauty");
  });

  it("does not force a match for a guess with no real overlap with any option", () => {
    expect(mapToValidSeamlessIndustry("Motivational Speaking")).toBeNull();
    expect(mapToValidSeamlessIndustry("Nonexistent Industry Xyz")).toBeNull();
    expect(mapToValidSeamlessIndustry("")).toBeNull();
  });

  it("does not match on purely generic words shared across unrelated industries", () => {
    // "Agency" and "Services" alone are too generic to imply any specific
    // industry -- should not spuriously match "Real Estate & Construction"
    // or any other option just because it's an "agency"/"company"/"business".
    expect(mapToValidSeamlessIndustry("Agency")).toBeNull();
    expect(mapToValidSeamlessIndustry("Services Company")).toBeNull();
  });
});
