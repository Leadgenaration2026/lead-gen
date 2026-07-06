/**
 * CSV Column Mapping for Seamless.AI Exports
 * Maps Seamless.AI CSV columns to our database schema
 */

export interface ParsedLead {
  companyName: string;
  ownerName: string;
  email: string;
  allEmails?: string[]; // Array of all emails found
  phoneNumber: string;
  allPhones?: Array<{ number: string; type: 'cell' | 'landline' | 'office' }>;
  jobTitle?: string;
  industry?: string;
  companySize?: string;
  website?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Common Seamless.AI CSV column names (case-insensitive)
 */
const SEAMLESS_COLUMN_MAPPING: Record<string, string[]> = {
  companyName: ['company name', 'company', 'organization', 'company_name'],
  firstName: ['first name', 'first_name', 'firstname', 'contact full name'],
  lastName: ['last name', 'last_name', 'lastname'],
  email: ['email', 'email address', 'work email', 'work_email', 'primary email', 'contact email', 'email 1'],
  email2: ['email 2', 'email2', 'secondary email', 'secondary_email', 'personal email', 'contact email 2'],
  email3: ['email 3', 'email3', 'tertiary email', 'contact email 3'],
  phoneNumber: ['phone', 'phone number', 'phone_number', 'mobile', 'cell phone', 'cell', 'contact phone 1', 'contact phone'],
  phoneCell: ['cell phone', 'cell', 'mobile phone', 'mobile', 'cell_phone', 'contact phone 1', 'contact phone 2'],
  phoneLandline: ['landline', 'office phone', 'office', 'work phone', 'phone (office)', 'company phone 1', 'company phone 2'],
  jobTitle: ['job title', 'title', 'position', 'job_title', 'designation'],
  industry: ['industry', 'industry name', 'industry_name'],
  companySize: ['company size', 'employee count', 'employees', 'company_size', 'headcount', 'employee_count'],
  website: ['website', 'company website', 'web site', 'url', 'company_website'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedin_url', 'linkedin profile'],
  instagramUrl: ['instagram', 'instagram url', 'instagram_url', 'instagram profile'],
  facebookUrl: ['facebook', 'facebook url', 'facebook_url', 'facebook profile'],
  city: ['city', 'location city', 'location_city'],
  state: ['state', 'province', 'region', 'state_province'],
  country: ['country', 'location country', 'location_country'],
};

/**
 * Parse CSV header row and return column index mapping
 */
export function parseCSVHeader(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  for (const [fieldName, aliases] of Object.entries(SEAMLESS_COLUMN_MAPPING)) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (aliases.includes(lowerHeaders[i])) {
        mapping[fieldName] = i;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parse a single CSV row using column mapping
 */
export function parseCSVRow(row: string[], columnMapping: Record<string, number>): Partial<ParsedLead> {
  const lead: Partial<ParsedLead> = {};

  // Company and person info
  if (columnMapping.companyName !== undefined) {
    lead.companyName = row[columnMapping.companyName]?.trim();
  }

  // Name - combine first and last
  let firstName = '';
  let lastName = '';
  if (columnMapping.firstName !== undefined) {
    firstName = row[columnMapping.firstName]?.trim() || '';
  }
  if (columnMapping.lastName !== undefined) {
    lastName = row[columnMapping.lastName]?.trim() || '';
  }
  lead.ownerName = `${firstName} ${lastName}`.trim();

  // Emails - collect all email columns
  const emails: string[] = [];
  if (columnMapping.email !== undefined) {
    const email = row[columnMapping.email]?.trim();
    if (email) emails.push(email);
  }
  if (columnMapping.email2 !== undefined) {
    const email = row[columnMapping.email2]?.trim();
    if (email) emails.push(email);
  }
  if (columnMapping.email3 !== undefined) {
    const email = row[columnMapping.email3]?.trim();
    if (email) emails.push(email);
  }

  if (emails.length > 0) {
    lead.email = emails[0]; // Primary email
    if (emails.length > 1) {
      lead.allEmails = emails;
    }
  }

  // Phone numbers - collect all phone columns with types
  const phones: Array<{ number: string; type: 'cell' | 'landline' | 'office' }> = [];

  if (columnMapping.phoneCell !== undefined) {
    const phone = row[columnMapping.phoneCell]?.trim();
    if (phone) {
      phones.push({ number: phone, type: 'cell' });
    }
  }

  if (columnMapping.phoneLandline !== undefined) {
    const phone = row[columnMapping.phoneLandline]?.trim();
    if (phone) {
      phones.push({ number: phone, type: 'landline' });
    }
  }

  if (columnMapping.phoneNumber !== undefined && phones.length === 0) {
    const phone = row[columnMapping.phoneNumber]?.trim();
    if (phone) {
      phones.push({ number: phone, type: 'cell' }); // Default to cell if type unknown
    }
  }

  if (phones.length > 0) {
    lead.phoneNumber = phones[0].number; // Primary phone
    if (phones.length > 1 || phones[0].type !== 'cell') {
      lead.allPhones = phones;
    }
  }

  // Job title
  if (columnMapping.jobTitle !== undefined) {
    lead.jobTitle = row[columnMapping.jobTitle]?.trim();
  }

  // Industry
  if (columnMapping.industry !== undefined) {
    lead.industry = row[columnMapping.industry]?.trim();
  }

  // Company size
  if (columnMapping.companySize !== undefined) {
    lead.companySize = row[columnMapping.companySize]?.trim();
  }

  // Website
  if (columnMapping.website !== undefined) {
    lead.website = row[columnMapping.website]?.trim();
  }

  // Social media
  if (columnMapping.linkedinUrl !== undefined) {
    lead.linkedinUrl = row[columnMapping.linkedinUrl]?.trim();
  }
  if (columnMapping.instagramUrl !== undefined) {
    lead.instagramUrl = row[columnMapping.instagramUrl]?.trim();
  }
  if (columnMapping.facebookUrl !== undefined) {
    lead.facebookUrl = row[columnMapping.facebookUrl]?.trim();
  }

  // Location
  if (columnMapping.city !== undefined) {
    lead.city = row[columnMapping.city]?.trim();
  }
  if (columnMapping.state !== undefined) {
    lead.state = row[columnMapping.state]?.trim();
  }
  if (columnMapping.country !== undefined) {
    lead.country = row[columnMapping.country]?.trim();
  }

  return lead;
}

/**
 * Validate parsed lead has required fields
 */
export function validateLead(lead: Partial<ParsedLead>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!lead.companyName?.trim()) {
    errors.push('Company name is required');
  }
  if (!lead.ownerName?.trim()) {
    errors.push('Contact name is required');
  }
  if (!lead.email?.trim()) {
    errors.push('Email is required');
  }
  if (!lead.phoneNumber?.trim()) {
    errors.push('Phone number is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
