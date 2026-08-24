import { eq, and, or, desc, asc, inArray, lte, count, sql, gte, notInArray, isNull, like } from "drizzle-orm";
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
    try {
      await repairImportedListLeadSetIdConflation(_db);
    } catch (error) {
      console.warn("[Database] Failed to repair imported-list leadSetId conflation:", error);
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
  await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS socialDailyLimits JSON NULL`);
  await database.execute(sql`ALTER TABLE userSettings ADD COLUMN IF NOT EXISTS companyName VARCHAR(255) NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS meetingBooked TINYINT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS meetingBookedAt TIMESTAMP NULL`);
  await database.execute(sql`ALTER TABLE emailTrackingEvents ADD COLUMN IF NOT EXISTS clickUrl VARCHAR(2048) NULL`);
  await database.execute(sql`ALTER TABLE callLogs ADD COLUMN IF NOT EXISTS endReason VARCHAR(100) NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS callsDisabled TINYINT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS callsDisabledAt TIMESTAMP NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS emailOpenCount INT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE campaignLeads ADD COLUMN IF NOT EXISTS engagementCallScheduled TINYINT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE callLogs ADD COLUMN IF NOT EXISTS followUpDecisionMade TINYINT DEFAULT 0 NOT NULL`);
  await database.execute(sql`ALTER TABLE followUpEmails ADD COLUMN IF NOT EXISTS clickTrackingToken VARCHAR(255) NULL`);
  await database.execute(sql`ALTER TABLE socialOutreach ADD COLUMN IF NOT EXISTS popupDismissedAt TIMESTAMP NULL`);
  leadsAndTrackingColumnsReady = true;
}

// One-time data repair (not a schema change) for a bug where every lead
// created via CSV import, AI-generate, or Seamless enrichment was saved with
// leadSetId set to the same value as sourceListId. The "Imported Lists"
// filter on the Leads page treats leadSetId as "this lead has been manually
// tagged" and specifically requires it to be empty to recognize a lead as
// still belonging to its original import list -- so every affected lead was
// invisible under Imported Lists despite being saved correctly otherwise.
// leadSetId === sourceListId can only happen via this exact bug (a real tag
// assignment is a different leadSet row with a different id), so it's safe
// to clear leadSetId back to null wherever they match; sourceListId (the
// lead's original list) is left untouched.
let importedListLeadSetIdConflationRepaired = false;
async function repairImportedListLeadSetIdConflation(database: NonNullable<typeof _db>) {
  if (importedListLeadSetIdConflationRepaired) return;
  await database.execute(sql`UPDATE leads SET leadSetId = NULL WHERE leadSetId = sourceListId`);
  importedListLeadSetIdConflationRepaired = true;
}

// Conservative default caps per platform/action, used when the user hasn't
// configured their own. These aren't official published platform limits
// (none of the three publish one) -- they're commonly-recommended safe
// starting points to avoid tripping spam/abuse detection.
export const DEFAULT_SOCIAL_DAILY_LIMITS: Record<string, Record<string, number>> = {
  linkedin: { connection_request: 20, direct_message: 20 },
  instagram: { connection_request: 20, direct_message: 20 },
  facebook: { connection_request: 20, direct_message: 20 },
};

export function getSocialDailyLimit(settings: any, platform: string, messageType: string): number {
  const configured = settings?.socialDailyLimits?.[platform]?.[messageType];
  if (typeof configured === "number" && configured > 0) return configured;
  return DEFAULT_SOCIAL_DAILY_LIMITS[platform]?.[messageType] || 20;
}

// Counts today's queued+sent outreach of this exact platform/type combo --
// used to enforce the per-platform, per-action-type daily cap.
export async function getSocialCountToday(userId: number, platform: string, messageType: string): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const { socialOutreach } = await import("../drizzle/schema");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const rows = await database.select().from(socialOutreach).where(
    and(
      eq(socialOutreach.userId, userId),
      eq(socialOutreach.platform, platform as any),
      eq(socialOutreach.messageType, messageType as any),
      inArray(socialOutreach.status, ["sent", "pending"]),
      gte(socialOutreach.createdAt, todayStart)
    )
  );
  return rows.length;
}

// Drives the in-app "LinkedIn message ready" popup -- replaces the email
// that used to go to settings.socialNotificationEmail. Joins in the lead's
// name so the popup doesn't need a second round-trip per item.
export async function getPendingSocialOutreachPopups(userId: number) {
  const database = await getDb();
  if (!database) return [];
  const { socialOutreach } = await import("../drizzle/schema");
  const rows = await database.select().from(socialOutreach).where(
    and(
      eq(socialOutreach.userId, userId),
      eq(socialOutreach.status, "pending"),
      isNull(socialOutreach.popupDismissedAt)
    )
  ).orderBy(desc(socialOutreach.createdAt)).limit(20);

  if (rows.length === 0) return [];
  const leadIds = [...new Set(rows.map((r: any) => r.leadId))];
  const leadRows = await database.select().from(leads).where(inArray(leads.id, leadIds));
  const leadById = new Map(leadRows.map((l: any) => [l.id, l]));

  return rows.map((r: any) => {
    const lead: any = leadById.get(r.leadId);
    return {
      id: r.id,
      leadId: r.leadId,
      platform: r.platform,
      message: r.message,
      profileUrl: r.profileUrl,
      createdAt: r.createdAt,
      leadName: lead?.ownerName || "Unknown",
      companyName: lead?.companyName || "",
    };
  });
}

export async function dismissSocialOutreachPopup(id: number, userId: number) {
  const database = await getDb();
  if (!database) return;
  const { socialOutreach } = await import("../drizzle/schema");
  await database.update(socialOutreach).set({ popupDismissedAt: new Date() } as any).where(
    and(eq(socialOutreach.id, id), eq(socialOutreach.userId, userId))
  );
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

// Get every lead matching a specific imported list or tag, unbounded -- the
// Leads page's main leads.list query is capped to the newest 50-100 leads
// (recency-paginated), and filtering "by list"/"by tag" used to be done
// entirely client-side over that same small, capped page. Once a user had
// 50+ leads created after an older imported list, that list's own leads
// would fall off the fetched page and silently vanish from the "Filter by
// list" view even though they were never actually deleted. This queries
// the real, full membership directly instead of slicing whatever happens
// to be paginated into view.
export async function getLeadsBySourceListOrTag(userId: number, filter: { sourceListId?: number; leadSetId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (filter.sourceListId != null) {
    // Matches the client-side filter's legacy fallback: older records (from
    // before sourceListId existed) used leadSetId to double as the list
    // identifier, so also match on that when sourceListId itself is unset.
    return db.select().from(leads).where(
      and(
        eq(leads.userId, userId),
        or(
          and(eq(leads.sourceListId, filter.sourceListId), isNull(leads.leadSetId)),
          and(isNull(leads.sourceListId), eq(leads.leadSetId, filter.sourceListId))
        )
      )
    ).orderBy(desc(leads.createdAt));
  }
  if (filter.leadSetId != null) {
    return db.select().from(leads).where(
      and(eq(leads.userId, userId), eq(leads.leadSetId, filter.leadSetId))
    ).orderBy(desc(leads.createdAt));
  }
  return [];
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

// Per-campaign follow-up email/call totals, aggregated directly in SQL
// across every campaign at once -- used to show follow-up activity (sent,
// opened, clicked, pending, calls made, calls pending) on a campaign list
// the same way the main Campaigns page shows its own inline stats, instead
// of requiring one campaign to be selected first to see anything. Grouped
// aggregates rather than reusing the existing per-lead campaignReport loop
// (reports.campaignReport), which is fine for a single campaign's full
// detail view but would be an expensive N+1 query fan-out run once per
// campaign just to get summary counts.
export async function getFollowUpSummaryByCampaign(userId: number) {
  const database = await getDb();
  if (!database) return {};
  const { followUpEmails, followUpCalls } = await import("../drizzle/schema");

  const emailRows = await database.select({
    campaignId: campaignLeads.campaignId,
    sent: sql<number>`SUM(CASE WHEN ${followUpEmails.status} IN ('sent','opened','clicked') THEN 1 ELSE 0 END)`,
    opened: sql<number>`SUM(CASE WHEN ${followUpEmails.status} IN ('opened','clicked') THEN 1 ELSE 0 END)`,
    clicked: sql<number>`SUM(CASE WHEN ${followUpEmails.status} = 'clicked' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${followUpEmails.status} IN ('draft','scheduled') THEN 1 ELSE 0 END)`,
  })
    .from(followUpEmails)
    .innerJoin(campaignLeads, eq(followUpEmails.campaignLeadId, campaignLeads.id))
    .innerJoin(campaigns, eq(campaignLeads.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId))
    .groupBy(campaignLeads.campaignId);

  const callRows = await database.select({
    campaignId: campaignLeads.campaignId,
    made: sql<number>`SUM(CASE WHEN ${followUpCalls.status} != 'scheduled' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${followUpCalls.status} = 'scheduled' THEN 1 ELSE 0 END)`,
  })
    .from(followUpCalls)
    .innerJoin(campaignLeads, eq(followUpCalls.campaignLeadId, campaignLeads.id))
    .innerJoin(campaigns, eq(campaignLeads.campaignId, campaigns.id))
    .where(eq(campaigns.userId, userId))
    .groupBy(campaignLeads.campaignId);

  const result: Record<number, { emailsSent: number; emailsOpened: number; emailsClicked: number; emailsPending: number; callsMade: number; callsPending: number }> = {};
  for (const r of emailRows as any[]) {
    result[r.campaignId] = { emailsSent: Number(r.sent), emailsOpened: Number(r.opened), emailsClicked: Number(r.clicked), emailsPending: Number(r.pending), callsMade: 0, callsPending: 0 };
  }
  for (const r of callRows as any[]) {
    if (!result[r.campaignId]) {
      result[r.campaignId] = { emailsSent: 0, emailsOpened: 0, emailsClicked: 0, emailsPending: 0, callsMade: 0, callsPending: 0 };
    }
    result[r.campaignId].callsMade = Number(r.made);
    result[r.campaignId].callsPending = Number(r.pending);
  }
  return result;
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

// Atomic increments for campaign-level counters -- reading the current
// value in JS and writing back current+1 (the previous approach) loses
// updates under concurrency: if several leads open/click/get called around
// the same time (the common case right after a mass send), two requests can
// both read the same starting value and both write back the same
// incremented result, silently undercounting. `col + 1` as a SQL expression
// happens atomically in the database instead.
export async function incrementCampaignOpenCount(campaignId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaigns).set({ openCount: sql`${campaigns.openCount} + 1`, updatedAt: new Date() } as any).where(eq(campaigns.id, campaignId));
}

export async function incrementCampaignClickCount(campaignId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaigns).set({ clickCount: sql`${campaigns.clickCount} + 1`, updatedAt: new Date() } as any).where(eq(campaigns.id, campaignId));
}

export async function incrementCampaignCallCount(campaignId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaigns).set({ callCount: sql`${campaigns.callCount} + 1`, updatedAt: new Date() } as any).where(eq(campaigns.id, campaignId));
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

// Atomic increment (same reasoning as incrementCampaignOpenCount -- a plain
// read-then-write loses counts under concurrent opens) -- returns the new
// count so the caller can check the 3-open threshold without a second,
// separately-racing read.
export async function incrementCampaignLeadOpenCount(campaignLeadId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  await database.update(campaignLeads).set({ emailOpenCount: sql`${campaignLeads.emailOpenCount} + 1`, updatedAt: new Date() } as any).where(eq(campaignLeads.id, campaignLeadId));
  const result = await database.select({ emailOpenCount: campaignLeads.emailOpenCount }).from(campaignLeads).where(eq(campaignLeads.id, campaignLeadId));
  return result[0]?.emailOpenCount || 0;
}

// Atomically claims the one-and-only engagement call slot for this lead --
// returns true only for whichever caller actually flips engagementScheduled
// from 0 to 1, false for every other caller (already scheduled, or lost the
// race). A plain "read the flag, decide, then write it" has a window where
// several near-simultaneous opens/clicks (e.g. a lead clicking a link
// several times within a few seconds, or an open pixel and a click landing
// close together) can all read "not yet scheduled" before any of them has
// written the flag -- each one then schedules its own call. This single
// UPDATE...WHERE is atomic at the row level: MySQL/TiDB only lets ONE
// concurrent statement matching `engagementCallScheduled = 0` succeed: every
// other one that ran through the same WHERE clause won't match after the
// winner's write, however close together they fired.
export async function claimEngagementCallSlot(campaignLeadId: number): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const result: any = await database.execute(
    sql`UPDATE campaignLeads SET engagementCallScheduled = 1 WHERE id = ${campaignLeadId} AND engagementCallScheduled = 0`
  );
  const affectedRows = Number(result?.[0]?.affectedRows ?? result?.affectedRows) || 0;
  return affectedRows === 1;
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

// Atomic compare-and-swap, same reasoning as claimEngagementCallSlot --
// Retell can redeliver the same webhook, and a plain read-then-write here
// could let two near-simultaneous deliveries both decide to cancel
// follow-ups (harmless if both reach the same conclusion, but not if one
// still doesn't have call_analysis yet while a concurrent one does).
// Returns true only for whichever caller actually makes the decision.
export async function claimFollowUpDecisionSlot(id: number): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const result: any = await database.execute(
    sql`UPDATE callLogs SET followUpDecisionMade = 1 WHERE id = ${id} AND followUpDecisionMade = 0`
  );
  const affectedRows = Number(result?.[0]?.affectedRows ?? result?.affectedRows) || 0;
  return affectedRows === 1;
}

// Calls stuck waiting on Retell's post-call analysis (needed to tell a real
// answer apart from the agent's own voicemail detection -- see
// handleRetellWebhook) for longer than a few minutes -- by then any later
// webhook delivery carrying that analysis would almost certainly have
// already arrived, so these are treated as a confirmed real answer instead
// of waiting forever and never cancelling their follow-ups.
export async function getStaleAmbiguousCallLogs(olderThanMinutes: number = 5) {
  const database = await getDb();
  if (!database) return [];
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return database.select().from(callLogs).where(
    and(
      eq(callLogs.status, "completed"),
      eq(callLogs.followUpDecisionMade, 0),
      isNull(callLogs.callAnalysis),
      lte(callLogs.updatedAt, cutoff.toISOString())
    )
  );
}

export async function getCallLogsByCampaignLead(campaignLeadId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(callLogs).where(eq(callLogs.campaignLeadId, campaignLeadId));
}

// Automatic calling is disabled (see scheduleFollowUpCalls/
// triggerCallOnFollowUpOpen) -- when a lead opens or clicks, instead of
// auto-scheduling a real Retell call, a row lands here so the UI can pop up
// "this lead just engaged -- call now?" and the user decides. Raw-SQL lazy
// table, same pattern as excludedSeamlessContacts (no migration tool access
// in this environment).
let callSuggestionsTableReady = false;
async function ensureCallSuggestionsTable(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (callSuggestionsTableReady) return;
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS callSuggestions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      campaignLeadId INT NOT NULL,
      leadId INT NOT NULL,
      triggerType VARCHAR(20) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      actionedAt TIMESTAMP NULL,
      dismissedAt TIMESTAMP NULL,
      INDEX callSuggestions_pending (userId, actionedAt, dismissedAt)
    )
  `);
  callSuggestionsTableReady = true;
}

