/**
 * Simplified CSV Parser - accepts any CSV format without strict validation
 * Tries to intelligently map columns but falls back to positional matching
 */

export interface ParsedLead {
  companyName: string;
  ownerName: string;
  email: string;
  phoneNumber?: string;
  jobTitle?: string;
  industry?: string;
  companySize?: string;
  website?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  allEmails?: string[];
  allPhones?: Array<{ number: string; type: 'cell' | 'landline' | 'office' }>;
}

export function parseSimpleCSV(records: any[]): { leads: ParsedLead[]; errors: string[] } {
  const leads: ParsedLead[] = [];
  const errors: string[] = [];

  records.forEach((record, idx) => {
    const row: any = {};
    const allValues = Object.values(record)
      .map(v => ((v as string) || "").trim())
      .filter(v => v && v !== "N/A" && v !== "n/a" && v !== "NA");

    // Try to match columns by header name
    for (const [key, val] of Object.entries(record)) {
      const header = (key as string).toLowerCase().trim();
      const value = ((val as string) || "").trim();
      if (!value || value === "N/A" || value === "n/a" || value === "NA") continue;

      // Match company
      if (header.includes("company") && !row.companyName) {
        row.companyName = value;
      }
      // Match name
      else if (
        (header.includes("name") || header.includes("contact") || header === "owner") &&
        !row.ownerName &&
        !header.includes("company")
      ) {
        row.ownerName = value;
      }
      // Match email
      else if (header.includes("email") && !row.email && value.includes("@")) {
        row.email = value;
      }
      // Match phone
      else if (
        (header.includes("phone") || header.includes("mobile") || header.includes("contact")) &&
        !row.phoneNumber &&
        value.replace(/[^0-9]/g, "").length >= 7
      ) {
        row.phoneNumber = value;
      }
      // Match other fields
      else if (header.includes("title") || header.includes("job")) {
        row.jobTitle = value;
      } else if (header.includes("industry")) {
        row.industry = value;
      } else if (header.includes("size") || header.includes("employee")) {
        row.companySize = value;
      } else if (header.includes("website") || header.includes("url")) {
        row.website = value;
      } else if (header.includes("linkedin")) {
        row.linkedinUrl = value;
      } else if (header.includes("city")) {
        row.city = value;
      } else if (header.includes("state")) {
        row.state = value;
      } else if (header.includes("country")) {
        row.country = value;
      }
    }

    // Fallback to positional matching if fields are missing
    if (!row.companyName && allValues[0]) row.companyName = allValues[0];
    if (!row.ownerName && allValues[1]) row.ownerName = allValues[1];
    if (!row.email && allValues[2]) {
      const val = allValues[2];
      if (val.includes("@")) row.email = val;
    }
    if (!row.phoneNumber && allValues[3]) {
      const val = allValues[3];
      if (val.replace(/[^0-9]/g, "").length >= 7) row.phoneNumber = val;
    }

    // Validate required fields
    if (!row.companyName || !row.ownerName || !row.email) {
      errors.push(
        `Row ${idx + 2}: Missing required fields. Found: ${[row.companyName, row.ownerName, row.email]
          .filter(Boolean)
          .join(", ")}`
      );
      return;
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push(`Row ${idx + 2}: Invalid email format: ${row.email}`);
      return;
    }

    // Format phone number if present
    if (row.phoneNumber) {
      const phoneDigits = row.phoneNumber.replace(/[^0-9+]/g, "");
      if (phoneDigits.replace(/[^0-9]/g, "").length >= 7) {
        row.phoneNumber = phoneDigits;
      } else {
        row.phoneNumber = undefined; // Invalid phone, discard
      }
    }

    leads.push(row as ParsedLead);
  });

  return { leads, errors };
}
