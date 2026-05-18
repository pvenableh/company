/**
 * Portal content list — Studio posts in `in_review` (and optionally other
 * states) that target the active client scope. Read-only.
 *
 * Phase 5 of the retainer/social plan. Driven by `requirePortalContext` so
 * the response is automatically scoped to the user's active client (plus
 * descendant clients, the same scope rule every /api/portal/* endpoint uses).
 *
 * Query:
 *   ?state=in_review (default)  — filter by approval_state
 *   ?state=all                  — drop state filter
 */
import { getSocialPosts } from '~~/server/utils/social-directus';
import { requirePortalContext } from '~~/server/utils/portal-auth';

const ALLOWED_STATES = new Set([
	'in_review',
	'approved',
	'requested_changes',
	'published',
	'all',
]);

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);
	const query = getQuery(event);
	const stateRaw = (query.state as string) || 'in_review';
	const state = ALLOWED_STATES.has(stateRaw) ? stateRaw : 'in_review';

	const posts = await getSocialPosts(ctx.organizationId, {
		approval_state: state === 'all' ? undefined : state,
		limit: 100,
	});

	// Scope down to the client (or descendants) the portal user is rooted on.
	// `getSocialPosts` already filters by organization; we layer the client
	// scope here so the deep-fetch query stays simple.
	const scope = new Set(ctx.scopedClientIds);
	const filtered = posts.filter((p) => p.target_client && scope.has(p.target_client));

	return { data: filtered };
});
