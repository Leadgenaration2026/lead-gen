import { Express, Request, Response } from "express";
import * as db from "../db";
import { triggerCallOnFollowUpOpen, normalizePhoneNumber } from "./followUpScheduler";
import { verifyCalcomSignature, verifyRetellSignature, getWebhookSecrets } from "./webhookVerification";

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
        campaignLeadId: event.campaignLeadId || undefined,
        leadId: (event as any).leadId || undefined,
        eventType: "open",
        trackingToken: `open_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userAgent: req.get("user-agent"),
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      } as any);

      // One-off scheduled emails (leadId, no campaignLeadId) have nothing
      // campaign-specific to update -- the event above is all that's needed.
      if (!event.campaignLeadId) {
        res.setHeader("Content-Type", "image/gif");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.send(PIXEL_GIF);
      }

      // Update campaign lead to mark as opened
      const campaignLead = await db.getCampaignLeadById(event.campaignLeadId);
      if (campaignLead) {
        // Always update the open status (even if already opened, to track re-opens)
        if (!campaignLead.emailOpened) {
            await db.updateCampaignLead(event.campaignLeadId, {
              emailOpened: 1 as any,
              emailOpenedAt: new Date().toISOString(),
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
              (lead as any).timezone || undefined,
              { customerName: lead.ownerName, customerEmail: lead.email, customerCompanyName: lead.companyName },
              (settings as any).companyName || undefined
            );
            
            if (result.success) {
              // Mark call as triggered (for tracking purposes)
              if (!campaignLead.callTriggered) {
                await db.updateCampaignLead(event.campaignLeadId, {
                  callTriggered: 1 as any,
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
          campaignLeadId: event.campaignLeadId || undefined,
          leadId: (event as any).leadId || undefined,
          eventType: "click",
          trackingToken: `click_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          clickUrl: url,
          userAgent: req.get("user-agent"),
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        } as any);

        // Update campaign lead to mark as clicked
        const campaignLead = await db.getCampaignLeadById(event.campaignLeadId);
        if (campaignLead) {
          if (!campaignLead.emailClicked) {
            await db.updateCampaignLead(campaignLead.id, {
              emailClicked: 1 as any,
              emailClickedAt: new Date().toISOString(),
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
                (lead as any).timezone || undefined,
                { customerName: lead.ownerName, customerEmail: lead.email, customerCompanyName: lead.companyName },
                (settings as any).companyName || undefined
              );
              
              if (result.success) {
                if (!campaignLead.callTriggered) {
                    await db.updateCampaignLead(campaignLead.id, {
                      callTriggered: 1 as any,
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
      if (event?.campaignLeadId) {
        await db.markLeadUnsubscribed(event.campaignLeadId);
        await db.cancelPendingFollowUps(event.campaignLeadId);
        console.log(`[EmailTracking] Marked campaignLead ${event.campaignLeadId} as unsubscribed and cancelled follow-ups`);
      } else if ((event as any)?.leadId) {
        await db.markLeadUnsubscribedGlobally((event as any).leadId);
        console.log(`[EmailTracking] Marked lead ${(event as any).leadId} as globally unsubscribed`);
      } else {
        console.log(`[EmailTracking] Unsubscribe token not found: ${token}`);
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
   *
   * Two payload shapes are supported:
   * 1. Simple direct-ID/email form: { email: string } or { campaignLeadId: number } —
   *    treated as an unconditional positive reply (used by simple integrations that
   *    already know this is a genuine reply, e.g. manual testing or a basic Zapier zap).
   * 2. Full reply form: { fromEmail, subject, body, headers, inReplyToMessageId, ... } —
   *    routed through processIncomingReply() to classify genuine replies vs.
   *    auto-replies/bounces/newsletters before stopping follow-ups (used by an
   *    email-forwarding/IMAP-monitor integration that relays the raw reply content).
   */
  app.post("/api/webhooks/reply", async (req: Request, res: Response) => {
    try {
      const { email, campaignLeadId, responseStatus, fromEmail, subject, body, headers } = req.body;
      const hasClassificationContext = subject || body || headers;

      if (hasClassificationContext) {
        const senderEmail = fromEmail || email;
        if (!senderEmail) {
          return res.status(400).json({ error: "fromEmail or email is required" });
        }

        const ownerSettings = await db.getUserSettings(1);
        const resolvedToEmail = req.body.toEmail || ownerSettings?.replyToEmail || "nitin@virtualassistant-group.com";

        console.log(`[ReplyDetection] Reply webhook received from: ${senderEmail}, to: ${resolvedToEmail}, subject: ${subject}`);

        const { processIncomingReply } = await import("../replyDetection");
        const result = await processIncomingReply({
          fromEmail: senderEmail,
          toEmail: resolvedToEmail,
          subject: subject || "",
          body: body || "",
          headers: headers || {},
          inReplyToMessageId: req.body.inReplyToMessageId,
          replyMessageId: req.body.replyMessageId,
          userId: 1, // Owner user ID
        });

        console.log(`[ReplyDetection] Classification: ${result.classification} (${result.confidence}% confidence) - ${result.reason}`);
        if (result.followUpsStopped) {
          console.log(`[ReplyDetection] Follow-ups stopped! Emails cancelled: ${result.emailsCancelled}, Calls cancelled: ${result.callsCancelled}`);
        }

        await db.createWebhookEvent({
          userId: 1,
          webhookType: "email_reply",
          status: result.classification === "genuine" ? "success" : "ignored",
          sourceEmail: senderEmail,
          campaignLeadId: undefined,
          payload: {
            classification: result.classification,
            confidence: result.confidence,
            reason: result.reason,
            followUpsStopped: result.followUpsStopped,
            emailsCancelled: result.emailsCancelled,
            callsCancelled: result.callsCancelled,
            leadId: result.leadId,
            campaignId: result.campaignId,
          },
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });

        return res.json({
          success: true,
          classification: result.classification,
          confidence: result.confidence,
          reason: result.reason,
          followUpsStopped: result.followUpsStopped,
          emailsCancelled: result.emailsCancelled,
          callsCancelled: result.callsCancelled,
          leadMatched: !!result.leadId,
        });
      }

      // Simple form: no subject/body/headers provided, treat as an unconditional positive reply
      console.log(`[EmailTracking] Reply webhook received - email: ${email}, campaignLeadId: ${campaignLeadId}`);

      let loggedCampaignLeadId: number | undefined;

      if (campaignLeadId) {
        await db.markLeadReplied(campaignLeadId, responseStatus || "positive");
        await db.cancelPendingFollowUps(campaignLeadId);
        loggedCampaignLeadId = campaignLeadId;
        console.log(`[EmailTracking] Marked campaignLead ${campaignLeadId} as replied (positive) and cancelled follow-ups`);
      } else if (email) {
        // Find all active campaign leads with this email
        const activeCampaignLeads = await db.findCampaignLeadsByEmail(email);
        for (const cl of activeCampaignLeads) {
          await db.markLeadReplied(cl.id, responseStatus || "positive");
          await db.cancelPendingFollowUps(cl.id);
          loggedCampaignLeadId = cl.id;
          console.log(`[EmailTracking] Marked campaignLead ${cl.id} as replied (positive) via email lookup`);
        }
      }

      // Log webhook event for monitoring
      await db.createWebhookEvent({
        userId: 1, // Default owner
        webhookType: "email_reply",
        status: "success",
        sourceEmail: email || undefined,
        campaignLeadId: loggedCampaignLeadId,
        payload: req.body,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[EmailTracking] Error processing reply webhook:", error);
      // Log failed event
      try {
        await db.createWebhookEvent({
          userId: 1,
          webhookType: "email_reply",
          status: "failed",
          sourceEmail: req.body?.email || req.body?.fromEmail,
          payload: req.body,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });
      } catch (_) {}
      res.status(500).json({ error: "Failed to process reply" });
    }
  });

  /**
   * Cal.com booking webhook (also accepts legacy Calendly format)
   * POST /api/webhooks/calendly
   * Called when a lead actually books a meeting on Cal.com
   * This is a POSITIVE response — lead scheduled a consultation
   * Body: Cal.com payload with { payload.attendees[0].email } or { email: string }
   */
  app.post("/api/webhooks/calendly", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      console.log(`[EmailTracking] Cal.com booking webhook received`);

      // HMAC Signature Verification (supports both Cal.com and legacy Calendly headers)
      const { calendlySecret } = await getWebhookSecrets();
      if (calendlySecret) {
        const rawBody = (req as any).rawBody || JSON.stringify(payload);
        const headers = {
          calcomSignature: req.headers["x-cal-signature-256"] as string | undefined,
          calendlySignature: req.headers["calendly-webhook-signature"] as string | undefined,
        };
        const verification = verifyCalcomSignature(rawBody, headers, calendlySecret);
        if (!verification.verified) {
          console.warn(`[EmailTracking] Cal.com webhook signature verification FAILED: ${verification.error}`);
          await db.createWebhookEvent({
            userId: 1,
            webhookType: "calendly_booking",
            status: "failed",
            signatureVerified: "unverified",
            payload,
            errorMessage: `Signature verification failed: ${verification.error}`,
            ipAddress: req.ip || req.socket.remoteAddress || undefined,
          });
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
        console.log(`[EmailTracking] Cal.com webhook signature verified successfully`);
      }

      // Determine signature verification status for event logging
      const calendlyVerificationStatus = calendlySecret ? "verified" : "bypassed";

      // Extract invitee email from various webhook formats
      let inviteeEmail: string | undefined;
      let loggedCampaignLeadId: number | undefined;

      // Handle Cal.com webhook format (payload.payload.attendees[0].email)
      if (payload?.payload?.attendees?.[0]?.email) {
        inviteeEmail = payload.payload.attendees[0].email;
      } else if (payload?.payload?.invitee?.email) {
        // Legacy Calendly v2 format
        inviteeEmail = payload.payload.invitee.email;
      } else if (payload?.email) {
        // Simple format: { email: "lead@example.com" }
        inviteeEmail = payload.email;
      } else if (payload?.campaignLeadId) {
        // Direct ID format
        await db.markLeadReplied(payload.campaignLeadId, "positive");
        await db.cancelPendingFollowUps(payload.campaignLeadId);
        loggedCampaignLeadId = payload.campaignLeadId;
        console.log(`[EmailTracking] Cal.com booking: marked campaignLead ${payload.campaignLeadId} as positive`);

        // Log webhook event
        await db.createWebhookEvent({
          userId: 1,
          webhookType: "calendly_booking",
          status: "success",
          signatureVerified: calendlyVerificationStatus as any,
          campaignLeadId: loggedCampaignLeadId,
          payload,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });
        return res.json({ success: true });
      }

      if (inviteeEmail) {
        const activeCampaignLeads = await db.findCampaignLeadsByEmail(inviteeEmail);
        for (const cl of activeCampaignLeads) {
          await db.markLeadReplied(cl.id, "positive");
          await db.cancelPendingFollowUps(cl.id);
          loggedCampaignLeadId = cl.id;
          console.log(`[EmailTracking] Cal.com booking: marked campaignLead ${cl.id} as positive (email: ${inviteeEmail})`);
        }
      } else {
        console.log(`[EmailTracking] Cal.com webhook: could not extract invitee email from payload`);
      }

      // Log webhook event for monitoring
      await db.createWebhookEvent({
        userId: 1,
        webhookType: "calendly_booking",
        status: inviteeEmail ? "success" : "ignored",
        signatureVerified: calendlyVerificationStatus as any,
        sourceEmail: inviteeEmail,
        campaignLeadId: loggedCampaignLeadId,
        payload,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[EmailTracking] Error processing Cal.com webhook:", error);
      // Log failed event
      try {
        await db.createWebhookEvent({
          userId: 1,
          webhookType: "calendly_booking",
          status: "failed",
          payload: req.body,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });
      } catch (_) {}
      res.status(500).json({ error: "Failed to process Cal.com booking" });
    }
  });

  /**
   * Email bounce webhook
   * POST /api/webhooks/bounce
   * Called by SMTP provider (SendGrid, Mailgun, AWS SES, etc.) when an email bounces
   * Also supports manual bounce reporting
   * Body: { email: string, reason?: string, campaignLeadId?: number }
   */
  app.post("/api/webhooks/bounce", async (req: Request, res: Response) => {
    try {
      const { email, reason, campaignLeadId, type } = req.body;
      console.log(`[EmailTracking] Bounce webhook received - email: ${email}, campaignLeadId: ${campaignLeadId}, type: ${type}`);

      const bounceReason = reason || type || "hard_bounce";
      let processedCount = 0;

      if (campaignLeadId) {
        // Direct campaign lead ID provided
        const campaignLead = await db.getCampaignLeadById(campaignLeadId);
        if (campaignLead && !campaignLead.emailBounced) {
          await db.updateCampaignLead(campaignLeadId, {
            emailBounced: 1 as any,
            emailBouncedAt: new Date().toISOString(),
            bounceReason: bounceReason,
          });
          // Update campaign bounce count
          const campaign = await db.getCampaignById(campaignLead.campaignId);
          if (campaign) {
            await db.updateCampaign(campaignLead.campaignId, {
              bounceCount: (campaign.bounceCount || 0) + 1,
            });
          }
          // Cancel follow-ups for bounced email
          await db.cancelPendingFollowUps(campaignLeadId);
          processedCount++;
          console.log(`[EmailTracking] Marked campaignLead ${campaignLeadId} as bounced: ${bounceReason}`);
        }
      } else if (email) {
        // Find all campaign leads with this email
        const activeCampaignLeads = await db.findCampaignLeadsByEmail(email);
        for (const cl of activeCampaignLeads) {
          // Check if already bounced
          const clFull = await db.getCampaignLeadById(cl.id);
          if (clFull && !clFull.emailBounced) {
            await db.updateCampaignLead(cl.id, {
              emailBounced: 1 as any,
              emailBouncedAt: new Date().toISOString(),
              bounceReason: bounceReason,
            });
            // Update campaign bounce count
            const campaign = await db.getCampaignById(cl.campaignId);
            if (campaign) {
              await db.updateCampaign(cl.campaignId, {
                bounceCount: (campaign.bounceCount || 0) + 1,
              });
            }
            // Cancel follow-ups for bounced email
            await db.cancelPendingFollowUps(cl.id);
            processedCount++;
            console.log(`[EmailTracking] Marked campaignLead ${cl.id} as bounced via email lookup: ${bounceReason}`);
          }
        }

        // Also update lead verification status to undeliverable for all leads with this email
        if (activeCampaignLeads.length > 0) {
          for (const cl of activeCampaignLeads) {
            const lead = await db.getLeadById(cl.leadId);
            if (lead && lead.emailVerificationStatus !== "undeliverable") {
              await db.updateLead(lead.id, {
                emailVerificationStatus: "undeliverable",
              });
              console.log(`[EmailTracking] Updated lead ${lead.id} email verification to undeliverable due to bounce`);
            }
          }
        }
      }

      res.json({ success: true, processed: processedCount });
    } catch (error) {
      console.error("[EmailTracking] Error processing bounce webhook:", error);
      res.status(500).json({ error: "Failed to process bounce" });
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

      // HMAC Signature Verification
      const { retellSecret } = await getWebhookSecrets();
      if (retellSecret) {
        const rawBody = (req as any).rawBody || JSON.stringify(payload);
        const sigHeader = req.headers["x-retell-signature"] as string | undefined;
        const verification = verifyRetellSignature(rawBody, sigHeader, retellSecret);
        if (!verification.verified) {
          console.warn(`[EmailTracking] Retell webhook signature verification FAILED: ${verification.error}`);
          await db.createWebhookEvent({
            userId: 1,
            webhookType: "retell_call",
            status: "failed",
            signatureVerified: "unverified",
            payload,
            errorMessage: `Signature verification failed: ${verification.error}`,
            ipAddress: req.ip || req.socket.remoteAddress || undefined,
          });
          return res.status(401).json({ error: "Invalid webhook signature" });
        }
        console.log(`[EmailTracking] Retell webhook signature verified successfully`);
      }

      const retellVerificationStatus = retellSecret ? "verified" : "bypassed";

      const { handleRetellWebhook } = await import("./retellAI");
      await handleRetellWebhook(payload);

      // Log webhook event for monitoring
      await db.createWebhookEvent({
        userId: 1,
        webhookType: "retell_call",
        status: "success",
        signatureVerified: retellVerificationStatus as any,
        payload,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error handling Retell webhook:", error);
      // Log failed event
      try {
        await db.createWebhookEvent({
          userId: 1,
          webhookType: "retell_call",
          status: "failed",
          payload: req.body,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        });
      } catch (_) {}
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

}
