/**
 * List marketing-feed recommendations for the user's organization.
 *
 * Query params:
 *   organizationId: string (required)
 *   status: string (optional) — 'all' returns everything; default returns
 *           active feed entries (pending | drafted)
 *
 * Returns the cards shown on the /marketing feed, sorted by urgency desc
 * then surfaced_at desc. Active feed = recommendations the user has not
 * acted on yet — the cards they should see this week.
 *
 * Reads via the server token because `marketing_recommendations` has no
 * row-level Directus perms granted to org roles. We gate access by
 * verifying the caller has an active membership in `organizationId`
 * first — same trust boundary as the existing marketing_campaigns route.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const organizationId = query.organizationId as string;

	if (!organizationId) {
		throw createError({ statusCode: 400, message: 'organizationId is required' });
	}

	await requireOrgMembership(event, organizationId);

	const directus = getTypedDirectus();

	// 30s browser cache for tab-switch / back-button. `private` blocks shared
	// proxies (org-scoped data). Set after auth so 401s aren't cached.
	setResponseHeader(event, 'Cache-Control', 'private, max-age=30');

	const filter: any = {
		organization: { _eq: organizationId },
	};

	const statusParam = query.status as string | undefined;
	if (statusParam && statusParam !== 'all') {
		filter.status = { _eq: statusParam };
	} else if (!statusParam) {
		// Default: active feed only — pending or drafted (skipped/expired hidden).
		filter.status = { _in: ['pending', 'drafted'] };
	}

	try {
		const recommendations = await directus.request(
			readItems('marketing_recommendations', {
				filter,
				fields: [
					'id',
					'organization',
					'card_type',
					'status',
					'urgency',
					'candidate_data',
					'ranker_output',
					'ranker_run_id',
					'ranker_prompt_version',
					'resulting_campaign',
					'skipped_reason',
					'surfaced_at',
					'expires_at',
					'date_created',
					'date_updated',
				],
				sort: ['-urgency', '-surfaced_at'],
				limit: 10,
			}),
		);

		return { recommendations };
	} catch (error: any) {
		console.error('[recommendations/list] Error:', error.message);
		throw createError({ statusCode: 500, message: 'Failed to fetch recommendations' });
	}
});
