// server/api/email/events.get.ts
/**
 * Org-scoped read of SendGrid delivery events for the Email Activity page.
 *
 * `email_events` has NO row-level read permission for authenticated org roles
 * (the only grant was a public, unfiltered read — a cross-org leak that has been
 * removed). So, exactly like marketing_campaigns, reads are routed through the
 * server: authorize the caller, then read with the admin token filtered to that
 * org. The page never talks to the collection directly.
 *
 * Access is gated to org owners/admins/managers (or platform admins) via
 * authorizeOrgInsight — delivery/open data on a client's transactional email is
 * sensitive, so it's not exposed to every active member.
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
import { authorizeOrgInsight } from '~~/server/utils/platform';

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const orgId = (query.org ?? '').toString().trim();
	if (!orgId) throw createError({ statusCode: 400, message: 'org is required' });
	// Owner/admin/manager of this org, or a platform admin. Throws 401/403.
	await authorizeOrgInsight(event, orgId);

	const days = Math.min(365, Math.max(1, Number(query.days) || 30));
	const since = new Date(Date.now() - days * 86400000).toISOString();

	const filters: any[] = [{ organization: { _eq: orgId } }, { timestamp: { _gte: since } }];
	const kind = (query.kind ?? 'all').toString();
	if (kind === 'campaign') filters.push({ email_id: { _nnull: true } });
	else if (kind === 'transactional') filters.push({ email_id: { _null: true } });

	const directus = getServerDirectus();
	const events = (await withTransientRetry(() => directus.request(
		readItems('email_events' as any, {
			fields: ['id', 'event', 'recipient', 'timestamp', 'url', 'reason', 'raw', 'email_id.id', 'email_id.name', 'email_id.subject'] as any,
			filter: { _and: filters } as any,
			sort: ['-timestamp'] as any,
			limit: 1000,
		}),
	), { label: 'email/events' })) as any[];

	return { events };
});
