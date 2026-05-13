// server/api/support/tickets/[id].get.ts
/**
 * GET /api/support/tickets/:id
 *
 * Reporter-facing detail view: returns the ticket only if the caller
 * created it, and includes a redacted `public_updates` thread.
 *
 * The Support org uses a prefix convention to mirror staff replies back
 * to the reporter: any comment whose body starts with `>>>` is treated
 * as public-facing. Everything else stays internal to triage.
 */

import { readItem, readItems } from '@directus/sdk';

const PUBLIC_PREFIX = '>>>';

function stripHtmlAndTrim(html: string): string {
	if (!html) return '';
	const text = html
		.replace(/<br\s*\/?>(\s|&nbsp;)*/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
	return text;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const id = getRouterParam(event, 'id');
	if (!id) {
		throw createError({ statusCode: 400, message: 'id is required' });
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

	const ticket = (await directus
		.request(
			readItem('tickets', id, {
				fields: [
					'id',
					'title',
					'description',
					'status',
					'priority',
					'date_created',
					'date_updated',
					'organization',
					'user_created',
				],
			}),
		)
		.catch(() => null)) as any;

	if (!ticket || ticket.organization !== supportOrgId || ticket.user_created !== userId) {
		throw createError({ statusCode: 404, message: 'Not found' });
	}

	const rawComments = (await directus
		.request(
			readItems('comments', {
				filter: {
					_and: [
						{ collection: { _eq: 'tickets' } },
						{ item: { _eq: String(id) } },
					],
				},
				fields: [
					'id',
					'comment',
					'date_created',
					'user.first_name',
					'user.last_name',
				],
				sort: ['date_created'],
				limit: 200,
			}),
		)
		.catch(() => [])) as any[];

	const public_updates = (rawComments || [])
		.map((c: any) => {
			const plain = stripHtmlAndTrim(c?.comment || '');
			if (!plain.startsWith(PUBLIC_PREFIX)) return null;
			const body = plain.slice(PUBLIC_PREFIX.length).replace(/^\s+/, '');
			const first = c?.user?.first_name || '';
			const last = c?.user?.last_name || '';
			const name = [first, last].filter(Boolean).join(' ') || 'Earnest Support';
			return {
				id: c.id,
				body,
				date_created: c.date_created,
				author: { name },
			};
		})
		.filter(Boolean);

	return {
		id: ticket.id,
		title: ticket.title,
		description: ticket.description,
		status: ticket.status,
		priority: ticket.priority,
		date_created: ticket.date_created,
		date_updated: ticket.date_updated,
		public_updates,
	};
});
