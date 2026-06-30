import { chromium, Browser, Page, Locator } from "playwright";
import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
  enrichedLeads: number;
  failedLeads: number;
  skippedLeads: number;
  startTime: Date;
  endTime?: Date;
  errors: Array<{ leadId: number; error: string }>;
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
          await leadRow.page()?.waitForTimeout(this.checkInterval);
          continue;
        }

        // Strategy 2: Check for phone number in any cell (more robust)
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
        await leadRow.page()?.waitForTimeout(this.checkInterval);
      } catch (error) {
        console.error(`[EnrichmentWatcher] Error during enrichment check:`, error);
        await leadRow.page()?.waitForTimeout(this.checkInterval);
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
      const phoneMatch = popupText?.match(/(\+?1?\s*)?(\()?(\ d{3})(\))?[-.]?(\d{3})[-.]?(\d{4})/);
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
    try {
      console.log(`[SeamlessAIAutomation] Starting enrichment for lead ${leadId}`);

      // STEP 1: Capture BEFORE state
      console.log(`[SeamlessAIAutomation] Capturing BEFORE state...`);
      const beforeData = await this.dataExtractor.extractLeadData(leadRow);
      console.log(`[SeamlessAIAutomation] BEFORE:`, beforeData);

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

      // STEP 4: Capture AFTER state
      console.log(`[SeamlessAIAutomation] Capturing AFTER state...`);
      const afterData = await this.dataExtractor.extractLeadData(leadRow);
      console.log(`[SeamlessAIAutomation] AFTER:`, afterData);

      // STEP 5: Verify that enrichment actually happened
      const enrichmentHappened = this.verifyEnrichmentHappened(beforeData, afterData);
      if (!enrichmentHappened) {
        console.error(`[SeamlessAIAutomation] ENRICHMENT FAILED: No fields changed for lead ${leadId}`);
        console.error(`[SeamlessAIAutomation] BEFORE:`, beforeData);
        console.error(`[SeamlessAIAutomation] AFTER:`, afterData);
        throw new Error("Enrichment failed: No fields changed");
      }

      console.log(`[SeamlessAIAutomation] Enrichment successful for lead ${leadId}`);

      // STEP 6: Save to database using leadId
      await this.saveEnrichedData(leadId, afterData);

      return afterData;
    } catch (error) {
      throw error;
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
