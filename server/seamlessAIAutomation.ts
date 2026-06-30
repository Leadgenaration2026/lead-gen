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

    while (Date.now() - startTime < this.maxWaitTime) {
      try {
        // Check 1: Phone number appeared
        const phoneCell = leadRow.locator("[class*='phone'], [data-field='phone']").first();
        const phoneText = await phoneCell.textContent();
        const phoneAvailable = phoneText ? phoneText.trim() !== "" && phoneText.trim() !== "—" : false;

        if (!initialPhoneStatus && phoneAvailable) {
          console.log(`[EnrichmentWatcher] Phone number detected - enrichment complete`);
          return true;
        }

        // Check 2: Loading spinner disappeared
        const spinner = leadRow.locator("[class*='spinner'], [class*='loading']").first();
        const spinnerVisible = (await spinner.count()) > 0;

        if (spinnerVisible) {
          console.log(`[EnrichmentWatcher] Still loading...`);
          await leadRow.page()?.waitForTimeout(this.checkInterval);
          continue;
        }

        // Check 3: Find button changed state (disabled or hidden)
        const findButton = leadRow.locator("button:has-text('Find')").first();
        const findButtonDisabled = await findButton.evaluate((el: any) => (el as HTMLButtonElement).disabled);

        if (findButtonDisabled) {
          console.log(`[EnrichmentWatcher] Find button disabled - enrichment complete`);
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
// DATA EXTRACTOR MODULE
// ============================================================================

class DataExtractor {
  async extractLeadData(leadRow: Locator): Promise<EnrichedLeadData> {
    try {
      const data: EnrichedLeadData = {
        fullName: await this.extractText(leadRow, "[class*='name'], [data-field='name']"),
        company: await this.extractText(leadRow, "[class*='company'], [data-field='company']"),
        jobTitle: await this.extractText(leadRow, "[class*='title'], [data-field='title']"),
        phoneNumber: await this.extractText(leadRow, "[class*='phone'], [data-field='phone']"),
        phoneType: await this.detectPhoneType(leadRow),
        companySize: await this.extractText(leadRow, "[class*='size'], [data-field='size']"),
        industry: await this.extractText(leadRow, "[class*='industry'], [data-field='industry']"),
        linkedinUrl: await this.extractLink(leadRow, "a[href*='linkedin']"),
        email: await this.extractText(leadRow, "[class*='email'], [data-field='email']"),
        website: await this.extractLink(leadRow, "a[href*='http'][href*='www']"),
      };

      return data;
    } catch (error) {
      console.error(`[DataExtractor] Failed to extract lead data:`, error);
      throw error;
    }
  }

  private async extractText(element: Locator, selector: string): Promise<string | undefined> {
    try {
      const text = await element.locator(selector).first().textContent();
      return text ? text.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  private async extractLink(element: Locator, selector: string): Promise<string | undefined> {
    try {
      const href = await element.locator(selector).first().getAttribute("href");
      return href || undefined;
    } catch {
      return undefined;
    }
  }

  private async detectPhoneType(leadRow: Locator): Promise<"cell" | "office" | "unknown" | undefined> {
    try {
      const phoneCell = leadRow.locator("[class*='phone'], [data-field='phone']").first();
      const phoneText = await phoneCell.textContent();

      if (!phoneText) return undefined;

      // Simple heuristic: if phone has extension or specific patterns, it's office
      if (phoneText.includes("ext") || phoneText.includes("x") || phoneText.includes("(")) {
        return "office";
      }

      // Default to cell for mobile-looking numbers
      return "cell";
    } catch {
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

          const result = await this.retryManager.executeWithRetry(
            () => this.enrichSingleLead(leadRow),
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

  private async enrichSingleLead(leadRow: Locator): Promise<EnrichedLeadData | null> {
    try {
      // Check if phone is already available
      const phoneAvailable = await this.findButtonController.isPhoneNumberAvailable(leadRow);

      if (phoneAvailable) {
        console.log(`[SeamlessAIAutomation] Phone already available, skipping Find button`);
        this.stats.skippedLeads++;
        return await this.dataExtractor.extractLeadData(leadRow);
      }

      // Find and click the Find button
      const findButton = await this.findButtonController.findFindButton(leadRow);
      if (!findButton) {
        throw new Error("Find button not found");
      }

      const clicked = await this.findButtonController.clickFindButton(findButton, leadRow);
      if (!clicked) {
        throw new Error("Failed to click Find button");
      }

      // Wait for enrichment to complete
      const enrichmentComplete = await this.enrichmentWatcher.waitForEnrichmentComplete(
        leadRow,
        phoneAvailable
      );

      if (!enrichmentComplete) {
        throw new Error("Enrichment timeout");
      }

      // Extract enriched data
      const enrichedData = await this.dataExtractor.extractLeadData(leadRow);

      // Save to database
      await this.saveEnrichedData(enrichedData);

      return enrichedData;
    } catch (error) {
      throw error;
    }
  }

  private async saveEnrichedData(data: EnrichedLeadData): Promise<void> {
    try {
      // Find lead by email or name+company
      const db = await getDb();
      if (!db) {
        console.warn("[SeamlessAIAutomation] Database not available");
        return;
      }

      const leadQuery = await db.select().from(leads).where(eq(leads.email, data.email || ""));

      if (leadQuery.length > 0) {
        const lead = leadQuery[0];
        // Update lead with enriched data
        await db
          .update(leads)
          .set({
            phoneNumber: data.phoneNumber || lead.phoneNumber,
            phoneType: (data.phoneType || lead.phoneType) as any,
            secondaryPhone: data.secondaryPhone || lead.secondaryPhone,
            companySize: data.companySize || lead.companySize,
            jobTitle: data.jobTitle || lead.jobTitle,
            industry: data.industry || lead.industry,
            linkedinUrl: data.linkedinUrl || lead.linkedinUrl,
            website: data.website || lead.website,
          })
          .where(eq(leads.id, lead.id));

        console.log(`[SeamlessAIAutomation] Saved enriched data for lead ${lead.id}`);
      }
    } catch (error) {
      console.error(`[SeamlessAIAutomation] Failed to save enriched data:`, error);
    }
  }

  async enrichSelectedLeads(leadIds: number[]): Promise<AutomationStats> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      console.log(`[SeamlessAIAutomation] Starting enrichment for ${leadIds.length} selected leads`);

      const leads = await this.leadDetector.detectLeads(this.page);
      console.log(`[SeamlessAIAutomation] Found ${leads.length} total leads on page`);

      // Filter leads to only process selected ones
      const selectedLeads = leads.slice(0, leadIds.length);

      for (let i = 0; i < selectedLeads.length; i++) {
        const leadRow = selectedLeads[i];
        const leadInfo = await this.leadDetector.getLeadInfo(leadRow);

        const result = await this.retryManager.executeWithRetry(
          () => this.enrichSingleLead(leadRow),
          i,
          this.errorLogger
        );

        if (result.success && result.result) {
          this.stats.enrichedLeads++;
          console.log(
            `[SeamlessAIAutomation] Enriched lead ${i + 1}/${selectedLeads.length}: ${leadInfo.name}`
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
