// server/api/ai/notices/check.post.ts
/**
 * Cron-callable endpoint that generates AI notices for organizations
 * and creates Directus notifications for urgent/high-priority notices.
 *
 * Deduplicates using ai_notice_history — each notice type per entity
 * fires at most once per calendar month.
 *
 * Auth: cronSecret Bearer token OR admin user session
 *
 * Body: { organizationId?: string }
 *   - If organizationId provided: checks only that org
 *   - If omitted (cron mode): checks ALL active organizations
 *
 * Returns: { organizations: number, checked: number, sent: number, skipped: number }
 */

import { createItem, createNotification, readItems } from '@directus/sdk';
import { createHash } from 'crypto';
import {
  generateClientNotices,
  generateProjectNotices,
  generateInvoiceNotices,
  generateLeadNotices,
  generateProposalNotices,
  generateTicketNotices,
  type AINotice,
} from '~~/server/utils/ai-notices';

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {};
  const { organizationId } = body;

  // Auth: accept cronSecret or user session
  const authHeader = getHeader(event, 'authorization');
  const config = useRuntimeConfig();
  const cronSecret = config.cronSecret || (config.public as any)?.cronSecret;

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // Authenticated via cron secret
  } else {
    const session = await requireUserSession(event);
    const userId = (session as any).user?.id;
    if (!userId) {
      throw createError({ statusCode: 401, message: 'Authentication required' });
    }
  }

  const directus = getServerDirectus();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Resolve which orgs to check
  let orgIds: string[] = [];
  if (organizationId) {
    orgIds = [organizationId];
  } else {
    // Cron mode: fetch all active organizations
    try {
      const orgs = await directus.request(
        readItems('organizations', {
          filter: { status: { _eq: 'active' } },
          fields: ['id'],
          limit: 500,
        }),
      ) as any[];
      orgIds = orgs.map((o: any) => o.id);
    } catch (err: any) {
      console.error('[ai/notices/check] Failed to fetch organizations:', err.message);
      throw createError({ statusCode: 500, message: 'Failed to fetch organizations' });
    }
  }

  if (orgIds.length === 0) {
    return { organizations: 0, checked: 0, sent: 0, skipped: 0 };
  }

  // Process all orgs
  let totalChecked = 0;
  let totalSent = 0;
  let totalSkipped = 0;

  for (const orgId of orgIds) {
    const result = await checkOrgNotices(directus, orgId, now, monthKey);
    totalChecked += result.checked;
    totalSent += result.sent;
    totalSkipped += result.skipped;
  }

  return { organizations: orgIds.length, checked: totalChecked, sent: totalSent, skipped: totalSkipped };
});

