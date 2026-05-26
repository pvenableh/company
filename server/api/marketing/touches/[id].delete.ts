/**
 * Delete a marketing_touch.
 *
 * P3 Phase 3.3 (composition-canvas-redesign). Mirrors DELETE
 * /api/social/posts/:id — only `pending` / `scheduled` / `failed` /
 * `cancelled` touches can be removed. Sent touches stay as a record of
 * what went out; if the user needs to clear them they're a separate
 * "archive" path (deferred).
 *
 * Auth: requireOrgMembership against the touch's `organization`.
 */
import { deleteItem, readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const touchId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(touchId)) {
		throw createError({ statusCode: 400, message: 'Touch ID must be numeric' });
	}

	const directus = getTypedDirectus();
	const existing = await directus
		.request(
			readItem('marketing_touches', touchId, {
				fields: ['id', 'organization', 'status'],
			}),
		)
		.catch(() => null) as any;

	if (!existing) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}

	await requireOrgMembership(event, existing.organization);

	if (!['pending', 'scheduled', 'failed', 'cancelled'].includes(existing.status)) {
		throw createError({
			statusCode: 400,
			message: `Cannot delete a ${existing.status} touch. Sent touches stay as a record of what went out.`,
		});
	}

	try {
		await directus.request(deleteItem('marketing_touches', touchId));
		return { success: true };
	} catch (err: any) {
		console.error('[marketing/touches] delete failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to delete touch' });
	}
});
