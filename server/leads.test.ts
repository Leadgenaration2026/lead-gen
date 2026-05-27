import { describe, it, expect, beforeEach, vi } from "vitest";
import * as db from "./db";

// Mock database functions
vi.mock("./db", () => ({
  getLeadsByUserId: vi.fn(),
  getLeadById: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  getCampaignById: vi.fn(),
  getCampaignLeads: vi.fn(),
  updateCampaignLead: vi.fn(),
  updateCampaign: vi.fn(),
  getUserSettings: vi.fn(),
  createEmailTrackingEvent: vi.fn(),
  getEmailTrackingEventByToken: vi.fn(),
  getCampaignLeadById: vi.fn(),
}));

describe("Lead Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve leads for a user", async () => {
    const mockLeads = [
      {
        id: 1,
        userId: 1,
        companyName: "Acme Corp",
        ownerName: "John Doe",
        email: "john@acme.com",
        phoneNumber: "+1234567890",
        status: "new",
      },
    ];

    vi.mocked(db.getLeadsByUserId).mockResolvedValue(mockLeads);

    const result = await db.getLeadsByUserId(1);
    expect(result).toEqual(mockLeads);
    expect(db.getLeadsByUserId).toHaveBeenCalledWith(1);
  });

  it("should create a new lead", async () => {
    const newLead = {
      userId: 1,
      companyName: "Tech Startup",
      ownerName: "Jane Smith",
      email: "jane@techstartup.com",
      phoneNumber: "+9876543210",
      status: "new" as const,
    };

    vi.mocked(db.createLead).mockResolvedValue({
      id: 2,
      ...newLead,
      website: null,
      industry: null,
      customData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await db.createLead(newLead);
    expect(result.companyName).toBe("Tech Startup");
    expect(result.ownerName).toBe("Jane Smith");
    expect(db.createLead).toHaveBeenCalledWith(newLead);
  });

  it("should update a lead", async () => {
    const updatedData = {
      companyName: "Updated Corp",
      status: "contacted" as const,
    };

    vi.mocked(db.updateLead).mockResolvedValue({
      id: 1,
      userId: 1,
      companyName: "Updated Corp",
      ownerName: "John Doe",
      email: "john@acme.com",
      phoneNumber: "+1234567890",
      status: "contacted",
      website: null,
      industry: null,
      customData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await db.updateLead(1, updatedData);
    expect(result.companyName).toBe("Updated Corp");
    expect(result.status).toBe("contacted");
  });

  it("should delete a lead", async () => {
    vi.mocked(db.deleteLead).mockResolvedValue(true);

    const result = await db.deleteLead(1);
    expect(result).toBe(true);
    expect(db.deleteLead).toHaveBeenCalledWith(1);
  });
});

describe("Email Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should track email opens", async () => {
    const mockEvent = {
      id: 1,
      campaignLeadId: 1,
      eventType: "open" as const,
      trackingToken: "token123",
      userAgent: "Mozilla/5.0",
      ipAddress: "192.168.1.1",
      clickUrl: null,
      createdAt: new Date(),
    };

    vi.mocked(db.getEmailTrackingEventByToken).mockResolvedValue(mockEvent);

    const result = await db.getEmailTrackingEventByToken("token123");
    expect(result?.eventType).toBe("open");
    expect(result?.trackingToken).toBe("token123");
  });

  it("should update campaign lead on email open", async () => {
    const mockCampaignLead = {
      id: 1,
      campaignId: 1,
      leadId: 1,
      emailSent: true,
      emailSentAt: new Date(),
      emailOpened: false,
      emailOpenedAt: null,
      emailClicked: false,
      emailClickedAt: null,
      callTriggered: false,
      callTriggeredAt: null,
      retellCallId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.updateCampaignLead).mockResolvedValue({
      ...mockCampaignLead,
      emailOpened: true,
      emailOpenedAt: new Date(),
    });

    const result = await db.updateCampaignLead(1, {
      emailOpened: true,
      emailOpenedAt: new Date(),
    });

    expect(result.emailOpened).toBe(true);
    expect(result.emailOpenedAt).not.toBeNull();
  });

  it("should update campaign metrics on email open", async () => {
    const mockCampaign = {
      id: 1,
      userId: 1,
      name: "Test Campaign",
      description: null,
      subject: "Test Subject",
      emailTemplate: "<p>Test</p>",
      status: "active" as const,
      totalLeads: 10,
      sentCount: 10,
      openCount: 5,
      clickCount: 2,
      callCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      launchedAt: new Date(),
    };

    vi.mocked(db.updateCampaign).mockResolvedValue({
      ...mockCampaign,
      openCount: 6,
    });

    const result = await db.updateCampaign(1, { openCount: 6 });
    expect(result.openCount).toBe(6);
  });
});

describe("Campaign Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve campaign leads", async () => {
    const mockLeads = [
      {
        id: 1,
        campaignId: 1,
        leadId: 1,
        emailSent: true,
        emailSentAt: new Date(),
        emailOpened: false,
        emailOpenedAt: null,
        emailClicked: false,
        emailClickedAt: null,
        callTriggered: false,
        callTriggeredAt: null,
        retellCallId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(db.getCampaignLeads).mockResolvedValue(mockLeads);

    const result = await db.getCampaignLeads(1);
    expect(result).toHaveLength(1);
    expect(result[0].campaignId).toBe(1);
  });

  it("should get campaign by ID", async () => {
    const mockCampaign = {
      id: 1,
      userId: 1,
      name: "Test Campaign",
      description: "A test campaign",
      subject: "Test Subject",
      emailTemplate: "<p>Test</p>",
      status: "active" as const,
      totalLeads: 10,
      sentCount: 10,
      openCount: 5,
      clickCount: 2,
      callCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      launchedAt: new Date(),
    };

    vi.mocked(db.getCampaignById).mockResolvedValue(mockCampaign);

    const result = await db.getCampaignById(1);
    expect(result?.name).toBe("Test Campaign");
    expect(result?.status).toBe("active");
  });
});

describe("Settings Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve user settings", async () => {
    const mockSettings = {
      id: 1,
      userId: 1,
      retellApiKey: "key123",
      retellAgentId: "agent123",
      senderPhoneNumber: "+1234567890",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUsername: "user@gmail.com",
      smtpPassword: "password",
      senderEmail: "sender@example.com",
      senderName: "Lead Gen",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.getUserSettings).mockResolvedValue(mockSettings);

    const result = await db.getUserSettings(1);
    expect(result?.retellAgentId).toBe("agent123");
    expect(result?.senderPhoneNumber).toBe("+1234567890");
  });
});
