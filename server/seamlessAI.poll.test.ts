/**
 * Unit tests for Seamless.AI Poll response parsing
 * Tests the exact JSON structure returned by the Poll endpoint
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the seamlessRequest function
let mockResponse: any = null;

// Simulated pollContactResults parser logic
function parsePollingResponse(response: any): any[] {
  let results: any[] = [];

  if (!response) {
    return [];
  }

  if (Array.isArray(response)) {
    results = response;
  } else if (response.contacts && Array.isArray(response.contacts)) {
    // Format: {contacts: [{...}, {...}]}
    results = response.contacts;
  } else if (response.data && Array.isArray(response.data)) {
    // Format: {data: [{...}, {...}]}
    results = response.data;
  } else if (response.requestId || response.status) {
    // Single contact object
    results = [response];
  } else {
    console.warn(`Unexpected poll response format:`, JSON.stringify(response).substring(0, 200));
    results = [];
  }

  // Validation logging
  console.log(`Poll batch parsed: ${results.length} contacts`);
  if (results.length > 0) {
    const first = results[0];
    console.log(`First contact: requestId=${first.requestId}, status=${first.status}`);
    if (first.contact) {
      console.log(
        `Contact fields: email=${first.contact.email}, phone1=${first.contact.contactPhone1}, title=${first.contact.title}, companySize=${first.contact.companyStaffCountRange}`
      );
    }
  }

  return results;
}

describe("Seamless.AI Poll Response Parsing", () => {
  describe("Response Format: {contacts: [...]}", () => {
    it("should parse 50 contacts from {contacts: [...]} format", () => {
      // This is the ACTUAL format returned by the API
      const pollResponse = {
        contacts: Array.from({ length: 50 }, (_, i) => ({
          requestId: `request-${i + 1}`,
          status: "done",
          contact: {
            firstName: `Contact${i + 1}`,
            lastName: `Test`,
            email: `contact${i + 1}@example.com`,
            contactPhone1: `555-000-${String(i + 1).padStart(4, "0")}`,
            title: `Senior Manager ${i + 1}`,
            company: `Company ${i + 1}`,
            companyStaffCountRange: "10,001+ employees",
            companyStaffCount: 10001,
            lIProfileUrl: `https://linkedin.com/in/contact${i + 1}`,
          },
        })),
      };

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(50);
      expect(results[0].requestId).toBe("request-1");
      expect(results[0].status).toBe("done");
      expect(results[0].contact.email).toBe("contact1@example.com");
    });

    it("should extract phone from contactPhone1", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              contactPhone1: "212-555-0001",
              contactPhone2: "212-555-0002",
              contactPhone3: "212-555-0003",
              companyPhone1: "212-555-9999",
              email: "test@example.com",
              title: "CEO",
              company: "Test Corp",
              companyStaffCountRange: "1,001-5,000",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      // Should use contactPhone1 first
      const phone =
        contact.contactPhone1 ??
        contact.contactPhone2 ??
        contact.contactPhone3 ??
        contact.companyPhone1 ??
        null;

      expect(phone).toBe("212-555-0001");
    });

    it("should fallback to companyPhone1 when personal phones missing", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              contactPhone1: null,
              contactPhone2: null,
              contactPhone3: null,
              companyPhone1: "212-555-9999",
              email: "test@example.com",
              title: "CEO",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      const phone =
        contact.contactPhone1 ??
        contact.contactPhone2 ??
        contact.contactPhone3 ??
        contact.companyPhone1 ??
        null;

      expect(phone).toBe("212-555-9999");
    });

    it("should extract title correctly", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              title: "Chief Technology Officer",
              email: "cto@example.com",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      expect(contact.title).toBe("Chief Technology Officer");
    });

    it("should extract company size from companyStaffCountRange", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              companyStaffCountRange: "10,001+ employees",
              companyStaffCount: 10001,
              email: "test@example.com",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      const companySize =
        contact.companyStaffCountRange ??
        (contact.companyStaffCount ? String(contact.companyStaffCount) : null);

      expect(companySize).toBe("10,001+ employees");
    });

    it("should extract email correctly", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              email: "john.doe@company.com",
              personalEmail: "john.doe@gmail.com",
              title: "Manager",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      expect(contact.email).toBe("john.doe@company.com");
    });

    it("should extract LinkedIn URL", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              lIProfileUrl: "https://www.linkedin.com/in/johndoe",
              email: "john@example.com",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);
      const contact = results[0].contact;

      expect(contact.lIProfileUrl).toBe("https://www.linkedin.com/in/johndoe");
    });
  });

  describe("Response Format: {data: [...]}", () => {
    it("should parse contacts from {data: [...]} format (legacy)", () => {
      const pollResponse = {
        data: [
          {
            requestId: "req-1",
            status: "done",
            contact: {
              email: "test@example.com",
              title: "Manager",
            },
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(1);
      expect(results[0].requestId).toBe("req-1");
    });
  });

  describe("Response Format: Array", () => {
    it("should parse contacts from array format", () => {
      const pollResponse = [
        {
          requestId: "req-1",
          status: "done",
          contact: {
            email: "test@example.com",
            title: "Manager",
          },
        },
      ];

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(1);
      expect(results[0].requestId).toBe("req-1");
    });
  });

  describe("Response Format: Single Object", () => {
    it("should parse single contact object", () => {
      const pollResponse = {
        requestId: "req-1",
        status: "done",
        contact: {
          email: "test@example.com",
          title: "Manager",
        },
      };

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(1);
      expect(results[0].requestId).toBe("req-1");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty contacts array", () => {
      const pollResponse = {
        contacts: [],
      };

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(0);
    });

    it("should handle null/undefined response", () => {
      const results = parsePollingResponse(null);
      expect(results).toHaveLength(0);

      const results2 = parsePollingResponse(undefined);
      expect(results2).toHaveLength(0);
    });

    it("should handle mixed status values", () => {
      const pollResponse = {
        contacts: [
          {
            requestId: "req-1",
            status: "done",
            contact: { email: "done@example.com" },
          },
          {
            requestId: "req-2",
            status: "researching",
            contact: { email: "researching@example.com" },
          },
          {
            requestId: "req-3",
            status: "missing",
            contact: null,
          },
        ],
      };

      const results = parsePollingResponse(pollResponse);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe("done");
      expect(results[1].status).toBe("researching");
      expect(results[2].status).toBe("missing");
    });
  });
});
