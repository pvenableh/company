/**
 * List mailing_lists for the user's organization — feeds the Composition
 * Canvas email composer's Recipients picker.
 *
 * Mirror of `campaigns/index.get.ts` — server-token read after a
 * `requireOrgMembership` gate so we don't depend on per-collection tenant
 * perms staying in sync. Returns the minimum fields the composer needs
 * (id, name, subscriber_count) plus is_default for sort stability.
 *
 * Query params:
 *   organizationId: string (required)
 *
 * Returns: { data: Array<{ id, name, subscriber_count, is_default }> }
 */
import { readItems } from '@directus/sdk';

interface MailingListLite {
	id: number;
	name: string;
	subscriber_count: number | null;
	is_default: boolean | null;
}

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	const organizationId = query.organizationId as string;
	await requireOrgMembership(event, organizationId);

	const directus = getTypedDirectus();

	try {
		const rows = (await directus.request(
			readItems('mailing_lists', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ status: { _eq: 'published' } },
					],
				},
				fields: ['id', 'name', 'subscriber_count', 'is_default'],
				sort: ['-is_default', 'name'],
				limit: 200,
			}),
		)) as unknown as MailingListLite[];

		return { data: rows };
	} catch (error: any) {
		console.error('[marketing/mailing-lists] Error:', error.message);
		throw createError({ statusCode: 500, message: 'Failed to fetch mailing lists' });
	}
});
