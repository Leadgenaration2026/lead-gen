import { eq, and, desc, inArray, lte, count, sql, gte, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { InsertUser, users, leads, campaigns, campaignLeads, emailTrackingEvents, callLogs, userSettings, InsertLead, InsertCampaign, InsertCampaignLead, InsertEmailTrackingEvent, InsertCallLog, InsertUserSettings, leadSets, InsertLeadSet, rotationalEmails, InsertRotationalEmail, webhookEvents, InsertWebhookEvent, claudeApiUsage, InsertClaudeApiUsage, searchCache, leadImports, InsertSearchCache, SearchCache, InsertLeadImport, LeadImport } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: 'default' });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (_db) {
    try {
      await ensureLeadsAndTrackingColumns(_db);
    } catch (error) {
      console.warn("[Database] Failed to ensure leads/tracking columns:", error);
    }
  }
  return _db;
}

// Lazily adds columns needed for lead-level (non-campaign) unsubscribe and
// tracking support. `leads` is queried from dozens of call sites, so this
// runs from getDb() itself (guarded, runs once) rather than from any one
// specific function -- every query against these tables goes through here.
let leadsAndTrackingColumnsReady = false;
async function ensureLeadsAndTrackingColumns(database: NonNullable<typeof _db>) {
  if (leadsAndTrackingColumnsReady) return;
  await database.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed TINYINT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribedAt TIMESTAMP NULL`);
  await database.execute(sql`ALTER TABLE emailTrackingEvents ADD COLUMN IF NOT EXISTS leadId INT`);
  await database.execute(sql`ALTER TABLE emailTrackingEvents MODIFY COLUMN campaignLeadId INT NULL`);
  await database.execute(sql`ALTER TABLE socialOutreach ADD COLUMN IF NOT EXISTS responseStatus ENUM('none','accepted','replied','declined') DEFAULT 'none' NOT NULL`);
  await database.execute(sql`ALTER TABLE socialOutreach ADD COLUMN IF NOT EXISTS respondedAt TIMESTAMP NULL`);
  leadsAndTrackingColumnsReady = true;
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
      const lastSignedInStr = typeof user.lastSignedIn === 'string' ? user.lastSignedIn : (user.lastSignedIn as any)?.toISOString?.() || user.lastSignedIn;
      values.lastSignedIn = lastSignedInStr;
      updateSet.lastSignedIn = lastSignedInStr;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();
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

export async function getLeadsByUserId(userId: number, page?: number, pageSize?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // If no pagination params provided, return plain array (backward compatible)
  if (page === undefined || pageSize === undefined) {
    const results = await db.select().from(leads)
      .where(eq(leads.userId, userId))
      .orderBy(desc(leads.createdAt));
    return results;
  }
  
  // Otherwise return paginated wrapper object
  const offset = (page - 1) * pageSize;
  const results = await db.select().from(leads)
    .where(eq(leads.userId, userId))
    .orderBy(desc(leads.createdAt))
    .limit(pageSize)
    .offset(offset);
  
  // Get total count for pagination
  const countResult = await db.select({ count: sql`count(*)` }).from(leads).where(eq(leads.userId, userId));
  const total = countResult[0]?.count as number || 0;
  
  return { results, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// Get leads not assigned to any campaign (for dashboard leads view)
export async function getUnassignedLeadsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Get all lead IDs that are in any campaign
  const assignedLeadRows = await db.selectDistinct({ leadId: campaignLeads.leadId }).from(campaignLeads);
  const assignedLeadIds = assignedLeadRows.map(r => r.leadId);
  if (assignedLeadIds.length === 0) {
    return db.select().from(leads).where(eq(leads.userId, userId)).orderBy(desc(leads.createdAt));
  }
  return db.select().from(leads).where(
    and(eq(leads.userId, userId), notInArray(leads.id, assignedLeadIds))
  ).orderBy(desc(leads.createdAt));
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
  return db.update(leads).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(leads).where(eq(leads.id, id));
}

export async function updateLeadEngagement(id: number, score: number, metrics: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(leads).set(convertToDbFormat({ engagementScore: score, engagementData: metrics, updatedAt: new Date() })).where(eq(leads.id, id));
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

function convertToDbFormat(data: any): any {
  const result = { ...data };
  for (const key in result) {
    if (result[key] instanceof Date) {
      result[key] = result[key].toISOString();
    } else if (typeof result[key] === 'boolean') {
      result[key] = result[key] ? 1 : 0;
    }
  }
  return result;
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(campaigns).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(campaigns.id, id));
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

export async function getCampaignLeadById(id: number | null | undefined) {
  if (!id) return undefined;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(campaignLeads).where(eq(campaignLeads.id, id)).limit(1);
  return result[0];
}

export async function updateCampaignLead(id: number, data: Partial<InsertCampaignLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(campaignLeads).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(campaignLeads.id, id));
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
  return db.update(callLogs).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(callLogs.id, id));
}

export async function getCallLogsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callLogs).where(eq(callLogs.campaignLeadId, campaignLeadId));
}

// Lazily adds the IMAP inbox-sync columns to the existing userSettings table
// (no migration tool access in this environment, so schema.ts is updated
// alongside this idempotent ALTER TABLE run once per process lifetime).
let userSettingsImapColumnsReady = false;
async function ensureUserSettingsImapColumns(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (userSettingsImapColumnsReady) return;
  // Best-effort: getUserSettings/upsertUserSettings are called from nearly
  // every procedure in the app, so a failure here (e.g. unsupported "ADD
  // COLUMN IF NOT EXISTS" syntax on some MySQL versions) must not take down
  // every settings-dependent feature — just skip and retry next call.
  try {
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapHost VARCHAR(255)`);
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapPort INT`);
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapUsername VARCHAR(255)`);
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapPassword VARCHAR(255)`);
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapLastUid INT`);
    await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS imapLastSyncedAt TIMESTAMP NULL`);
    userSettingsImapColumnsReady = true;
  } catch (error) {
    console.error("[ensureUserSettingsImapColumns] Failed to add IMAP columns:", error);
  }
}

// User settings queries
export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureUserSettingsImapColumns(db);
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserSettings(data: InsertUserSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!data.userId) throw new Error("userId is required");
  await ensureUserSettingsImapColumns(db);

  const existing = await getUserSettings(data.userId);
  if (existing) {
    return db.update(userSettings).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(userSettings.userId, data.userId));
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
    return db.update(emailSignatures).set(convertToDbFormat({ signatureHtml, signaturePlainText, updatedAt: new Date() })).where(eq(emailSignatures.userId, userId));
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
  return db.update(followUpEmails).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(followUpEmails.id, id));
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
  return db.update(followUpCalls).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(followUpCalls.id, id));
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
    return db.update(leadWeakPoints).set(convertToDbFormat({ weakPoints, analysis, suggestedEmailTypes, updatedAt: new Date() })).where(eq(leadWeakPoints.leadId, leadId));
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
  return db.update(emailTemplates).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(emailTemplates.id, id));
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
    return db.update(followUpSchedules).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(followUpSchedules.userId, data.userId));
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
    .set(convertToDbFormat({ status: "failed", updatedAt: new Date() }))
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

export async function getLeadsBySeamlessIds(seamlessIds: string[], userId: number) {
  const database = await getDb();
  if (!database || seamlessIds.length === 0) return [];
  return database.select().from(leads).where(
    and(inArray(leads.seamlessId, seamlessIds), eq(leads.userId, userId))
  );
}

// Tracks Seamless.AI contacts a user has explicitly deleted/discarded from a
// search preview (not saved as leads), so future searches never show them
// again. This project's schema changes require manually running
// `drizzle-kit generate && migrate` against the live database, which isn't
// something this environment has credentials to do -- so this table is
// created lazily (idempotent, isolated from the existing `leads` table)
// the first time it's needed, using the same DB connection the app already has.
let excludedSeamlessTableReady = false;
async function ensureExcludedSeamlessContactsTable(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (excludedSeamlessTableReady) return;
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS excludedSeamlessContacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      seamlessId VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY excludedSeamlessContacts_user_seamless (userId, seamlessId)
    )
  `);
  excludedSeamlessTableReady = true;
}

