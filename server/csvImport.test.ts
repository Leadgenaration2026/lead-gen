import { describe, it, expect } from "vitest";
import { parseCSVHeader, parseCSVRow, validateLead } from "./csvMapping";

describe("CSV Import - Seamless.AI Format", () => {
  it("should parse Seamless.AI CSV headers correctly", () => {
    const headers = [
      "Research Date",
      "Contact Full Name",
      "First Name",
      "Last Name",
      "Title",
      "Company Name",
      "Contact Email",
      "Contact Phone 1",
      "Contact Phone 2",
      "Company Phone 1",
      "Industry",
      "Employee Size",
      "Website",
      "Contact LI Profile URL",
      "City",
      "State",
      "Country",
    ];

    const mapping = parseCSVHeader(headers);

    expect(mapping.firstName).toBeDefined();
    expect(mapping.lastName).toBeDefined();
    expect(mapping.companyName).toBeDefined();
    expect(mapping.email).toBeDefined();
    expect(mapping.phoneNumber).toBeDefined();
    expect(mapping.jobTitle).toBeDefined();
    expect(mapping.industry).toBeDefined();
    expect(mapping.companySize).toBeDefined();
    expect(mapping.website).toBeDefined();
    expect(mapping.linkedinUrl).toBeDefined();
    expect(mapping.city).toBeDefined();
    expect(mapping.state).toBeDefined();
    expect(mapping.country).toBeDefined();
  });

  it("should parse a Seamless.AI CSV row correctly", () => {
    const headers = [
      "Research Date",
      "Contact Full Name",
      "First Name",
      "Last Name",
      "Title",
      "Company Name",
      "Contact Email",
      "Contact Phone 1",
      "Contact Phone 2",
      "Company Phone 1",
      "Industry",
      "Employee Size",
      "Website",
      "Contact LI Profile URL",
      "City",
      "State",
      "Country",
    ];

    const row = [
      "2026-07-05T18:19:26.485Z",
      "Stephen Lauer",
      "Stephen",
      "Lauer",
      "Owner",
      "Inks and Links",
      "stephen@inksandlinks.com",
      "(256) 677-9575",
      "(256) 653-5282",
      "(817) 832-0459",
      "Design & Marketing",
      "2 - 10 employees",
      "inksandlinks.com",
      "https://www.linkedin.com/in/stephen-lauer-0a665932",
      "Owens Cross Roads",
      "Alabama",
      "United States",
    ];

    const mapping = parseCSVHeader(headers);
    const parsed = parseCSVRow(row, mapping);

    expect(parsed.companyName).toBe("Inks and Links");
    expect(parsed.ownerName).toBe("Stephen Lauer");
    expect(parsed.email).toBe("stephen@inksandlinks.com");
    expect(parsed.phoneNumber).toBe("(256) 677-9575");
    expect(parsed.jobTitle).toBe("Owner");
    expect(parsed.industry).toBe("Design & Marketing");
    expect(parsed.companySize).toBe("2 - 10 employees");
    expect(parsed.website).toBe("inksandlinks.com");
    expect(parsed.linkedinUrl).toBe("https://www.linkedin.com/in/stephen-lauer-0a665932");
    expect(parsed.city).toBe("Owens Cross Roads");
    expect(parsed.state).toBe("Alabama");
    expect(parsed.country).toBe("United States");
  });

  it("should validate a complete lead correctly", () => {
    const lead = {
      companyName: "Acme Corp",
      ownerName: "John Doe",
      email: "john@acme.com",
      phoneNumber: "(555) 123-4567",
      jobTitle: "Manager",
      industry: "Technology",
      companySize: "50-100",
      website: "https://acme.com",
    };

    const result = validateLead(lead);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject lead with missing required fields", () => {
    const lead = {
      companyName: "Acme Corp",
      ownerName: "John Doe",
      // Missing email and phone
    };

    const result = validateLead(lead);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Email is required");
    expect(result.errors).toContain("Phone number is required");
  });

  it("should handle multiple phone numbers", () => {
    const headers = [
      "Contact Phone 1",
      "Contact Phone 2",
      "Company Phone 1",
      "Company Phone 2",
    ];

    const row = [
      "(256) 677-9575",
      "(256) 653-5282",
      "(817) 832-0459",
      "(205) 369-8658",
    ];

    const mapping = parseCSVHeader(headers);
    const parsed = parseCSVRow(row, mapping);

    expect(parsed.phoneNumber).toBe("(256) 677-9575");
    expect(parsed.allPhones).toBeDefined();
    expect(parsed.allPhones?.length).toBeGreaterThan(0);
  });
});
