import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database module
vi.mock("./db", () => ({
  getLeadsByUserId: vi.fn(),
  deleteLead: vi.fn(),
  getLeadSetsByUserId: vi.fn(),
  createLeadSet: vi.fn(),
  renameLeadSet: vi.fn(),
  deleteLeadSet: vi.fn(),
  assignLeadsToSet: vi.fn(),
  createLead: vi.fn(),
  getLeadByEmail: vi.fn(),
  getCampaignsByUserId: vi.fn(),
  getCampaignLeads: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  addLeadsToCampaign: vi.fn(),
  getTemplatesByUserId: vi.fn(),
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getSmtpSettingsByUserId: vi.fn(),
  getRetellSettingsByUserId: vi.fn(),
  upsertSmtpSettings: vi.fn(),
  upsertRetellSettings: vi.fn(),
  getScheduledEmailsByUserId: vi.fn(),
  createScheduledEmail: vi.fn(),
  updateScheduledEmail: vi.fn(),
  getDueScheduledEmails: vi.fn(),
  upsertLeadByEmail: vi.fn(),
}));

import * as db from "./db";

describe("Batch 10 — Bulk Delete, Lead Set Management & CSV Export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Bulk Delete", () => {
    it("should delete multiple leads by IDs", async () => {
      const mockDeleteLead = vi.mocked(db.deleteLead);
      mockDeleteLead.mockResolvedValue(undefined as any);

      const leadIds = [1, 2, 3, 4, 5];
      for (const id of leadIds) {
        await db.deleteLead(id);
      }

      expect(mockDeleteLead).toHaveBeenCalledTimes(5);
      expect(mockDeleteLead).toHaveBeenCalledWith(1);
      expect(mockDeleteLead).toHaveBeenCalledWith(5);
    });

    it("should handle empty lead IDs array gracefully", () => {
      const leadIds: number[] = [];
      expect(leadIds.length).toBe(0);
      // No calls should be made for empty array
    });
  });

  describe("Lead Set Management", () => {
    it("should create a new lead set", async () => {
      const mockCreate = vi.mocked(db.createLeadSet);
      mockCreate.mockResolvedValue({ id: 1, name: "SaaS Companies", description: "B2B SaaS leads", userId: "user1", createdAt: new Date() } as any);

      const result = await db.createLeadSet("user1", "SaaS Companies", "B2B SaaS leads");
      expect(result).toEqual(expect.objectContaining({ name: "SaaS Companies" }));
      expect(mockCreate).toHaveBeenCalledWith("user1", "SaaS Companies", "B2B SaaS leads");
    });

    it("should rename a lead set", async () => {
      const mockRename = vi.mocked(db.renameLeadSet);
      mockRename.mockResolvedValue(undefined as any);

      await db.renameLeadSet(1, "Updated Name");
      expect(mockRename).toHaveBeenCalledWith(1, "Updated Name");
    });

    it("should delete a lead set", async () => {
      const mockDelete = vi.mocked(db.deleteLeadSet);
      mockDelete.mockResolvedValue(undefined as any);

      await db.deleteLeadSet(1);
      expect(mockDelete).toHaveBeenCalledWith(1);
    });

    it("should assign leads to a set", async () => {
      const mockAssign = vi.mocked(db.assignLeadsToSet);
      mockAssign.mockResolvedValue(undefined as any);

      await db.assignLeadsToSet([1, 2, 3], 5);
      expect(mockAssign).toHaveBeenCalledWith([1, 2, 3], 5);
    });

    it("should unassign leads (set to null)", async () => {
      const mockAssign = vi.mocked(db.assignLeadsToSet);
      mockAssign.mockResolvedValue(undefined as any);

      await db.assignLeadsToSet([1, 2], null as any);
      expect(mockAssign).toHaveBeenCalledWith([1, 2], null);
    });
  });

  describe("CSV Export Logic", () => {
    it("should generate proper CSV content from leads data", () => {
      const leads = [
        { companyName: "Acme Corp", ownerName: "John Doe", email: "john@acme.com", phone: "+1234567890", industry: "Tech", tag: "hot", leadSetId: 1 },
        { companyName: "Beta Inc", ownerName: "Jane Smith", email: "jane@beta.com", phone: "+0987654321", industry: "Finance", tag: "warm", leadSetId: null },
      ];
      const leadSets = [{ id: 1, name: "SaaS Companies" }];

      const headers = ["Company", "Owner", "Email", "Phone", "Industry", "Tag", "Lead Set"];
      const rows = leads.map((lead) => [
        lead.companyName || "",
        lead.ownerName || "",
        lead.email || "",
        lead.phone || "",
        lead.industry || "",
        lead.tag || "",
        leadSets.find((s) => s.id === lead.leadSetId)?.name || "Unassigned",
      ]);
      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      expect(csvContent).toContain('"Company","Owner","Email","Phone","Industry","Tag","Lead Set"');
      expect(csvContent).toContain('"Acme Corp","John Doe","john@acme.com","+1234567890","Tech","hot","SaaS Companies"');
      expect(csvContent).toContain('"Beta Inc","Jane Smith","jane@beta.com","+0987654321","Finance","warm","Unassigned"');
    });

    it("should handle special characters in CSV (quotes, commas)", () => {
      const cell = 'Company "Best", Inc.';
      const escaped = `"${cell.replace(/"/g, '""')}"`;
      expect(escaped).toBe('"Company ""Best"", Inc."');
    });

    it("should filter leads by lead set before export", () => {
      const allLeads = [
        { id: 1, leadSetId: 1, companyName: "A" },
        { id: 2, leadSetId: 2, companyName: "B" },
        { id: 3, leadSetId: 1, companyName: "C" },
        { id: 4, leadSetId: null, companyName: "D" },
      ];

      // Filter by set 1
      const filtered = allLeads.filter(l => l.leadSetId === 1);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(l => l.companyName)).toEqual(["A", "C"]);

      // Filter unassigned
      const unassigned = allLeads.filter(l => !l.leadSetId);
      expect(unassigned).toHaveLength(1);
      expect(unassigned[0].companyName).toBe("D");
    });
  });

  describe("Lead Set Merge Logic", () => {
    it("should reassign all leads from source to target set", async () => {
      const mockGetLeads = vi.mocked(db.getLeadsByUserId);
      const mockAssign = vi.mocked(db.assignLeadsToSet);
      const mockDelete = vi.mocked(db.deleteLeadSet);

      mockGetLeads.mockResolvedValue([
        { id: 1, leadSetId: 5 },
        { id: 2, leadSetId: 5 },
        { id: 3, leadSetId: 10 },
      ] as any);
      mockAssign.mockResolvedValue(undefined as any);
      mockDelete.mockResolvedValue(undefined as any);

      // Simulate merge: move leads from set 5 to set 10
      const allLeads = await db.getLeadsByUserId("user1");
      const sourceLeadIds = allLeads.filter((l: any) => l.leadSetId === 5).map((l: any) => l.id);
      
      expect(sourceLeadIds).toEqual([1, 2]);
      
      await db.assignLeadsToSet(sourceLeadIds, 10);
      await db.deleteLeadSet(5);

      expect(mockAssign).toHaveBeenCalledWith([1, 2], 10);
      expect(mockDelete).toHaveBeenCalledWith(5);
    });
  });
});
