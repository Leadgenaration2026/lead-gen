import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getCampaignById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Campaign",
    status: "active",
    createdAt: new Date("2026-01-01"),
  }),
  getCampaignLeads: vi.fn().mockResolvedValue([
    {
      id: 1,
      campaignId: 1,
      leadId: 1,
      emailSent: true,
      emailSentAt: new Date("2026-01-02"),
      emailOpened: true,
      emailOpenedAt: new Date("2026-01-03"),
      emailClicked: false,
      emailClickedAt: null,
      callTriggered: true,
      callTriggeredAt: new Date("2026-01-03"),
    },
  ]),
  getLeadById: vi.fn().mockResolvedValue({
    id: 1,
    ownerName: "John Smith",
    companyName: "Acme Corp",
    email: "john@acme.com",
    phoneNumber: "+1-555-0100",
  }),
  getFollowUpEmailsByCampaignLead: vi.fn().mockResolvedValue([
    {
      id: 1,
      campaignLeadId: 1,
      sequenceNumber: 1,
      emailType: "discovery",
      subject: "Follow up - Acme Corp",
      status: "sent",
      scheduledFor: new Date("2026-01-09"),
      sentAt: new Date("2026-01-09"),
      openedAt: null,
      clickedAt: null,
    },
    {
      id: 2,
      campaignLeadId: 1,
      sequenceNumber: 2,
      emailType: "value_prop",
      subject: "Value for Acme Corp",
      status: "scheduled",
      scheduledFor: new Date("2026-01-16"),
      sentAt: null,
      openedAt: null,
      clickedAt: null,
    },
  ]),
  getFollowUpCallsByCampaignLead: vi.fn().mockResolvedValue([
    {
      id: 1,
      campaignLeadId: 1,
      attemptNumber: 1,
      status: "completed",
      scheduledFor: new Date("2026-01-05"),
      initiatedAt: new Date("2026-01-05"),
      completedAt: new Date("2026-01-05"),
      duration: 120,
      outcome: "answered",
    },
    {
      id: 2,
      campaignLeadId: 1,
      attemptNumber: 2,
      status: "scheduled",
      scheduledFor: new Date("2026-01-08"),
      initiatedAt: null,
      completedAt: null,
      duration: null,
      outcome: null,
    },
  ]),
  getEmailTrackingEventsByCampaignLead: vi.fn().mockResolvedValue([
    { eventType: "open", createdAt: new Date("2026-01-03") },
  ]),
  getCallLogsByCampaignLead: vi.fn().mockResolvedValue([
    { id: 1, campaignLeadId: 1, status: "completed", duration: 45, retellCallId: "call_123" },
  ]),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

describe("reports.campaignReport", () => {
  it("returns comprehensive campaign report with all email and call data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const report = await caller.reports.campaignReport(1);

    // Campaign info
    expect(report.campaign.id).toBe(1);
    expect(report.campaign.name).toBe("Test Campaign");
    expect(report.campaign.status).toBe("active");

    // Summary
    expect(report.summary.totalLeads).toBe(1);
    expect(report.summary.totalEmailsSent).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalEmailsOpened).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalCallsMade).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalCallsPending).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalEmailsPending).toBeGreaterThanOrEqual(1);

    // Lead data
    expect(report.leads).toHaveLength(1);
    const lead = report.leads[0];
    expect(lead.leadName).toBe("John Smith");
    expect(lead.companyName).toBe("Acme Corp");
    expect(lead.email).toBe("john@acme.com");
    expect(lead.phone).toBe("+1-555-0100");

    // Initial email
    expect(lead.initialEmail.sent).toBe(true);
    expect(lead.initialEmail.opened).toBe(true);
    expect(lead.initialEmail.clicked).toBe(false);

    // Initial call
    expect(lead.initialCall.triggered).toBe(true);
    expect(lead.initialCall.status).toBe("completed");
    expect(lead.initialCall.duration).toBe(45);

    // Follow-up emails
    expect(lead.followUpEmails).toHaveLength(2);
    expect(lead.followUpEmails[0].sequenceNumber).toBe(1);
    expect(lead.followUpEmails[0].status).toBe("sent");
    expect(lead.followUpEmails[1].sequenceNumber).toBe(2);
    expect(lead.followUpEmails[1].status).toBe("scheduled");

    // Follow-up calls
    expect(lead.followUpCalls).toHaveLength(2);
    expect(lead.followUpCalls[0].attemptNumber).toBe(1);
    expect(lead.followUpCalls[0].status).toBe("completed");
    expect(lead.followUpCalls[0].duration).toBe(120);
    expect(lead.followUpCalls[1].attemptNumber).toBe(2);
    expect(lead.followUpCalls[1].status).toBe("scheduled");

    // Summary counts
    expect(lead.summary.emailsSent).toBe(1);
    expect(lead.summary.emailsPending).toBe(1);
    expect(lead.summary.callsMade).toBe(1);
    expect(lead.summary.callsPending).toBe(1); // "scheduled" is in the pending list per our code
  });

  it("returns tracking events for the lead", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const report = await caller.reports.campaignReport(1);
    const lead = report.leads[0];

    expect(lead.trackingEvents).toHaveLength(1);
    expect(lead.trackingEvents[0].type).toBe("open");
  });
});
