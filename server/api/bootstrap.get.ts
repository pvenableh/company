// server/api/bootstrap.get.ts
/**
 * GET /api/bootstrap — one round-trip for the login-time chrome scalars.
 *
 * The home/app shell used to fan out ~10 independent authenticated fetches on
 * login (notification count, unread badges, AI pending count, prefs, …), all
 * hitting Directus in parallel — the burst that intermittently tripped 500s.
 * This collapses the small, always-visible header/rail scalars into a SINGLE
 * client request. The client (`useBootstrap`) calls this once per org and seeds
 * the shared useState singletons the widgets already read, so those widgets skip
 * their own login-time fetch.
 *
 * Orchestrated server-side over the existing, already-hardened endpoints
 * (each does its own retry + fail-soft), with allSettled so one slow/failing
 * source never sinks the rest. Cookie is forwarded so the sub-calls authenticate
 * as the caller. Extend by adding more sources to the allSettled array.
 */
export default defineEventHandler(async (event) => {
	await requireUserSession(event);

	const org = (getQuery(event).org ?? '').toString().trim();
	const cookie = getHeader(event, 'cookie') || '';
	const fwd = { headers: { cookie } } as const;

	const [channelsUnread, aiPending] = await Promise.allSettled([
		// User-scoped (derives the caller's orgs internally) — no org param needed.
		$fetch<{ channels: Record<string, any>; total: number }>('/api/channels/unread', fwd),
		// Org-scoped — skip cleanly when no org is selected yet.
		org
			? $fetch<{ count: number }>('/api/ai/actions/pending-count', { ...fwd, query: { organizationId: org } })
			: Promise.resolve({ count: 0 }),
	]);

	return {
		channelsUnread: channelsUnread.status === 'fulfilled'
			? { channels: channelsUnread.value?.channels || {}, total: channelsUnread.value?.total || 0 }
			: { channels: {}, total: 0 },
		aiPendingCount: aiPending.status === 'fulfilled'
			? Number((aiPending.value as any)?.count ?? 0)
			: 0,
	};
});
