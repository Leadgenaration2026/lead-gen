import { describe, it, expect } from "vitest";
import { parseInstructionToFilters } from "./seamlessAI";

/**
 * Tests for parseInstructionToFilters function
 * Verifies that natural language instructions are converted to structured API filters
 */

describe("parseInstructionToFilters", () => {
  describe("Job Title Expansion", () => {
    it("should expand 'small business owner' to multiple titles", () => {
      const filters = parseInstructionToFilters("small business owner");
      
      expect(filters.jobTitle).toBeDefined();
      expect(Array.isArray(filters.jobTitle)).toBe(true);
      expect(filters.jobTitle.length).toBeGreaterThan(1);
      expect(filters.jobTitle).toContain("Owner");
      expect(filters.jobTitle).toContain("CEO");
      expect(filters.jobTitle).toContain("Founder");
    });

    it("should expand 'sales director' to sales-related titles", () => {
      const filters = parseInstructionToFilters("sales director");
      
      expect(filters.jobTitle).toBeDefined();
      expect(filters.jobTitle.length).toBeGreaterThan(0);
      expect(filters.jobTitle.some((t: string) => t.toLowerCase().includes("sales"))).toBe(true);
    });

    it("should handle multiple job titles in instruction", () => {
      const filters = parseInstructionToFilters("CEO or founder");
      
      expect(filters.jobTitle).toBeDefined();
      expect(filters.jobTitle.length).toBeGreaterThan(0);
    });
  });

  describe("Company Size Parsing", () => {
    it("should parse 'company size 2-10' to min/max filters", () => {
      const filters = parseInstructionToFilters("small business company size 2-10");
      
      expect(filters.companyEmployeeCountMin).toBe(2);
      expect(filters.companyEmployeeCountMax).toBe(10);
    });

    it("should parse 'small' to company size 1-50", () => {
      const filters = parseInstructionToFilters("small business owners");
      
      expect(filters.companyEmployeeCountMax).toBe(50);
    });

    it("should parse 'enterprise' to min 5001", () => {
      const filters = parseInstructionToFilters("enterprise companies");
      
      expect(filters.companyEmployeeCountMin).toBe(5001);
    });

    it("should parse '1000+' to min 1000", () => {
      const filters = parseInstructionToFilters("companies 1000+");
      
      expect(filters.companyEmployeeCountMin).toBe(1000);
    });
  });

  describe("Country Handling", () => {
    it("should default to United States if not specified", () => {
      const filters = parseInstructionToFilters("small business owners");
      
      expect(filters.contactCountry).toBeDefined();
      expect(filters.contactCountry).toContain("United States");
    });

    it("should use provided country parameter", () => {
      const filters = parseInstructionToFilters("small business owners", "Canada");
      
      expect(filters.contactCountry).toContain("Canada");
    });

    it("should parse country from instruction", () => {
      const filters = parseInstructionToFilters("small business owners in United Kingdom");
      
      expect(filters.contactCountry).toBeDefined();
      expect(filters.contactCountry.length).toBeGreaterThan(0);
    });
  });

  describe("Industry Parsing", () => {
    it("should parse industry from instruction", () => {
      const filters = parseInstructionToFilters("technology company owners");
      
      expect(filters.industry).toBeDefined();
      expect(filters.industry).toContain("Software & Information Technology");
    });

    it("should parse multiple industries", () => {
      const filters = parseInstructionToFilters("finance or healthcare CEOs");
      
      expect(filters.industry).toBeDefined();
      expect(filters.industry.length).toBeGreaterThan(0);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle 'Generate leads of small business owners with company size 2-10'", () => {
      const filters = parseInstructionToFilters("Generate leads of small business owners with company size 2-10");
      
      // Should have expanded titles
      expect(filters.jobTitle).toBeDefined();
      expect(filters.jobTitle.length).toBeGreaterThan(1);
      
      // Should have company size
      expect(filters.companyEmployeeCountMin).toBe(2);
      expect(filters.companyEmployeeCountMax).toBe(10);
      
      // Should have country
      expect(filters.contactCountry).toContain("United States");
    });

    it("should handle 'Find VP of Sales at tech companies in California'", () => {
      const filters = parseInstructionToFilters("Find VP of Sales at tech companies in California");
      
      expect(filters.jobTitle).toBeDefined();
      expect(filters.industry).toBeDefined();
    });

    it("should handle 'Enterprise CTOs in finance'", () => {
      const filters = parseInstructionToFilters("Enterprise CTOs in finance");
      
      expect(filters.jobTitle).toBeDefined();
      expect(filters.companyEmployeeCountMin).toBe(5001);
      expect(filters.industry).toContain("Finance & Banking");
    });
  });

  describe("Filter Structure", () => {
    it("should return object with proper structure", () => {
      const filters = parseInstructionToFilters("small business owner");
      
      expect(typeof filters).toBe("object");
      expect(filters).not.toBeNull();
    });

    it("should only include defined filters", () => {
      const filters = parseInstructionToFilters("CEO");
      
      // Should have jobTitle
      expect(filters.jobTitle).toBeDefined();
      
      // Should have country
      expect(filters.contactCountry).toBeDefined();
      
      // Should not have undefined values
      Object.values(filters).forEach((value) => {
        expect(value).toBeDefined();
      });
    });

    it("should use array format for multi-value filters", () => {
      const filters = parseInstructionToFilters("small business owner");
      
      if (filters.jobTitle) {
        expect(Array.isArray(filters.jobTitle)).toBe(true);
      }
      
      if (filters.contactCountry) {
        expect(Array.isArray(filters.contactCountry)).toBe(true);
      }
      
      if (filters.industry) {
        expect(Array.isArray(filters.industry)).toBe(true);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty instruction", () => {
      const filters = parseInstructionToFilters("");
      
      // Should still have country
      expect(filters.contactCountry).toBeDefined();
    });

    it("should handle instruction with only company size", () => {
      const filters = parseInstructionToFilters("company size 50-100");
      
      expect(filters.companyEmployeeCountMin).toBe(50);
      expect(filters.companyEmployeeCountMax).toBe(100);
    });

    it("should be case-insensitive", () => {
      const filters1 = parseInstructionToFilters("SMALL BUSINESS OWNER");
      const filters2 = parseInstructionToFilters("small business owner");
      
      expect(filters1.jobTitle).toEqual(filters2.jobTitle);
      expect(filters1.companyEmployeeCountMax).toBe(filters2.companyEmployeeCountMax);
    });
  });

  describe("API Compatibility", () => {
    it("should generate filters compatible with searchContacts API", () => {
      const filters = parseInstructionToFilters("small business owner");
      
      // API expects these field names
      if (filters.jobTitle) expect(Array.isArray(filters.jobTitle)).toBe(true);
      if (filters.contactCountry) expect(Array.isArray(filters.contactCountry)).toBe(true);
      if (filters.industry) expect(Array.isArray(filters.industry)).toBe(true);
      
      // Min/max should be numbers
      if (filters.companyEmployeeCountMin) {
        expect(typeof filters.companyEmployeeCountMin).toBe("number");
      }
      if (filters.companyEmployeeCountMax) {
        expect(typeof filters.companyEmployeeCountMax).toBe("number");
      }
    });

    it("should not include 'instruction' field in output", () => {
      const filters = parseInstructionToFilters("small business owner");
      
      expect(filters.instruction).toBeUndefined();
    });
  });
});
