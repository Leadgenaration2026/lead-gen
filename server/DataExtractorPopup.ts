import { Locator } from "playwright";

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

export class DataExtractorPopup {
  async extractLeadData(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("[DataExtractor] Starting data extraction...");

      // CRITICAL: Look for hidden popup with enriched data
      console.log("[DataExtractor] Looking for enrichment popup...");
      const popup = await this.findEnrichmentPopup(leadRow);

      if (popup) {
        console.log("[DataExtractor] Found enrichment popup! Extracting from popup...");
        const popupData = await this.extractFromPopup(popup);
        if (Object.keys(popupData).length > 0) {
          console.log("[DataExtractor] Successfully extracted from popup:", popupData);
          return popupData;
        }
      }

      // Get all cells/columns in the row
      const cells = await leadRow.locator("td, div[role='cell'], [class*='cell']").all();
      console.log(`[DataExtractor] Found ${cells.length} cells in row`);

      const data: EnrichedLeadData = {};

      // Extract data from cells
      if (cells.length > 0) {
        for (let i = 0; i < Math.min(cells.length, 10); i++) {
          const cellText = await cells[i].textContent();
          console.log(`[DataExtractor] Cell ${i}: ${cellText?.substring(0, 50)}`);
        }

        data.fullName = await this.extractFromCells(cells, 0, "name");
        data.company = await this.extractFromCells(cells, 1, "company");
        data.email = await this.extractFromCells(cells, 2, "email");
        data.phoneNumber = await this.extractFromCells(cells, 3, "phone");
        data.jobTitle = await this.extractFromCells(cells, 4, "title");
        data.companySize = await this.extractFromCells(cells, 5, "size");
        data.industry = await this.extractFromCells(cells, 6, "industry");
      }

      console.log(`[DataExtractor] Extracted data:`, data);
      return data;
    } catch (error) {
      console.error(`[DataExtractor] Failed to extract lead data:`, error);
      throw error;
    }
  }

  private async findEnrichmentPopup(leadRow: Locator): Promise<Locator | null> {
    try {
      const page = leadRow.page();
      if (!page) return null;

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
                  console.log(`[DataExtractor] Found popup with selector: ${selector}`);
                  return element;
                }
              } catch (e) {
                // Continue
              }
            }
          }
        } catch (e) {
          // Continue
        }
      }
      return null;
    } catch (error) {
      console.error("[DataExtractor] Error finding popup:", error);
      return null;
    }
  }

  private async extractFromPopup(popup: Locator): Promise<EnrichedLeadData> {
    try {
      const data: EnrichedLeadData = {};
      const popupText = await popup.textContent();
      console.log(`[DataExtractor] Popup text: ${popupText?.substring(0, 300)}`);

      // Extract phone
      const phoneMatch = popupText?.match(/(\+?1?\s*)?(\()?(\d{3})(\))?[-.]?(\d{3})[-.]?(\d{4})/);
      if (phoneMatch) {
        data.phoneNumber = phoneMatch[0].trim();
        console.log(`[DataExtractor] Found phone: ${data.phoneNumber}`);
      }

      // Extract job title
      const jobMatch = popupText?.match(/(?:Title|Position):\s*([^\n,]+)/i);
      if (jobMatch) {
        data.jobTitle = jobMatch[1].trim();
        console.log(`[DataExtractor] Found job title: ${data.jobTitle}`);
      }

      // Extract company size
      const sizeMatch = popupText?.match(/(?:Company Size|Size):\s*([^\n,]+)/i);
      if (sizeMatch) {
        data.companySize = sizeMatch[1].trim();
        console.log(`[DataExtractor] Found company size: ${data.companySize}`);
      }

      console.log("[DataExtractor] Extracted from popup:", data);
      return data;
    } catch (error) {
      console.error("[DataExtractor] Error extracting from popup:", error);
      return {};
    }
  }

  private async extractFromCells(cells: Locator[], index: number, fieldName: string): Promise<string | undefined> {
    try {
      if (index >= cells.length) return undefined;
      const text = await cells[index].textContent();
      const trimmed = text ? text.trim() : undefined;
      if (trimmed) {
        console.log(`[DataExtractor] Cell ${index} (${fieldName}): ${trimmed.substring(0, 50)}`);
      }
      return trimmed;
    } catch (error) {
      console.error(`[DataExtractor] Error extracting cell ${index}:`, error);
      return undefined;
    }
  }
}