export async function excludeSeamlessContacts(userId: number, seamlessIds: string[]) {
  const database = await getDb();
  if (!database || seamlessIds.length === 0) return;
  try {
    await ensureExcludedSeamlessContactsTable(database);
    const values = sql.join(
      seamlessIds.map((id) => sql`(${userId}, ${id})`),
      sql`, `
    );
    await database.execute(sql`INSERT IGNORE INTO excludedSeamlessContacts (userId, seamlessId) VALUES ${values}`);
  } catch (error) {
    console.error("[excludeSeamlessContacts] Failed:", error);
  }
}

export async function getExcludedSeamlessContactIds(userId: number, seamlessIds: string[]): Promise<Set<string>> {
  const database = await getDb();
  if (!database || seamlessIds.length === 0) return new Set();
  try {
    await ensureExcludedSeamlessContactsTable(database);
    const idList = sql.join(seamlessIds.map((id) => sql`${id}`), sql`, `);
    const result: any = await database.execute(
      sql`SELECT seamlessId FROM excludedSeamlessContacts WHERE userId = ${userId} AND seamlessId IN (${idList})`
    );
    // mysql2's raw execute() can return either `rows` directly or a
    // `[rows, fields]` tuple depending on driver/version — handle both.
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    return new Set(rows.map((r: any) => r.seamlessId));
  } catch (error) {
    console.error("[getExcludedSeamlessContactIds] Failed:", error);
    return new Set();
  }
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
      updatedAt: new Date().toISOString(),
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
  await database.update(leadSets).set(convertToDbFormat({ ...data, updatedAt: new Date() })).where(eq(leadSets.id, id));
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
    await database.update(rotationalEmails).set(convertToDbFormat({
      email: data.email,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUsername: data.smtpUsername,
      smtpPassword: data.smtpPassword,
      senderName: data.senderName,
      isActive: data.isActive ?? true,
    })).where(eq(rotationalEmails.id, existing[0].id));
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

// Global, lead-level unsubscribe -- used for one-off scheduled emails, which
// aren't tied to any campaign so there's no campaignLeadId to scope to.
// Also cancels any other still-pending scheduled emails for this lead.
export async function markLeadUnsubscribedGlobally(leadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(leads).set({
    unsubscribed: true,
    unsubscribedAt: new Date(),
  } as any).where(eq(leads.id, leadId));

  await database.update(scheduledEmails).set({ status: "cancelled" }).where(
    and(eq(scheduledEmails.leadId, leadId), eq(scheduledEmails.status, "pending"))
  );
}

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
  return result[0]?.unsubscribed === 1;
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

// ============ Inbox / Email Replies ============

export async function getEmailRepliesByUser(userId: number, limit: number = 100) {
  const database = await getDb();
  if (!database) return [];
  const { emailReplies } = await import("../drizzle/schema");
  const { desc } = await import("drizzle-orm");
  return database.select().from(emailReplies).where(eq(emailReplies.userId, userId)).orderBy(desc(emailReplies.receivedAt)).limit(limit);
}

export async function getReplyStatsByUser(userId: number) {
  const database = await getDb();
  if (!database) return { total: 0, genuine: 0, autoReply: 0, newsletter: 0, spam: 0, bounce: 0, unsubscribe: 0, followUpsStopped: 0 };
  const { emailReplies } = await import("../drizzle/schema");
  const rows = await database.select().from(emailReplies).where(eq(emailReplies.userId, userId));
  const stats = { total: rows.length, genuine: 0, autoReply: 0, newsletter: 0, spam: 0, bounce: 0, unsubscribe: 0, followUpsStopped: 0 };
  for (const r of rows as any[]) {
    if (r.classification === "genuine") stats.genuine++;
    else if (r.classification === "auto_reply") stats.autoReply++;
    else if (r.classification === "newsletter") stats.newsletter++;
    else if (r.classification === "spam") stats.spam++;
    else if (r.classification === "bounce") stats.bounce++;
    else if (r.classification === "unsubscribe") stats.unsubscribe++;
    if (r.followUpsStopped) stats.followUpsStopped++;
  }
  return stats;
}

// ============ Webhook Events ============

export async function createWebhookEvent(data: InsertWebhookEvent) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(webhookEvents).values(data);
  return result[0].insertId;
}

