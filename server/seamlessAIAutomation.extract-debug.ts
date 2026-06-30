/**
 * DATA EXTRACTION DEBUGGING SCRIPT
 * 
 * This script adds comprehensive logging to the DataExtractor to identify why:
 * 1. No phone numbers are being extracted
 * 2. No company sizes are being extracted
 * 3. No job titles are being extracted
 * 
 * The issue is likely that the CSS selectors don't match Seamless.AI's actual DOM structure
 */

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

class DataExtractorDebug {
  async extractLeadData(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("\n[DataExtractorDebug] ===== STARTING DATA EXTRACTION =====");

      // Get the HTML of the lead row to inspect structure
      const html = await leadRow.evaluate((el) => el.outerHTML);
      console.log("[DataExtractorDebug] Lead Row HTML:", html.substring(0, 500) + "...");

      // Try to get all text content
      const allText = await leadRow.textContent();
      console.log("[DataExtractorDebug] All text in row:", allText);

      // Try to get all elements and their classes
      const elements = await leadRow.evaluate((el) => {
        const els = el.querySelectorAll("*");
        return Array.from(els).map((e) => ({
          tag: e.tagName,
          class: e.className,
          text: e.textContent?.substring(0, 50),
        }));
      });
      console.log("[DataExtractorDebug] All elements:", JSON.stringify(elements, null, 2));

      // Extract each field with detailed logging
      const data: EnrichedLeadData = {};

      // Name extraction
      console.log("\n[DataExtractorDebug] Extracting NAME...");
      data.fullName = await this.extractTextWithDebug(
        leadRow,
        "[class*='name'], [data-field='name'], td:nth-child(1), div:nth-child(1)",
        "NAME"
      );

      // Company extraction
      console.log("\n[DataExtractorDebug] Extracting COMPANY...");
      data.company = await this.extractTextWithDebug(
        leadRow,
        "[class*='company'], [data-field='company'], td:nth-child(2), div:nth-child(2)",
        "COMPANY"
      );

      // Email extraction
      console.log("\n[DataExtractorDebug] Extracting EMAIL...");
      data.email = await this.extractTextWithDebug(
        leadRow,
        "[class*='email'], [data-field='email'], td:nth-child(3), div:nth-child(3)",
        "EMAIL"
      );

      // Phone extraction - THIS IS CRITICAL
      console.log("\n[DataExtractorDebug] Extracting PHONE NUMBER...");
      data.phoneNumber = await this.extractTextWithDebug(
        leadRow,
        "[class*='phone'], [data-field='phone'], td:nth-child(4), div:nth-child(4)",
        "PHONE"
      );

      // Job Title extraction
      console.log("\n[DataExtractorDebug] Extracting JOB TITLE...");
      data.jobTitle = await this.extractTextWithDebug(
        leadRow,
        "[class*='title'], [data-field='title'], td:nth-child(5), div:nth-child(5)",
        "JOB_TITLE"
      );

      // Company Size extraction
      console.log("\n[DataExtractorDebug] Extracting COMPANY SIZE...");
      data.companySize = await this.extractTextWithDebug(
        leadRow,
        "[class*='size'], [data-field='size'], td:nth-child(6), div:nth-child(6)",
        "COMPANY_SIZE"
      );

      // Industry extraction
      console.log("\n[DataExtractorDebug] Extracting INDUSTRY...");
      data.industry = await this.extractTextWithDebug(
        leadRow,
        "[class*='industry'], [data-field='industry'], td:nth-child(7), div:nth-child(7)",
        "INDUSTRY"
      );

      console.log("\n[DataExtractorDebug] ===== EXTRACTION COMPLETE =====");
      console.log("[DataExtractorDebug] Extracted data:", JSON.stringify(data, null, 2));

      return data;
    } catch (error) {
      console.error(`[DataExtractorDebug] Failed to extract lead data:`, error);
      throw error;
    }
  }

  private async extractTextWithDebug(
    element: Locator,
    selector: string,
    fieldName: string
  ): Promise<string | undefined> {
    try {
      const selectors = selector.split(",").map((s) => s.trim());

      for (const sel of selectors) {
        try {
          const count = await element.locator(sel).count();
          console.log(
            `[DataExtractorDebug] ${fieldName} - Trying selector: "${sel}" - Found: ${count} elements`
          );

          if (count > 0) {
            const text = await element.locator(sel).first().textContent();
            const trimmed = text ? text.trim() : undefined;
            console.log(`[DataExtractorDebug] ${fieldName} - SUCCESS with selector "${sel}": "${trimmed}"`);
            return trimmed;
          }
        } catch (e) {
          console.log(`[DataExtractorDebug] ${fieldName} - Selector "${sel}" failed:`, String(e));
        }
      }

      console.log(`[DataExtractorDebug] ${fieldName} - NO MATCH FOUND for any selector`);
      return undefined;
    } catch (error) {
      console.error(`[DataExtractorDebug] ${fieldName} - Error:`, error);
      return undefined;
    }
  }
}

export { DataExtractorDebug };
