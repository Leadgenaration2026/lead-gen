import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerEmailTrackingRoutes } from "./emailTracking";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  // The verify hook captures the raw body for HMAC signature verification on webhook routes
  app.use(express.json({
    limit: "50mb",
    verify: (req: any, _res, buf) => {
      // Store raw body for webhook signature verification
      if (req.url?.startsWith("/api/webhooks/")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerEmailTrackingRoutes(app);

  // Scheduled email processor endpoint (called by heartbeat cron)
  // Processes: 1) Scheduled one-off emails, 2) Follow-up emails, 3) Follow-up calls
  app.post("/api/scheduled/process-emails", async (req, res) => {
    try {
      // Authenticate cron request
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }

      const { processScheduledEmails, processScheduledFollowUpEmails, processScheduledFollowUpCalls } = await import("./followUpScheduler");
      const db = await import("../db");

      // 1. Process one-off scheduled emails
      const scheduledResult = await processScheduledEmails();
      console.log(`[Heartbeat] Scheduled emails: ${JSON.stringify(scheduledResult)}`);

      // 2. Process follow-up emails that are due
      const followUpResult = await processScheduledFollowUpEmails();
      console.log(`[Heartbeat] Follow-up emails: ${JSON.stringify(followUpResult)}`);

      // 3. Process follow-up calls that are due
      // Get Retell.AI settings from the owner's settings
      const ownerSettings = await db.getUserSettings(1); // Owner userId
      if (ownerSettings?.retellApiKey && ownerSettings?.retellAgentId && ownerSettings?.senderPhoneNumber) {
        const callsResult = await processScheduledFollowUpCalls(
          ownerSettings.retellApiKey,
          ownerSettings.retellAgentId,
          ownerSettings.senderPhoneNumber
        );
        console.log(`[Heartbeat] Follow-up calls: ${JSON.stringify(callsResult)}`);
        res.json({ ok: true, scheduled: scheduledResult, followUpEmails: followUpResult, followUpCalls: callsResult });
      } else {
        console.log(`[Heartbeat] Skipping follow-up calls - Retell.AI not configured`);
        res.json({ ok: true, scheduled: scheduledResult, followUpEmails: followUpResult, followUpCalls: { skipped: "retell_not_configured" } });
      }
    } catch (error: any) {
      console.error("[Heartbeat] Handler error:", error);
      res.status(500).json({
        error: error.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        context: { url: req.url, taskUid: (req as any).user?.taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
  // Scheduled campaign auto-launch endpoint (called by heartbeat cron)
  app.post("/api/scheduled/launch-campaign", async (req, res) => {
    try {
      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await import("../db");
      const { campaigns } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Find campaign by scheduleCronTaskUid
      const database = await db.getDb();
      if (!database) return res.status(500).json({ error: "Database unavailable" });
      const [campaign] = await database.select().from(campaigns).where(eq(campaigns.scheduleCronTaskUid, user.taskUid)).limit(1);
      if (!campaign) return res.json({ ok: true, skipped: "orphan" });

      // Only launch if still in draft status (prevent double-launch)
      if (campaign.status !== "draft") {
        return res.json({ ok: true, skipped: "already_launched", status: campaign.status });
      }

      // Get user settings for SMTP
      const settings = await db.getUserSettings(campaign.userId);
      if (!settings?.smtpHost || !settings?.smtpPassword || !settings?.senderEmail) {
        return res.status(500).json({ error: "SMTP not configured for campaign owner" });
      }

      // Import required utilities
      const nodemailer = (await import("nodemailer")).default;
      const { nanoid } = await import("nanoid");
      const { plainTextToHtml } = await import("@shared/emailFormat");
      const { getSignatureHtml } = await import("./followUpScheduler");

      const signature = await db.getEmailSignature(campaign.userId);
      const signatureHtml = getSignatureHtml(signature);
      const campaignLeads = await db.getCampaignLeads(campaign.id);

      if (campaignLeads.length === 0) {
        return res.json({ ok: true, skipped: "no_leads" });
      }

      let sentCount = 0;
      const baseUrl = req.headers["x-forwarded-proto"] 
        ? `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"] || req.headers.host}` 
        : `${req.protocol}://${req.get("host")}`;

      for (const campaignLead of campaignLeads) {
        try {
          const lead = await db.getLeadById(campaignLead.leadId);
          if (!lead) continue;

          const personalizedTemplate = (campaign.emailTemplate || "")
            .replace(/{{companyName}}/g, lead.companyName)
            .replace(/{{ownerName}}/g, lead.ownerName)
            .replace(/{{email}}/g, lead.email)
            .replace(/{{industry}}/g, lead.industry || "your industry")
            .replace(/{{phoneNumber}}/g, lead.phoneNumber || "");

          const trackingToken = nanoid();
          await db.createEmailTrackingEvent({ campaignLeadId: campaignLead.id, eventType: "open", trackingToken });
          const clickTrackingToken = nanoid();
          await db.createEmailTrackingEvent({ campaignLeadId: campaignLead.id, eventType: "click", trackingToken: clickTrackingToken });

          const trackingPixel = `<img src="${baseUrl}/api/track/pixel/${trackingToken}" width="1" height="1" alt="" style="display:none" />`;
          const ctaUrl = "https://calendly.com/nitin-virtualassistant/30min";
          const trackedCtaUrl = `${baseUrl}/api/track/click/${clickTrackingToken}?url=${encodeURIComponent(ctaUrl)}`;
          let emailBody = personalizedTemplate
            .replace(/{{bookingUrl}}/g, trackedCtaUrl)
            .replace(/{{ctaLink}}/g, trackedCtaUrl)
            .replace(/https:\/\/calendly\.com\/nitin-virtualassistant\/30min/g, trackedCtaUrl);

          emailBody = plainTextToHtml(emailBody) + trackingPixel;

          const unsubscribeUrl = `${baseUrl}/api/track/unsubscribe/${trackingToken}`;
          emailBody = emailBody.replace(
            /---<br\/?>[\s\S]*?unsubscribe[\s\S]*?$/i,
            `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`
          );
          if (!emailBody.includes(unsubscribeUrl)) {
            emailBody += `<br/><p style="font-size:11px;color:#999;text-align:center;margin-top:24px;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from future emails</p>`;
          }

          const todayDow = new Date().getDay();
          const mappedDow = todayDow === 0 ? 5 : todayDow > 5 ? 5 : todayDow;
          const rotationalEmail = await db.getRotationalEmailForDay(campaign.userId, mappedDow);

          const smtpConfig = rotationalEmail ? {
            host: rotationalEmail.smtpHost,
            port: rotationalEmail.smtpPort,
            secure: rotationalEmail.smtpPort === 465,
            auth: { user: rotationalEmail.smtpUsername, pass: rotationalEmail.smtpPassword },
          } : {
            host: settings.smtpHost || "",
            port: settings.smtpPort || 587,
            secure: (settings.smtpPort || 587) === 465,
            auth: { user: settings.smtpUsername || "", pass: settings.smtpPassword || "" },
          };
          const senderEmail = rotationalEmail ? rotationalEmail.email : settings.senderEmail;
          const senderDisplayName = rotationalEmail ? (rotationalEmail.senderName || settings.senderName || "Lead Gen") : (settings.senderName || "Lead Gen");

          const transporter = nodemailer.createTransport(smtpConfig as any);
          await transporter.sendMail({
            from: `"${senderDisplayName}" <${senderEmail}>`,
            to: lead.email,
            replyTo: "nitin@virtualassistant-group.com",
            subject: campaign.subject,
            html: emailBody,
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          });

          await db.updateCampaignLead(campaignLead.id, { emailSent: true, emailSentAt: new Date() });
          sentCount++;
        } catch (err: any) {
          console.error(`[Scheduled Launch] Failed for campaignLead ${campaignLead.id}:`, err?.message);
        }
      }

      await db.updateCampaign(campaign.id, { status: "active", launchedAt: new Date(), sentCount });

      // Delete the cron job since it's a one-time launch
      try {
        const { deleteHeartbeatJob } = await import("./heartbeat");
        await deleteHeartbeatJob(user.taskUid, "");
      } catch { /* ignore cleanup errors */ }

      console.log(`[Scheduled Launch] Campaign ${campaign.id} launched: ${sentCount}/${campaignLeads.length} emails sent`);
      res.json({ ok: true, campaignId: campaign.id, sentCount });
    } catch (error: any) {
      console.error("[Scheduled Launch] Handler error:", error);
      res.status(500).json({
        error: error.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        context: { url: req.url, taskUid: (req as any).user?.taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
