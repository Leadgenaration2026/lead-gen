import { chromium, Browser, Page, Locator } from "playwright";
import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { APIResponseParser, type EnrichmentAPIResponse } from "./apiResponseParser";

/**
 * Seamless.AI Browser Automation System
 * Enriches leads with phone numbers, job titles, company size, etc.
 * Simulates human behavior with realistic delays and interactions
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EnrichedLeadData {
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

export interface EnrichmentResult {
  leadId: number;
  success: boolean;
  data?: EnrichedLeadData;
  error?: string;
  retryCount: number;
}

export interface AutomationStats {
  totalLeads: number;
  enrichedLeads?: number;
  successfulLeads?: number;
  failedLeads: number;
  skippedLeads: number;
  startTime?: Date;
  endTime?: Date;
  errors?: Array<{ leadId: number; error: string }>;
  totalSearchResults?: number;
  extractedCount?: number;
}

// ============================================================================
// ERROR LOGGER MODULE
// ============================================================================

class ErrorLogger {
  private errors: Array<{ timestamp: Date; leadId?: number; message: string; type: string }> = [];

  log(message: string, type: string = "error", leadId?: number) {
    const entry = { timestamp: new Date(), leadId, message, type };
    this.errors.push(entry);
    console.error(`[${type.toUpperCase()}] Lead ${leadId || "N/A"}: ${message}`);
  }

  getErrors() {
    return this.errors;
  }

  clear() {
    this.errors = [];
  }
}

// ============================================================================
// LEAD DETECTOR MODULE
// ============================================================================

class LeadDetector {
  async detectLeads(page: Page): Promise<Locator[]> {
    // Wait for lead rows to load
    await page.waitForSelector("tr[data-lead-id], .lead-row, [class*='lead'][class*='row']", {
      timeout: 10000,
    });

    // Try multiple selectors for lead rows
    const selectors = [
      "tr[data-lead-id]",
      ".lead-row",
      "[class*='lead'][class*='row']",
      "tbody tr",
    ];

    for (const selector of selectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`[LeadDetector] Found ${elements.length} leads using selector: ${selector}`);
        return page.locator(selector).all();
      }
    }

    throw new Error("No lead rows found on page");
  }

  async getLeadInfo(leadRow: Locator): Promise<{ name?: string; company?: string; email?: string }> {
    try {
      const nameEl = await leadRow.locator("[class*='name'], [data-field='name']").first();
      const companyEl = await leadRow.locator("[class*='company'], [data-field='company']").first();
      const emailEl = await leadRow.locator("[class*='email'], [data-field='email']").first();

      const name = (await nameEl.textContent())?.trim() || undefined;
      const company = (await companyEl.textContent())?.trim() || undefined;
      const email = (await emailEl.textContent())?.trim() || undefined;

      return { name, company, email };
    } catch (error) {
      return {};
    }
  }
}

// ============================================================================
// FIND BUTTON CONTROLLER MODULE
// ============================================================================

class FindButtonController {
  private readonly humanDelayMin = 200;  // Reduced from 500 for faster processing
  private readonly humanDelayMax = 800;  // Reduced from 2000 for faster processing

  private randomDelay(min: number = this.humanDelayMin, max: number = this.humanDelayMax) {
    return Math.random() * (max - min) + min;
  }

  async findFindButton(leadRow: Locator): Promise<Locator | null> {
    try {
      // Try multiple button selectors
      const selectors = [
        "button:has-text('Find')",
        "button:has-text('FIND')",
        "[data-action='find']",
        "button[class*='find']",
      ];

      for (const selector of selectors) {
        const button = leadRow.locator(selector).first();
        if ((await button.count()) > 0) {
          return button;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async isPhoneNumberAvailable(leadRow: Locator): Promise<boolean> {
    try {
      const phoneCell = leadRow.locator("[class*='phone'], [data-field='phone']").first();
      const phoneText = await phoneCell.textContent();
      // Check if phone is not empty and not showing placeholder
      return phoneText ? phoneText.trim() !== "" && phoneText.trim() !== "—" : false;
    } catch {
      return false;
    }
  }

  async clickFindButton(button: Locator, leadRow: Locator): Promise<boolean> {
    try {
      // Simulate human mouse movement
      const box = await button.boundingBox();
      if (!box) return false;

      const page = button.page();
      if (!page) return false;

      // Move mouse to button with human-like path
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(this.randomDelay(100, 300));

      // Click the button
      await button.click();
      console.log(`[FindButtonController] Clicked Find button`);

      // Wait for page to respond
      await page.waitForTimeout(this.randomDelay(500, 1000));

      return true;
    } catch (error) {
      console.error(`[FindButtonController] Failed to click Find button:`, error);
      return false;
    }
  }
}

// ============================================================================
// ENRICHMENT WATCHER MODULE
// ============================================================================

class EnrichmentWatcher {
  private readonly maxWaitTime = 30000; // 30 seconds
  private readonly checkInterval = 500; // Check every 500ms

  async waitForEnrichmentComplete(leadRow: Locator, initialPhoneStatus: boolean): Promise<boolean> {
    const startTime = Date.now();
    let lastLogTime = startTime;
    const page = leadRow.page();
    if (!page) return false;

    while (Date.now() - startTime < this.maxWaitTime) {
      try {
        const elapsedMs = Date.now() - startTime;

        // Strategy 1: Check for loading spinner
        const spinner = leadRow.locator("[class*='spinner'], [class*='loading'], .spinner, .loader").first();
        const spinnerCount = await spinner.count();
        if (spinnerCount > 0) {
          if (Date.now() - lastLogTime > 3000) {
            console.log(`[EnrichmentWatcher] Still loading... (${elapsedMs}ms)`);
            lastLogTime = Date.now();
          }
          await page.waitForTimeout(this.checkInterval);
          continue;
        }

        // Strategy 2: Check for phone number in any cell (more robust)
        // NOTE: This uses the leadRow locator which may become stale after React re-render
        // The main enrichSingleLead method handles re-locating after enrichment completes
        const cells = await leadRow.locator("td, div[role='cell'], [class*='cell']").all();
        let phoneFound = false;
        for (let i = 0; i < Math.min(cells.length, 10); i++) {
          const cellText = await cells[i].textContent();
          if (cellText && /^\+?1?\s*\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/.test(cellText.trim())) {
            console.log(`[EnrichmentWatcher] Phone detected in cell ${i}: ${cellText.trim()} (${elapsedMs}ms)`);
            phoneFound = true;
            break;
          }
        }

        if (phoneFound && !initialPhoneStatus) {
          console.log(`[EnrichmentWatcher] Phone number appeared - enrichment complete`);
          return true;
        }

        // Strategy 3: Check if Find button is disabled
        try {
          const findButton = leadRow.locator("button:has-text('Find')").first();
          const findButtonCount = await findButton.count();
          if (findButtonCount > 0) {
            const isDisabled = await findButton.evaluate((el: any) => (el as HTMLButtonElement).disabled);
            if (isDisabled) {
              console.log(`[EnrichmentWatcher] Find button disabled - enrichment complete`);
              return true;
            }
          }
        } catch (e) {
          // Ignore button check errors
        }

        // Strategy 4: After 5 seconds, assume enrichment is done
        if (elapsedMs > 5000) {
          console.log(`[EnrichmentWatcher] Waited ${elapsedMs}ms, assuming enrichment complete`);
          return true;
        }

        // Wait before next check
        await page.waitForTimeout(this.checkInterval);
      } catch (error) {
        console.error(`[EnrichmentWatcher] Error during enrichment check:`, error);
        await page.waitForTimeout(this.checkInterval);
      }
    }

    console.warn(`[EnrichmentWatcher] Enrichment timeout after ${this.maxWaitTime}ms`);
    return false;
  }
}

// ============================================================================
// DATA EXTRACTOR MODULE - POPUP AWARE
// ============================================================================

class DataExtractor {
  async extractLeadData(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      console.log("[DataExtractor] Starting data extraction from table row...");
      const data: EnrichedLeadData = {};

      // Get all cells in the row - these are the table columns
      const cells = await leadRow.locator("td, div[role='cell']").all();
      console.log(`[DataExtractor] Found ${cells.length} table cells in row`);

      // Extract text from each cell
      const cellTexts: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        try {
          const cellText = await cells[i].textContent();
          const trimmed = cellText ? cellText.trim() : "";
          cellTexts.push(trimmed);
          console.log(`[DataExtractor] Cell ${i}: "${trimmed.substring(0, 100)}"`);
        } catch (e) {
          cellTexts.push("");
        }
      }

      // Based on the table structure:
      // Column 0: Checkbox
      // Column 1: Name
      // Column 2: Phones
      // Column 3: Company
      // Column 4: Emails
      // Column 5+: Other fields

      // Extract from Phones column (column 2)
      if (cellTexts.length > 2) {
        const phonesCell = cellTexts[2];
        console.log(`[DataExtractor] Phones cell content: "${phonesCell}"`);
        
        // Look for phone pattern: (XXX) XXX-XXXX or similar
        const phonePattern = /(\+?1?\s*)?(\()?([0-9]{3})(\))?[-.]?([0-9]{3})[-.]?([0-9]{4})/;
        const phoneMatch = phonesCell.match(phonePattern);
        if (phoneMatch && phoneMatch[0]) {
          data.phoneNumber = phoneMatch[0].trim();
          console.log(`[DataExtractor] Extracted phone from column 2: ${data.phoneNumber}`);
        }
      }

      // Extract from Emails column (column 4)
      if (cellTexts.length > 4) {
        const emailsCell = cellTexts[4];
        console.log(`[DataExtractor] Emails cell content: "${emailsCell}"`);
        
        // Look for email pattern
        const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
        const emailMatch = emailsCell.match(emailPattern);
        if (emailMatch && emailMatch[0]) {
          data.email = emailMatch[0].trim();
          console.log(`[DataExtractor] Extracted email from column 4: ${data.email}`);
        }
      }

      // Extract job title from all cells (it might be in a separate column or in the name cell)
      const allCellText = cellTexts.join(" ");
      const jobTitlePattern = /(Manager|Director|Engineer|Developer|Designer|Analyst|Specialist|Coordinator|Consultant|Officer|Executive|President|CEO|CTO|CFO|COO|CMO|VP|Head|Lead|Senior|Junior|Associate|Architect|Administrator|Supervisor|Technician)[\w\s]*/i;
      const jobMatch = allCellText.match(jobTitlePattern);
      if (jobMatch && jobMatch[0]) {
        data.jobTitle = jobMatch[0].trim();
        console.log(`[DataExtractor] Extracted job title: ${data.jobTitle}`);
      }

      // Extract company size from all cells
      const companySizePattern = /(1-10|11-50|51-200|201-500|501-1000|1000\+|\d+\s*-\s*\d+\s*(?:employees|people|staff))/i;
      const sizeMatch = allCellText.match(companySizePattern);
      if (sizeMatch && sizeMatch[0]) {
        data.companySize = sizeMatch[0].trim();
        console.log(`[DataExtractor] Extracted company size: ${data.companySize}`);
      }

      console.log(`[DataExtractor] Final extracted data:`, data);
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
      const popupText = await popup.textContent() || "";
      
      console.log("[DataExtractor] Extracting from popup...");
      console.log("[DataExtractor] Popup text length:", popupText.length);
      
      // Split into lines for analysis
      const lines = popupText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      console.log(`[DataExtractor] Found ${lines.length} non-empty lines`);
      
      // Strategy 1: Look for phone numbers using multiple patterns
      const phonePatterns = [
        /(\+?1?\s*)?(\()?([0-9]{3})(\))?[-.]?([0-9]{3})[-.]?([0-9]{4})/,  // (XXX) XXX-XXXX
        /\b([0-9]{3})[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/,  // XXX-XXX-XXXX
      ];
      
      for (const pattern of phonePatterns) {
        const match = popupText.match(pattern);
        if (match && match[0]) {
          data.phoneNumber = match[0].trim();
          console.log(`[DataExtractor] Found phone using pattern: ${data.phoneNumber}`);
          break;
        }
      }
      
      // Strategy 2: Look for job title in lines
      // Try to find it after common keywords or as a standalone line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if line contains title keywords
        if (/title|position|role|job/i.test(line)) {
          // If it's a label line, get the next line
          if (/^(title|position|role|job)\s*:?\s*$/i.test(line) && i + 1 < lines.length) {
            data.jobTitle = lines[i + 1];
            console.log(`[DataExtractor] Found job title (next line): ${data.jobTitle}`);
            break;
          }
          // If it contains the label and value, extract value
          else if (/:\s*/.test(line)) {
            const parts = line.split(/:\s*/);
            if (parts.length > 1) {
              data.jobTitle = parts[1].trim();
              console.log(`[DataExtractor] Found job title (same line): ${data.jobTitle}`);
              break;
            }
          }
          // If it's just the title value
          else if (!/^(title|position|role|job)\s*:?\s*$/i.test(line)) {
            data.jobTitle = line;
            console.log(`[DataExtractor] Found job title (direct): ${data.jobTitle}`);
            break;
          }
        }
      }
      
      // Strategy 3: Look for company size in lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if line contains size keywords
        if (/size|employees|employee|count|headcount|staff/i.test(line)) {
          // If it's a label line, get the next line
          if (/^(size|employees|employee|count|headcount|staff)\s*:?\s*$/i.test(line) && i + 1 < lines.length) {
            data.companySize = lines[i + 1];
            console.log(`[DataExtractor] Found company size (next line): ${data.companySize}`);
            break;
          }
          // If it contains the label and value, extract value
          else if (/:\s*/.test(line)) {
            const parts = line.split(/:\s*/);
            if (parts.length > 1) {
              data.companySize = parts[1].trim();
              console.log(`[DataExtractor] Found company size (same line): ${data.companySize}`);
              break;
            }
          }
          // If it's just the size value
          else if (!/^(size|employees|employee|count|headcount|staff)\s*:?\s*$/i.test(line)) {
            data.companySize = line;
            console.log(`[DataExtractor] Found company size (direct): ${data.companySize}`);
            break;
          }
        }
      }
      
      console.log("[DataExtractor] Final extracted data:", data);
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

