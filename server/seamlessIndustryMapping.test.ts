import { describe, it, expect } from "vitest";
import { mapToValidSeamlessIndustry, findAmbiguousIndustryMatches } from "./seamlessAI";

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

  it("prefers a confirmed synonym over a generic word-overlap match to a different, wrong option (regression: 'legal firms' shares the word 'legal' with 'Legal Services' and matched there, but Seamless.AI's own search resolves this phrase to 'Law Practice' instead)", () => {
    expect(mapToValidSeamlessIndustry("legal firms")).toBe("Law Practice");
    expect(mapToValidSeamlessIndustry("law firm")).toBe("Law Practice");
    expect(mapToValidSeamlessIndustry("law firms")).toBe("Law Practice");
    expect(mapToValidSeamlessIndustry("attorneys")).toBe("Law Practice");
    expect(mapToValidSeamlessIndustry("lawyer")).toBe("Law Practice");
  });

  it("does not guess when a typo is equally close to two different, unrelated options (regression: 'prctice' alone is one edit from both 'Medical Practice' and 'Law Practice' once the short word 'law' is filtered out -- guessing wrong here is worse than finding nothing)", () => {
    expect(mapToValidSeamlessIndustry("law prctice")).toBeNull();
  });
});

describe("findAmbiguousIndustryMatches", () => {
  it("flags a keyword that plausibly matches 2+ real, unrelated categories instead of letting the caller silently pick whichever comes first (regression: 'law' matches both 'Law Enforcement' and 'Law Practice', and mapToValidSeamlessIndustry alone would silently resolve to 'Law Enforcement' -- very likely wrong for someone searching law firms)", () => {
    const matches = findAmbiguousIndustryMatches("law");
    expect(matches).toContain("Law Enforcement");
    expect(matches).toContain("Law Practice");
    expect(matches.length).toBe(2);
  });

  it("does not flag a confirmed synonym, an exact match, or a keyword with only one plausible match as ambiguous", () => {
    expect(findAmbiguousIndustryMatches("law firm")).toEqual([]);
    expect(findAmbiguousIndustryMatches("Law Practice")).toEqual([]);
    expect(findAmbiguousIndustryMatches("travel")).toEqual([]);
    expect(findAmbiguousIndustryMatches("")).toEqual([]);
  });
});
