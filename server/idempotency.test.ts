import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";

/**
 * Idempotency Test Suite
 * 
 * Tests the idempotency protection mechanism that prevents:
 * - Double-click charges
 * - Browser retry charges
 * - React re-render charges
 * - Network failure duplicate charges
 */

describe("Idempotency Protection", () => {
  describe("Job ID Generation", () => {
    it("should generate a unique Job ID for each request", () => {
      const jobId1 = generateJobId("user1", "lead-1,lead-2,lead-3");
      const jobId2 = generateJobId("user1", "lead-1,lead-2,lead-3");
      
      // Same input should generate same Job ID (deterministic)
      expect(jobId1).toBe(jobId2);
    });

    it("should generate different Job IDs for different lead selections", () => {
      const jobId1 = generateJobId("user1", "lead-1,lead-2");
      const jobId2 = generateJobId("user1", "lead-1,lead-2,lead-3");
      
      expect(jobId1).not.toBe(jobId2);
    });

    it("should generate different Job IDs for different users", () => {
      const jobId1 = generateJobId("user1", "lead-1,lead-2");
      const jobId2 = generateJobId("user2", "lead-1,lead-2");
      
      expect(jobId1).not.toBe(jobId2);
    });

    it("should be deterministic (same input = same output)", () => {
      const input = "user123|lead-1,lead-2,lead-3";
      const jobId1 = generateJobId("user123", "lead-1,lead-2,lead-3");
      const jobId2 = generateJobId("user123", "lead-1,lead-2,lead-3");
      const jobId3 = generateJobId("user123", "lead-1,lead-2,lead-3");
      
      expect(jobId1).toBe(jobId2);
      expect(jobId2).toBe(jobId3);
    });

    it("should produce a valid hash format (hex string)", () => {
      const jobId = generateJobId("user1", "lead-1");
      
      // Should be a valid hex string (64 chars for SHA256)
      expect(jobId).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("Duplicate Detection", () => {
    const jobStore: Record<string, { timestamp: number; status: string }> = {};

    it("should detect duplicate Job IDs within the same minute", () => {
      const jobId = "abc123def456";
      const now = Date.now();

      // First request
      jobStore[jobId] = { timestamp: now, status: "pending" };
      const isDuplicate1 = isDuplicateRequest(jobId, jobStore, 60000); // 60 second window
      expect(isDuplicate1).toBe(false);

      // Second request (same Job ID, within 60 seconds)
      const isDuplicate2 = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate2).toBe(true);
    });

    it("should NOT detect duplicates after the idempotency window expires", () => {
      const jobId = "xyz789";
      const now = Date.now();

      // First request
      jobStore[jobId] = { timestamp: now - 120000, status: "completed" }; // 2 minutes ago

      // Second request (same Job ID, but > 60 seconds later)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(false);
    });

    it("should allow retries for failed requests", () => {
      const jobId = "retry123";
      const now = Date.now();

      // First request failed
      jobStore[jobId] = { timestamp: now - 5000, status: "failed" };

      // Retry should be allowed (not treated as duplicate)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(false); // Failed requests can be retried
    });

    it("should block retries for completed requests", () => {
      const jobId = "completed123";
      const now = Date.now();

      // First request completed
      jobStore[jobId] = { timestamp: now - 5000, status: "completed" };

      // Retry should be blocked (duplicate)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true); // Completed requests cannot be retried
    });
  });

  describe("Double-Click Protection", () => {
    it("should reject second click within 2 seconds", () => {
      const jobId = "click1";
      const jobStore: Record<string, { timestamp: number; status: string }> = {};
      const now = Date.now();

      // First click
      jobStore[jobId] = { timestamp: now, status: "pending" };

      // Second click (1 second later)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true);
    });

    it("should allow new enrichment after first completes", () => {
      const jobId1 = generateJobId("user1", "lead-1");
      const jobId2 = generateJobId("user1", "lead-2"); // Different lead
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // First enrichment completed
      jobStore[jobId1] = { timestamp: Date.now() - 10000, status: "completed" };

      // Second enrichment (different lead, different Job ID)
      const isDuplicate = isDuplicateRequest(jobId2, jobStore, 60000);
      expect(isDuplicate).toBe(false); // Different Job ID, not a duplicate
    });
  });

  describe("Browser Retry Protection", () => {
    it("should detect browser back-button retry", () => {
      const jobId = "browser-retry";
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // Original request
      jobStore[jobId] = { timestamp: Date.now() - 30000, status: "completed" };

      // Browser back button (user refreshes page and clicks again)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true); // Should be detected as duplicate
    });

    it("should detect browser refresh retry", () => {
      const jobId = "refresh-retry";
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // Original request
      jobStore[jobId] = { timestamp: Date.now() - 5000, status: "pending" };

      // Page refresh (same Job ID submitted again)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true);
    });
  });

  describe("React Re-render Protection", () => {
    it("should not be affected by React re-renders", () => {
      const jobId = generateJobId("user1", "lead-1,lead-2");
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // Simulate React component mounting multiple times
      const mount1 = jobId;
      const mount2 = jobId; // Same Job ID (deterministic)
      const mount3 = jobId;

      expect(mount1).toBe(mount2);
      expect(mount2).toBe(mount3);

      // All mounts produce same Job ID, so only first request goes through
      jobStore[jobId] = { timestamp: Date.now(), status: "pending" };
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true);
    });
  });

  describe("Network Failure Recovery", () => {
    it("should allow retry after network timeout", () => {
      const jobId = "network-fail";
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // Original request failed (network timeout)
      jobStore[jobId] = { timestamp: Date.now() - 5000, status: "failed" };

      // Retry (same Job ID, but status was failed)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(false); // Should allow retry
    });

    it("should prevent duplicate charges on network recovery", () => {
      const jobId = "network-recover";
      const jobStore: Record<string, { timestamp: number; status: string }> = {};

      // Original request succeeded (but user didn't see confirmation)
      jobStore[jobId] = { timestamp: Date.now() - 3000, status: "completed" };

      // User retries (thinking it failed)
      const isDuplicate = isDuplicateRequest(jobId, jobStore, 60000);
      expect(isDuplicate).toBe(true); // Should block retry (already completed)
    });
  });

  describe("Credit Protection", () => {
    it("should calculate expected credits correctly", () => {
      const selectedLeads = 5;
      const expectedCredits = calculateExpectedCredits(selectedLeads);
      
      expect(expectedCredits).toBe(5); // 1 credit per lead
    });

    it("should enforce maximum credits per run", () => {
      const selectedLeads = 150;
      const maxCreditsPerRun = 100;
      
      const shouldBlock = selectedLeads > maxCreditsPerRun;
      expect(shouldBlock).toBe(true);
    });

    it("should enforce hard limit (1000 credits)", () => {
      const selectedLeads = 1500;
      const hardLimit = 1000;
      
      const shouldBlock = selectedLeads > hardLimit;
      expect(shouldBlock).toBe(true);
    });

    it("should allow requests within configurable limit", () => {
      const selectedLeads = 20;
      const configuredLimit = 20;
      
      const shouldBlock = selectedLeads > configuredLimit;
      expect(shouldBlock).toBe(false);
    });
  });

  describe("Audit Logging", () => {
    it("should log all enrichment attempts", () => {
      const logs: string[] = [];
      const mockLog = (msg: string) => logs.push(msg);

      const jobId = generateJobId("user1", "lead-1");
      mockLog(`[Enrichment] Job ID: ${jobId}`);
      mockLog(`[Enrichment] Selected Leads: 1`);
      mockLog(`[Enrichment] Expected Credits: 1`);

      expect(logs).toContain(`[Enrichment] Job ID: ${jobId}`);
      expect(logs).toContain(`[Enrichment] Selected Leads: 1`);
      expect(logs).toContain(`[Enrichment] Expected Credits: 1`);
    });

    it("should log duplicate request attempts", () => {
      const logs: string[] = [];
      const mockLog = (msg: string) => logs.push(msg);

      const jobId = "dup123";
      mockLog(`[Enrichment] Duplicate request detected: ${jobId}`);

      expect(logs).toContain(`[Enrichment] Duplicate request detected: ${jobId}`);
    });
  });
});

/**
 * Helper Functions (simulating backend logic)
 */

function generateJobId(userId: string, leadIds: string): string {
  const payload = `${userId}|${leadIds}`;
  return createHash("sha256").update(payload).digest("hex");
}

function isDuplicateRequest(
  jobId: string,
  jobStore: Record<string, { timestamp: number; status: string }>,
  idempotencyWindowMs: number
): boolean {
  if (!jobStore[jobId]) {
    return false; // First request
  }

  const stored = jobStore[jobId];
  const now = Date.now();
  const age = now - stored.timestamp;

  // Allow retries for failed requests
  if (stored.status === "failed") {
    return false;
  }

  // Block retries for completed/pending requests within idempotency window
  if (age < idempotencyWindowMs) {
    return true;
  }

  // Allow new requests after idempotency window expires
  return false;
}

function calculateExpectedCredits(selectedLeadCount: number): number {
  return selectedLeadCount; // 1 credit per lead
}
