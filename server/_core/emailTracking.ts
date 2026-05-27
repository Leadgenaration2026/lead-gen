import { Express, Request, Response } from "express";
import * as db from "../db";
import { triggerRetellCall } from "./retellAI";

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

      // Get the tracking event
      const event = await db.getEmailTrackingEventByToken(token);
      if (!event) {
        // Still return pixel even if token not found (for privacy)
        res.setHeader("Content-Type", "image/gif");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.send(PIXEL_GIF);
      }

      // Update campaign lead to mark as opened
      const campaignLead = await db.getCampaignLeadById(event.campaignLeadId);
      if (campaignLead && !campaignLead.emailOpened) {
        await db.updateCampaignLead(event.campaignLeadId, {
          emailOpened: true,
          emailOpenedAt: new Date(),
        });

        // Update campaign open count
        const campaign = await db.getCampaignById(campaignLead.campaignId);
        if (campaign) {
          await db.updateCampaign(campaignLead.campaignId, {
            openCount: (campaign.openCount || 0) + 1,
          });
        }

        // Trigger Retell.AI call on email open
        if (!campaignLead.callTriggered) {
          try {
            const lead = await db.getLeadById(campaignLead.leadId);
            const settings = await db.getUserSettings(campaign.userId);
            
            if (lead && settings?.retellApiKey && settings?.retellAgentId && settings?.senderPhoneNumber) {
              await triggerRetellCall(
                campaignLead.id,
                lead.phoneNumber,
                settings.retellApiKey,
                settings.retellAgentId,
                settings.senderPhoneNumber,
                'email_open'
              );
            }
          } catch (error) {
            console.error("Failed to trigger Retell call on open:", error);
          }
        }
      }

      // Return pixel
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(PIXEL_GIF);
    } catch (error) {
      console.error("Error tracking pixel:", error);
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
        if (campaignLead && !campaignLead.emailClicked) {
          await db.updateCampaignLead(event.campaignLeadId, {
            emailClicked: true,
            emailClickedAt: new Date(),
          });

          // Update campaign click count
          const campaign = await db.getCampaignById(campaignLead.campaignId);
          if (campaign) {
            await db.updateCampaign(campaignLead.campaignId, {
              clickCount: (campaign.clickCount || 0) + 1,
            });
          }

          // Trigger Retell.AI call on email click
          if (!campaignLead.callTriggered) {
            try {
              const lead = await db.getLeadById(campaignLead.leadId);
              const settings = await db.getUserSettings(campaign.userId);
              
              if (lead && settings?.retellApiKey && settings?.retellAgentId && settings?.senderPhoneNumber) {
                await triggerRetellCall(
                  campaignLead.id,
                  lead.phoneNumber,
                  settings.retellApiKey,
                  settings.retellAgentId,
                  settings.senderPhoneNumber,
                  'email_click'
                );
              }
            } catch (error) {
              console.error("Failed to trigger Retell call on click:", error);
            }
          }
        }
      }

      // Redirect to original URL
      res.redirect(302, url);
    } catch (error) {
      console.error("Error tracking click:", error);
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
   * Retell.AI webhook for call status updates
   * POST /api/webhooks/retell
   * Receives call status updates from Retell.AI
   */
  app.post("/api/webhooks/retell", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      
      // Verify webhook signature (optional, depends on Retell.AI implementation)
      // For now, we'll accept all webhooks and let the handler validate
      
      // Handle the webhook
      const { handleRetellWebhook } = await import("./retellAI");
      await handleRetellWebhook(payload);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error handling Retell webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
}