// ============================================================================
// RETRY MANAGER MODULE
// ============================================================================

class RetryManager {
  private readonly maxRetries = 2;
  private readonly retryDelayMin = 2000;
  private readonly retryDelayMax = 5000;

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    leadId: number,
    errorLogger: ErrorLogger
  ): Promise<{ success: boolean; result?: T; retryCount: number }> {
    let lastError: Error | null = null;
    let retryCount = 0;

    for (retryCount = 0; retryCount <= this.maxRetries; retryCount++) {
      try {
        const result = await operation();
        return { success: true, result, retryCount };
      } catch (error) {
        lastError = error as Error;

        if (retryCount < this.maxRetries) {
          const delay = Math.random() * (this.retryDelayMax - this.retryDelayMin) + this.retryDelayMin;
          console.log(
            `[RetryManager] Retry ${retryCount + 1}/${this.maxRetries} for lead ${leadId} after ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    errorLogger.log(
      `Failed after ${this.maxRetries} retries: ${lastError?.message}`,
      "error",
      leadId
    );
    return { success: false, retryCount: this.maxRetries };
  }
}

// ============================================================================
// PAGINATION MANAGER MODULE
// ============================================================================

class PaginationManager {
  async hasNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = page.locator("button:has-text('Next'), a:has-text('Next')").first();
      const isDisabled = await nextButton.evaluate((el: any) => (el as HTMLElement).getAttribute("disabled"));
      return !isDisabled && (await nextButton.count()) > 0;
    } catch {
      return false;
    }
  }

  async goToNextPage(page: Page): Promise<boolean> {
    try {
      const nextButton = page.locator("button:has-text('Next'), a:has-text('Next')").first();
      await nextButton.click();
      await page.waitForTimeout(2000); // Wait for page to load
      return true;
    } catch (error) {
      console.error(`[PaginationManager] Failed to go to next page:`, error);
      return false;
    }
  }
}

// ============================================================================
// MAIN AUTOMATION ORCHESTRATOR
// ============================================================================

export class SeamlessAIAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private leadDetector = new LeadDetector();
  private findButtonController = new FindButtonController();
  private enrichmentWatcher = new EnrichmentWatcher();
  private dataExtractor = new DataExtractor();
  private retryManager = new RetryManager();
  private paginationManager = new PaginationManager();
  private errorLogger = new ErrorLogger();
  private stats: AutomationStats;
  private lastEnrichmentResponse: EnrichmentAPIResponse | null = null;

  constructor() {
    this.stats = {
      totalLeads: 0,
      enrichedLeads: 0,
      failedLeads: 0,
      skippedLeads: 0,
      startTime: new Date(),
      errors: [],
    };
  }

  async start(seamlessAIUrl: string): Promise<void> {
    try {
      console.log("[SeamlessAIAutomation] Starting browser automation...");
      this.browser = await chromium.launch({ headless: false });
      this.page = await this.browser.newPage();

      // Intercept all network responses to capture enrichment data
      await this.page.on('response', async (response) => {
        try {
          const url = response.url();
          const status = response.status();
          
          // Capture ALL responses
          if (status === 200 || status === 201) {
            try {
              const responseText = await response.text();
              console.log(`\n[NETWORK] ${status} ${url}`);
              console.log(`[NETWORK] Response:`, responseText.substring(0, 500));
              
              // Save to file for debugging
              const fs = require('fs');
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `/tmp/seamless_response_${timestamp}.json`;
              fs.writeFileSync(filename, responseText, 'utf-8');
              console.log(`[NETWORK] Saved to: ${filename}`);
              
              // Try to parse as enrichment data
              const parsed = APIResponseParser.parseEnrichmentResponse(responseText);
              if (parsed && APIResponseParser.hasEnrichmentData(parsed)) {
                console.log(`[NETWORK] ✅ Enrichment data found:`, {
                  phone: parsed.phone,
                  title: parsed.title,
                  companySize: parsed.companySize,
                });
                this.lastEnrichmentResponse = parsed;
              }
            } catch (e) {
              // Continue on error
            }
          }
        } catch (e) {
          // Silently ignore errors in response logging
        }
      });

      await this.page.goto(seamlessAIUrl, { waitUntil: "networkidle" });
      console.log("[SeamlessAIAutomation] Browser ready");
    } catch (error) {
      this.errorLogger.log(`Failed to start browser: ${error}`, "fatal");
      throw error;
    }
  }

  async enrichAllLeads(): Promise<AutomationStats> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      let pageNumber = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        console.log(`[SeamlessAIAutomation] Processing page ${pageNumber}...`);

        const leads = await this.leadDetector.detectLeads(this.page);
        console.log(`[SeamlessAIAutomation] Found ${leads.length} leads on page ${pageNumber}`);

        for (let i = 0; i < leads.length; i++) {
          const leadRow = leads[i];
          const leadInfo = await this.leadDetector.getLeadInfo(leadRow);

          // For enrichAllLeads, we don't have a specific leadId, so use 0 as placeholder
          const result = await this.retryManager.executeWithRetry(
            () => this.enrichSingleLead(leadRow, 0),
            i,
            this.errorLogger
          );

          if (result.success && result.result) {
            this.stats.enrichedLeads++;
            console.log(
              `[SeamlessAIAutomation] Enriched lead ${i + 1}/${leads.length}: ${leadInfo.name}`
            );
          } else {
            this.stats.failedLeads++;
            this.stats.errors.push({
              leadId: i,
              error: `Failed after ${result.retryCount} retries`,
            });
          }

          this.stats.totalLeads++;
        }

        // Check for next page
        hasMorePages = await this.paginationManager.hasNextPage(this.page);
        if (hasMorePages) {
          console.log(`[SeamlessAIAutomation] Moving to next page...`);
          await this.paginationManager.goToNextPage(this.page);
          pageNumber++;
        }
      }

      this.stats.endTime = new Date();
      console.log("[SeamlessAIAutomation] Enrichment complete", this.stats);

      return this.stats;
    } catch (error) {
      this.errorLogger.log(`Enrichment failed: ${error}`, "fatal");
      throw error;
    }
  }

  private async enrichSingleLead(leadRow: Locator, leadId: number): Promise<EnrichedLeadData | null> {
    let leadName: string | null = null;
    let page: Page | null = null;

    try {
      console.log(`[SeamlessAIAutomation] Starting enrichment for lead ${leadId}`);

      // Get the page reference for later re-querying
      page = leadRow.page();
      if (!page) {
        throw new Error("Cannot get page reference from leadRow");
      }

      // STEP 1: Capture BEFORE state and extract lead name as unique identifier
      console.log(`[SeamlessAIAutomation] Capturing BEFORE state...`);
      const beforeData = await this.dataExtractor.extractLeadData(leadRow);
      leadName = beforeData.fullName || null;
      console.log(`[SeamlessAIAutomation] BEFORE:`, beforeData);
      console.log(`[SeamlessAIAutomation] Lead name (unique ID): "${leadName}"`);

      // Check if phone is already available
      const phoneAvailable = beforeData.phoneNumber ? true : false;

      if (phoneAvailable) {
        console.log(`[SeamlessAIAutomation] Phone already available, skipping Find button`);
        this.stats.skippedLeads++;
        return beforeData;
      }

      // STEP 2: Find and click the Find button
      console.log(`[SeamlessAIAutomation] Finding Find button...`);
      const findButton = await this.findButtonController.findFindButton(leadRow);
      if (!findButton) {
        throw new Error("Find button not found");
      }

      console.log(`[SeamlessAIAutomation] Clicking Find button...`);
      const clicked = await this.findButtonController.clickFindButton(findButton, leadRow);
      if (!clicked) {
        throw new Error("Failed to click Find button");
      }

      // STEP 3: Wait for enrichment to complete
      console.log(`[SeamlessAIAutomation] Waiting for enrichment to complete...`);
      const enrichmentComplete = await this.enrichmentWatcher.waitForEnrichmentComplete(
        leadRow,
        phoneAvailable
      );

      if (!enrichmentComplete) {
        throw new Error("Enrichment timeout");
      }

      // STEP 4: CRITICAL FIX - Discard old locator and re-query DOM
      // After React re-renders, the old leadRow locator is stale
      console.log(`[SeamlessAIAutomation] OLD LOCATOR IS NOW STALE - Re-querying DOM from page root...`);
      console.log(`[SeamlessAIAutomation] Looking for lead by name: "${leadName}"`);

      if (!leadName) {
        throw new Error("Cannot re-locate lead: name is null");
      }

      // Re-query the table from the page root
      const freshLeadRow = await this.relocateLeadByName(page, leadName);
      if (!freshLeadRow) {
        throw new Error(`Could not re-locate lead by name: "${leadName}"`);
      }

      console.log(`[SeamlessAIAutomation] Successfully re-located lead by name: "${leadName}"`);

      // STEP 5: Use API response data if available, otherwise extract from DOM
      console.log(`[SeamlessAIAutomation] Checking for API response data...`);
      let afterData: any;
      
      if (this.lastEnrichmentResponse && APIResponseParser.hasEnrichmentData(this.lastEnrichmentResponse)) {
        console.log(`[SeamlessAIAutomation] ✅ Using API response data:`, this.lastEnrichmentResponse);
        afterData = {
          fullName: leadName,
          phoneNumber: this.lastEnrichmentResponse.phone,
          jobTitle: this.lastEnrichmentResponse.title,
          companySize: this.lastEnrichmentResponse.companySize,
          email: this.lastEnrichmentResponse.email,
          company: this.lastEnrichmentResponse.company,
          linkedinUrl: this.lastEnrichmentResponse.linkedinUrl,
          industry: (this.lastEnrichmentResponse as any).industry,
          website: (this.lastEnrichmentResponse as any).website,
        };
        this.lastEnrichmentResponse = null; // Clear for next lead
      } else {
        console.log(`[SeamlessAIAutomation] No API response, extracting from DOM...`);
        afterData = await this.dataExtractor.extractLeadData(freshLeadRow);
      }
      console.log(`[SeamlessAIAutomation] AFTER:`, afterData);

      // STEP 6: Verify that enrichment actually happened
      const enrichmentHappened = this.verifyEnrichmentHappened(beforeData, afterData);
      if (!enrichmentHappened) {
        console.error(`[SeamlessAIAutomation] ENRICHMENT FAILED: No fields changed for lead ${leadId}`);
        console.error(`[SeamlessAIAutomation] BEFORE:`, beforeData);
        console.error(`[SeamlessAIAutomation] AFTER:`, afterData);
        throw new Error("Enrichment failed: No fields changed");
      }

      console.log(`[SeamlessAIAutomation] Enrichment successful for lead ${leadId}`);

      // STEP 7: Save to database using leadId
      await this.saveEnrichedData(leadId, afterData);

      return afterData;
    } catch (error) {
      console.error(`[SeamlessAIAutomation] Error enriching lead ${leadId}:`, error);
      throw error;
    }
  }

  private async relocateLeadByName(page: Page, leadName: string): Promise<Locator | null> {
    try {
      console.log(`[SeamlessAIAutomation] Re-locating lead by name: "${leadName}"`);

      // Wait for table to stabilize
      await page.waitForTimeout(500);

      // Get all lead rows from the page root
      const rows = await page.locator("tr, [class*='row']").all();
      console.log(`[SeamlessAIAutomation] Found ${rows.length} rows in table`);

      // Search through rows to find the one with matching name
      for (let i = 0; i < rows.length; i++) {
        try {
          const rowText = await rows[i].textContent();
          if (rowText && rowText.includes(leadName)) {
            console.log(`[SeamlessAIAutomation] Found matching row at index ${i}`);
            return rows[i];
          }
        } catch (e) {
          // Continue to next row
        }
      }

      console.error(`[SeamlessAIAutomation] Could not find row with name: "${leadName}"`);
      return null;
    } catch (error) {
      console.error(`[SeamlessAIAutomation] Error relocating lead:`, error);
      return null;
    }
  }


  private verifyEnrichmentHappened(beforeData: EnrichedLeadData, afterData: EnrichedLeadData): boolean {
    // Check if any of the critical enrichment fields changed
    const criticalFields: (keyof EnrichedLeadData)[] = ["phoneNumber", "jobTitle", "companySize"];

    for (const field of criticalFields) {
      const before = beforeData[field];
      const after = afterData[field];

      // Check if field went from empty to populated
      const beforeEmpty = !before || before === "" || before === "—";
      const afterPopulated = after && after !== "" && after !== "—";

      if (beforeEmpty && afterPopulated) {
        console.log(`[SeamlessAIAutomation] Enrichment detected: ${field} changed from "${before}" to "${after}"`);
        return true;
      }
    }

    console.error(`[SeamlessAIAutomation] No enrichment detected. Critical fields unchanged:`);
    console.error(`  phoneNumber: "${beforeData.phoneNumber}" -> "${afterData.phoneNumber}"`);
    console.error(`  jobTitle: "${beforeData.jobTitle}" -> "${afterData.jobTitle}"`);
    console.error(`  companySize: "${beforeData.companySize}" -> "${afterData.companySize}"`);
    return false;
  }

  private async saveEnrichedData(leadId: number, data: EnrichedLeadData): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[SeamlessAIAutomation] Database not available");
        return;
      }

      // Update lead by ID (not by email)
      await db
        .update(leads)
        .set({
          phoneNumber: data.phoneNumber || undefined,
          phoneType: (data.phoneType || undefined) as any,
          secondaryPhone: data.secondaryPhone || undefined,
          secondaryPhoneType: (data.secondaryPhoneType || undefined) as any,
          companySize: data.companySize || undefined,
          jobTitle: data.jobTitle || undefined,
          industry: data.industry || undefined,
          linkedinUrl: data.linkedinUrl || undefined,
          website: data.website || undefined,
          personalEmail: data.personalEmail || undefined,
          workEmail: data.workEmail || undefined,
        })
        .where(eq(leads.id, leadId));

      console.log(`[SeamlessAIAutomation] Saved enriched data for lead ${leadId}`);
    } catch (error) {
      console.error(`[SeamlessAIAutomation] Failed to save enriched data for lead ${leadId}:`, error);
      throw error;
    }
  }

  async enrichSelectedLeads(leadIds: number[]): Promise<AutomationStats> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      console.log(`[SeamlessAIAutomation] Starting enrichment for ${leadIds.length} selected leads`);

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const allDomLeads = await this.leadDetector.detectLeads(this.page);
      console.log(`[SeamlessAIAutomation] Found ${allDomLeads.length} total leads on page`);

      // Map requested leadIds to DOM rows
      const selectedLeads: Array<{ domRow: Locator; leadId: number }> = [];
      for (const leadId of leadIds) {
        try {
          const dbLead = await getDb().then(d => d ? d.select().from(leads).where(eq(leads.id, leadId)).limit(1) : null).then(r => r?.[0]);
          if (!dbLead) {
            console.warn(`[SeamlessAIAutomation] Lead ${leadId} not found in database`);
            continue;
          }

          // Find matching DOM row by email
          let matchedRow: Locator | null = null;
          for (const domRow of allDomLeads) {
            const leadInfo = await this.leadDetector.getLeadInfo(domRow);
            if (leadInfo.email === dbLead.email) {
              matchedRow = domRow;
              break;
            }
          }

          if (matchedRow) {
            selectedLeads.push({ domRow: matchedRow, leadId });
            console.log(`[SeamlessAIAutomation] Mapped leadId ${leadId} to DOM row`);
          } else {
            console.warn(`[SeamlessAIAutomation] Could not find DOM row for lead ${leadId}`);
          }
        } catch (error) {
          console.error(`[SeamlessAIAutomation] Error mapping lead ${leadId}:`, error);
        }
      }

      console.log(`[SeamlessAIAutomation] Successfully mapped ${selectedLeads.length}/${leadIds.length} leads`);

      for (let i = 0; i < selectedLeads.length; i++) {
        const { domRow: leadRow, leadId } = selectedLeads[i];

        const result = await this.retryManager.executeWithRetry(
          () => this.enrichSingleLead(leadRow, leadId),
          leadId,
          this.errorLogger
        );

        if (result.success && result.result) {
          this.stats.enrichedLeads++;
          console.log(
            `[SeamlessAIAutomation] Enriched lead ${i + 1}/${selectedLeads.length}`
          );
        } else {
          this.stats.failedLeads++;
          this.stats.errors.push({
            leadId: leadIds[i],
            error: `Failed after ${result.retryCount} retries`,
          });
        }

        this.stats.totalLeads++;
      }

      this.stats.endTime = new Date();
      console.log("[SeamlessAIAutomation] Selected leads enrichment complete", this.stats);

      return this.stats;
    } catch (error) {
      this.errorLogger.log(`Enrichment failed: ${error}`, "fatal");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log("[SeamlessAIAutomation] Browser closed");
    }
  }

  getStats(): AutomationStats {
    return this.stats;
  }

  getErrors() {
    return this.errorLogger.getErrors();
  }
}
