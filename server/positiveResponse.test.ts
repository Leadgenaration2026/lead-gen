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
  markLeadUnsubscribed: vi.fn(),
  cancelPendingFollowUps: vi.fn(),
  findCampaignLeadsByEmail: vi.fn(),
  createWebhookEvent: vi.fn().mockResolvedValue(1),
  getWebhookEvents: vi.fn().mockResolvedValue([]),
  getWebhookStats: vi.fn().mockResolvedValue({ calendlyTotal: 0, replyTotal: 0, retellTotal: 0, calendlyLast: null, replyLast: null, retellLast: null }),
}));

// Mock followUpScheduler
vi.mock("./_core/followUpScheduler", () => ({
  triggerCallOnFollowUpOpen: vi.fn().mockResolvedValue({ success: false, reason: "test" }),
  normalizePhoneNumber: vi.fn((n: string) => n),
}));

describe("Positive Response Logic", () => {
  let app: express.Express;
  let db: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await import("./db");

    // Create a fresh Express app and register tracking routes
    app = express();
    app.use(express.json());

    const { registerEmailTrackingRoutes } = await import("./_core/emailTracking");
    registerEmailTrackingRoutes(app);
  });

  describe("Calendly link click does NOT set positive response", () => {
    it("should NOT call markLeadReplied when a Calendly link is clicked", async () => {
      const mockEvent = {
        id: 1,
        campaignLeadId: 10,
        eventType: "sent",
        trackingToken: "test-token-123",
      };

      const mockCampaignLead = {
        id: 10,
        campaignId: 1,
        leadId: 5,
        emailSent: true,
        emailOpened: true,
        emailClicked: false,
        callTriggered: false,
      };

      const mockCampaign = { id: 1, userId: 1, clickCount: 0 };

      (db.getEmailTrackingEventByToken as any).mockResolvedValue(mockEvent);
      (db.getCampaignLeadById as any).mockResolvedValue(mockCampaignLead);
      (db.getCampaignById as any).mockResolvedValue(mockCampaign);
      (db.getLeadById as any).mockResolvedValue({ id: 5, phoneNumber: null });
      (db.getUserSettings as any).mockResolvedValue({});

      // Simulate clicking a Calendly link
      const calendlyUrl = "https://calendly.com/nitin-virtualassistant/30min";
      const res = await request(app)
        .get(`/api/track/click/test-token-123?url=${encodeURIComponent(calendlyUrl)}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(calendlyUrl);

      // markLeadReplied should NOT be called — clicking Calendly is not a positive response
      expect(db.markLeadReplied).not.toHaveBeenCalled();
      expect(db.cancelPendingFollowUps).not.toHaveBeenCalled();
    });

    it("should still track the click event without marking positive response", async () => {
      const mockEvent = {
        id: 1,
        campaignLeadId: 10,
        eventType: "sent",
        trackingToken: "test-token-456",
      };

      const mockCampaignLead = {
        id: 10,
        campaignId: 1,
        leadId: 5,
        emailSent: true,
        emailOpened: true,
        emailClicked: false,
        callTriggered: false,
      };

      const mockCampaign = { id: 1, userId: 1, clickCount: 0 };

      (db.getEmailTrackingEventByToken as any).mockResolvedValue(mockEvent);
      (db.getCampaignLeadById as any).mockResolvedValue(mockCampaignLead);
      (db.getCampaignById as any).mockResolvedValue(mockCampaign);
      (db.getLeadById as any).mockResolvedValue({ id: 5, phoneNumber: null });
      (db.getUserSettings as any).mockResolvedValue({});

      const calendlyUrl = "https://calendly.com/nitin-virtualassistant/30min";
      await request(app)
        .get(`/api/track/click/test-token-456?url=${encodeURIComponent(calendlyUrl)}`);

      // Click should still be tracked
      expect(db.createEmailTrackingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignLeadId: 10,
          eventType: "click",
          clickUrl: calendlyUrl,
        })
      );

      // But no positive response marking
      expect(db.markLeadReplied).not.toHaveBeenCalled();
    });
  });

  describe("Calendly booking webhook DOES set positive response", () => {
    it("should mark lead as positive when Calendly booking webhook fires (v2 format)", async () => {
      (db.findCampaignLeadsByEmail as any).mockResolvedValue([
        { id: 10, campaignId: 1, leadId: 5 },
      ]);

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .send({
          payload: {
            invitee: {
              email: "john@acme.com",
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should mark as positive and cancel follow-ups
      expect(db.markLeadReplied).toHaveBeenCalledWith(10, "positive");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(10);
    });

    it("should mark lead as positive when Calendly booking webhook fires (simple format)", async () => {
      (db.findCampaignLeadsByEmail as any).mockResolvedValue([
        { id: 20, campaignId: 2, leadId: 8 },
      ]);

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .send({ email: "jane@startup.io" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(db.markLeadReplied).toHaveBeenCalledWith(20, "positive");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(20);
    });

    it("should mark lead as positive when Calendly booking webhook fires (direct ID format)", async () => {
      const res = await request(app)
        .post("/api/webhooks/calendly")
        .send({ campaignLeadId: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(db.markLeadReplied).toHaveBeenCalledWith(30, "positive");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(30);
    });
  });

  describe("Reply webhook DOES set positive response and cancels follow-ups", () => {
    it("should mark lead as positive when reply webhook fires with campaignLeadId", async () => {
      const res = await request(app)
        .post("/api/webhooks/reply")
        .send({ campaignLeadId: 15 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(db.markLeadReplied).toHaveBeenCalledWith(15, "positive");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(15);
    });

    it("should mark lead as positive when reply webhook fires with email lookup", async () => {
      (db.findCampaignLeadsByEmail as any).mockResolvedValue([
        { id: 25, campaignId: 3, leadId: 12 },
        { id: 26, campaignId: 4, leadId: 12 },
      ]);

      const res = await request(app)
        .post("/api/webhooks/reply")
        .send({ email: "lead@company.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should mark ALL matching campaign leads as replied
      expect(db.markLeadReplied).toHaveBeenCalledWith(25, "positive");
      expect(db.markLeadReplied).toHaveBeenCalledWith(26, "positive");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(25);
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(26);
    });

    it("should support custom responseStatus in reply webhook", async () => {
      const res = await request(app)
        .post("/api/webhooks/reply")
        .send({ campaignLeadId: 40, responseStatus: "negative" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(db.markLeadReplied).toHaveBeenCalledWith(40, "negative");
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(40);
    });
  });

  describe("Unsubscribe cancels follow-ups", () => {
    it("should cancel follow-ups when lead unsubscribes", async () => {
      const mockEvent = {
        id: 1,
        campaignLeadId: 50,
        eventType: "sent",
        trackingToken: "unsub-token",
      };

      (db.getEmailTrackingEventByToken as any).mockResolvedValue(mockEvent);

      const res = await request(app)
        .get("/api/track/unsubscribe/unsub-token");

      expect(res.status).toBe(200);
      expect(db.markLeadUnsubscribed).toHaveBeenCalledWith(50);
      expect(db.cancelPendingFollowUps).toHaveBeenCalledWith(50);
    });
  });
});