export async function createCallSuggestion(userId: number, campaignLeadId: number, leadId: number, triggerType: "email_open" | "email_click") {
  const database = await getDb();
  if (!database) return;
  try {
    await ensureCallSuggestionsTable(database);
    await database.execute(sql`
      INSERT INTO callSuggestions (userId, campaignLeadId, leadId, triggerType)
      VALUES (${userId}, ${campaignLeadId}, ${leadId}, ${triggerType})
    `);
  } catch (error) {
    console.error("[createCallSuggestion] Failed:", error);
  }
}

// Joined with leads/campaignLeads/campaigns in JS (rather than a raw SQL
// join) so this stays consistent with how the rest of this file reads
// drizzle-defined tables -- callSuggestions itself isn't in schema.ts since
// it's created lazily like the other ad-hoc tables here.
export async function getPendingCallSuggestions(userId: number) {
  const database = await getDb();
  if (!database) return [];
  try {
    await ensureCallSuggestionsTable(database);
    const result: any = await database.execute(
      sql`SELECT * FROM callSuggestions WHERE userId = ${userId} AND actionedAt IS NULL AND dismissedAt IS NULL ORDER BY createdAt DESC LIMIT 20`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    if (rows.length === 0) return [];

    const leadIds = [...new Set(rows.map((r) => r.leadId))];
    const campaignLeadIds = [...new Set(rows.map((r) => r.campaignLeadId))];
    const [leadRows, campaignLeadRows] = await Promise.all([
      database.select().from(leads).where(inArray(leads.id, leadIds)),
      database.select().from(campaignLeads).where(inArray(campaignLeads.id, campaignLeadIds)),
    ]);
    const leadById = new Map(leadRows.map((l: any) => [l.id, l]));
    const campaignIds = [...new Set(campaignLeadRows.map((cl: any) => cl.campaignId))];
    const campaignRows = campaignIds.length > 0 ? await database.select().from(campaigns).where(inArray(campaigns.id, campaignIds)) : [];
    const campaignById = new Map(campaignRows.map((c: any) => [c.id, c]));
    const campaignLeadById = new Map(campaignLeadRows.map((cl: any) => [cl.id, cl]));

    return rows
      .map((r) => {
        const lead: any = leadById.get(r.leadId);
        const campaignLead: any = campaignLeadById.get(r.campaignLeadId);
        const campaign: any = campaignLead ? campaignById.get(campaignLead.campaignId) : null;
        if (!lead) return null;
        return {
          id: r.id,
          campaignLeadId: r.campaignLeadId,
          leadId: r.leadId,
          triggerType: r.triggerType,
          createdAt: r.createdAt,
          leadName: lead.ownerName,
          companyName: lead.companyName,
          phoneNumber: lead.phoneNumber,
          campaignName: campaign?.name || null,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("[getPendingCallSuggestions] Failed:", error);
    return [];
  }
}

export async function dismissCallSuggestion(id: number, userId: number) {
  const database = await getDb();
  if (!database) return;
  await ensureCallSuggestionsTable(database);
  await database.execute(sql`UPDATE callSuggestions SET dismissedAt = CURRENT_TIMESTAMP WHERE id = ${id} AND userId = ${userId}`);
}

export async function markCallSuggestionActioned(id: number, userId: number) {
  const database = await getDb();
  if (!database) return;
  await ensureCallSuggestionsTable(database);
  await database.execute(sql`UPDATE callSuggestions SET actionedAt = CURRENT_TIMESTAMP WHERE id = ${id} AND userId = ${userId}`);
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

export async function getFollowUpEmailByTrackingToken(token: string) {
  const database = await getDb();
  if (!database) return null;
  const { followUpEmails } = await import("../drizzle/schema");
  const result = await database.select().from(followUpEmails).where(eq(followUpEmails.trackingToken, token)).limit(1);
  return result[0] || null;
}

export async function getFollowUpEmailByClickTrackingToken(token: string) {
  const database = await getDb();
  if (!database) return null;
  const { followUpEmails } = await import("../drizzle/schema");
  const result = await database.select().from(followUpEmails).where(eq(followUpEmails.clickTrackingToken, token)).limit(1);
  return result[0] || null;
}

// The pixel/click handlers only ever updated campaignLeads-level flags --
// nothing updated a specific follow-up email's OWN openedAt/clickedAt/status,
// so the Follow-Up Emails report always showed 0 opened/0 clicked no matter
// what the recipient actually did. These are additive to that existing
// campaignLeads-level logic, not a replacement for it. Never regresses
// status backwards (clicked implies opened, so a late-arriving open ping
// after a click shouldn't downgrade it back to "opened").
export async function markFollowUpEmailOpened(id: number) {
  const database = await getDb();
  if (!database) return;
  const { followUpEmails } = await import("../drizzle/schema");
  const rows = await database.select().from(followUpEmails).where(eq(followUpEmails.id, id)).limit(1);
  const email = rows[0] as any;
  if (!email) return;
  const patch: any = { updatedAt: new Date() };
  if (!email.openedAt) patch.openedAt = new Date();
  if (email.status === "sent") patch.status = "opened";
  await database.update(followUpEmails).set(patch).where(eq(followUpEmails.id, id));
}

export async function markFollowUpEmailClicked(id: number) {
  const database = await getDb();
  if (!database) return;
  const { followUpEmails } = await import("../drizzle/schema");
  const rows = await database.select().from(followUpEmails).where(eq(followUpEmails.id, id)).limit(1);
  const email = rows[0] as any;
  if (!email) return;
  const patch: any = { status: "clicked", updatedAt: new Date() };
  if (!email.openedAt) patch.openedAt = new Date();
  if (!email.clickedAt) patch.clickedAt = new Date();
  await database.update(followUpEmails).set(patch).where(eq(followUpEmails.id, id));
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

export async function getExcludedSeamlessContactsCount(userId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  try {
    await ensureExcludedSeamlessContactsTable(database);
    const result: any = await database.execute(
      sql`SELECT COUNT(*) as count FROM excludedSeamlessContacts WHERE userId = ${userId}`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    return Number(rows[0]?.count) || 0;
  } catch (error) {
    console.error("[getExcludedSeamlessContactsCount] Failed:", error);
    return 0;
  }
}

export async function clearExcludedSeamlessContacts(userId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  try {
    await ensureExcludedSeamlessContactsTable(database);
    const result: any = await database.execute(
      sql`DELETE FROM excludedSeamlessContacts WHERE userId = ${userId}`
    );
    return Number(result?.[0]?.affectedRows ?? result?.affectedRows) || 0;
  } catch (error) {
    console.error("[clearExcludedSeamlessContacts] Failed:", error);
    return 0;
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

// Persists each Seamless.AI search (instruction + filters + pagination
// cursor) as its own row so a user can come back later -- even a different
// day/session -- and continue exactly where they left off, instead of the
// cursor only living in React state and being lost on refresh. Same lazy
// CREATE TABLE pattern as excludedSeamlessContacts above (no migration
// pipeline in this deployment).
let seamlessSearchesTableReady = false;
async function ensureSeamlessSearchesTable(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (seamlessSearchesTableReady) return;
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS seamlessSearches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      instruction TEXT NOT NULL,
      country VARCHAR(255) NULL,
      state VARCHAR(255) NULL,
      companySize VARCHAR(255) NULL,
      industryOverride VARCHAR(255) NULL,
      titlesOverride TEXT NULL,
      requestedCount INT NOT NULL,
      leadSetName VARCHAR(255) NULL,
      nextToken TEXT NULL,
      totalAvailable INT NULL,
      extractedSoFar INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      INDEX seamlessSearches_userId (userId)
    )
  `);
  seamlessSearchesTableReady = true;
}

export async function createSeamlessSearch(userId: number, params: {
  instruction: string; country?: string; state?: string; companySize?: string;
  industryOverride?: string; titlesOverride?: string[]; requestedCount: number;
  leadSetName?: string; nextToken?: string; totalAvailable?: number; extractedSoFar: number;
}): Promise<number | null> {
  const database = await getDb();
  if (!database) return null;
  try {
    await ensureSeamlessSearchesTable(database);
    const status = params.nextToken ? "active" : "exhausted";
    const result: any = await database.execute(sql`
      INSERT INTO seamlessSearches
        (userId, instruction, country, state, companySize, industryOverride, titlesOverride, requestedCount, leadSetName, nextToken, totalAvailable, extractedSoFar, status)
      VALUES
        (${userId}, ${params.instruction}, ${params.country ?? null}, ${params.state ?? null}, ${params.companySize ?? null}, ${params.industryOverride ?? null},
         ${params.titlesOverride ? JSON.stringify(params.titlesOverride) : null}, ${params.requestedCount}, ${params.leadSetName ?? null},
         ${params.nextToken ?? null}, ${params.totalAvailable ?? null}, ${params.extractedSoFar}, ${status})
    `);
    return Number(result?.[0]?.insertId ?? result?.insertId) || null;
  } catch (error) {
    console.error("[createSeamlessSearch] Failed:", error);
    return null;
  }
}

export async function updateSeamlessSearchProgress(id: number, userId: number, params: {
  nextToken?: string; totalAvailable?: number; extractedSoFar?: number; leadSetName?: string;
}) {
  const database = await getDb();
  if (!database) return;
  try {
    await ensureSeamlessSearchesTable(database);
    const status = params.nextToken ? "active" : "exhausted";
    await database.execute(sql`
      UPDATE seamlessSearches SET
        nextToken = ${params.nextToken ?? null},
        totalAvailable = COALESCE(${params.totalAvailable ?? null}, totalAvailable),
        extractedSoFar = COALESCE(${params.extractedSoFar ?? null}, extractedSoFar),
        leadSetName = COALESCE(${params.leadSetName ?? null}, leadSetName),
        status = ${status},
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${id} AND userId = ${userId}
    `);
  } catch (error) {
    console.error("[updateSeamlessSearchProgress] Failed:", error);
  }
}

export async function listSeamlessSearches(userId: number): Promise<any[]> {
  const database = await getDb();
  if (!database) return [];
  try {
    await ensureSeamlessSearchesTable(database);
    const result: any = await database.execute(
      sql`SELECT * FROM seamlessSearches WHERE userId = ${userId} ORDER BY updatedAt DESC LIMIT 200`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    return rows.map((r) => ({ ...r, titlesOverride: r.titlesOverride ? JSON.parse(r.titlesOverride) : [] }));
  } catch (error) {
    console.error("[listSeamlessSearches] Failed:", error);
    return [];
  }
}

export async function getSeamlessSearchById(id: number, userId: number): Promise<any | null> {
  const database = await getDb();
  if (!database) return null;
  try {
    await ensureSeamlessSearchesTable(database);
    const result: any = await database.execute(
      sql`SELECT * FROM seamlessSearches WHERE id = ${id} AND userId = ${userId} LIMIT 1`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    if (rows.length === 0) return null;
    const r = rows[0];
    return { ...r, titlesOverride: r.titlesOverride ? JSON.parse(r.titlesOverride) : [] };
  } catch (error) {
    console.error("[getSeamlessSearchById] Failed:", error);
    return null;
  }
}

export async function deleteSeamlessSearch(id: number, userId: number) {
  const database = await getDb();
  if (!database) return;
  try {
    await ensureSeamlessSearchesTable(database);
    await database.execute(sql`DELETE FROM seamlessSearches WHERE id = ${id} AND userId = ${userId}`);
  } catch (error) {
    console.error("[deleteSeamlessSearch] Failed:", error);
  }
}

// Archive of hard-deleted leads, so "Delete List"/"Delete Tag" (below) can
// actually remove leads (needed so Seamless dedup stops blocking them, see
// archiveAndDeleteLeadsByTag/BySourceList) without the deletion being a true
// dead end -- the user can browse everything that's been deleted and
// selectively restore individual leads back into their active data.
let deletedLeadsArchiveTableReady = false;
async function ensureDeletedLeadsArchiveTable(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (deletedLeadsArchiveTableReady) return;
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS deletedLeadsArchive (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      originalLeadId INT NOT NULL,
      sourceListName VARCHAR(255) NULL,
      leadSetName VARCHAR(255) NULL,
      deletedVia VARCHAR(20) NOT NULL,
      seamlessId VARCHAR(255) NULL,
      leadName VARCHAR(255) NULL,
      leadEmail VARCHAR(255) NULL,
      leadCompany VARCHAR(255) NULL,
      leadData JSON NOT NULL,
      deletedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      restoredAt TIMESTAMP NULL,
      INDEX deletedLeadsArchive_userId (userId)
    )
  `);
  deletedLeadsArchiveTableReady = true;
}

async function archiveLeads(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, rows: any[], opts: { deletedVia: "list" | "tag"; sourceListName?: string; leadSetName?: string }) {
  await ensureDeletedLeadsArchiveTable(database);
  for (const row of rows) {
    await database.execute(sql`
      INSERT INTO deletedLeadsArchive
        (userId, originalLeadId, sourceListName, leadSetName, deletedVia, seamlessId, leadName, leadEmail, leadCompany, leadData)
      VALUES
        (${userId}, ${row.id}, ${opts.sourceListName ?? null}, ${opts.leadSetName ?? null}, ${opts.deletedVia}, ${row.seamlessId ?? null},
         ${row.ownerName ?? null}, ${row.email ?? null}, ${row.companyName ?? null}, ${JSON.stringify(row)})
    `);
  }
}

// Deleting an imported/generated list means "this is a dead lead, never
// offer it to me again" -- archive for recovery, hard-delete so it stops
// counting as an owned lead, then permanently exclude it from future
// Seamless searches via excludeSeamlessContacts (same table normal lead
// deletion already uses).
export async function archiveAndDeleteLeadsBySourceList(userId: number, sourceListId: number, listName?: string) {
  const database = await getDb();
  if (!database) return { archivedCount: 0 };
  const rows = await database.select().from(leads).where(and(eq(leads.sourceListId, sourceListId), eq(leads.userId, userId)));
  if (rows.length > 0) {
    await archiveLeads(database, userId, rows, { deletedVia: "list", sourceListName: listName });
    const seamlessIds = rows.map((r: any) => r.seamlessId).filter(Boolean);
    for (const row of rows) {
      await deleteLead(row.id);
    }
    if (seamlessIds.length > 0) {
      await excludeSeamlessContacts(userId, seamlessIds);
    }
  }
  await database.delete(leadSets).where(eq(leadSets.id, sourceListId));
  return { archivedCount: rows.length };
}

// Deleting a tag means "I don't want this grouping anymore" -- archive for
// recovery, hard-delete so the leads stop counting as owned, but do NOT
// exclude them from Seamless: this is what actually frees them up so the
// exact same search can offer these contacts again in the future.
export async function archiveAndDeleteLeadsByTag(userId: number, leadSetId: number, tagName?: string) {
  const database = await getDb();
  if (!database) return { archivedCount: 0 };
  const rows = await database.select().from(leads).where(and(eq(leads.leadSetId, leadSetId), eq(leads.userId, userId)));
  if (rows.length > 0) {
    await archiveLeads(database, userId, rows, { deletedVia: "tag", leadSetName: tagName });
    for (const row of rows) {
      await deleteLead(row.id);
    }
  }
  await database.delete(leadSets).where(eq(leadSets.id, leadSetId));
  return { archivedCount: rows.length };
}

export async function getDeletedLeadsArchive(userId: number): Promise<any[]> {
  const database = await getDb();
  if (!database) return [];
  try {
    await ensureDeletedLeadsArchiveTable(database);
    const result: any = await database.execute(
      sql`SELECT id, originalLeadId, sourceListName, leadSetName, deletedVia, seamlessId, leadName, leadEmail, leadCompany, deletedAt
          FROM deletedLeadsArchive WHERE userId = ${userId} AND restoredAt IS NULL ORDER BY deletedAt DESC LIMIT 1000`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    return rows;
  } catch (error) {
    console.error("[getDeletedLeadsArchive] Failed:", error);
    return [];
  }
}

export async function restoreArchivedLead(userId: number, archiveId: number): Promise<number | null> {
  const database = await getDb();
  if (!database) return null;
  try {
    await ensureDeletedLeadsArchiveTable(database);
    const result: any = await database.execute(
      sql`SELECT * FROM deletedLeadsArchive WHERE id = ${archiveId} AND userId = ${userId} AND restoredAt IS NULL LIMIT 1`
    );
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : Array.isArray(result) ? result : [];
    if (rows.length === 0) return null;
    const archived = rows[0];
    const leadData = typeof archived.leadData === "string" ? JSON.parse(archived.leadData) : archived.leadData;
    delete leadData.id;
    leadData.sourceListId = null;
    leadData.leadSetId = null;
    leadData.createdAt = new Date().toISOString();
    leadData.updatedAt = new Date().toISOString();
    const inserted = await database.insert(leads).values(convertToDbFormat(leadData));
    const newLeadId = Number((inserted as any)?.[0]?.insertId) || null;
    if (archived.deletedVia === "list" && archived.seamlessId) {
      await database.execute(sql`DELETE FROM excludedSeamlessContacts WHERE userId = ${userId} AND seamlessId = ${archived.seamlessId}`);
    }
    await database.execute(sql`UPDATE deletedLeadsArchive SET restoredAt = CURRENT_TIMESTAMP WHERE id = ${archiveId}`);
    return newLeadId;
  } catch (error) {
    console.error("[restoreArchivedLead] Failed:", error);
    return null;
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

export async function updateCampaignTemplate(id: number, data: Partial<InsertCampaignTemplate>) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignTemplates).set({ ...data, updatedAt: new Date() } as any).where(eq(campaignTemplates.id, id));
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

// Per-tag/list lead counts (total/verified/undeliverable), aggregated directly
// in SQL rather than filtering whatever page of leads.list the client happens
// to have loaded (capped at 50-100 rows) -- the same staleness bug fixed for
// the Leads page's own list/tag filters (getLeadsBySourceListOrTag above):
// any tag whose members had fallen off that capped page silently showed as
// "0 leads" even though real leads existed under it.
export async function getLeadCountsByTag(userId: number): Promise<Record<number, { total: number; verified: number; undeliverable: number }>> {
  const database = await getDb();
  if (!database) return {};
  const rows = await database.select({
    leadSetId: leads.leadSetId,
    total: count(),
    verified: sql<number>`SUM(CASE WHEN ${leads.emailVerificationStatus} = 'deliverable' THEN 1 ELSE 0 END)`,
    undeliverable: sql<number>`SUM(CASE WHEN ${leads.emailVerificationStatus} = 'undeliverable' THEN 1 ELSE 0 END)`,
  }).from(leads).where(eq(leads.userId, userId)).groupBy(leads.leadSetId);

  const result: Record<number, { total: number; verified: number; undeliverable: number }> = {};
  for (const r of rows) {
    if (r.leadSetId != null) {
      result[r.leadSetId] = { total: Number(r.total), verified: Number(r.verified), undeliverable: Number(r.undeliverable) };
    }
  }
  return result;
}

// Finds leads by name, email, or phone (any one matching is enough) --
// queried directly against the full leads table rather than filtering
// whatever page happens to be loaded client-side, so it actually finds a
// lead regardless of how many newer leads exist. Also resolves which
// imported list / tag each match currently belongs to, since the point of
// searching from the Lead Sets page is usually "which set is this lead in."
export async function searchLeads(userId: number, query: string, limit: number = 25) {
  const database = await getDb();
  if (!database || !query.trim()) return [];
  // Escape LIKE wildcards in the user's own input so a literal "%" or "_"
  // in a search term isn't treated as a wildcard.
  const escaped = query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  const matches = await database.select().from(leads).where(
    and(
      eq(leads.userId, userId),
      or(
        like(leads.ownerName, pattern),
        like(leads.email, pattern),
        like(leads.phoneNumber, pattern)
      )
    )
  ).orderBy(desc(leads.createdAt)).limit(limit);

  const setIds = new Set<number>();
  for (const lead of matches as any[]) {
    if (lead.sourceListId) setIds.add(lead.sourceListId);
    if (lead.leadSetId) setIds.add(lead.leadSetId);
  }
  let setNames: Record<number, string> = {};
  if (setIds.size > 0) {
    const setRows = await database.select().from(leadSets).where(inArray(leadSets.id, Array.from(setIds)));
    setNames = Object.fromEntries(setRows.map((s: any) => [s.id, s.name]));
  }

  return (matches as any[]).map((lead) => ({
    ...lead,
    sourceListName: lead.sourceListId ? setNames[lead.sourceListId] : undefined,
    leadSetName: lead.leadSetId ? setNames[lead.leadSetId] : undefined,
  }));
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

// Get the (optionally capped) oldest-first untagged leads from an imported
// list, queried and limited directly in SQL -- the "Assign All to Tag"
// dialog used to filter/slice the leads.list page already loaded on the
// client, which is capped at 100 rows, so asking for e.g. 1000 leads
// silently only ever saw whatever fit on the current page. This queries
// the actual full list.
export async function getUntaggedLeadIdsBySourceList(userId: number, sourceListId: number, limit?: number) {
  const database = await getDb();
  if (!database) return [];
  const query = database.select({ id: leads.id }).from(leads).where(
    and(
      eq(leads.userId, userId),
      eq(leads.sourceListId, sourceListId),
      isNull(leads.leadSetId)
    )
  ).orderBy(asc(leads.createdAt));
  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((r) => r.id);
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

// Global, lead-level unsubscribe -- an opt-out is permanent and applies to
// every campaign the lead is or will ever be enrolled in, not just the one
// whose email they clicked unsubscribe on. Also cancels any other still-
// pending scheduled emails and campaign follow-ups for this lead.
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

  await cancelAllPendingFollowUpsForLead(leadId);
}

export async function markLeadUnsubscribed(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    unsubscribed: true,
    unsubscribedAt: new Date(),
  } as any).where(eq(campaignLeads.id, campaignLeadId));

  // An unsubscribe on any single campaign is a permanent, cross-campaign
  // opt-out -- propagate it to the lead globally and to every other
  // campaign enrollment for this lead.
  const [cl] = await database.select().from(campaignLeads).where(eq(campaignLeads.id, campaignLeadId));
  if (cl?.leadId) {
    await markLeadUnsubscribedGlobally(cl.leadId);
  }
}

// Mark every campaign enrollment for this lead as unsubscribed and cancel
// their pending follow-up emails/calls, so an opt-out on one campaign stops
// outreach from all of them.
export async function cancelAllPendingFollowUpsForLead(leadId: number) {
  const database = await getDb();
  if (!database) return;
  const rows = await database.select({ id: campaignLeads.id }).from(campaignLeads).where(eq(campaignLeads.leadId, leadId));
  for (const row of rows) {
    await database.update(campaignLeads).set({
      unsubscribed: true,
      unsubscribedAt: new Date(),
    } as any).where(eq(campaignLeads.id, row.id));
    await cancelPendingFollowUps(row.id);
  }
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

// Distinct from markLeadReplied -- a Cal.com/Calendly booking webhook calls
// both (booking is also treated as a positive reply for follow-up
// cancellation), but this flag lets the report show "booked a meeting"
// separately from "replied to the email".
export async function markMeetingBooked(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    meetingBooked: true,
    meetingBookedAt: new Date(),
  } as any).where(eq(campaignLeads.id, campaignLeadId));
}

export async function isLeadUnsubscribed(campaignLeadId: number): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const result = await database.select().from(campaignLeads).where(eq(campaignLeads.id, campaignLeadId));
  return result[0]?.unsubscribed === 1;
}

// Cancel only pending follow-up calls (not emails) -- used when a call
// reaches voicemail: a message was already left, so further call attempts
// aren't more effective, but there's no reason to also stop emailing.
export async function cancelPendingFollowUpCalls(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(followUpCalls).set({
    status: "failed" as any,
  }).where(
    and(
      eq(followUpCalls.campaignLeadId, campaignLeadId),
      eq(followUpCalls.status, "scheduled")
    )
  );
}

// Manual per-lead opt-out of the CALL side of follow-ups only (e.g. the
// phone number turned out to be unreachable/wrong) -- cancels any
// currently-scheduled follow-up calls and prevents new ones from being
// scheduled going forward. Follow-up emails are untouched and keep going.
export async function disableCallFollowUps(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    callsDisabled: true,
    callsDisabledAt: new Date(),
  } as any).where(eq(campaignLeads.id, campaignLeadId));
  await cancelPendingFollowUpCalls(campaignLeadId);
}

// Re-enable calling for a lead that had it manually disabled -- does not
// resurrect calls that were already cancelled (use responses.resumeFollowUps
// for that); this just lets NEW calls be scheduled again going forward.
export async function enableCallFollowUps(campaignLeadId: number) {
  const database = await getDb();
  if (!database) return;
  await database.update(campaignLeads).set({
    callsDisabled: false,
    callsDisabledAt: null,
  } as any).where(eq(campaignLeads.id, campaignLeadId));
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
