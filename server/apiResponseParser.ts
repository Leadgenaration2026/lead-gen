/**
 * API Response Parser for Seamless.AI Enrichment
 * Intercepts and parses API responses to extract enrichment data
 */

export interface EnrichmentAPIResponse {
  phone?: string;
  phoneNumber?: string;
  workPhone?: string;
  personalPhone?: string;
  mobilePhone?: string;
  
  title?: string;
  jobTitle?: string;
  position?: string;
  
  companySize?: string;
  employeeCount?: string | number;
  employees?: string | number;
  
  email?: string;
  personalEmail?: string;
  workEmail?: string;
  
  company?: string;
  companyName?: string;
  
  linkedinUrl?: string;
  lIProfileUrl?: string;
  
  [key: string]: any;
}

export class APIResponseParser {
  /**
   * Parse enrichment API response and extract key fields
   */
  static parseEnrichmentResponse(responseBody: string): EnrichmentAPIResponse | null {
    try {
      const data = JSON.parse(responseBody);
      
      // Handle array response (multiple results)
      if (Array.isArray(data)) {
        if (data.length === 0) return null;
        // Take first result
        return this.extractFields(data[0]);
      }
      
      // Handle object response
      if (typeof data === 'object' && data !== null) {
        // If it has a 'contact' field (Seamless.AI poll response)
        if (data.contact) {
          return this.extractFields(data.contact);
        }
        
        // If it has 'data' field (wrapped response)
        if (data.data) {
          if (Array.isArray(data.data)) {
            return this.extractFields(data.data[0]);
          }
          return this.extractFields(data.data);
        }
        
        // Direct response
        return this.extractFields(data);
      }
      
      return null;
    } catch (e) {
      console.error('[APIResponseParser] Failed to parse response:', e);
      return null;
    }
  }
  
  /**
   * Extract relevant fields from parsed response
   */
  private static extractFields(obj: any): EnrichmentAPIResponse {
    return {
      phone: obj.phone || obj.phoneNumber || obj.workPhone || undefined,
      title: obj.title || obj.jobTitle || obj.position || undefined,
      companySize: obj.companySize || obj.employeeCount || obj.employees || undefined,
      email: obj.email || obj.personalEmail || obj.workEmail || undefined,
      company: obj.company || obj.companyName || undefined,
      linkedinUrl: obj.linkedinUrl || obj.lIProfileUrl || undefined,
      // Include all other fields for debugging
      ...obj,
    };
  }
  
  /**
   * Check if response contains enrichment data
   */
  static hasEnrichmentData(parsed: EnrichmentAPIResponse): boolean {
    return !!(
      parsed.phone ||
      parsed.title ||
      parsed.companySize ||
      parsed.email ||
      parsed.company
    );
  }
}
