import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import * as db from "../db";
import { processIncomingReply } from "../replyDetection";

export interface InboxSyncResult {
  success: boolean;
  scanned: number;
  matched: number;
  error?: string;
}

/**
 * Poll the configured IMAP mailbox for messages received since the last sync,
 * and feed any that came from a known lead's email address into the existing
 * reply-classification pipeline (processIncomingReply), which classifies
 * genuine vs auto-reply/bounce/newsletter/spam/unsubscribe and stops
 * follow-ups accordingly.
 *
 * Messages from senders that don't match any lead are skipped entirely
 * (not stored) so the rest of the owner's personal/business inbox doesn't
 * get pulled into the CRM.
 */
export async function syncInboxReplies(userId: number): Promise<InboxSyncResult> {
  const settings = await db.getUserSettings(userId);
  if (!settings?.imapHost || !settings?.imapUsername || !settings?.imapPassword) {
    return { success: false, scanned: 0, matched: 0, error: "IMAP not configured" };
  }

  const port = settings.imapPort || 993;
  const client = new ImapFlow({
    host: settings.imapHost,
    port,
    secure: port === 993,
    auth: {
      user: settings.imapUsername,
      pass: settings.imapPassword,
    },
    logger: false,
  });

  let scanned = 0;
  let matched = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const currentUidNext: number = client.mailbox && typeof client.mailbox === "object" ? (client.mailbox as any).uidNext || 1 : 1;
      const lastUid = settings.imapLastUid;

      if (!lastUid) {
        // First-ever sync: bookmark the current position without processing
        // the mailbox's entire history — only new mail from now on.
        await db.upsertUserSettings({
          userId,
          imapLastUid: Math.max(currentUidNext - 1, 0),
          imapLastSyncedAt: new Date().toISOString(),
        } as any);
        return { success: true, scanned: 0, matched: 0 };
      }

      const fromUid = lastUid + 1;
      if (fromUid >= currentUidNext) {
        await db.upsertUserSettings({ userId, imapLastSyncedAt: new Date().toISOString() } as any);
        return { success: true, scanned: 0, matched: 0 };
      }

      let maxUidSeen = lastUid;

      for await (const message of client.fetch(
        `${fromUid}:*`,
        { envelope: true, source: true },
        { uid: true }
      )) {
        scanned++;
        if (message.uid > maxUidSeen) maxUidSeen = message.uid;

        try {
          const fromAddress = message.envelope?.from?.[0]?.address;
          if (!fromAddress) continue;

          // Only process messages from known leads.
          const matchingLeads = await db.getLeadsByEmail(fromAddress, userId);
          if (matchingLeads.length === 0) continue;

          const parsed = message.source ? await simpleParser(message.source as Buffer) : null;
          const subject = message.envelope?.subject || parsed?.subject || "";
          const bodyText = parsed?.text || (typeof parsed?.html === "string" ? parsed.html : "") || "";

          await processIncomingReply({
            fromEmail: fromAddress,
            toEmail: settings.imapUsername!,
            subject,
            body: bodyText,
            inReplyToMessageId: message.envelope?.inReplyTo || undefined,
            replyMessageId: message.envelope?.messageId || undefined,
            userId,
          });
          matched++;
        } catch (msgError) {
          console.error("[InboxSync] Failed to process message:", msgError);
        }
      }

      await db.upsertUserSettings({
        userId,
        imapLastUid: maxUidSeen,
        imapLastSyncedAt: new Date().toISOString(),
      } as any);
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, scanned, matched };
  } catch (error: any) {
    console.error("[InboxSync] Error syncing inbox:", error);
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { success: false, scanned, matched, error: error.message || String(error) };
  }
}

/**
 * Verify IMAP credentials work by connecting and immediately logging out.
 * Used by the "Test Connection" button in Settings.
 */
export async function testImapConnection(params: {
  host: string;
  port: number;
  username: string;
  password: string;
}): Promise<{ success: boolean; error?: string }> {
  const client = new ImapFlow({
    host: params.host,
    port: params.port,
    secure: params.port === 993,
    auth: { user: params.username, pass: params.password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (error: any) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { success: false, error: error.message || String(error) };
  }
}
