import { eq, and, desc, inArray, lte, count, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, leads, campaigns, campaignLeads, emailTrackingEvents, callLogs, userSettings, InsertLead, InsertCampaign, InsertCampaignLead, InsertEmailTrackingEvent, InsertCallLog, InsertUserSettings, leadSets, InsertLeadSet, rotationalEmails, InsertRotationalEmail, webhookEvents, InsertWebhookEvent } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Lead queries
export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(leads).values(data);
}

export async function getLeadsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(leads).where(eq(leads.userId, userId)).orderBy(desc(leads.createdAt));
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(leads).where(eq(leads.id, id));
}

// Campaign queries
export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(campaigns).values(data);
  return result[0].insertId;
}

export async function getCampaignsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result[0];
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(campaigns).set({ ...data, updatedAt: new Date() }).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Get all campaign lead IDs for cascading
  const cLeads = await db.select({ id: campaignLeads.id }).from(campaignLeads).where(eq(campaignLeads.campaignId, id));
  const cLeadIds = cLeads.map(cl => cl.id);
  
  if (cLeadIds.length > 0) {
    // Delete dependent records for each campaign lead
    const { followUpEmails, followUpCalls } = await import("../drizzle/schema");
    for (const clId of cLeadIds) {
      await db.delete(emailTrackingEvents).where(eq(emailTrackingEvents.campaignLeadId, clId));
      await db.delete(callLogs).where(eq(callLogs.campaignLeadId, clId));
      await db.delete(followUpEmails).where(eq(followUpEmails.campaignLeadId, clId));
      await db.delete(followUpCalls).where(eq(followUpCalls.campaignLeadId, clId));
    }
    // Delete campaign leads
    await db.delete(campaignLeads).where(eq(campaignLeads.campaignId, id));
  }
  // Delete the campaign
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

// Campaign lead queries
export async function addLeadsToCampaign(campaignId: number, leadIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const campaignLeadData = leadIds.map(leadId => ({
    campaignId,
    leadId,
  }));
  return db.insert(campaignLeads).values(campaignLeadData);
}

export async function getCampaignLeads(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(campaignLeads).where(eq(campaignLeads.campaignId, campaignId));
}

export async function getCampaignLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campaignLeads).where(eq(campaignLeads.id, id)).limit(1);
  return result[0];
}

export async function updateCampaignLead(id: number, data: Partial<InsertCampaignLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(campaignLeads).set({ ...data, updatedAt: new Date() }).where(eq(campaignLeads.id, id));
}

// Email tracking queries
export async function createEmailTrackingEvent(data: InsertEmailTrackingEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(emailTrackingEvents).values(data);
}

export async function getEmailTrackingEventByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(emailTrackingEvents).where(eq(emailTrackingEvents.trackingToken, token)).limit(1);
  return result[0];
}

export async function getEmailTrackingEventsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(emailTrackingEvents).where(eq(emailTrackingEvents.campaignLeadId, campaignLeadId));
}

// Call log queries
export async function createCallLog(data: InsertCallLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(callLogs).values(data);
}

export async function getCallLogByRetellId(retellCallId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(callLogs).where(eq(callLogs.retellCallId, retellCallId)).limit(1);
  return result[0];
}

export async function updateCallLog(id: number, data: Partial<InsertCallLog>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(callLogs).set({ ...data, updatedAt: new Date() }).where(eq(callLogs.id, id));
}

export async function getCallLogsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callLogs).where(eq(callLogs.campaignLeadId, campaignLeadId));
}

// User settings queries
export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserSettings(data: InsertUserSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!data.userId) throw new Error("userId is required");
  
  const existing = await getUserSettings(data.userId);
  if (existing) {
    return db.update(userSettings).set({ ...data, updatedAt: new Date() }).where(eq(userSettings.userId, data.userId));
  }
  return db.insert(userSettings).values(data);
}


// Email signatures queries
export async function getEmailSignature(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailSignatures } = await import("../drizzle/schema");
  const result = await db.select().from(emailSignatures).where(eq(emailSignatures.userId, userId)).limit(1);
  return result[0];
}

