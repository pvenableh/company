/**
 * Marketing-touches timeline read.
 *
 * Returns all marketing_touches in [now - 30d, now + 30d] for the org,
 * joined with their parent campaign for color/title attribution. Used by
 * /marketing-timeline (the Gantt view).
 *
 * Auth: requireOrgMembership.
 * Routes via server token (same trust boundary as the other marketing
 * routes — collections have no row-level perms).
 */
import { readItems } from '@directus/sdk';

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

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

	const now = new Date();
	const start = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
	const end = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();

	let touches: any[] = [];
	try {
		touches = await directus.request(
			readItems('marketing_touches', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{
							_or: [
								{ scheduled_for: { _gte: start, _lte: end } },
								{ sent_at: { _gte: start, _lte: end } },
							],
						},
					],
				},
				fields: [
					'id',
					'campaign',
					'sequence_index',
					'kind',
					'audience_target',
					'audience_filter',
					'send_offset_hours',
					'scheduled_for',
					'sent_at',
					'status',
					'email_subject',
					'email_preview_text',
					'email_body_markdown',
					'email_cta',
					'social_channel',
					'social_caption',
					'social_image_brief',
					'opens_count',
					'clicks_count',
					'replies_count',
				],
				sort: ['scheduled_for'],
				limit: 500,
			}),
		) as any[];
	} catch (err: any) {
		console.error('[marketing/timeline] touches query failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to load touches' });
	}

	// Pull parent campaigns so the UI can colour bars and link out.
	const campaignIds = Array.from(new Set(touches.map((t) => t.campaign).filter(Boolean)));
	let campaigns: any[] = [];
	if (campaignIds.length > 0) {
		try {
			campaigns = await directus.request(
				readItems('marketing_campaigns', {
					filter: { id: { _in: campaignIds as any } },
					fields: ['id', 'title', 'card_type', 'status', 'goal'],
					limit: 200,
				}),
			) as any[];
		} catch (err: any) {
			console.warn('[marketing/timeline] campaigns query failed:', err.message);
		}
	}

	return {
		windowStart: start,
		windowEnd: end,
		touches,
		campaigns,
	};
});