export async function getWebhookEvents(userId: number, limit: number = 100, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(webhookEvents.userId, userId)];
  if (startDate) {
    conditions.push(gte(webhookEvents.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(webhookEvents.createdAt, endDate));
  }
  return db.select().from(webhookEvents)
    .where(and(...conditions))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(limit);
}

export async function clearWebhookEvents(userId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return;
  const conditions: any[] = [eq(webhookEvents.userId, userId)];
  if (startDate) {
    conditions.push(gte(webhookEvents.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(webhookEvents.createdAt, endDate));
  }
  await db.delete(webhookEvents).where(and(...conditions));
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


// Website Insights queries
export async function getWebsiteInsights(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { websiteInsights } = await import("../drizzle/schema");
  const result = await db.select().from(websiteInsights).where(eq(websiteInsights.leadId, leadId)).limit(1);
  return result[0];
}

export async function upsertWebsiteInsights(leadId: number, data: {
  domain: string;
  totalVisits?: number | null;
  bounceRate?: number | null;
  globalRank?: number | null;
  topKeywords?: any;
  trafficSources?: any;
  topLandingPages?: any;
  competitors?: any;
  competitorGaps?: any;
  recentNews?: any;
  industryInsights?: any;
  insightsSummary?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { websiteInsights } = await import("../drizzle/schema");

  const existing = await getWebsiteInsights(leadId);
  const values: any = {
    leadId,
    domain: data.domain,
    totalVisits: data.totalVisits ?? null,
    bounceRate: data.bounceRate !== null && data.bounceRate !== undefined ? String(data.bounceRate) : null,
    globalRank: data.globalRank ?? null,
    topKeywords: data.topKeywords ?? null,
    trafficSources: data.trafficSources ?? null,
    topLandingPages: data.topLandingPages ?? null,
    competitors: data.competitors ?? null,
    competitorGaps: data.competitorGaps ?? null,
    recentNews: data.recentNews ?? null,
    industryInsights: data.industryInsights ?? null,
    insightsSummary: data.insightsSummary ?? null,
    analyzedAt: new Date(),
  };

  if (existing) {
    return db.update(websiteInsights).set({ ...values, updatedAt: new Date() }).where(eq(websiteInsights.leadId, leadId));
  }
  return db.insert(websiteInsights).values(values);
}

// ============ Email Replies ============
export async function getRepliesByCampaignId(campaignId: number, userId: number) {
  const database = await getDb();
  if (!database) return [];
  const { emailReplies } = await import("../drizzle/schema");
  return database.select().from(emailReplies)
    .where(and(eq(emailReplies.campaignId, campaignId), eq(emailReplies.userId, userId)))
    .orderBy(desc(emailReplies.receivedAt));
}


// ============================================================
// CLAUDE API USAGE TRACKING
// ============================================================

export async function trackClaudeApiUsage(data: {
  userId: number;
  purpose: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const database = await getDb();
  if (!database) return null;
  const [result] = await database.insert(claudeApiUsage).values({
    userId: data.userId,
    purpose: data.purpose,
    model: data.model || null,
    inputTokens: data.inputTokens || null,
    outputTokens: data.outputTokens || null,
  });
  return (result as any).insertId;
}

export async function getClaudeApiUsageThisMonth(userId: number) {
  const database = await getDb();
  if (!database) return { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const results = await database
    .select({
      totalCalls: count(),
      totalInputTokens: sql<number>`COALESCE(SUM(${claudeApiUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${claudeApiUsage.outputTokens}), 0)`,
    })
    .from(claudeApiUsage)
    .where(
      and(
        eq(claudeApiUsage.userId, userId),
        gte(claudeApiUsage.createdAt, startOfMonth)
      )
    );
  
  return {
    totalCalls: results[0]?.totalCalls || 0,
    totalInputTokens: Number(results[0]?.totalInputTokens) || 0,
    totalOutputTokens: Number(results[0]?.totalOutputTokens) || 0,
  };
}


// ============================================================
// ENRICHMENT JOBS & SETTINGS (PHASE B, C, D)
// ============================================================

import crypto from 'crypto';

export async function getEnrichmentSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentSettings } = await import("../drizzle/schema");
  const result = await db.select().from(enrichmentSettings).where(eq(enrichmentSettings.userId, userId)).limit(1);
  return result[0] || null;
}

export async function getOrCreateEnrichmentSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentSettings } = await import("../drizzle/schema");
  
  let settings = await getEnrichmentSettings(userId);
  if (!settings) {
    await db.insert(enrichmentSettings).values({
      userId,
      maxCreditsPerRun: 20,
      requireConfirmationThreshold: 50,
      absoluteHardLimit: 1000,
      enabled: 1,
    });
    settings = await getEnrichmentSettings(userId);
  }
  return settings;
}

export async function updateEnrichmentSettings(userId: number, data: {
  maxCreditsPerRun?: number;
  requireConfirmationThreshold?: number;
  absoluteHardLimit?: number;
  enabled?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentSettings } = await import("../drizzle/schema");
  
  const updateData: any = {};
  if (data.maxCreditsPerRun !== undefined) updateData.maxCreditsPerRun = data.maxCreditsPerRun;
  if (data.requireConfirmationThreshold !== undefined) updateData.requireConfirmationThreshold = data.requireConfirmationThreshold;
  if (data.absoluteHardLimit !== undefined) updateData.absoluteHardLimit = data.absoluteHardLimit;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  
  await db.update(enrichmentSettings).set(updateData).where(eq(enrichmentSettings.userId, userId));
  return await getEnrichmentSettings(userId);
}

// Phase B: Idempotency - Check if job already exists or is in progress
export async function checkEnrichmentJobExists(jobId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const { enrichmentJobs } = await import("../drizzle/schema");
  
  const result = await db.select().from(enrichmentJobs).where(eq(enrichmentJobs.jobId, jobId)).limit(1);
  return result.length > 0;
}

export async function getEnrichmentJobByIdempotencyKey(userId: number, payloadHash: string) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentJobs } = await import("../drizzle/schema");
  
  const result = await db.select().from(enrichmentJobs).where(
    and(
      eq(enrichmentJobs.userId, userId),
      eq(enrichmentJobs.payloadHash, payloadHash),
      inArray(enrichmentJobs.status, ['pending', 'in_progress'])
    )
  ).limit(1);
  return result[0] || null;
}

