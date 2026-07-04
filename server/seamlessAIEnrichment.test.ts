import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as seamlessAI from "./seamlessAI";
import { leads } from "../drizzle/schema";

// Mock database functions
vi.mock("./db", () => ({
  getLeadById: vi.fn(),
  updateLead: vi.fn(),
  getUserSettings: vi.fn(),
}));

// Mock Seamless.AI functions
vi.mock("./seamlessAI", () => ({
  searchContacts: vi.fn(),
  researchContact: vi.fn(),
  createSeamlessError: vi.fn((error, context) => new Error(`Seamless Error: ${context} - ${error.message}`)),
  logSeamlessError: vi.fn(),
}));

// Helper to create a mock context for tRPC calls
function createMockContext(userId: number = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user${userId}@example.com`,
      name: `User ${userId}`,
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as any,
    res: {} as any,
  };
}

describe("seamlessAIEnrichmentRouter", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Default mock for getUserSettings
    (db.getUserSettings as vi.Mock).mockResolvedValue({
      seamlessApiKey: "mock-seamless-api-key",
    });
  });

  it("should submit exactly one research request per lead and respect maxResearchSubmissions", async () => {
    const mockLeads = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      ownerName: `Lead ${i + 1}`,
      companyName: `Company ${i + 1}`,
      email: `lead${i + 1}@company${i + 1}.com`,
      jobTitle: `Title ${i + 1}`,
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Mock getLeadById to return our mock leads
    (db.getLeadById as vi.Mock).mockImplementation((id) =>
      Promise.resolve(mockLeads.find((lead) => lead.id === id))
    );

    // Mock searchContacts to return a single search result for each lead
    (seamlessAI.searchContacts as vi.Mock).mockImplementation((apiKey, filters) => {
      const leadId = parseInt(filters.firstName.replace("Lead ", ""));
      return Promise.resolve({
        data: [
          {
            id: `search-result-${leadId}`,
            name: `Lead ${leadId}`,
            company: `Company ${leadId}`,
            email: `lead${leadId}@company${leadId}.com`,
            firstName: `Lead ${leadId}`,
            lastName: `1`,
            jobTitle: `Title ${leadId}`,
          },
        ],
      });
    });

    // Mock researchContact to return some enriched data
    (seamlessAI.researchContact as vi.Mock).mockImplementation((apiKey, searchResultIds) => {
      const leadId = parseInt(searchResultIds[0].replace("search-result-", ""));
      return Promise.resolve({
        email: `enriched-lead${leadId}@company${leadId}.com`,
        phoneNumber: `+1-555-000-${leadId}`,
      });
    });

    const caller = appRouter.createCaller(createMockContext());

    // Test with maxResearchSubmissions = 5
    const result = await caller.seamlessAIEnrichment.enrichLeads({
      leadIds: mockLeads.map((l) => l.id),
      confidenceThreshold: 0,
      maxResearchSubmissions: 5,
    });

    expect(result.success).toBe(true);
    expect(result.stats.searchesPerformed).toBe(5); // Only 5 leads are searched due to limit
    expect(result.stats.researchRequestsSubmitted).toBe(5); // Only 5 leads are researched due to limit
    expect(result.stats.skippedLeads).toBe(15); // 15 leads are skipped
    expect(db.updateLead).toHaveBeenCalledTimes(5); // Only 5 leads are updated

    // Verify that researchContact was called with exactly one searchResultId for each of the 5 researched leads
    const researchCalls = (seamlessAI.researchContact as vi.Mock).mock.calls;
    expect(researchCalls.length).toBe(5);
    researchCalls.forEach((call) => {
      expect(call[1]).toHaveLength(1); // Expecting an array with a single ID
      expect(typeof call[1][0]).toBe("string"); // Expecting the ID to be a string
    });

    // Test without maxResearchSubmissions (should enrich all 20)
    vi.clearAllMocks();
    (db.getUserSettings as vi.Mock).mockResolvedValue({
      seamlessApiKey: "mock-seamless-api-key",
    });
    (db.getLeadById as vi.Mock).mockImplementation((id) =>
      Promise.resolve(mockLeads.find((lead) => lead.id === id))
    );
    (seamlessAI.searchContacts as vi.Mock).mockImplementation((apiKey, filters) => {
      const leadId = parseInt(filters.firstName.replace("Lead ", ""));
      return Promise.resolve({
        data: [
          {
            id: `search-result-${leadId}`,
            name: `Lead ${leadId}`,
            company: `Company ${leadId}`,
            email: `lead${leadId}@company${leadId}.com`,
            firstName: `Lead ${leadId}`,
            lastName: `1`,
            jobTitle: `Title ${leadId}`,
          },
        ],
      });
    });
    (seamlessAI.researchContact as vi.Mock).mockImplementation((apiKey, searchResultIds) => {
      const leadId = parseInt(searchResultIds[0].replace("search-result-", ""));
      return Promise.resolve({
        email: `enriched-lead${leadId}@company${leadId}.com`,
        phoneNumber: `+1-555-000-${leadId}`,
      });
    });

    const resultAll = await caller.seamlessAIEnrichment.enrichLeads({
      leadIds: mockLeads.map((l) => l.id),
      confidenceThreshold: 0,
    });

    expect(resultAll.success).toBe(true);
    expect(resultAll.stats.searchesPerformed).toBe(20);
    expect(resultAll.stats.researchRequestsSubmitted).toBe(20);
    expect(resultAll.stats.skippedLeads).toBe(0);
    expect(db.updateLead).toHaveBeenCalledTimes(20);
  });

  it("should perform one search and one research request per lead", async () => {
    const mockLead = {
      id: 1,
      ownerName: "John Doe",
      companyName: "Example Corp",
      email: "john.doe@example.com",
      jobTitle: "CEO",
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.getLeadById as vi.Mock).mockResolvedValue(mockLead);
    (seamlessAI.searchContacts as vi.Mock).mockResolvedValue({
      data: [
        {
          id: "search-result-1",
          name: "John Doe",
          company: "Example Corp",
          email: "john.doe@example.com",
          firstName: "John",
          lastName: "Doe",
          jobTitle: "CEO",
        },
      ],
    });
    (seamlessAI.researchContact as vi.Mock).mockResolvedValue({
      email: "john.doe.enriched@example.com",
      phoneNumber: "+1-555-123-4567",
    });

    const caller = appRouter.createCaller(createMockContext());
    await caller.seamlessAIEnrichment.enrichLeads({
      leadIds: [mockLead.id],
      confidenceThreshold: 0,
    });

    expect(seamlessAI.searchContacts).toHaveBeenCalledTimes(1);
    expect(seamlessAI.researchContact).toHaveBeenCalledTimes(1);
    expect(db.updateLead).toHaveBeenCalledTimes(1);
    expect(db.updateLead).toHaveBeenCalledWith(mockLead.id, expect.objectContaining({
      email: "john.doe.enriched@example.com",
      phoneNumber: "+1-555-123-4567",
    }));
  });

  it("should mark leads as 'needs_review' if confidence is too low", async () => {
    const mockLead = {
      id: 1,
      ownerName: "John Doe",
      companyName: "Example Corp",
      email: "john.doe@example.com",
      jobTitle: "CEO",
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.getLeadById as vi.Mock).mockResolvedValue(mockLead);
    (seamlessAI.searchContacts as vi.Mock).mockResolvedValue({
      data: [
        {
          id: "search-result-1",
          name: "Jane Doe", // Mismatch name for low confidence
          company: "Different Corp", // Mismatch company name for low confidence
          email: "jane.doe@different.com", // Mismatch email for low confidence
          firstName: "Jane",
          lastName: "Doe",
          jobTitle: "Intern", // Mismatch job title for low confidence, ensuring a low score
        },
      ],
    });
    (seamlessAI.researchContact as vi.Mock).mockResolvedValue({}); // Should not be called

    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.seamlessAIEnrichment.enrichLeads({
      leadIds: [mockLead.id],
      confidenceThreshold: 80, // High threshold, ensuring the score is below it
    });

    expect(result.success).toBe(true);
    expect(result.stats.searchesPerformed).toBe(1);
    expect(result.stats.resultsReturned).toBe(1);
    expect(result.stats.needsReviewLeads).toBe(1);
    expect(result.stats.researchRequestsSubmitted).toBe(0); // Research should not be called
    expect(db.updateLead).not.toHaveBeenCalled(); // Lead should not be updated
  });

  it("should handle cases where no search results are found", async () => {
    const mockLead = {
      id: 1,
      ownerName: "Non Existent Lead",
      companyName: "No Company",
      email: "no.email@no.com",
      jobTitle: "None",
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.getLeadById as vi.Mock).mockResolvedValue(mockLead);
    (seamlessAI.searchContacts as vi.Mock).mockResolvedValue({
      data: [], // No search results
    });
    (seamlessAI.researchContact as vi.Mock).mockResolvedValue({}); // Should not be called

    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.seamlessAIEnrichment.enrichLeads({
      leadIds: [mockLead.id],
      confidenceThreshold: 0,
    });

    expect(result.success).toBe(true);
    expect(result.stats.searchesPerformed).toBe(1);
    expect(result.stats.resultsReturned).toBe(1);
    expect(result.stats.needsReviewLeads).toBe(1);
    expect(result.stats.researchRequestsSubmitted).toBe(0);
    expect(db.updateLead).not.toHaveBeenCalled();
  });
});
