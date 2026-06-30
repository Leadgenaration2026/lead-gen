import { chromium, Browser, Page, Locator } from "playwright";
import { getDb } from "./db";
import { leads } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

/**
 * DEBUGGING VERSION - Comprehensive logging at every step
 * Saves screenshots, HAR logs, and detailed timestamps
 */

const DEBUG_DIR = "/tmp/seamless-debug";
const SCREENSHOTS_DIR = path.join(DEBUG_DIR, "screenshots");
const LOGS_DIR = path.join(DEBUG_DIR, "logs");

// Create debug directories
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

interface DebugLog {
  timestamp: string;
  step: string;
  status: "START" | "SUCCESS" | "FAILURE" | "INFO" | "WARNING";
  details: any;
  leadIndex?: number;
}

class DebugLogger {
  private logs: DebugLog[] = [];
  private logFile: string;

  constructor(sessionId: string) {
    this.logFile = path.join(LOGS_DIR, `debug-${sessionId}.json`);
  }

  log(step: string, status: "START" | "SUCCESS" | "FAILURE" | "INFO" | "WARNING", details: any, leadIndex?: number) {
    const entry: DebugLog = {
      timestamp: new Date().toISOString(),
      step,
      status,
      details,
      leadIndex,
    };
    this.logs.push(entry);
    console.log(`[${status}] ${step} (${entry.timestamp}):`, JSON.stringify(details));
  }

  save() {
    fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2));
    console.log(`[DEBUG] Logs saved to ${this.logFile}`);
  }
}

export class SeamlessAIAutomationDebug {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private debugLogger: DebugLogger;
  private sessionId: string;

  constructor() {
    this.sessionId = `session-${Date.now()}`;
    this.debugLogger = new DebugLogger(this.sessionId);
  }

  async start(seamlessAIUrl: string): Promise<void> {
    this.debugLogger.log("BROWSER_LAUNCH", "START", { url: seamlessAIUrl });

    try {
      this.browser = await chromium.launch({ headless: false });
      this.debugLogger.log("BROWSER_LAUNCH", "SUCCESS", { message: "Browser launched" });

      this.page = await this.browser.newPage();
      this.debugLogger.log("PAGE_CREATE", "SUCCESS", { message: "Page created" });

      // Navigate to Seamless.AI
      await this.page.goto(seamlessAIUrl, { waitUntil: "networkidle", timeout: 30000 });
      this.debugLogger.log("PAGE_NAVIGATE", "SUCCESS", { url: seamlessAIUrl });

      // Wait for page to fully load
      await this.page.waitForTimeout(2000);
      this.debugLogger.log("PAGE_READY", "SUCCESS", { message: "Page ready for automation" });
    } catch (error) {
      this.debugLogger.log("BROWSER_LAUNCH", "FAILURE", { error: String(error) });
      throw error;
    }
  }