async function checkOrgNotices(
  directus: any, organizationId: string, now: Date, monthKey: string,
): Promise<{ checked: number; sent: number; skipped: number }> {

  try {
    // 1. Fetch all active clients, projects, invoices, leads, proposals, tickets for this org
    const [clients, projects, invoices, leads, proposals, tickets] = await Promise.all([
      directus.request(
        readItems('clients', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _eq: 'active' } },
            ],
          },
          fields: ['id'],
          limit: 100,
        }),
      ).catch(() => []) as Promise<any[]>,

      directus.request(
        readItems('projects', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } },
            ],
          },
          fields: ['id'],
          limit: 100,
        }),
      ).catch(() => []) as Promise<any[]>,

      directus.request(
        readItems('invoices', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _in: ['pending', 'processing'] } },
            ],
          },
          fields: ['id'],
          limit: 100,
        }),
      ).catch(() => []) as Promise<any[]>,

      directus.request(
        readItems('leads', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { stage: { _nin: ['won', 'lost'] } },
            ],
          },
          fields: ['id'],
          limit: 200,
        }),
      ).catch(() => []) as Promise<any[]>,

      directus.request(
        readItems('proposals', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { proposal_status: { _nin: ['accepted', 'rejected'] } },
            ],
          },
          fields: ['id'],
          limit: 100,
        }),
      ).catch(() => []) as Promise<any[]>,

      directus.request(
        readItems('tickets', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _in: ['Pending', 'Scheduled', 'In Progress'] } },
            ],
          },
          fields: ['id'],
          limit: 200,
        }),
      ).catch(() => []) as Promise<any[]>,
    ]);

    // 2. Generate notices for each entity
    const allNotices: AINotice[] = [];

    const clientNoticePromises = (clients || []).map((c: any) =>
      generateClientNotices(directus, c.id, organizationId, now).catch(() => []),
    );
    const projectNoticePromises = (projects || []).map((p: any) =>
      generateProjectNotices(directus, p.id, organizationId, now).catch(() => []),
    );
    const invoiceNoticePromises = (invoices || []).map((i: any) =>
      generateInvoiceNotices(directus, i.id, organizationId, now).catch(() => []),
    );
    const leadNoticePromises = (leads || []).map((l: any) =>
      generateLeadNotices(directus, String(l.id), organizationId, now).catch(() => []),
    );
    const proposalNoticePromises = (proposals || []).map((p: any) =>
      generateProposalNotices(directus, p.id, organizationId, now).catch(() => []),
    );
    const ticketNoticePromises = (tickets || []).map((t: any) =>
      generateTicketNotices(directus, t.id, organizationId, now).catch(() => []),
    );

    const [
      clientResults, projectResults, invoiceResults,
      leadResults, proposalResults, ticketResults,
    ] = await Promise.all([
      Promise.all(clientNoticePromises),
      Promise.all(projectNoticePromises),
      Promise.all(invoiceNoticePromises),
      Promise.all(leadNoticePromises),
      Promise.all(proposalNoticePromises),
      Promise.all(ticketNoticePromises),
    ]);

    clientResults.forEach((notices) => allNotices.push(...notices));
    projectResults.forEach((notices) => allNotices.push(...notices));
    invoiceResults.forEach((notices) => allNotices.push(...notices));
    leadResults.forEach((notices) => allNotices.push(...notices));
    proposalResults.forEach((notices) => allNotices.push(...notices));
    ticketResults.forEach((notices) => allNotices.push(...notices));

    // 3. Filter to urgent/high priority only
    const actionableNotices = allNotices.filter(
      (n) => n.priority === 'urgent' || n.priority === 'high',
    );

    if (actionableNotices.length === 0) {
      return { checked: allNotices.length, sent: 0, skipped: 0 };
    }

    // 4. Check which notices have already been sent this month
    const hashes = actionableNotices.map((n) =>
      createHash('md5').update(`${n.id}:${organizationId}:${monthKey}`).digest('hex'),
    );

    let existingHashes: Set<string> = new Set();
    try {
      const existing = await directus.request(
        readItems('ai_notice_history', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { notice_hash: { _in: hashes } },
            ],
          },
          fields: ['notice_hash'],
          limit: 500,
        }),
      ) as any[];
      existingHashes = new Set(existing.map((e: any) => e.notice_hash));
    } catch {
      // Collection may not exist yet — treat all as unsent
    }

    // 5. Get org admins to notify
    let adminUserIds: string[] = [];
    try {
      const memberships = await directus.request(
        readItems('org_memberships', {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _eq: 'active' } },
              { role: { slug: { _in: ['owner', 'admin'] } } },
            ],
          },
          fields: ['user'],
          limit: 50,
        }),
      ) as any[];
      adminUserIds = memberships.map((m: any) => m.user).filter(Boolean);
    } catch {
      console.warn('[ai/notices/check] Could not resolve org admins');
      return { checked: allNotices.length, sent: 0, skipped: actionableNotices.length };
    }

    if (adminUserIds.length === 0) {
      return { checked: allNotices.length, sent: 0, skipped: actionableNotices.length };
    }

    // 6. Create notifications for new notices
    let sent = 0;
    let skipped = 0;

    for (let i = 0; i < actionableNotices.length; i++) {
      const notice = actionableNotices[i];
      const hash = hashes[i];

      if (existingHashes.has(hash)) {
        skipped++;
        continue;
      }

      // Create notification for each admin
      const notifyResults = await Promise.allSettled(
        adminUserIds.map((adminId) =>
          directus.request(
            createNotification({
              recipient: adminId,
              subject: `${notice.priority === 'urgent' ? '🚨 ' : ''}${notice.title}`,
              message: notice.description,
              collection: notice.entityType || 'ai_notices',
              item: notice.entityId || notice.id,
              status: 'inbox',
            }),
          ),
        ),
      );

      const successCount = notifyResults.filter((r) => r.status === 'fulfilled').length;
      if (successCount > 0) sent++;

      // Record in notice history
      try {
        await directus.request(
          createItem('ai_notice_history', {
            organization: organizationId,
            notice_hash: hash,
            notice_id: notice.id,
            entity_type: notice.entityType || null,
            entity_id: notice.entityId || null,
            sent_at: now.toISOString(),
          }),
        );
      } catch (histErr: any) {
        console.warn('[ai/notices/check] Failed to record notice history:', histErr.message);
      }
    }

    return { checked: allNotices.length, sent, skipped };
  } catch (error: any) {
    console.error(`[ai/notices/check] Error for org ${organizationId}:`, error.message);
    return { checked: 0, sent: 0, skipped: 0 };
  }
}