export async function upsertEmailSignature(userId: number, signatureHtml: string, signaturePlainText?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailSignatures } = await import("../drizzle/schema");
  
  const existing = await getEmailSignature(userId);
  if (existing) {
    return db.update(emailSignatures).set({ signatureHtml, signaturePlainText, updatedAt: new Date() }).where(eq(emailSignatures.userId, userId));
  }
  return db.insert(emailSignatures).values({ userId, signatureHtml, signaturePlainText });
}

// Follow-up emails queries
export async function createFollowUpEmail(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpEmails } = await import("../drizzle/schema");
  return db.insert(followUpEmails).values(data);
}

export async function getFollowUpEmailsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpEmails } = await import("../drizzle/schema");
  return db.select().from(followUpEmails).where(eq(followUpEmails.campaignLeadId, campaignLeadId));
}

export async function updateFollowUpEmail(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpEmails } = await import("../drizzle/schema");
  return db.update(followUpEmails).set({ ...data, updatedAt: new Date() }).where(eq(followUpEmails.id, id));
}

// Follow-up calls queries
export async function createFollowUpCall(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpCalls } = await import("../drizzle/schema");
  return db.insert(followUpCalls).values(data);
}

export async function getFollowUpCallsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpCalls } = await import("../drizzle/schema");
  return db.select().from(followUpCalls).where(eq(followUpCalls.campaignLeadId, campaignLeadId));
}

export async function updateFollowUpCall(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpCalls } = await import("../drizzle/schema");
  return db.update(followUpCalls).set({ ...data, updatedAt: new Date() }).where(eq(followUpCalls.id, id));
}

// Lead weak points queries
export async function getLeadWeakPoints(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { leadWeakPoints } = await import("../drizzle/schema");
  const result = await db.select().from(leadWeakPoints).where(eq(leadWeakPoints.leadId, leadId)).limit(1);
  return result[0];
}

export async function upsertLeadWeakPoints(leadId: number, weakPoints: any, analysis: string, suggestedEmailTypes: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { leadWeakPoints } = await import("../drizzle/schema");
  
  const existing = await getLeadWeakPoints(leadId);
  if (existing) {
    return db.update(leadWeakPoints).set({ weakPoints, analysis, suggestedEmailTypes, updatedAt: new Date() }).where(eq(leadWeakPoints.leadId, leadId));
  }
  return db.insert(leadWeakPoints).values({ leadId, weakPoints, analysis, suggestedEmailTypes });
}

// Email templates queries
export async function createEmailTemplate(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailTemplates } = await import("../drizzle/schema");
  return db.insert(emailTemplates).values(data);
}

export async function getEmailTemplatesByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailTemplates } = await import("../drizzle/schema");
  return db.select().from(emailTemplates).where(eq(emailTemplates.userId, userId));
}

export async function updateEmailTemplate(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailTemplates } = await import("../drizzle/schema");
  return db.update(emailTemplates).set({ ...data, updatedAt: new Date() }).where(eq(emailTemplates.id, id));
}

export async function deleteEmailTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { emailTemplates } = await import("../drizzle/schema");
  return db.delete(emailTemplates).where(eq(emailTemplates.id, id));
}

// Follow-up schedule queries
export async function getFollowUpSchedule(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpSchedules } = await import("../drizzle/schema");
  const result = await db.select().from(followUpSchedules).where(eq(followUpSchedules.userId, userId)).limit(1);
  return result[0];
}

export async function upsertFollowUpSchedule(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpSchedules } = await import("../drizzle/schema");
  
  const existing = await getFollowUpSchedule(data.userId);
  if (existing) {
    return db.update(followUpSchedules).set({ ...data, updatedAt: new Date() }).where(eq(followUpSchedules.userId, data.userId));
  }
  return db.insert(followUpSchedules).values(data);
}

// Get all scheduled follow-up emails that are due (scheduledFor <= now)
export async function getDueFollowUpEmails() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpEmails } = await import("../drizzle/schema");
  const { lte, and } = await import("drizzle-orm");
  return db.select().from(followUpEmails)
    .where(and(
      eq(followUpEmails.status, "scheduled"),
      lte(followUpEmails.scheduledFor, new Date())
    ));
}

