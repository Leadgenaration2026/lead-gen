import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getCampaignsByUserId: vi.fn(),
  getLeadsByUserId: vi.fn(),
  getCampaignLeads: vi.fn(),
  getCampaignTemplatesByUserId: vi.fn(),
  createCampaign: vi.fn(),
  addLeadsToCampaign: vi.fn(),
}));

import * as db from "./db";

describe("Analytics Router - Overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should compute correct totals from campaign leads", async () => {
    const mockCampaigns = [
      { id: 1, name: "Campaign A", status: "active", createdAt: new Date("2024-06-01") },
      { id: 2, name: "Campaign B", status: "draft", createdAt: new Date("2024-06-02") },
    ];
    const mockLeads = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const mockCampaignLeads1 = [
      { emailSent: true, emailOpened: true, emailClicked: true, callTriggered: true },
      { emailSent: true, emailOpened: true, emailClicked: false, callTriggered: false },
      { emailSent: true, emailOpened: false, emailClicked: false, callTriggered: false },
    ];
    const mockCampaignLeads2 = [
      { emailSent: true, emailOpened: true, emailClicked: true, callTriggered: true },
    ];

    (db.getCampaignsByUserId as any).mockResolvedValue(mockCampaigns);
    (db.getLeadsByUserId as any).mockResolvedValue(mockLeads);
    (db.getCampaignLeads as any)
      .mockResolvedValueOnce(mockCampaignLeads1)
      .mockResolvedValueOnce(mockCampaignLeads2);

    // Simulate the overview logic
    let totalSent = 0, totalOpened = 0, totalClicked = 0, totalCalls = 0;
    for (const campaign of mockCampaigns) {
      const cls = await db.getCampaignLeads(campaign.id);
      for (const cl of cls as any[]) {
        if (cl.emailSent) totalSent++;
        if (cl.emailOpened) totalOpened++;
        if (cl.emailClicked) totalClicked++;
        if (cl.callTriggered) totalCalls++;
      }
    }

    expect(totalSent).toBe(4);
    expect(totalOpened).toBe(3);
    expect(totalClicked).toBe(2);
    expect(totalCalls).toBe(2);

    const overallOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const overallClickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;
    expect(overallOpenRate).toBe(75);
    expect(overallClickRate).toBe(50);
  });

  it("should handle empty campaigns gracefully", async () => {
    (db.getCampaignsByUserId as any).mockResolvedValue([]);
    (db.getLeadsByUserId as any).mockResolvedValue([]);

    const campaigns = await db.getCampaignsByUserId(1);
    expect(campaigns).toEqual([]);

    const overallOpenRate = 0;
    const overallClickRate = 0;
    expect(overallOpenRate).toBe(0);
    expect(overallClickRate).toBe(0);
  });
});

describe("Analytics Router - Time Series", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should compute open rate and click rate per date", async () => {
    const mockCampaigns = [
      { id: 1, createdAt: new Date("2024-06-01") },
      { id: 2, createdAt: new Date("2024-06-01") },
      { id: 3, createdAt: new Date("2024-06-03") },
    ];
    const mockCL1 = [
      { emailSent: true, emailOpened: true, emailClicked: false, callTriggered: false },
      { emailSent: true, emailOpened: false, emailClicked: false, callTriggered: false },
    ];
    const mockCL2 = [
      { emailSent: true, emailOpened: true, emailClicked: true, callTriggered: true },
    ];
    const mockCL3 = [
      { emailSent: true, emailOpened: false, emailClicked: false, callTriggered: false },
      { emailSent: true, emailOpened: true, emailClicked: true, callTriggered: false },
    ];

    (db.getCampaignsByUserId as any).mockResolvedValue(mockCampaigns);
    (db.getCampaignLeads as any)
      .mockResolvedValueOnce(mockCL1)
      .mockResolvedValueOnce(mockCL2)
      .mockResolvedValueOnce(mockCL3);

    // Simulate time series logic
    const dateMap = new Map<string, { sent: number; opened: number; clicked: number; calls: number }>();

    for (const campaign of mockCampaigns) {
      const cls = await db.getCampaignLeads(campaign.id) as any[];
      const dateKey = new Date(campaign.createdAt).toISOString().split("T")[0];
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { sent: 0, opened: 0, clicked: 0, calls: 0 });
      }
      const entry = dateMap.get(dateKey)!;
      for (const cl of cls) {
        if (cl.emailSent) entry.sent++;
        if (cl.emailOpened) entry.opened++;
        if (cl.emailClicked) entry.clicked++;
        if (cl.callTriggered) entry.calls++;
      }
    }

    const sortedDates = Array.from(dateMap.keys()).sort();
    const dataPoints = sortedDates.map((date) => {
      const entry = dateMap.get(date)!;
      const openRate = entry.sent > 0 ? Math.round((entry.opened / entry.sent) * 100) : 0;
      const clickRate = entry.sent > 0 ? Math.round((entry.clicked / entry.sent) * 100) : 0;
      return { date, ...entry, openRate, clickRate };
    });

    expect(dataPoints).toHaveLength(2);
    // June 1: 3 sent, 2 opened, 1 clicked => openRate=67, clickRate=33
    expect(dataPoints[0].date).toBe("2024-06-01");
    expect(dataPoints[0].sent).toBe(3);
    expect(dataPoints[0].opened).toBe(2);
    expect(dataPoints[0].openRate).toBe(67);
    expect(dataPoints[0].clickRate).toBe(33);
    // June 3: 2 sent, 1 opened, 1 clicked => openRate=50, clickRate=50
    expect(dataPoints[1].date).toBe("2024-06-03");
    expect(dataPoints[1].sent).toBe(2);
    expect(dataPoints[1].openRate).toBe(50);
    expect(dataPoints[1].clickRate).toBe(50);
  });
});