  async enrichSelectedLeads(leadIds: number[]): Promise<any> {
    if (!this.page) throw new Error("Browser not initialized");

    this.debugLogger.log("ENRICH_START", "START", { leadIds, count: leadIds.length });

    try {
      // STEP 1: Detect leads on page
      this.debugLogger.log("LEAD_DETECTION", "START", { message: "Detecting leads on page" });

      const selectors = [
        "tr[data-lead-id]",
        ".lead-row",
        "[class*='lead'][class*='row']",
        "tbody tr",
      ];

      let detectedLeads: Locator[] = [];
      let usedSelector = "";

      for (const selector of selectors) {
        try {
          const elements = await this.page.$$(selector);
          if (elements.length > 0) {
            detectedLeads = await this.page.locator(selector).all();
            usedSelector = selector;
            this.debugLogger.log("LEAD_DETECTION", "SUCCESS", {
              selector,
              count: detectedLeads.length,
            });
            break;
          }
        } catch (e) {
          this.debugLogger.log("LEAD_DETECTION", "INFO", { selector, error: String(e) });
        }
      }

      if (detectedLeads.length === 0) {
        this.debugLogger.log("LEAD_DETECTION", "FAILURE", { message: "No leads found" });
        throw new Error("No leads detected on page");
      }

      // Take screenshot of page with leads
      await this.page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `01-leads-detected-${this.sessionId}.png`),
      });
      this.debugLogger.log("SCREENSHOT", "SUCCESS", { file: "01-leads-detected" });

      // STEP 2: Process each lead
      const stats = {
        totalLeads: leadIds.length,
        enrichedLeads: 0,
        failedLeads: 0,
        errors: [] as any[],
      };

      for (let i = 0; i < Math.min(leadIds.length, detectedLeads.length); i++) {
        const leadId = leadIds[i];
        const leadRow = detectedLeads[i];

        this.debugLogger.log("LEAD_PROCESS", "START", { leadIndex: i, leadId }, i);

        try {
          // Get lead info
          const leadInfo = await this.getLeadInfo(leadRow, i);
          this.debugLogger.log("LEAD_INFO", "SUCCESS", leadInfo, i);

          // Take screenshot before click
          await this.page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `02-lead-${i}-before-click-${this.sessionId}.png`),
          });

          // STEP 3: Find the Find button
          this.debugLogger.log("FIND_BUTTON_SEARCH", "START", { leadIndex: i }, i);

          const findButton = await this.findFindButton(leadRow, i);
          if (!findButton) {
            throw new Error("Find button not found");
          }

          this.debugLogger.log("FIND_BUTTON_SEARCH", "SUCCESS", { leadIndex: i }, i);

          // STEP 4: Click the Find button
          this.debugLogger.log("FIND_BUTTON_CLICK", "START", { leadIndex: i }, i);

          const clicked = await this.clickFindButton(findButton, leadRow, i);
          if (!clicked) {
            throw new Error("Failed to click Find button");
          }

          this.debugLogger.log("FIND_BUTTON_CLICK", "SUCCESS", { leadIndex: i }, i);

          // Take screenshot after click
          await this.page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `03-lead-${i}-after-click-${this.sessionId}.png`),
          });

          // STEP 5: Wait for enrichment
          this.debugLogger.log("ENRICHMENT_WAIT", "START", { leadIndex: i }, i);

          const enrichmentComplete = await this.waitForEnrichmentComplete(leadRow, i);
          if (!enrichmentComplete) {
            throw new Error("Enrichment timeout");
          }

          this.debugLogger.log("ENRICHMENT_WAIT", "SUCCESS", { leadIndex: i }, i);

          // Take screenshot after enrichment
          await this.page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `04-lead-${i}-after-enrichment-${this.sessionId}.png`),
          });

          // STEP 6: Extract data
          this.debugLogger.log("DATA_EXTRACTION", "START", { leadIndex: i }, i);

          const extractedData = await this.extractLeadData(leadRow, i);
          this.debugLogger.log("DATA_EXTRACTION", "SUCCESS", extractedData, i);

          // STEP 7: Save to database
          this.debugLogger.log("DATA_SAVE", "START", { leadIndex: i, leadId }, i);

          await this.saveEnrichedData(leadId, extractedData);
          this.debugLogger.log("DATA_SAVE", "SUCCESS", { leadIndex: i, leadId }, i);

          stats.enrichedLeads++;
          this.debugLogger.log("LEAD_PROCESS", "SUCCESS", { leadIndex: i, leadId }, i);
        } catch (error) {
          stats.failedLeads++;
          stats.errors.push({
            leadIndex: i,
            leadId,
            error: String(error),
          });
          this.debugLogger.log("LEAD_PROCESS", "FAILURE", { leadIndex: i, error: String(error) }, i);
        }
      }

      this.debugLogger.log("ENRICH_COMPLETE", "SUCCESS", stats);
      this.debugLogger.save();

      return stats;
    } catch (error) {
      this.debugLogger.log("ENRICH_COMPLETE", "FAILURE", { error: String(error) });
      this.debugLogger.save();
      throw error;
    }
  }

  private async getLeadInfo(leadRow: Locator, leadIndex: number): Promise<any> {
    try {
      const selectors = {
        name: "[class*='name'], [data-field='name'], td:nth-child(1)",
        company: "[class*='company'], [data-field='company'], td:nth-child(2)",
        email: "[class*='email'], [data-field='email'], td:nth-child(3)",
      };

      const info: any = {};

      for (const [key, selector] of Object.entries(selectors)) {
        try {
          const text = await leadRow.locator(selector).first().textContent();
          info[key] = text ? text.trim() : null;
        } catch {
          info[key] = null;
        }
      }

      return info;
    } catch (error) {
      this.debugLogger.log("GET_LEAD_INFO", "FAILURE", { error: String(error) }, leadIndex);
      return {};
    }
  }

  private async findFindButton(leadRow: Locator, leadIndex: number): Promise<Locator | null> {
    const selectors = [
      "button:has-text('Find')",
      "button:has-text('FIND')",
      "[data-action='find']",
      "button[class*='find']",
      "button",
    ];

    for (const selector of selectors) {
      try {
        const button = leadRow.locator(selector).first();
        const count = await button.count();
        if (count > 0) {
          const text = await button.textContent();
          this.debugLogger.log("FIND_BUTTON_LOCATED", "SUCCESS", { selector, text }, leadIndex);
          return button;
        }
      } catch (e) {
        this.debugLogger.log("FIND_BUTTON_SEARCH", "INFO", { selector, error: String(e) }, leadIndex);
      }
    }

    this.debugLogger.log("FIND_BUTTON_LOCATED", "FAILURE", { message: "No Find button found" }, leadIndex);
    return null;
  }

  private async clickFindButton(button: Locator, leadRow: Locator, leadIndex: number): Promise<boolean> {
    try {
      const page = button.page();
      if (!page) {
        throw new Error("Page not available");
      }

      // Get button position
      const box = await button.boundingBox();
      if (!box) {
        throw new Error("Button bounding box not available");
      }

      this.debugLogger.log("CLICK_PREPARATION", "SUCCESS", { box }, leadIndex);

      // Move mouse to button
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);

      // Click button
      await button.click();
      this.debugLogger.log("CLICK_EXECUTED", "SUCCESS", { x: box.x, y: box.y }, leadIndex);

      // Wait for response
      await page.waitForTimeout(500);

      return true;
    } catch (error) {
      this.debugLogger.log("CLICK_EXECUTED", "FAILURE", { error: String(error) }, leadIndex);
      return false;
    }
  }

  private async waitForEnrichmentComplete(leadRow: Locator, leadIndex: number): Promise<boolean> {
    const maxWaitTime = 30000;
    const checkInterval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check for phone number
        const phoneText = await leadRow.locator("[class*='phone'], [data-field='phone'], td:nth-child(4)").first().textContent();
        const phoneAvailable = phoneText && phoneText.trim() !== "" && phoneText.trim() !== "—";

        if (phoneAvailable) {
          this.debugLogger.log("ENRICHMENT_DETECTED", "SUCCESS", { phoneText, elapsedMs: Date.now() - startTime }, leadIndex);
          return true;
        }

        // Check for loading spinner
        const spinner = leadRow.locator("[class*='spinner'], [class*='loading']").first();
        const spinnerCount = await spinner.count();

        if (spinnerCount > 0) {
          this.debugLogger.log("ENRICHMENT_LOADING", "INFO", { elapsedMs: Date.now() - startTime }, leadIndex);
        }

        await leadRow.page()?.waitForTimeout(checkInterval);
      } catch (error) {
        this.debugLogger.log("ENRICHMENT_CHECK", "WARNING", { error: String(error) }, leadIndex);
        await leadRow.page()?.waitForTimeout(checkInterval);
      }
    }

    this.debugLogger.log("ENRICHMENT_TIMEOUT", "FAILURE", { maxWaitTime }, leadIndex);
    return false;
  }

  private async extractLeadData(leadRow: Locator, leadIndex: number): Promise<any> {
    const data: any = {};

    const fields = {
      fullName: "[class*='name'], [data-field='name'], td:nth-child(1)",
      company: "[class*='company'], [data-field='company'], td:nth-child(2)",
      email: "[class*='email'], [data-field='email'], td:nth-child(3)",
      phoneNumber: "[class*='phone'], [data-field='phone'], td:nth-child(4)",
      jobTitle: "[class*='title'], [data-field='title'], td:nth-child(5)",
      companySize: "[class*='size'], [data-field='size'], td:nth-child(6)",
    };

    for (const [key, selector] of Object.entries(fields)) {
      try {
        const text = await leadRow.locator(selector).first().textContent();
        data[key] = text ? text.trim() : null;
      } catch {
        data[key] = null;
      }
    }

    return data;
  }

  private async saveEnrichedData(leadId: number, data: any): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      await db
        .update(leads)
        .set({
          phoneNumber: data.phoneNumber || undefined,
          jobTitle: data.jobTitle || undefined,
          companySize: data.companySize || undefined,
        })
        .where(eq(leads.id, leadId));

      this.debugLogger.log("DATA_SAVED", "SUCCESS", { leadId }, undefined);
    } catch (error) {
      this.debugLogger.log("DATA_SAVED", "FAILURE", { leadId, error: String(error) }, undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.debugLogger.log("BROWSER_CLOSED", "SUCCESS", {});
    }
    this.debugLogger.save();
  }
}