// Get all scheduled follow-up calls that are due (scheduledFor <= now)
export async function getDueFollowUpCalls() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpCalls, campaignLeads, leads } = await import("../drizzle/schema");
  const { lte, and } = await import("drizzle-orm");
  const results = await db.select({
    id: followUpCalls.id,
    campaignLeadId: followUpCalls.campaignLeadId,
    attemptNumber: followUpCalls.attemptNumber,
    phoneNumber: followUpCalls.phoneNumber,
    status: followUpCalls.status,
    scheduledFor: followUpCalls.scheduledFor,
    leadTimezone: leads.timezone,
  }).from(followUpCalls)
    .innerJoin(campaignLeads, eq(followUpCalls.campaignLeadId, campaignLeads.id))
    .innerJoin(leads, eq(campaignLeads.leadId, leads.id))
    .where(and(
      eq(followUpCalls.status, "scheduled"),
      lte(followUpCalls.scheduledFor, new Date())
    ));
  return results;
}

// Cancel all remaining scheduled calls for a campaign lead (when lead answers)
export async function cancelRemainingFollowUpCalls(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { followUpCalls } = await import("../drizzle/schema");
  const { and } = await import("drizzle-orm");
  return db.update(followUpCalls)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(
      eq(followUpCalls.campaignLeadId, campaignLeadId),
      eq(followUpCalls.status, "scheduled")
    ));
}

// ============ Lead Deduplication ============
import { scheduledEmails, campaignTemplates, followUpEmails, followUpCalls } from "../drizzle/schema";
import type { InsertScheduledEmail } from "../drizzle/schema";
import type { InsertCampaignTemplate } from "../drizzle/schema";

export async function getLeadsByEmail(email: string, userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(leads).where(
    and(eq(leads.email, email), eq(leads.userId, userId))
  );
}

export async function getLeadsByEmails(emails: string[], userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(leads).where(
    and(inArray(leads.email, emails), eq(leads.userId, userId))
  );
}

// ============ Scheduled Emails ============
export async function createScheduledEmail(data: Omit<InsertScheduledEmail, "id" | "createdAt" | "updatedAt">) {
  const database = await getDb();
  if (!database) return null;
  const result = await database.insert(scheduledEmails).values(data);
  return result[0].insertId;
}

export async function getScheduledEmailsByUserId(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(scheduledEmails).where(eq(scheduledEmails.userId, userId)).orderBy(scheduledEmails.scheduledFor);
}

export async function getDueScheduledEmails() {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(scheduledEmails).where(
    and(
      eq(scheduledEmails.status, "pending"),
      lte(scheduledEmails.scheduledFor, new Date())
    )
  );
}

export async function updateScheduledEmail(id: number, data: Partial<InsertScheduledEmail>) {
  const database = await getDb();
  if (!database) return;
  await database.update(scheduledEmails).set(data).where(eq(scheduledEmails.id, id));
}

export async function cancelScheduledEmail(id: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(scheduledEmails).set({ status: "cancelled" }).where(eq(scheduledEmails.id, id));
}

// ============ Campaign Templates ============
export async function createCampaignTemplate(data: Omit<InsertCampaignTemplate, "id" | "createdAt" | "updatedAt">) {
  const database = await getDb();
  if (!database) return null;
  const result = await database.insert(campaignTemplates).values(data);
  return result[0].insertId;
}

export async function getCampaignTemplatesByUserId(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(campaignTemplates).where(eq(campaignTemplates.userId, userId)).orderBy(campaignTemplates.createdAt);
}

export async function getCampaignTemplateById(id: number) {
  const database = await getDb();
  if (!database) return null;
  const result = await database.select().from(campaignTemplates).where(eq(campaignTemplates.id, id));
  return result.length > 0 ? result[0] : null;
}

export async function deleteCampaignTemplate(id: number) {
  const database = await getDb();
  if (!database) return;
  await database.delete(campaignTemplates).where(eq(campaignTemplates.id, id));
}

export async function incrementTemplateUsage(id: number) {
  const database = await getDb();
  if (!database) return;
  const template = await getCampaignTemplateById(id);
  if (template) {
    await database.update(campaignTemplates).set({ usageCount: template.usageCount + 1 }).where(eq(campaignTemplates.id, id));
  }
}

