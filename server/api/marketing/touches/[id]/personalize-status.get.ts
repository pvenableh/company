/**
 * Status of per-recipient personalization for a touch.
 *
 * GET /api/marketing/touches/[id]/personalize-status
 *
 * Returns counts so the TouchEditor drawer can poll while in_progress.
 * Cheap — single aggregate query against marketing_touch_variants.
 */
import { aggregate, readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const touchId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(touchId)) {
		throw createError({ statusCode: 400, message: 'Touch ID must be numeric' });
	}

	const directus = getTypedDirectus();

	const touch = await directus
		.request(
			readItem('marketing_touches', touchId, {
				fields: ['id', 'organization', 'personalization_state'],
			}),
		)
		.catch(() => null) as any;

	if (!touch) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}

	await requireOrgMembership(event, touch.organization);

	let buckets: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
	try {
		const rows = await directus.request(
			aggregate('marketing_touch_variants' as any, {
				groupBy: ['status'],
				aggregate: { count: ['id'] },
				query: { filter: { touch: { _eq: touchId } } },
			}),
		) as any[];
		for (const r of rows) {
			const s = r.status as string;
			const c = Number((r.count as any)?.id ?? 0);
			if (s in buckets) buckets[s] = c;
		}
	} catch (err: any) {
		console.warn('[personalize-status] aggregate failed:', err.message);
	}

	const total = buckets.pending + buckets.processing + buckets.completed + buckets.failed;
	const isDone = total > 0 && buckets.pending === 0 && buckets.processing === 0;

	return {
		touch_id: touchId,
		personalization_state: touch.personalization_state || 'none',
		total,
		pending: buckets.pending,
		processing: buckets.processing,
		completed: buckets.completed,
		failed: buckets.failed,
		is_done: isDone,
	};
});
