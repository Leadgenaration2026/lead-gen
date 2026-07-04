import { describe, it, expect } from "vitest";
import {
  expandJobTitle,
  parseCompanySize,
  parseSearchInstruction,
  TITLE_EXPANSION_MAP,
  COMPANY_SIZE_MAP,
} from "./titleExpansionMap";

describe("titleExpansionMap", () => {
  describe("expandJobTitle", () => {
    it("should expand 'owner' to multiple executive titles", () => {
      const result = expandJobTitle("owner");
      expect(result).toContain("Owner");
      expect(result).toContain("Founder");
      expect(result).toContain("CEO");
      expect(result).toContain("President");
      expect(result.length).toBeGreaterThan(1);
    });

    it("should expand 'ceo' to executive titles", () => {
      const result = expandJobTitle("ceo");
      expect(result).toContain("CEO");
      expect(result).toContain("President");
      expect(result).toContain("Founder");
    });

    it("should expand 'sales director' to sales-related titles", () => {
      const result = expandJobTitle("sales director");
      expect(result).toContain("Sales Director");
      expect(result).toContain("VP of Sales");
      expect(result).toContain("Sales Manager");
    });

    it("should handle case-insensitive matching", () => {
      const result1 = expandJobTitle("OWNER");
      const result2 = expandJobTitle("Owner");
      const result3 = expandJobTitle("owner");
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it("should return original title if no match found", () => {
      const result = expandJobTitle("xyzabc123");
      expect(result).toContain("xyzabc123");
    });

    it("should do partial matching for keywords", () => {
      const result = expandJobTitle("sales");
      // Should match sales-related titles
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((t) => t.toLowerCase().includes("sales"))).toBe(true);
    });

    it("should handle small business owner", () => {
      const result = expandJobTitle("small business owner");
      expect(result).toContain("Owner");
      expect(result).toContain("Founder");
      expect(result).toContain("CEO");
    });
  });

  describe("parseCompanySize", () => {
    it("should parse 'startup' to max 50", () => {
      const result = parseCompanySize("startup");
      expect(result.max).toBe(50);
      expect(result.min).toBeUndefined();
    });

    it("should parse 'small' to 1-50", () => {
      const result = parseCompanySize("small");
      expect(result.min).toBe(1);
      expect(result.max).toBe(50);
    });

    it("should parse 'enterprise' to min 5001", () => {
      const result = parseCompanySize("enterprise");
      expect(result.min).toBe(5001);
      expect(result.max).toBeUndefined();
    });

    it("should parse numeric range '2-10'", () => {
      const result = parseCompanySize("2-10");
      expect(result.min).toBe(2);
      expect(result.max).toBe(10);
    });

    it("should parse numeric range with text '11-50 employees'", () => {
      const result = parseCompanySize("11-50 employees");
      expect(result.min).toBe(11);
      expect(result.max).toBe(50);
    });

    it("should parse single number '1000'", () => {
      const result = parseCompanySize("1000");
      expect(result.max).toBe(1000);
    });

    it("should parse number with plus '1000+'", () => {
      const result = parseCompanySize("1000+");
      expect(result.min).toBe(1000);
      expect(result.max).toBeUndefined();
    });

    it("should return empty object for empty string", () => {
      const result = parseCompanySize("");
      expect(result).toEqual({});
    });

    it("should handle case-insensitive matching", () => {
      const result1 = parseCompanySize("STARTUP");
      const result2 = parseCompanySize("startup");
      expect(result1).toEqual(result2);
    });
  });

  describe("parseSearchInstruction", () => {
    it("should extract job titles from instruction", () => {
      const result = parseSearchInstruction("I want to find CEOs and founders");
      expect(result.titles.length).toBeGreaterThan(0);
      expect(result.titles.some((t) => t.toLowerCase().includes("ceo"))).toBe(
        true
      );
      expect(
        result.titles.some((t) => t.toLowerCase().includes("founder"))
      ).toBe(true);
    });

    it("should extract company size from instruction", () => {
      const result = parseSearchInstruction("I want small business owners");
      expect(result.companySize).toBeDefined();
      expect(result.companySize.max).toBe(50);
    });

    it("should extract multiple titles", () => {
      const result = parseSearchInstruction(
        "Find sales directors and marketing managers"
      );
      expect(result.titles.length).toBeGreaterThan(0);
    });

    it("should remove duplicate titles", () => {
      const result = parseSearchInstruction("owner founder owner");
      // Should not have duplicates
      const uniqueTitles = new Set(result.titles);
      expect(uniqueTitles.size).toBe(result.titles.length);
    });

    it("should return empty arrays for empty instruction", () => {
      const result = parseSearchInstruction("");
      expect(result.titles).toEqual([]);
      expect(result.industries).toEqual([]);
      expect(result.countries).toEqual([]);
    });

    it("should extract industries", () => {
      const result = parseSearchInstruction(
        "Find technology company owners"
      );
      expect(result.industries).toContain("technology");
    });

    it("should extract countries", () => {
      const result = parseSearchInstruction("Find CEOs in the United States");
      expect(result.countries.length).toBeGreaterThan(0);
    });

    it("should handle complex instructions", () => {
      const result = parseSearchInstruction(
        "Find small business owners in technology companies in the United States"
      );
      expect(result.titles.length).toBeGreaterThan(0);
      expect(result.companySize.max).toBe(50);
      expect(result.industries).toContain("technology");
      expect(result.countries.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      const result1 = parseSearchInstruction("FIND CEOS");
      const result2 = parseSearchInstruction("find ceos");
      expect(result1.titles).toEqual(result2.titles);
    });
  });

  describe("TITLE_EXPANSION_MAP", () => {
    it("should have entries for common titles", () => {
      expect(TITLE_EXPANSION_MAP["owner"]).toBeDefined();
      expect(TITLE_EXPANSION_MAP["ceo"]).toBeDefined();
      expect(TITLE_EXPANSION_MAP["sales director"]).toBeDefined();
      expect(TITLE_EXPANSION_MAP["manager"]).toBeDefined();
    });

    it("should have arrays of titles for each key", () => {
      for (const [key, titles] of Object.entries(TITLE_EXPANSION_MAP)) {
        expect(Array.isArray(titles)).toBe(true);
        expect(titles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("COMPANY_SIZE_MAP", () => {
    it("should have entries for common sizes", () => {
      expect(COMPANY_SIZE_MAP["startup"]).toBeDefined();
      expect(COMPANY_SIZE_MAP["small"]).toBeDefined();
      expect(COMPANY_SIZE_MAP["enterprise"]).toBeDefined();
    });

    it("should have valid min/max values", () => {
      for (const [key, size] of Object.entries(COMPANY_SIZE_MAP)) {
        if (size.min && size.max) {
          expect(size.min).toBeLessThanOrEqual(size.max);
        }
      }
    });
  });

  describe("Real-world scenarios", () => {
    it("should handle 'I need to reach small business owners'", () => {
      const result = parseSearchInstruction(
        "I need to reach small business owners"
      );
      expect(result.titles).toContain("Owner");
      expect(result.companySize.max).toBe(50);
    });

    it("should handle 'Find VP of Sales at technology companies'", () => {
      const result = parseSearchInstruction(
        "Find VP of Sales at technology companies"
      );
      expect(result.titles.length).toBeGreaterThan(0);
      expect(result.industries).toContain("technology");
    });

    it("should handle 'Enterprise CTOs in finance'", () => {
      const result = parseSearchInstruction("Enterprise CTOs in finance");
      expect(result.companySize.min).toBe(5001);
      expect(result.industries).toContain("finance");
    });
  });
});
