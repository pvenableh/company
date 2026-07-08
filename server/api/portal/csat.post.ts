// server/api/portal/csat.post.ts
/**
 * POST /api/portal/csat
 *
 * Lets a client portal user rate their satisfaction (1–5 + optional note) on a
 * delivered ticket or completed project. Verifies the item belongs to a client
 * in the user's portal scope AND that the work is actually delivered before
 * stamping the CSAT fields. Written with the server (admin) token so no portal
 * write-perm on tickets/projects is needed — mirrors event-approve.
 *
 * Body: { collection: 'tickets' | 'projects', itemId: string, rating: 1..5, comment?: string }
 */
import { readItem, updateItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';
import { notifyEvent } from '~~/server/utils/notify-event';
import { writeClientTimeline } from '~~/server/utils/write-timeline';

// Which status counts as "delivered" per collection (case differs by design:
// tickets.status is Capitalized, projects.status is lowercase).
const DELIVERED_STATUS: Record<'tickets' | 'projects', string> = {
	tickets: 'Completed',
	projects: 'completed',
};

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);
	const body = await readBody(event);

	const collection = body?.collection as 'tickets' | 'projects';
	const itemId = body?.itemId as string | undefined;
	const rating = Number(body?.rating);
	const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : null;

	if (collection !== 'tickets' && collection !== 'projects') {
		throw createError({ statusCode: 400, message: 'collection must be tickets or projects' });
	}
	if (!itemId) throw createError({ statusCode: 400, message: 'itemId is required' });
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		throw createError({ statusCode: 400, message: 'rating must be an integer 1–5' });
	}

	const directus = getServerDirectus();

	const row = (await directus.request(
		readItem(collection, itemId, {
			fields: ['id', 'status', 'organization', 'client', 'title'],
		}),
	)) as any;

	const org = typeof row?.organization === 'object' ? row.organization?.id : row?.organization;
	const client = typeof row?.client === 'object' ? row.client?.id : row?.client;

	// Scope check — 404 (not 403) so we never confirm existence of out-of-scope rows.
	if (!org || org !== ctx.organizationId) {
		throw createError({ statusCode: 404, message: 'Not found' });
	}
	if (!client || !ctx.scopedClientIds.includes(client)) {
		throw createError({ statusCode: 404, message: 'Not found' });
	}
	// Only rateable once delivered — prevents rating in-flight work.
	if (row.status !== DELIVERED_STATUS[collection]) {
		throw createError({ statusCode: 409, message: 'This work is not marked complete yet.' });
	}

	const updated = await directus.request(
		updateItem(collection, itemId, {
			csat_rating: rating,
			csat_comment: comment,
			csat_submitted_at: new Date().toISOString(),
		}),
	);

	// ── Return leg ─────────────────────────────────────────────────────────
	// Notify the item's assignees (a low score ≤2 also escalates to org
	// admins) and log the rating on the client timeline. Both fire-and-forget.
	const label = row.title || (collection === 'projects' ? 'Project' : 'Ticket');

	void notifyEvent({
		directus,
		collection: 'csat',
		action: 'create',
		item: {
			source_collection: collection,
			source_id: itemId,
			rating,
			comment,
			title: label,
		},
		itemId: String(itemId),
		userId: '', // portal actor is not a staff directus user
		orgId: ctx.organizationId,
		staffOnly: true,
	}).catch((e) => console.warn('[portal/csat] notify failed:', e));

	void writeClientTimeline({
		organizationId: ctx.organizationId,
		clientId: client,
		verb: 'csat.submitted',
		title: `Rated ${rating}/5 · ${label}`,
		subtitle: comment,
		actorType: 'client',
		sourceCollection: collection,
		sourceId: itemId,
		href: collection === 'projects' ? `/projects/${itemId}` : `/tickets/${itemId}`,
		icon: rating <= 2 ? 'lucide:frown' : 'lucide:smile',
		metadata: { rating },
	});

	return { ok: true, id: itemId, rating, data: updated };
});
