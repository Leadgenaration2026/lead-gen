import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock db module
vi.mock("./db", () => ({
  getEmailTrackingEventByToken: vi.fn(),
  getCampaignLeadById: vi.fn(),
  getCampaignById: vi.fn(),
  getLeadById: vi.fn(),
  getUserSettings: vi.fn(),
  updateCampaignLead: vi.fn(),
  updateCampaign: vi.fn(),
  createEmailTrackingEvent: vi.fn(),
  markLeadReplied: vi.fn(),
  markMeetingBooked: vi.fn(),
  markLeadUnsubscribed: vi.fn(),
  cancelPendingFollowUps: vi.fn(),
  findCampaignLeadsByEmail: vi.fn(),
  createWebhookEvent: vi.fn().mockResolvedValue(1),
  getWebhookEvents: vi.fn(),
  getWebhookStats: vi.fn(),
}));

// Mock followUpScheduler
vi.mock("./_core/followUpScheduler", () => ({
  triggerCallOnFollowUpOpen: vi.fn().mockResolvedValue({ success: false, reason: "test" }),
  normalizePhoneNumber: vi.fn((n: string) => n),
}));

// Mock retellAI
vi.mock("./_core/retellAI", () => ({
  handleRetellWebhook: vi.fn().mockResolvedValue(undefined),
}));

describe("Webhook Event Logging", () => {
  let app: express.Express;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await import("./db");

    app = express();
    app.use(express.json());

    const { registerEmailTrackingRoutes } = await import("./_core/emailTracking");
    registerEmailTrackingRoutes(app);
  });

  describe("Calendly booking webhook logs events", () => {
    it("should log a success event when Calendly booking is received", async () => {
      (db.findCampaignLeadsByEmail as any).mockResolvedValue([
        { id: 10, campaignId: 1, leadId: 5 },
      ]);

      await request(app)
        .post("/api/webhooks/calendly")
        .send({ email: "john@acme.com" });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          webhookType: "calendly_booking",
          status: "success",
          sourceEmail: "john@acme.com",
          campaignLeadId: 10,
        })
      );
    });

    it("should log an ignored event when no invitee email found", async () => {
      await request(app)
        .post("/api/webhooks/calendly")
        .send({ someOtherField: "value" });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookType: "calendly_booking",
          status: "ignored",
        })
      );
    });

    it("should log a success event for direct campaignLeadId format", async () => {
      await request(app)
        .post("/api/webhooks/calendly")
        .send({ campaignLeadId: 30 });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookType: "calendly_booking",
          status: "success",
          campaignLeadId: 30,
        })
      );
    });
  });

  describe("Reply webhook logs events", () => {
    it("should log a success event when reply is received with email", async () => {
      (db.findCampaignLeadsByEmail as any).mockResolvedValue([
        { id: 20, campaignId: 2, leadId: 8 },
      ]);

      await request(app)
        .post("/api/webhooks/reply")
        .send({ email: "lead@company.com" });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          webhookType: "email_reply",
          status: "success",
          sourceEmail: "lead@company.com",
          campaignLeadId: 20,
        })
      );
    });

    it("should log a success event when reply is received with campaignLeadId", async () => {
      await request(app)
        .post("/api/webhooks/reply")
        .send({ campaignLeadId: 15 });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookType: "email_reply",
          status: "success",
          campaignLeadId: 15,
        })
      );
    });
  });

  describe("Retell webhook logs events", () => {
    it("should log a success event when Retell webhook is received", async () => {
      await request(app)
        .post("/api/webhooks/retell")
        .send({ call_id: "abc123", status: "completed" });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          webhookType: "retell_call",
          status: "success",
        })
      );
    });
  });

  describe("Webhook stats and listing", () => {
    it("should have getWebhookStats function available", async () => {
      expect(db.getWebhookStats).toBeDefined();
      expect(typeof db.getWebhookStats).toBe("function");
    });

    it("should have getWebhookEvents function available", async () => {
      expect(db.getWebhookEvents).toBeDefined();
      expect(typeof db.getWebhookEvents).toBe("function");
    });

    it("should have createWebhookEvent function available", async () => {
      expect(db.createWebhookEvent).toBeDefined();
      expect(typeof db.createWebhookEvent).toBe("function");
    });
  });
});
