import { Express, Request, Response } from "express";
import * as db from "../db";
import { triggerCallOnFollowUpOpen, normalizePhoneNumber } from "./followUpScheduler";

// 1x1 transparent GIF pixel
const PIXEL_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
  0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x0A,
  0x00, 0x01, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3B,
]);

export function registerEmailTrackingRoutes(app: Express) {
  /**
   * Email open tracking pixel
   * GET /api/track/pixel/:token
   * Returns a 1x1 transparent GIF and logs the open event
   */
  app.get("/api/track/pixel/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      console.log(`[EmailTracking] Pixel request received for token: ${token}`);

      // Get the tracking event
      const event = await db.getEmailTrackingEventByToken(token);
      if (!event) {
        console.log(`[EmailTracking] Token not found: ${token}`);
        res.setHeader("Content-Type", "image/gif");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.send(PIXEL_GIF);
      }

      // Log the open event with metadata
      await db.createEmailTrackingEvent({
        campaignLeadId: event.campaignLeadId,
        eventType: "open",
        trackingToken: `open_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userAgent: req.get("user-agent"),
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      });

      // Update campaign lead to mark as opened
      const campaignLead = await db.getCampaignLeadById(event.campaignLeadId);
      if (campaignLead) {
        // Always update the open status (even if already opened, to track re-opens)
        if (!campaignLead.emailOpened) {
          await db.updateCampaignLead(event.campaignLeadId, {
            emailOpened: true,
            emailOpenedAt: new Date(),
          });
          console.log(`[EmailTracking] Marked campaignLead ${event.campaignLeadId} as opened`);

          // Update campaign open count
          const campaign = await db.getCampaignById(campaignLead.campaignId);
          if (campaign) {
            await db.updateCampaign(campaignLead.campaignId, {
              openCount: (campaign.openCount || 0) + 1,
            });
            console.log(`[EmailTracking] Updated campaign ${campaign.id} openCount to ${(campaign.openCount || 0) + 1}`);
          }
        }

        // Trigger Retell.AI call on every email open (calls after each follow-up email open)
        try {
          const campaign = await db.getCampaignById(campaignLead.campaignId);
          const lead = await db.getLeadById(campaignLead.leadId);
          const settings = campaign ? await db.getUserSettings(campaign.userId) : null;
          
          console.log(`[EmailTracking] Retell check - lead: ${!!lead}, phone: ${lead?.phoneNumber}, apiKey: ${!!settings?.retellApiKey}, agentId: ${settings?.retellAgentId}, fromPhone: ${settings?.senderPhoneNumber}`);
          
          if (lead && lead.phoneNumber && settings?.retellApiKey && settings?.retellAgentId && settings?.senderPhoneNumber) {
            // Normalize phone numbers to E.164 format
            const normalizedLeadPhone = normalizePhoneNumber(lead.phoneNumber);
            const normalizedFromPhone = normalizePhoneNumber(settings.senderPhoneNumber);
            
            console.log(`[EmailTracking] Triggering Retell.AI call - to: ${normalizedLeadPhone}, from: ${normalizedFromPhone}, agent: ${settings.retellAgentId}`);
            
            const result = await triggerCallOnFollowUpOpen(
              campaignLead.id,
              normalizedLeadPhone,
              settings.retellApiKey,
              settings.retellAgentId,
              normalizedFromPhone,
              'email_open',
              (lead as any).timezone || undefined
            );
            
            if (result.success) {
              // Mark call as triggered (for tracking purposes)
              if (!campaignLead.callTriggered) {
                await db.updateCampaignLead(event.campaignLeadId, {
                  callTriggered: true,
                });
              }
              console.log(`[EmailTracking] Retell.AI call triggered successfully for campaignLead ${event.campaignLeadId}`);
            } else {
              console.log(`[EmailTracking] Retell.AI call not triggered: ${result.reason || result.error}`);
            }
          } else {
            console.log(`[EmailTracking] Retell.AI call NOT triggered - missing configuration. Lead phone: ${lead?.phoneNumber}, API key: ${!!settings?.retellApiKey}, Agent ID: ${settings?.retellAgentId}, From phone: ${settings?.senderPhoneNumber}`);
          }
        } catch (error) {
          console.error("[EmailTracking] Failed to trigger Retell call on open:", error);
        }
      }

      // Return pixel
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(PIXEL_GIF);
    } catch (error) {
      console.error("[EmailTracking] Error tracking pixel:", error);
      // Still return pixel on error
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(PIXEL_GIF);
    }
  });

  /**
   * Email click tracking redirect
   * GET /api/track/click/:token?url=...
   * Logs the click and redirects to the original URL
   */
  app.get("/api/track/click/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { url } = req.query;
      console.log(`[EmailTracking] Click request received for token: ${token}, url: ${url}`);

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Missing or invalid url parameter" });
      }

      // Get the tracking event
      const event = await db.getEmailTrackingEventByToken(token);
      if (event) {
        // Log the click event
        await db.createEmailTrackingEvent({
          campaignLeadId: event.campaignLeadId,
          eventType: "click",
          trackingToken: `click_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          clickUrl: url,
          userAgent: req.get("user-agent"),
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });

        // Update campaign lead to mark as clicked
        const campaignLead = await db.getCampaignLeadById(event.campaignLeadId);
        if (campaignLead) {
          if (!campaignLead.emailClicked) {
            await db.updateCampaignLead(event.campaignLeadId, {
              emailClicked: true,
              emailClickedAt: new Date(),
            });
            console.log(`[EmailTracking] Marked campaignLead ${event.campaignLeadId} as clicked`);

            // Update campaign click count
            const campaign = await db.getCampaignById(campaignLead.campaignId);
            if (campaign) {
              await db.updateCampaign(campaignLead.campaignId, {
                clickCount: (campaign.clickCount || 0) + 1,
              });
            }
          }

          // Trigger Retell.AI call on every email click
          try {
            const campaign = await db.getCampaignById(campaignLead.campaignId);
            const lead = await db.getLeadById(campaignLead.leadId);
            const settings = campaign ? await db.getUserSettings(campaign.userId) : null;
            
            if (lead && lead.phoneNumber && settings?.retellApiKey && settings?.retellAgentId && settings?.senderPhoneNumber) {
              const normalizedLeadPhone = normalizePhoneNumber(lead.phoneNumber);
              const normalizedFromPhone = normalizePhoneNumber(settings.senderPhoneNumber);
              
              console.log(`[EmailTracking] Triggering Retell.AI call on click - to: ${normalizedLeadPhone}, from: ${normalizedFromPhone}`);
              
              const result = await triggerCallOnFollowUpOpen(
                campaignLead.id,
                normalizedLeadPhone,
                settings.retellApiKey,
                settings.retellAgentId,
                normalizedFromPhone,
                'email_click',
                (lead as any).timezone || undefined
              );
              
              if (result.success) {
                if (!campaignLead.callTriggered) {
                  await db.updateCampaignLead(event.campaignLeadId, {
                    callTriggered: true,
                  });
                }
                console.log(`[EmailTracking] Retell.AI call triggered on click for campaignLead ${event.campaignLeadId}`);
              }
            }
          } catch (error) {
            console.error("[EmailTracking] Failed to trigger Retell call on click:", error);
          }
        }
      }

      // Note: Clicking Calendly link is NOT a positive response.
      // Positive response only when: (1) actual Calendly booking via webhook, or (2) email reply

      // Redirect to original URL
      res.redirect(302, url);
    } catch (error) {
      console.error("[EmailTracking] Error tracking click:", error);
      // Redirect anyway on error
      const url = req.query.url;
      if (url && typeof url === "string") {
        res.redirect(302, url);
      } else {
        res.status(400).json({ error: "Failed to process click" });
      }
    }
  });

  /**
   * Unsubscribe endpoint
   * GET /api/track/unsubscribe/:token
   * Marks the lead as unsubscribed and shows confirmation page
   */
  app.get("/api/track/unsubscribe/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      console.log(`[EmailTracking] Unsubscribe request for token: ${token}`);

      const event = await db.getEmailTrackingEventByToken(token);
      if (event) {
        await db.markLeadUnsubscribed(event.campaignLeadId);
        await db.cancelPendingFollowUps(event.campaignLeadId);
        console.log(`[EmailTracking] Marked campaignLead ${event.campaignLeadId} as unsubscribed and cancelled follow-ups`);
      }

      // Show a simple confirmation page
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;}div{text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;}h1{color:#111;font-size:24px;}p{color:#666;font-size:16px;}</style></head><body><div><h1>\u2705 Unsubscribed</h1><p>You have been successfully unsubscribed from future emails. We're sorry to see you go.</p></div></body></html>`);
    } catch (error) {
      console.error("[EmailTracking] Error processing unsubscribe:", error);
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body><h1>Unsubscribed</h1><p>You have been unsubscribed.</p></body></html>`);
    }
  });

  /**
   * Reply detection webhook
   * POST /api/webhooks/reply
   * Called when a lead replies to an email (via email forwarding rules or Zapier)
   * Body: { email: string } or { campaignLeadId: number }
   * This is a POSITIVE response — lead replied to nitin@virtualassistant-group.com
   */
  app.post("/api/webhooks/reply", async (req: Request, res: Response) => {
    try {
      const { email, campaignLeadId, responseStatus } = req.body;
      console.log(`[EmailTracking] Reply webhook received - email: ${email}, campaignLeadId: ${campaignLeadId}`);

      if (campaignLeadId) {
        await db.markLeadReplied(campaignLeadId, responseStatus || "positive");
        await db.cancelPendingFollowUps(campaignLeadId);
        console.log(`[EmailTracking] Marked campaignLead ${campaignLeadId} as replied (positive) and cancelled follow-ups`);
      } else if (email) {
        // Find all active campaign leads with this email
        const activeCampaignLeads = await db.findCampaignLeadsByEmail(email);
        for (const cl of activeCampaignLeads) {
          await db.markLeadReplied(cl.id, responseStatus || "positive");
          await db.cancelPendingFollowUps(cl.id);
          console.log(`[EmailTracking] Marked campaignLead ${cl.id} as replied (positive) via email lookup`);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[EmailTracking] Error processing reply webhook:", error);
      res.status(500).json({ error: "Failed to process reply" });
    }
  });

  /**
   * Calendly booking webhook
   * POST /api/webhooks/calendly
   * Called when a lead actually books a meeting on Calendly
   * This is a POSITIVE response — lead scheduled a consultation
   * Body: { email: string } or Calendly webhook payload
   */
  app.post("/api/webhooks/calendly", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      console.log(`[EmailTracking] Calendly booking webhook received`);

      // Calendly sends payload.payload.invitee.email for bookings
      let inviteeEmail: string | undefined;

      // Handle Calendly v2 webhook format
      if (payload?.payload?.invitee?.email) {
        inviteeEmail = payload.payload.invitee.email;
      } else if (payload?.email) {
        // Simple format: { email: "lead@example.com" }
        inviteeEmail = payload.email;
      } else if (payload?.campaignLeadId) {
        // Direct ID format
        await db.markLeadReplied(payload.campaignLeadId, "positive");
        await db.cancelPendingFollowUps(payload.campaignLeadId);
        console.log(`[EmailTracking] Calendly booking: marked campaignLead ${payload.campaignLeadId} as positive`);
        return res.json({ success: true });
      }

      if (inviteeEmail) {
        const activeCampaignLeads = await db.findCampaignLeadsByEmail(inviteeEmail);
        for (const cl of activeCampaignLeads) {
          await db.markLeadReplied(cl.id, "positive");
          await db.cancelPendingFollowUps(cl.id);
          console.log(`[EmailTracking] Calendly booking: marked campaignLead ${cl.id} as positive (email: ${inviteeEmail})`);
        }
      } else {
        console.log(`[EmailTracking] Calendly webhook: could not extract invitee email from payload`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[EmailTracking] Error processing Calendly webhook:", error);
      res.status(500).json({ error: "Failed to process Calendly booking" });
    }
  });

  /**
   * Retell.AI webhook for call status updates
   * POST /api/webhooks/retell
   * Receives call status updates from Retell.AI
   */
  app.post("/api/webhooks/retell", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const { handleRetellWebhook } = await import("./retellAI");
      await handleRetellWebhook(payload);
      res.json({ success: true });
    } catch (error) {
      console.error("Error handling Retell webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
}
