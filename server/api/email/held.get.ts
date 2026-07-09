// server/api/email/held.get.ts
/**
 * Org-scoped read of the money-email DRAFT OUTBOX (`held_emails`).
 *
 * `held_emails` has NO row-level read perm for authenticated org roles (writes
 * are admin-token only). So, like email_events / marketing_campaigns, reads are
 * routed through the server: verify the caller belongs to the org, then read
 * with the admin token filtered to that org.
 *
 * Query params:
 *   - org    (required) — organization id; caller must be a member.
 *   - status (optional) — 'held' (default) | 'sent' | 'discarded' | 'all'.
 *   - limit  (optional) — default 100, clamped 1..500.
 *
 * Returns { drafts } newest-first.
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

	const status = (query.status ?? 'held').toString();
	const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));

	const filters: any[] = [{ organization: { _eq: orgId } }];
	if (status !== 'all') filters.push({ status: { _eq: status } });

	const directus = getServerDirectus();
	const drafts = (await directus.request(
		readItems('held_emails' as any, {
			fields: [
				'id', 'channel', 'to_email', 'subject', 'amount', 'reason', 'status',
				'date_created', 'sent_at', 'source_collection', 'source_id',
			] as any,
			filter: { _and: filters } as any,
			sort: ['-date_created'] as any,
			limit,
		}),
	)) as any[];

	return { drafts };
});
