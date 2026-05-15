// server/api/support/tickets.get.ts
/**
 * GET /api/support/tickets
 *
 * Returns the caller's own submissions in the Earnest support org. Same
 * cross-org trust boundary as /submit — gate on the session, then read
 * through the server token because the reporter has no role inside the
 * Support org. Mirrors the pattern in server/utils/marketing-perms.ts.
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const config = useRuntimeConfig();
	const supportOrgId = (config as any).earnestSupportOrgId as string;
	if (!supportOrgId) {
		throw createError({
			statusCode: 503,
			message:
				'Support inbox is not configured. Set EARNEST_SUPPORT_ORG_ID after running scripts/setup-earnest-support-org.ts.',
		});
	}

	const directus = getTypedDirectus();
	const rows = (await directus.request(
		readItems('tickets', {
			filter: {
				_and: [
					{ organization: { _eq: supportOrgId } },
					{ user_created: { _eq: userId } },
				],
			},
			fields: ['id', 'title', 'status', 'priority', 'date_created', 'date_updated'],
			sort: ['-date_created'],
			limit: 100,
		}),
	)) as any[];

	return rows ?? [];
});
