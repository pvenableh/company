/**
 * Fetch one marketing_touch by id.
 *
 * P3 Phase 3.3 (composition-canvas-redesign). The canvas's
 * `useComposition().fetchById('touch:<n>')` calls this — pre-3.3 the
 * adapter had to scan the timeline window to find one touch, which
 * doesn't deep-link cleanly for a touch outside the rolling 30d window.
 *
 * Auth: requireOrgMembership against the touch's `organization`. We have
 * to read the row before we can check the org id (touches have no
 * row-level perms, so the server token does the read).
 */
import { readItem } from '@directus/sdk';

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
				fields: [
					'id',
					'campaign',
					'organization',
					'sequence_index',
					'kind',
					'audience_target',
					'audience_filter',
					// Expanded m2o so the canvas can render the list name on
					// the lifted card without a second round trip.
					'mailing_list.id',
					'mailing_list.name',
					'send_offset_hours',
					'scheduled_for',
					'sent_at',
					'status',
					'email_subject',
					'email_preview_text',
					'email_body_markdown',
					'email_cta',
					// P4 Item A.2: per-target body + subject variants.
					'body_variants',
					'social_channel',
					'social_caption',
					'social_image_brief',
					'social_image_url',
					'source_social_post',
					'source_email_send',
					'personalization_state',
					'opens_count',
					'clicks_count',
					'replies_count',
					'tokens_spent',
					'regenerate_history',
					'generator_strategy_excerpt',
					'date_created',
					'date_updated',
					// P4 Item A.1: junction rows for multi-target sends.
					// Expanded inline so the canvas's touchToComposition
					// mapper can build the chip row without a second fetch.
					'targets.id',
					'targets.target_kind',
					'targets.mailing_list.id',
					'targets.mailing_list.name',
					'targets.audience_filter',
					'targets.sort',
				],
			}),
		)
		.catch(() => null) as any;

	if (!touch) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}

	await requireOrgMembership(event, touch.organization);

	return { data: touch };
});
