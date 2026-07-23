// server/api/platform/email-events.get.ts
/**
 * GET /api/platform/email-events
 *
 * CROSS-ORG email delivery events for the platform console (Earnest creator
 * only). Unlike /api/email/events — which requires org membership and hard-
 * filters to a single org — this is gated to platform admins (global Directus
 * Administrator) and reads across every organization, so the Earnest owner can
 * confirm transactional + campaign delivery/opens for any org (or all at once).
 *
 * Query params:
 *   - days (optional) — lookback window, default 30, clamped 1..365.
 *   - org  (optional) — restrict to one organization id; omit for ALL orgs.
 *   - kind (optional) — 'campaign' | 'transactional' | 'all' (default).
 *          campaign = marketing newsletter sends (email_id set); transactional
 *          = everything else (email_id null).
 *
 * Returns { events } — each event carries `organization` so the UI can roll the
 * cross-org set up per org. Capped higher than the org endpoint since it spans
 * every org; the platform view is a monitoring surface, not an export.
 */
import { readItems } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/platform';

export default defineEventHandler(async (event) => {
	await requirePlatformAdmin(event);

	const query = getQuery(event);
	const days = Math.min(365, Math.max(1, Number(query.days) || 30));
	const since = new Date(Date.now() - days * 86400000).toISOString();
	const orgId = (query.org ?? '').toString().trim();
	const kind = (query.kind ?? 'all').toString();

	const filters: any[] = [{ timestamp: { _gte: since } }];
	if (orgId) filters.push({ organization: { _eq: orgId } });
	if (kind === 'campaign') filters.push({ email_id: { _nnull: true } });
	else if (kind === 'transactional') filters.push({ email_id: { _null: true } });

	const directus = getServerDirectus();
	const events = (await withTransientRetry(() => directus.request(
		readItems('email_events' as any, {
			fields: ['id', 'event', 'recipient', 'timestamp', 'url', 'reason', 'raw', 'organization', 'email_id.id', 'email_id.name', 'email_id.subject'] as any,
			filter: { _and: filters } as any,
			sort: ['-timestamp'] as any,
			limit: 5000,
		}),
	), { label: 'platform/email-events' })) as any[];

	return { events };
});