// ============ Lead Upsert (Overwrite by email) ============
export async function upsertLeadByEmail(data: InsertLead) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  // Case-insensitive email lookup
  const emailLower = data.email.toLowerCase();
  const existing = await database.select().from(leads).where(
    and(eq(leads.userId, data.userId!), eq(leads.email, emailLower))
  );
  if (existing.length > 0) {
    // Update existing lead
    await database.update(leads).set({
      companyName: data.companyName,
      ownerName: data.ownerName,
      phoneNumber: data.phoneNumber,
      website: data.website,
      industry: data.industry,
      customData: data.customData,
      updatedAt: new Date(),
    }).where(eq(leads.id, existing[0].id));
    return existing[0].id;
  }
  // Insert new
  const result = await database.insert(leads).values({ ...data, email: emailLower });
  return result[0].insertId;
}

// ============ Lead Sets ============
export async function createLeadSet(data: Omit<InsertLeadSet, "id" | "createdAt" | "updatedAt">) {
  const database = await getDb();
  if (!database) return null;
  const result = await database.insert(leadSets).values(data);
  return result[0].insertId;
}

export async function getLeadSetsByUserId(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(leadSets).where(eq(leadSets.userId, userId)).orderBy(desc(leadSets.createdAt));
}

export async function getLeadSetById(id: number) {
  const database = await getDb();
  if (!database) return null;
  const result = await database.select().from(leadSets).where(eq(leadSets.id, id));
  return result.length > 0 ? result[0] : null;
}

export async function updateLeadSet(id: number, data: Partial<InsertLeadSet>) {
  const database = await getDb();
  if (!database) return;
  await database.update(leadSets).set({ ...data, updatedAt: new Date() }).where(eq(leadSets.id, id));
}

export async function deleteLeadSet(id: number) {
  const database = await getDb();
  if (!database) return;
  // Remove the leadSetId from leads that belong to this set
  await database.update(leads).set({ leadSetId: null }).where(eq(leads.leadSetId, id));
  await database.delete(leadSets).where(eq(leadSets.id, id));
}

export async function assignLeadsToSet(leadIds: number[], leadSetId: number | null) {
  const database = await getDb();
  if (!database) return;
  await database.update(leads).set({ leadSetId }).where(inArray(leads.id, leadIds));
}

export async function getLeadsBySetId(leadSetId: number, userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(leads).where(
    and(eq(leads.leadSetId, leadSetId), eq(leads.userId, userId))
  ).orderBy(desc(leads.createdAt));
}

// ===== Rotational Emails =====

export async function getRotationalEmailForDay(userId: number, dayOfWeek: number) {
  const database = await getDb();
  if (!database) return null;
  const results = await database.select().from(rotationalEmails).where(
    and(eq(rotationalEmails.userId, userId), eq(rotationalEmails.dayOfWeek, dayOfWeek), eq(rotationalEmails.isActive, true))
  );
  return results[0] || null;
}

export async function getRotationalEmailsByUser(userId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(rotationalEmails).where(eq(rotationalEmails.userId, userId)).orderBy(rotationalEmails.dayOfWeek);
}

export async function upsertRotationalEmail(data: Omit<InsertRotationalEmail, "id" | "createdAt" | "updatedAt">) {
  const database = await getDb();
  if (!database) return;
  // Check if one exists for this user+day
  const existing = await database.select().from(rotationalEmails).where(
    and(eq(rotationalEmails.userId, data.userId), eq(rotationalEmails.dayOfWeek, data.dayOfWeek))
  );
  if (existing.length > 0) {
    await database.update(rotationalEmails).set({
      email: data.email,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUsername: data.smtpUsername,
      smtpPassword: data.smtpPassword,
      senderName: data.senderName,
      isActive: data.isActive ?? true,
    }).where(eq(rotationalEmails.id, existing[0].id));
  } else {
    await database.insert(rotationalEmails).values(data as any);
  }
}

export async function deleteRotationalEmail(id: number) {
  const database = await getDb();
  if (!database) return;
  await database.delete(rotationalEmails).where(eq(rotationalEmails.id, id));
}

// ===== Unsubscribe & Reply =====

export async function markLeadUnsubscribed(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    unsubscribed: true,
    unsubscribedAt: new Date(),
  } as any).where(eq(campaignLeads.id, campaignLeadId));
}

