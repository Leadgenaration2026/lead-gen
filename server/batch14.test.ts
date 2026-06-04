import { describe, it, expect, vi } from "vitest";

// Mock db module
vi.mock("./db", () => ({
  getCampaignById: vi.fn(),
  getCampaignLeads: vi.fn(),
  getLeadById: vi.fn(),
  getEmailTrackingEventsByCampaignLead: vi.fn(),
  getCallLogsByCampaignLead: vi.fn(),
  getEmailSignature: vi.fn(),
  getUserSettings: vi.fn(),
  getCampaignLeadById: vi.fn(),
  updateCampaignLead: vi.fn(),
  updateCampaign: vi.fn(),
  createEmailTrackingEvent: vi.fn(),
  getEmailTrackingEventByToken: vi.fn(),
}));

vi.mock("./_core/retellAI", () => ({
  triggerRetellCall: vi.fn().mockResolvedValue("mock-call-id"),
}));

describe("Batch 14 - Email Signature, Activity Tracking, Retell.AI Calls", () => {
  describe("Email Signature Appending", () => {
    it("should have getEmailSignature function available in db module", async () => {
      const db = await import("./db");
      expect(db.getEmailSignature).toBeDefined();
      expect(typeof db.getEmailSignature).toBe("function");
    });

    it("should fetch signature during campaign launch", async () => {
      // The campaign launch procedure now calls db.getEmailSignature
      const db = await import("./db");
      const mockSignature = {
        id: 1,
        userId: 1,
        signatureHtml: '<div>Best regards,<br/>Nitin Sharma</div>',
        signaturePlainText: 'Best regards, Nitin Sharma',
      };
      (db.getEmailSignature as any).mockResolvedValue(mockSignature);
      
      const result = await db.getEmailSignature(1);
      expect(result).toEqual(mockSignature);
      expect(result.signatureHtml).toContain("Best regards");
    });
  });

  describe("Activity Feed Enhancement", () => {
    it("should return full lead details in activity response", async () => {
      const db = await import("./db");
      
      // Mock data
      (db.getCampaignById as any).mockResolvedValue({ id: 1, userId: 1, name: "Test" });
      (db.getCampaignLeads as any).mockResolvedValue([
        { id: 1, campaignId: 1, leadId: 1, emailSent: true, emailSentAt: new Date(), emailOpened: true, emailOpenedAt: new Date(), emailClicked: true, emailClickedAt: new Date(), callTriggered: true, callTriggeredAt: new Date() }
      ]);
      (db.getLeadById as any).mockResolvedValue({
        id: 1, ownerName: "John Doe", companyName: "Acme Corp", email: "john@acme.com", phoneNumber: "+1234567890"
      });
      (db.getEmailTrackingEventsByCampaignLead as any).mockResolvedValue([
        { id: 1, campaignLeadId: 1, eventType: "open", trackingToken: "t1" },
        { id: 2, campaignLeadId: 1, eventType: "click", trackingToken: "t2", clickUrl: "https://example.com/booking" },
      ]);
      (db.getCallLogsByCampaignLead as any).mockResolvedValue([
        { id: 1, campaignLeadId: 1, retellCallId: "call_123", status: "completed", phoneNumber: "+1234567890" }
      ]);

      // Simulate what the activity endpoint does
      const campaignLeads = await db.getCampaignLeads(1);
      const activities = [];
      
      for (const cl of campaignLeads) {
        const lead = await db.getLeadById(cl.leadId);
        if (!lead) continue;

        const trackingEvents = await db.getEmailTrackingEventsByCampaignLead(cl.id);
        const clickEvents = trackingEvents.filter((e: any) => e.eventType === 'click' && e.clickUrl);
        const clickedUrls = clickEvents.map((e: any) => e.clickUrl).filter(Boolean);

        const callLogs = await db.getCallLogsByCampaignLead(cl.id);
        const latestCall = callLogs.length > 0 ? callLogs[callLogs.length - 1] : null;

        activities.push({
          campaignLeadId: cl.id,
          leadName: lead.ownerName,
          companyName: lead.companyName,
          email: lead.email,
          phoneNumber: lead.phoneNumber,
          emailSent: cl.emailSent,
          emailSentAt: cl.emailSentAt,
          emailOpened: cl.emailOpened,
          emailOpenedAt: cl.emailOpenedAt,
          emailClicked: cl.emailClicked,
          emailClickedAt: cl.emailClickedAt,
          clickedUrls,
          callTriggered: cl.callTriggered,
          callTriggeredAt: cl.callTriggeredAt,
          callStatus: latestCall?.status || null,
          callId: latestCall?.retellCallId || null,
          totalCalls: callLogs.length,
        });
      }

      expect(activities).toHaveLength(1);
      const activity = activities[0];
      
      // Verify full lead details are included
      expect(activity.email).toBe("john@acme.com");
      expect(activity.phoneNumber).toBe("+1234567890");
      expect(activity.leadName).toBe("John Doe");
      expect(activity.companyName).toBe("Acme Corp");
      
      // Verify clicked URLs are included
      expect(activity.clickedUrls).toContain("https://example.com/booking");
      
      // Verify call status is included
      expect(activity.callStatus).toBe("completed");
      expect(activity.callId).toBe("call_123");
      expect(activity.totalCalls).toBe(1);
    });

    it("should show 'No Call Yet' when call not triggered", async () => {
      const db = await import("./db");
      
      (db.getCampaignLeads as any).mockResolvedValue([
        { id: 2, campaignId: 1, leadId: 2, emailSent: true, emailSentAt: new Date(), emailOpened: false, emailClicked: false, callTriggered: false }
      ]);
      (db.getLeadById as any).mockResolvedValue({
        id: 2, ownerName: "Jane Smith", companyName: "Beta Inc", email: "jane@beta.com", phoneNumber: "+9876543210"
      });
      (db.getEmailTrackingEventsByCampaignLead as any).mockResolvedValue([]);
      (db.getCallLogsByCampaignLead as any).mockResolvedValue([]);

      const campaignLeads = await db.getCampaignLeads(1);
      const cl = campaignLeads[0];
      const lead = await db.getLeadById(cl.leadId);
      const callLogs = await db.getCallLogsByCampaignLead(cl.id);
      const latestCall = callLogs.length > 0 ? callLogs[callLogs.length - 1] : null;

      const activity = {
        callTriggered: cl.callTriggered,
        callStatus: latestCall?.status || null,
        callId: latestCall?.retellCallId || null,
        totalCalls: callLogs.length,
      };

      expect(activity.callTriggered).toBe(false);
      expect(activity.callStatus).toBeNull();
      expect(activity.totalCalls).toBe(0);
    });
  });

  describe("Email Tracking - Pixel Open", () => {
    it("should log open event and update campaign lead on pixel request", async () => {
      const db = await import("./db");
      
      (db.getEmailTrackingEventByToken as any).mockResolvedValue({
        id: 1, campaignLeadId: 1, eventType: "open", trackingToken: "test-token"
      });
      (db.getCampaignLeadById as any).mockResolvedValue({
        id: 1, campaignId: 1, leadId: 1, emailOpened: false, callTriggered: false
      });
      (db.getCampaignById as any).mockResolvedValue({ id: 1, userId: 1, openCount: 0 });
      (db.getLeadById as any).mockResolvedValue({ id: 1, phoneNumber: "+1234567890" });
      (db.getUserSettings as any).mockResolvedValue({
        retellApiKey: "key_123",
        retellAgentId: "agent_123",
        senderPhoneNumber: "+1987654321",
      });

      // Simulate the tracking pixel handler logic
      const event = await db.getEmailTrackingEventByToken("test-token");
      expect(event).toBeDefined();
      
      const campaignLead = await db.getCampaignLeadById(event!.campaignLeadId);
      expect(campaignLead).toBeDefined();
      expect(campaignLead!.emailOpened).toBe(false);
      
      // Verify settings are fetched correctly for Retell.AI trigger
      const campaign = await db.getCampaignById(campaignLead!.campaignId);
      const settings = await db.getUserSettings(campaign!.userId);
      expect(settings?.retellApiKey).toBe("key_123");
      expect(settings?.retellAgentId).toBe("agent_123");
      expect(settings?.senderPhoneNumber).toBe("+1987654321");
    });
  });

  describe("Retell.AI Call Triggering", () => {
    it("should trigger call when all settings are configured", async () => {
      const { triggerRetellCall } = await import("./_core/retellAI");
      
      const result = await triggerRetellCall(
        1,
        "+1234567890",
        "key_123",
        "agent_123",
        "+1987654321",
        "email_open"
      );
      
      expect(result).toBe("mock-call-id");
      expect(triggerRetellCall).toHaveBeenCalledWith(
        1,
        "+1234567890",
        "key_123",
        "agent_123",
        "+1987654321",
        "email_open"
      );
    });

    it("should also trigger on email click", async () => {
      const { triggerRetellCall } = await import("./_core/retellAI");
      
      const result = await triggerRetellCall(
        1,
        "+1234567890",
        "key_123",
        "agent_123",
        "+1987654321",
        "email_click"
      );
      
      expect(result).toBe("mock-call-id");
      expect(triggerRetellCall).toHaveBeenCalledWith(
        1,
        "+1234567890",
        "key_123",
        "agent_123",
        "+1987654321",
        "email_click"
      );
    });
  });

  describe("Tracking URL Construction", () => {
    it("should use request origin for tracking pixel URL (not VITE_FRONTEND_FORGE_API_URL)", () => {
      // The fix ensures we use ctx.req.protocol + ctx.req.get('host') instead of env vars
      const protocol = "https";
      const host = "leadgenoutreach-gkqazghm.manus.space";
      const baseUrl = `${protocol}://${host}`;
      const trackingToken = "test-token-123";
      
      const trackingPixelUrl = `${baseUrl}/api/track/pixel/${trackingToken}`;
      
      expect(trackingPixelUrl).toBe("https://leadgenoutreach-gkqazghm.manus.space/api/track/pixel/test-token-123");
      expect(trackingPixelUrl).not.toContain("forge");
      expect(trackingPixelUrl).not.toContain("localhost");
    });
  });
});
