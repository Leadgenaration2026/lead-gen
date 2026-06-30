/**
 * POPUP-AWARE DATA EXTRACTOR
 * 
 * Key insight: Seamless.AI shows enriched data in a HIDDEN POPUP, not in the table row
 * 
 * This extractor:
 * 1. Looks for hidden popups after enrichment
 * 2. Extracts data from the popup (not the table row)
 * 3. Falls back to table row if no popup found
 */

import { Locator, Page } from "playwright";

interface EnrichedLeadData {
  fullName?: string;
  company?: string;
  jobTitle?: string;
  phoneNumber?: string;
  phoneType?: "cell" | "office" | "unknown";
  secondaryPhone?: string;
  secondaryPhoneType?: "cell" | "office" | "unknown";
  companySize?: string;
  industry?: string;
  linkedinUrl?: string;
  email?: string;
  personalEmail?: string;
  workEmail?: string;
  website?: string;
}

class PopupAwareDataExtractor {
  async extractLeadData(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("[PopupExtractor] Starting data extraction...");

      // STEP 1: Look for enrichment popup
      const popup = await this.findEnrichmentPopup(leadRow);

      if (popup) {
        console.log("[PopupExtractor] Found enrichment popup! Extracting from popup...");
        const popupData = await this.extractFromPopup(popup);
        if (Object.keys(popupData).length > 0) {
          console.log("[PopupExtractor] Successfully extracted from popup:", popupData);
          return popupData;
        }
      }

      // STEP 2: Fallback to table row extraction
      console.log("[PopupExtractor] No popup or empty popup. Trying table row...");
      return await this.extractFromTableRow(leadRow);
    } catch (error) {
      console.error("[PopupExtractor] Error during extraction:", error);
      return {};
    }
  }

  private async findEnrichmentPopup(leadRow: Locator): Promise<Locator | null> {
    try {
      const page = leadRow.page();
      if (!page) return null;

      console.log("[PopupExtractor] Searching for enrichment popup...");

      // Common popup selectors
      const popupSelectors = [
        "[role='dialog']",
        "[role='tooltip']",
        ".popup",
        ".modal",
        ".drawer",
        "[class*='popup']",
        "[class*='modal']",
        "[class*='drawer']",
        "[class*='enrichment']",
        "[class*='detail']",
        "[class*='popover']",
        "[class*='overlay']",
      ];

      // Search in page body
      for (const selector of popupSelectors) {
        try {
          const elements = page.locator(selector);
          const count = await elements.count();

          if (count > 0) {
            for (let i = 0; i < count; i++) {
              const element = elements.nth(i);
              try {
                const isVisible = await element.isVisible().catch(() => false);
                const hasHeight = await element.evaluate((el: any) => el.offsetHeight > 0).catch(() => false);

                if (isVisible || hasHeight) {
                  console.log(`[PopupExtractor] Found visible popup with selector: ${selector}`);
                  return element;
                }
              } catch (e) {
                // Continue
              }
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log("[PopupExtractor] No popup found");
      return null;
    } catch (error) {
      console.error("[PopupExtractor] Error finding popup:", error);
      return null;
    }
  }

  private async extractFromPopup(popup: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("[PopupExtractor] Extracting from popup...");
      const data: EnrichedLeadData = {};

      // Get all text from popup
      const popupText = await popup.textContent();
      console.log(`[PopupExtractor] Popup text (first 300 chars): ${popupText?.substring(0, 300)}`);

      // Get HTML to inspect structure
      const html = await popup.evaluate((el) => el.outerHTML);
      console.log(`[PopupExtractor] Popup HTML (first 500 chars): ${html.substring(0, 500)}`);

      // Extract phone number using regex
      const phoneMatch = popupText?.match(/(\+?1?\s*)?(\()?(\d{3})(\))?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
      if (phoneMatch) {
        data.phoneNumber = phoneMatch[0].trim();
        console.log(`[PopupExtractor] Found phone: ${data.phoneNumber}`);
      }

      // Look for job title patterns
      const jobTitlePatterns = [
        /(?:Title|Job Title|Position):\s*([^\n,]+)/i,
        /(?:VP|Director|Manager|Engineer|Developer|Designer|Analyst|Specialist|Coordinator|Consultant|Officer|Executive|President|CEO|CTO|CFO|COO|CMO)(?:\s+(?:of|at|for))?\s+([^\n,]+)?/i,
      ];

      for (const pattern of jobTitlePatterns) {
        const match = popupText?.match(pattern);
        if (match && match[1]) {
          data.jobTitle = match[1].trim();
          console.log(`[PopupExtractor] Found job title: ${data.jobTitle}`);
          break;
        }
      }

      // Look for company size patterns
      const companySizePatterns = [
        /(?:Company Size|Size):\s*([^\n,]+)/i,
        /(\d+[-–]\d+\s*(?:employees|people|staff))/i,
        /(?:1-10|11-50|51-200|201-500|501-1000|1000\+)/i,
      ];

      for (const pattern of companySizePatterns) {
        const match = popupText?.match(pattern);
        if (match && match[1]) {
          data.companySize = match[1].trim();
          console.log(`[PopupExtractor] Found company size: ${data.companySize}`);
          break;
        }
      }

      // Extract email
      const emailMatch = popupText?.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        data.email = emailMatch[0];
        console.log(`[PopupExtractor] Found email: ${data.email}`);
      }

      // Extract company name
      const companyMatch = popupText?.match(/(?:Company|Organization):\s*([^\n,]+)/i);
      if (companyMatch && companyMatch[1]) {
        data.company = companyMatch[1].trim();
        console.log(`[PopupExtractor] Found company: ${data.company}`);
      }

      // Extract name
      const nameMatch = popupText?.match(/(?:Name|Contact):\s*([^\n,]+)/i);
      if (nameMatch && nameMatch[1]) {
        data.fullName = nameMatch[1].trim();
        console.log(`[PopupExtractor] Found name: ${data.fullName}`);
      }

      console.log("[PopupExtractor] Extracted from popup:", data);
      return data;
    } catch (error) {
      console.error("[PopupExtractor] Error extracting from popup:", error);
      return {};
    }
  }

  private async extractFromTableRow(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("[PopupExtractor] Extracting from table row...");
      const data: EnrichedLeadData = {};

      // Get all cells
      const cells = await leadRow.locator("td, div[role='cell']").all();
      console.log(`[PopupExtractor] Found ${cells.length} cells in row`);

      // Extract by position
      for (let i = 0; i < Math.min(cells.length, 10); i++) {
        const cellText = await cells[i].textContent();
        console.log(`[PopupExtractor] Cell ${i}: ${cellText?.substring(0, 50)}`);
      }

      // Map cells to fields
      if (cells.length > 0) data.fullName = await this.getCellText(cells, 0);
      if (cells.length > 1) data.company = await this.getCellText(cells, 1);
      if (cells.length > 2) data.email = await this.getCellText(cells, 2);
      if (cells.length > 3) data.phoneNumber = await this.getCellText(cells, 3);
      if (cells.length > 4) data.jobTitle = await this.getCellText(cells, 4);
      if (cells.length > 5) data.companySize = await this.getCellText(cells, 5);
      if (cells.length > 6) data.industry = await this.getCellText(cells, 6);

      console.log("[PopupExtractor] Extracted from row:", data);
      return data;
    } catch (error) {
      console.error("[PopupExtractor] Error extracting from row:", error);
      return {};
    }
  }

  private async getCellText(cells: Locator[], index: number): Promise<string | undefined> {
    try {
      if (index >= cells.length) return undefined;
      const text = await cells[index].textContent();
      return text ? text.trim() : undefined;
    } catch {
      return undefined;
    }
  }
}

export { PopupAwareDataExtractor };