export async function markLeadReplied(campaignLeadId: number, responseStatus: string = "positive") {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    replied: true,
    repliedAt: new Date(),
    responseStatus,
  } as any).where(eq(campaignLeads.id, campaignLeadId));
}

export async function isLeadUnsubscribed(campaignLeadId: number): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const result = await database.select().from(campaignLeads).where(eq(campaignLeads.id, campaignLeadId));
  return result[0]?.unsubscribed === true;
}

// Cancel all pending follow-up emails and calls for a campaign lead (on reply/unsubscribe)
export async function cancelPendingFollowUps(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  
  // Cancel pending follow-up emails
  await database.update(followUpEmails).set({
    status: "failed" as any, // Using "failed" to indicate cancelled
  }).where(
    and(
      eq(followUpEmails.campaignLeadId, campaignLeadId),
      eq(followUpEmails.status, "scheduled")
    )
  );
  
  // Cancel pending follow-up calls
  await database.update(followUpCalls).set({
    status: "failed" as any,
  }).where(
    and(
      eq(followUpCalls.campaignLeadId, campaignLeadId),
      eq(followUpCalls.status, "scheduled")
    )
  );
}

// Find active campaign leads by email address (for reply/booking detection)
export async function findCampaignLeadsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];
  
  // Find leads with this email
  const matchingLeads = await db.select({ id: leads.id }).from(leads).where(eq(leads.email, email));
  if (matchingLeads.length === 0) return [];
  
  const leadIds = matchingLeads.map(l => l.id);
  
  // Find campaign leads that are in active campaigns and haven't already replied
  const results = await db.select({
    id: campaignLeads.id,
    campaignId: campaignLeads.campaignId,
    leadId: campaignLeads.leadId,
  }).from(campaignLeads)
    .innerJoin(campaigns, eq(campaignLeads.campaignId, campaigns.id))
    .where(
      and(
        inArray(campaignLeads.leadId, leadIds),
        eq(campaigns.status, "active"),
        eq(campaignLeads.replied, false)
      )
    );
  
  return results;
}

// ============ Webhook Events ============

export async function createWebhookEvent(data: InsertWebhookEvent) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(webhookEvents).values(data);
  return result[0].insertId;
}

export async function getWebhookEvents(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(webhookEvents)
    .where(eq(webhookEvents.userId, userId))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(limit);
}

export async function getWebhookStats(userId: number) {
  const db = await getDb();
  if (!db) return { calendlyTotal: 0, replyTotal: 0, retellTotal: 0, calendlyLast: null, replyLast: null, retellLast: null };

  // Get counts by type
  const counts = await db.select({
    webhookType: webhookEvents.webhookType,
    total: count(),
  }).from(webhookEvents)
    .where(and(eq(webhookEvents.userId, userId), eq(webhookEvents.status, "success")))
    .groupBy(webhookEvents.webhookType);

  // Get last successful event for each type
  const lastCalendly = await db.select().from(webhookEvents)
    .where(and(eq(webhookEvents.userId, userId), eq(webhookEvents.webhookType, "calendly_booking"), eq(webhookEvents.status, "success")))
    .orderBy(desc(webhookEvents.createdAt)).limit(1);

  const lastReply = await db.select().from(webhookEvents)
    .where(and(eq(webhookEvents.userId, userId), eq(webhookEvents.webhookType, "email_reply"), eq(webhookEvents.status, "success")))
    .orderBy(desc(webhookEvents.createdAt)).limit(1);

  const lastRetell = await db.select().from(webhookEvents)
    .where(and(eq(webhookEvents.userId, userId), eq(webhookEvents.webhookType, "retell_call"), eq(webhookEvents.status, "success")))
    .orderBy(desc(webhookEvents.createdAt)).limit(1);

  const calendlyCount = counts.find(c => c.webhookType === "calendly_booking")?.total || 0;
  const replyCount = counts.find(c => c.webhookType === "email_reply")?.total || 0;
  const retellCount = counts.find(c => c.webhookType === "retell_call")?.total || 0;

  return {
    calendlyTotal: calendlyCount,
    replyTotal: replyCount,
    retellTotal: retellCount,
    calendlyLast: lastCalendly[0]?.createdAt || null,
    replyLast: lastReply[0]?.createdAt || null,
    retellLast: lastRetell[0]?.createdAt || null,
  };
}
