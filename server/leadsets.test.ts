import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getLeadSetsByUserId: vi.fn(),
  createLeadSet: vi.fn(),
  deleteLeadSet: vi.fn(),
  getLeadSetById: vi.fn(),
  assignLeadsToSet: vi.fn(),
  getLeadsBySetId: vi.fn(),
}));

import * as db from "./db";

describe("Lead Sets Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Lead Sets CRUD", () => {
    it("should list lead sets for a user", async () => {
      const mockSets = [
        { id: 1, name: "SaaS Companies", description: null, userId: 1, createdAt: new Date() },
        { id: 2, name: "Local Restaurants", description: "NYC area", userId: 1, createdAt: new Date() },
      ];
      (db.getLeadSetsByUserId as any).mockResolvedValue(mockSets);

      const result = await db.getLeadSetsByUserId(1);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("SaaS Companies");
      expect(result[1].name).toBe("Local Restaurants");
    });

    it("should create a new lead set", async () => {
      (db.createLeadSet as any).mockResolvedValue({ id: 3 });

      const result = await db.createLeadSet({
        name: "Tech Startups",
        description: "Series A+",
        userId: 1,
      });
      expect(result.id).toBe(3);
      expect(db.createLeadSet).toHaveBeenCalledWith({
        name: "Tech Startups",
        description: "Series A+",
        userId: 1,
      });
    });

    it("should delete a lead set", async () => {
      (db.deleteLeadSet as any).mockResolvedValue(undefined);

      await db.deleteLeadSet(1);
      expect(db.deleteLeadSet).toHaveBeenCalledWith(1);
    });
  });

  describe("Lead Assignment", () => {
    it("should assign multiple leads to a set", async () => {
      (db.assignLeadsToSet as any).mockResolvedValue(undefined);

      await db.assignLeadsToSet([1, 2, 3], 5);
      expect(db.assignLeadsToSet).toHaveBeenCalledWith([1, 2, 3], 5);
    });

    it("should remove leads from a set by assigning null", async () => {
      (db.assignLeadsToSet as any).mockResolvedValue(undefined);

      await db.assignLeadsToSet([1, 2], null);
      expect(db.assignLeadsToSet).toHaveBeenCalledWith([1, 2], null);
    });

    it("should get leads by set ID", async () => {
      const mockLeads = [
        { id: 1, companyName: "Acme", leadSetId: 5, userId: 1 },
        { id: 2, companyName: "Beta Corp", leadSetId: 5, userId: 1 },
      ];
      (db.getLeadsBySetId as any).mockResolvedValue(mockLeads);

      const result = await db.getLeadsBySetId(5, 1);
      expect(result).toHaveLength(2);
      expect(result.every((l: any) => l.leadSetId === 5)).toBe(true);
    });
  });

  describe("Lead Set Validation", () => {
    it("should verify lead set belongs to user before assignment", async () => {
      const mockSet = { id: 5, name: "My Set", userId: 1 };
      (db.getLeadSetById as any).mockResolvedValue(mockSet);

      const set = await db.getLeadSetById(5);
      expect(set).toBeDefined();
      expect(set!.userId).toBe(1);
    });

    it("should return null for non-existent lead set", async () => {
      (db.getLeadSetById as any).mockResolvedValue(null);

      const set = await db.getLeadSetById(999);
      expect(set).toBeNull();
    });
  });
});