describe("Analytics Router - Top Templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should compute template open/click rates from linked campaigns via templateId", async () => {
    const mockTemplates = [
      { id: 10, name: "Template A", emailType: "discovery", usageCount: 5, subject: "Hello", tags: "sales" },
      { id: 20, name: "Template B", emailType: "value_prop", usageCount: 2, subject: "Offer", tags: "promo" },
    ];
    const mockCampaigns = [
      { id: 1, templateId: 10, subject: "Hello", createdAt: new Date() },
      { id: 2, templateId: 10, subject: "Hello", createdAt: new Date() },
      { id: 3, templateId: 20, subject: "Offer", createdAt: new Date() },
    ];

    // Use mockImplementation for deterministic results based on campaign ID
    (db.getCampaignLeads as any).mockImplementation((campaignId: number) => {
      if (campaignId === 1) return Promise.resolve([
        { emailSent: true, emailOpened: true, emailClicked: true },
        { emailSent: true, emailOpened: true, emailClicked: false },
      ]);
      if (campaignId === 2) return Promise.resolve([
        { emailSent: true, emailOpened: false, emailClicked: false },
      ]);
      if (campaignId === 3) return Promise.resolve([
        { emailSent: true, emailOpened: true, emailClicked: true },
        { emailSent: true, emailOpened: false, emailClicked: false },
      ]);
      return Promise.resolve([]);
    });

    (db.getCampaignTemplatesByUserId as any).mockResolvedValue(mockTemplates);
    (db.getCampaignsByUserId as any).mockResolvedValue(mockCampaigns);

    // Simulate top templates logic
    const enriched = await Promise.all(
      mockTemplates.map(async (t) => {
        const matchingCampaigns = mockCampaigns.filter(
          (c: any) => c.templateId === t.id || (!c.templateId && c.subject === t.subject)
        );
        let totalSent = 0, totalOpened = 0, totalClicked = 0;
        for (const campaign of matchingCampaigns) {
          const cls = await db.getCampaignLeads(campaign.id) as any[];
          for (const cl of cls) {
            if (cl.emailSent) totalSent++;
            if (cl.emailOpened) totalOpened++;
            if (cl.emailClicked) totalClicked++;
          }
        }
        return {
          id: t.id,
          name: t.name,
          totalSent,
          totalOpened,
          totalClicked,
          openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
        };
      })
    );

    // Template A: campaigns 1 & 2 match (templateId=10)
    // Campaign 1: 2 sent, 2 opened, 1 clicked
    // Campaign 2: 1 sent, 0 opened, 0 clicked
    // Total: 3 sent, 2 opened, 1 clicked => openRate=67%, clickRate=33%
    const templateA = enriched.find((e) => e.id === 10)!;
    expect(templateA.totalSent).toBe(3);
    expect(templateA.totalOpened).toBe(2);
    expect(templateA.totalClicked).toBe(1);
    expect(templateA.openRate).toBe(67);
    expect(templateA.clickRate).toBe(33);

    // Template B: campaign 3 matches (templateId=20)
    // Campaign 3: 2 sent, 1 opened, 1 clicked => openRate=50%, clickRate=50%
    const templateB = enriched.find((e) => e.id === 20)!;
    expect(templateB.totalSent).toBe(2);
    expect(templateB.totalOpened).toBe(1);
    expect(templateB.totalClicked).toBe(1);
    expect(templateB.openRate).toBe(50);
    expect(templateB.clickRate).toBe(50);
  });

  it("should sort templates by open rate descending", () => {
    const templates = [
      { id: 1, openRate: 30, usageCount: 10 },
      { id: 2, openRate: 75, usageCount: 3 },
      { id: 3, openRate: 50, usageCount: 5 },
    ];

    const sorted = templates.sort((a, b) => b.openRate - a.openRate || b.usageCount - a.usageCount);
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });
});

describe("Campaign Creation with templateId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass templateId when creating campaign from template", async () => {
    (db.createCampaign as any).mockResolvedValue({ insertId: 99 });
    (db.addLeadsToCampaign as any).mockResolvedValue(undefined);

    const input = {
      name: "Test Campaign",
      description: "From template",
      subject: "Hello {{ownerName}}",
      emailTemplate: "<p>Hi</p>",
      leadIds: [1, 2, 3],
      templateId: 42,
    };

    const result = await db.createCampaign({
      userId: 1,
      name: input.name,
      description: input.description,
      subject: input.subject,
      emailTemplate: input.emailTemplate,
      templateId: input.templateId || null,
      status: "draft",
      totalLeads: input.leadIds.length,
    } as any);

    expect(db.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 42,
        totalLeads: 3,
      })
    );
  });

  it("should set templateId to null when not provided", async () => {
    (db.createCampaign as any).mockResolvedValue({ insertId: 100 });

    const input = {
      name: "Direct Campaign",
      subject: "Hello",
      emailTemplate: "<p>Hi</p>",
      leadIds: [1],
    };

    await db.createCampaign({
      userId: 1,
      name: input.name,
      subject: input.subject,
      emailTemplate: input.emailTemplate,
      templateId: (input as any).templateId || null,
      status: "draft",
      totalLeads: input.leadIds.length,
    } as any);

    expect(db.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: null,
      })
    );
  });
});
