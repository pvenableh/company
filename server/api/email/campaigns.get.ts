// server/api/email/campaigns.get.ts
/**
 * Org-scoped read of marketing campaign sends (`emails`) for the Email Activity
 * page + the Marketing dashboard's campaign roll-up.
 *
 * `emails` shipped with a PUBLIC, unfiltered read grant — a cross-org leak of
 * campaign metadata (subjects, recipient counts, org ids), the same shape the
 * `email_events` leak had. That public read is being removed on prod; once it's
 * gone there is NO authenticated row-level read for org roles, so — exactly like
 * `email_events` and `marketing_campaigns` — reads route through the server:
 * verify the caller belongs to the org, then read with the admin token filtered
 * to that org. The pages never talk to the collection directly.
 *
 * Query params:
 *   - org   (required) — organization id; caller must be a member.
 *   - days  (optional) — lookback window on sent_at, default 30, clamped 1..365.
 *   - limit (optional) — row cap, default 100, clamped 1..500.
 *
 * Returns { campaigns } with the fields both callers aggregate.
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
	const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
	const since = new Date(Date.now() - days * 86400000).toISOString();

	const directus = getServerDirectus();
	const campaigns = (await directus.request(
		readItems('emails' as any, {
			fields: ['id', 'name', 'subject', 'sent_at', 'total_recipients', 'total_sent', 'total_failed'] as any,
			filter: { _and: [{ organization: { _eq: orgId } }, { sent_at: { _gte: since } }] } as any,
			sort: ['-sent_at'] as any,
			limit,
		}),
	)) as any[];

	return { campaigns };
});
