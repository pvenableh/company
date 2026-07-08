// server/api/email/events.get.ts
/**
 * Org-scoped read of SendGrid delivery events for the Email Activity page.
 *
 * `email_events` has NO row-level read permission for authenticated org roles
 * (the only grant was a public, unfiltered read — a cross-org leak that has been
 * removed). So, exactly like marketing_campaigns, reads are routed through the
 * server: verify the caller belongs to the org, then read with the admin token
 * filtered to that org. The page never talks to the collection directly.
 *
 * Query params:
 *   - org    (required) — organization id; caller must be a member.
 *   - days   (optional) — lookback window, default 30, clamped 1..365.
 *   - kind   (optional) — 'campaign' | 'transactional' | 'all' (default).
 *            campaign = marketing newsletter sends (email_id set by the webhook
 *            when send_collection==='emails'); transactional = everything else
 *            (email_id null). Lets marketing views exclude transactional email
 *            from their engagement KPIs.
 *
 * Returns { events } where each event carries the fields the activity page
 * aggregates (event, recipient, timestamp, url, reason, raw, email_id).
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	if (!(session as any).user?.id) throw createError({ statusCode: 401, message: 'Authentication required' });

	const query = getQuery(event);
	const orgId = (query.org ?? '').toString().trim();
	if (!orgId) throw createError({ statusCode: 400, message: 'org is required' });
	await requireOrgMembership(event, orgId);

	const days = Math.min(365, Math.max(1, Number(query.days) || 30));
	const since = new Date(Date.now() - days * 86400000).toISOString();

	const filters: any[] = [{ organization: { _eq: orgId } }, { timestamp: { _gte: since } }];
	const kind = (query.kind ?? 'all').toString();
	if (kind === 'campaign') filters.push({ email_id: { _nnull: true } });
	else if (kind === 'transactional') filters.push({ email_id: { _null: true } });

	const directus = getServerDirectus();
	const events = (await directus.request(
		readItems('email_events' as any, {
			fields: ['id', 'event', 'recipient', 'timestamp', 'url', 'reason', 'raw', 'email_id.id', 'email_id.name', 'email_id.subject'] as any,
			filter: { _and: filters } as any,
			sort: ['-timestamp'] as any,
			limit: 1000,
		}),
	)) as any[];

	return { events };
});