export async function createEnrichmentJob(userId: number, selectedLeadIds: number[]) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentJobs } = await import("../drizzle/schema");
  
  const jobId = `enrich-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(selectedLeadIds)).digest('hex');
  
  await db.insert(enrichmentJobs).values({
    jobId,
    userId,
    status: 'pending',
    selectedLeads: selectedLeadIds.length,
    payloadHash,
  });
  
  return jobId;
}

export async function updateEnrichmentJob(jobId: string, data: {
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  searchRequests?: number;
  researchRequests?: number;
  pollRequests?: number;
  researchIdsSubmitted?: number;
  successful?: number;
  failed?: number;
  failureReasons?: string[];
  completedAt?: Date;
}) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentJobs } = await import("../drizzle/schema");
  
  const updateData: any = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (data.searchRequests !== undefined) updateData.searchRequests = data.searchRequests;
  if (data.researchRequests !== undefined) updateData.researchRequests = data.researchRequests;
  if (data.pollRequests !== undefined) updateData.pollRequests = data.pollRequests;
  if (data.researchIdsSubmitted !== undefined) updateData.researchIdsSubmitted = data.researchIdsSubmitted;
  if (data.successful !== undefined) updateData.successful = data.successful;
  if (data.failed !== undefined) updateData.failed = data.failed;
  if (data.failureReasons !== undefined) updateData.failureReasons = JSON.stringify(data.failureReasons);
  if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;
  
  await db.update(enrichmentJobs).set(updateData).where(eq(enrichmentJobs.jobId, jobId));
  return await getEnrichmentJobByJobId(jobId);
}

export async function getEnrichmentJobByJobId(jobId: string) {
  const db = await getDb();
  if (!db) return null;
  const { enrichmentJobs } = await import("../drizzle/schema");
  
  const result = await db.select().from(enrichmentJobs).where(eq(enrichmentJobs.jobId, jobId)).limit(1);
  return result[0] || null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH PREVIEW MODE - Database Helpers
// ═══════════════════════════════════════════════════════════════════════════════

import { searchCache, leadImports, InsertSearchCache, SearchCache, InsertLeadImport, LeadImport } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Save search results to cache
 * Used to store Seamless.AI search results with pagination token
 */
export async function cacheSearchResults(
  userId: number,
  searchId: string,
  filters: Record<string, any>,
  totalResults: number,
  nextToken?: string,
  cachedResults?: any[]
): Promise<SearchCache | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const result = await db.insert(searchCache).values({
      userId,
      searchId,
      filters: filters as any,
      totalResults,
      resultsRetrieved: cachedResults?.length || 0,
      nextToken,
      cachedResults: cachedResults as any,
      expiresAt: expiresAt.toISOString(),
    }).onDuplicateKeyUpdate({
      set: {
        totalResults,
        nextToken: nextToken || undefined,
        cachedResults: cachedResults as any,
        updatedAt: new Date().toISOString(),
      }
    });
    
    // Return the cached record
    const cached = await db.select().from(searchCache).where(eq(searchCache.searchId, searchId)).limit(1);
    return cached[0] || null;
  } catch (error) {
    console.error("[Database] Failed to cache search results:", error);
    return null;
  }
}

/**
 * Get cached search results
 * Returns null if cache has expired
 */
export async function getSearchCache(userId: number, searchId: string): Promise<SearchCache | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const now = new Date().toISOString();
    const cached = await db.select()
      .from(searchCache)
      .where(and(
        eq(searchCache.userId, userId),
        eq(searchCache.searchId, searchId)
      ))
      .limit(1);
    
    if (!cached.length) return null;
    
    const record = cached[0];
    // Check if cache has expired
    if (new Date(record.expiresAt) < new Date(now)) {
      return null; // Cache expired
    }
    
    return record;
  } catch (error) {
    console.error("[Database] Failed to get search cache:", error);
    return null;
  }
}

/**
 * Create a lead import record
 * Tracks which leads were imported from which search
 */
export async function createLeadImport(
  userId: number,
  searchId: string,
  importId: string,
  importedCount: number,
  creditsEstimated: number
): Promise<LeadImport | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(leadImports).values({
      userId,
      searchId,
      importId,
      importedCount,
      creditsEstimated,
      creditsUsed: 0,
      status: 'pending',
    });
    
    const imported = await db.select().from(leadImports).where(eq(leadImports.importId, importId)).limit(1);
    return imported[0] || null;
  } catch (error) {
    console.error("[Database] Failed to create lead import:", error);
    return null;
  }
}

/**
 * Get lead import record
 */
export async function getLeadImport(userId: number, importId: string): Promise<LeadImport | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const imported = await db.select()
      .from(leadImports)
      .where(and(
        eq(leadImports.userId, userId),
        eq(leadImports.importId, importId)
      ))
      .limit(1);
    
    return imported[0] || null;
  } catch (error) {
    console.error("[Database] Failed to get lead import:", error);
    return null;
  }
}

/**
 * Update lead import status after enrichment
 */
export async function updateLeadImportStatus(
  importId: string,
  status: 'pending' | 'completed' | 'failed',
  creditsUsed?: number,
  failureReason?: string
): Promise<LeadImport | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const updateData: any = { status };
    if (creditsUsed !== undefined) updateData.creditsUsed = creditsUsed;
    if (failureReason) updateData.failureReason = failureReason;
    
    await db.update(leadImports)
      .set(updateData)
      .where(eq(leadImports.importId, importId));
    
    const updated = await db.select().from(leadImports).where(eq(leadImports.importId, importId)).limit(1);
    return updated[0] || null;
  } catch (error) {
    console.error("[Database] Failed to update lead import status:", error);
    return null;
  }
}
