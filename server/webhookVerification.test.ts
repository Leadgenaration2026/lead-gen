import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
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
  getWebhookEvents: vi.fn().mockResolvedValue([]),
  getWebhookStats: vi.fn().mockResolvedValue({ calendlyTotal: 0, replyTotal: 0, retellTotal: 0, calendlyLast: null, replyLast: null, retellLast: null }),
}));

// Mock followUpScheduler
vi.mock("./_core/followUpScheduler", () => ({
  triggerCallOnFollowUpOpen: vi.fn().mockResolvedValue({ success: false, reason: "test" }),
  normalizePhoneNumber: vi.fn((n: string) => n),
}));

// Import the verification functions directly for unit testing
import { verifyCalcomSignature, verifyRetellSignature } from "./_core/webhookVerification";

describe("HMAC Webhook Signature Verification", () => {
  describe("verifyCalcomSignature - Cal.com format (x-cal-signature-256)", () => {
    const signingKey = "test-calcom-signing-key-12345";

    it("should verify a valid Cal.com signature", () => {
      const body = JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: { attendees: [{ email: "test@example.com" }] } });
      const signature = crypto.createHmac("sha256", signingKey).update(body).digest("hex");

      const result = verifyCalcomSignature(body, { calcomSignature: signature }, signingKey);
      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject an invalid Cal.com signature", () => {
      const body = JSON.stringify({ triggerEvent: "BOOKING_CREATED" });
      const result = verifyCalcomSignature(body, { calcomSignature: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });

    it("should reject when body has been tampered with", () => {
      const originalBody = JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: { attendees: [{ email: "real@example.com" }] } });
      const tamperedBody = JSON.stringify({ triggerEvent: "BOOKING_CREATED", payload: { attendees: [{ email: "attacker@evil.com" }] } });
      const signature = crypto.createHmac("sha256", signingKey).update(originalBody).digest("hex");

      const result = verifyCalcomSignature(tamperedBody, { calcomSignature: signature }, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });
  });

  describe("verifyCalcomSignature - Legacy Calendly format fallback", () => {
    const signingKey = "test-calendly-signing-key-12345";

    it("should verify a valid Calendly signature (legacy fallback)", () => {
      const body = JSON.stringify({ event: "invitee.created", payload: { invitee: { email: "test@example.com" } } });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${body}`;
      const signature = crypto.createHmac("sha256", signingKey).update(signedPayload).digest("hex");

      const result = verifyCalcomSignature(body, { calendlySignature: `t=${timestamp},v1=${signature}` }, signingKey);
      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject an invalid Calendly signature", () => {
      const body = JSON.stringify({ event: "invitee.created" });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const result = verifyCalcomSignature(body, { calendlySignature: `t=${timestamp},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef` }, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });

    it("should reject when signature header is missing entirely", () => {
      const body = JSON.stringify({ event: "invitee.created" });
      const result = verifyCalcomSignature(body, {}, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Missing webhook signature header");
    });

    it("should reject when Calendly header format is invalid", () => {
      const body = JSON.stringify({ event: "invitee.created" });
      const result = verifyCalcomSignature(body, { calendlySignature: "invalid-header-format" }, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Invalid signature header format");
    });

    it("should reject when timestamp is too old (replay attack)", () => {
      const body = JSON.stringify({ event: "invitee.created" });
      const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const signedPayload = `${timestamp}.${body}`;
      const signature = crypto.createHmac("sha256", signingKey).update(signedPayload).digest("hex");

      const result = verifyCalcomSignature(body, { calendlySignature: `t=${timestamp},v1=${signature}` }, signingKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("timestamp too old");
    });
  });

  describe("verifyRetellSignature", () => {
    const apiKey = "test-retell-api-key-67890";

    it("should verify a valid Retell signature", () => {
      const body = JSON.stringify({ call_id: "call_123", status: "ended" });
      const signature = crypto.createHmac("sha256", apiKey).update(body).digest("hex");

      const result = verifyRetellSignature(body, signature, apiKey);
      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject an invalid Retell signature", () => {
      const body = JSON.stringify({ call_id: "call_123", status: "ended" });
      const fakeSignature = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

      const result = verifyRetellSignature(body, fakeSignature, apiKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });

    it("should reject when signature header is missing", () => {
      const body = JSON.stringify({ call_id: "call_123" });
      const result = verifyRetellSignature(body, undefined, apiKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Missing x-retell-signature header");
    });

    it("should reject when body has been tampered with", () => {
      const originalBody = JSON.stringify({ call_id: "call_123", status: "ended" });
      const tamperedBody = JSON.stringify({ call_id: "call_123", status: "in_progress" });
      const signature = crypto.createHmac("sha256", apiKey).update(originalBody).digest("hex");

      const result = verifyRetellSignature(tamperedBody, signature, apiKey);
      expect(result.verified).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });
  });

  describe("Integration: Webhook endpoints with signature verification", () => {
    let app: express.Express;
    let db: any;

    beforeEach(async () => {
      vi.clearAllMocks();
      db = await import("./db");

      app = express();
      // Simulate the raw body capture verify hook
      app.use(express.json({
        verify: (req: any, _res, buf) => {
          if (req.url?.startsWith("/api/webhooks/")) {
            req.rawBody = buf.toString("utf8");
          }
        },
      }));

      const { registerEmailTrackingRoutes } = await import("./_core/emailTracking");
      registerEmailTrackingRoutes(app);
    });

    it("should accept Cal.com booking webhook when no signing secret is configured (bypass mode)", async () => {
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: null, retellWebhookSecret: null });
      db.findCampaignLeadsByEmail.mockResolvedValue([{ id: 1 }]);

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .send({ email: "lead@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should reject booking webhook with invalid signature when secret is configured", async () => {
      const signingKey = "my-calcom-secret";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: signingKey, retellWebhookSecret: null });

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .set("x-cal-signature-256", "invalidsignature")
        .send({ email: "lead@example.com" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid webhook signature");
    });

    it("should accept booking webhook with valid Cal.com signature when secret is configured", async () => {
      const signingKey = "my-calcom-secret";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: signingKey, retellWebhookSecret: null });
      db.findCampaignLeadsByEmail.mockResolvedValue([{ id: 5 }]);

      const body = JSON.stringify({ email: "lead@example.com" });
      const signature = crypto.createHmac("sha256", signingKey).update(body).digest("hex");

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .set("Content-Type", "application/json")
        .set("x-cal-signature-256", signature)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should accept booking webhook with valid legacy Calendly signature when secret is configured", async () => {
      const signingKey = "my-calcom-secret";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: signingKey, retellWebhookSecret: null });
      db.findCampaignLeadsByEmail.mockResolvedValue([{ id: 5 }]);

      const body = JSON.stringify({ email: "lead@example.com" });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${body}`;
      const signature = crypto.createHmac("sha256", signingKey).update(signedPayload).digest("hex");

      const res = await request(app)
        .post("/api/webhooks/calendly")
        .set("Content-Type", "application/json")
        .set("Calendly-Webhook-Signature", `t=${timestamp},v1=${signature}`)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should reject Retell webhook with invalid signature when secret is configured", async () => {
      const apiKey = "my-retell-api-key";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: null, retellWebhookSecret: apiKey });

      const res = await request(app)
        .post("/api/webhooks/retell")
        .set("x-retell-signature", "invalidsignaturevalue")
        .send({ call_id: "call_123", status: "ended" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid webhook signature");
    });

    it("should accept Retell webhook with valid signature when secret is configured", async () => {
      const apiKey = "my-retell-api-key";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: null, retellWebhookSecret: apiKey });

      // Mock retellAI module
      vi.doMock("./_core/retellAI", () => ({
        handleRetellWebhook: vi.fn().mockResolvedValue(undefined),
      }));

      const body = JSON.stringify({ call_id: "call_123", status: "ended" });
      const signature = crypto.createHmac("sha256", apiKey).update(body).digest("hex");

      const res = await request(app)
        .post("/api/webhooks/retell")
        .set("Content-Type", "application/json")
        .set("x-retell-signature", signature)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should log failed verification events to webhookEvents table", async () => {
      const signingKey = "my-calcom-secret";
      db.getUserSettings.mockResolvedValue({ calcomWebhookSecret: signingKey, retellWebhookSecret: null });

      await request(app)
        .post("/api/webhooks/calendly")
        .set("x-cal-signature-256", "badsig")
        .send({ email: "attacker@evil.com" });

      expect(db.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookType: "calendly_booking",
          status: "failed",
          errorMessage: expect.stringContaining("Signature verification failed"),
        })
      );
    });
  });
});
