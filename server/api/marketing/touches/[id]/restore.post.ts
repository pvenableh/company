/**
 * Restore the most recent prior version of a touch from regenerate_history.
 *
 * POST /api/marketing/touches/[id]/restore
 *
 * Pops the head entry off `regenerate_history` and patches the touch back
 * to that version. Refuses if history is empty or the touch is past the
 * mutable lifecycle (sent/cancelled/failed).
 *
 * Token-free — no AI call.
 */
import { readItem, updateItem } from '@directus/sdk';
import type { DraftedTouch, TouchHistoryEntry } from '~/composables/useMarketingDrafts';
import type { MarketingTouch } from '~~/shared/marketing-persistence';

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
					'organization',
					'status',
					'audience_target',
					'regenerate_history',
				],
			}),
		)
		.catch(() => null) as MarketingTouch | null;

	if (!touch) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}
	if (!['pending', 'scheduled'].includes(touch.status)) {
		throw createError({
			statusCode: 409,
			message: `Touch is ${touch.status}; cannot restore.`,
		});
	}

	await requireOrgMembership(event, touch.organization);

	const history = Array.isArray(touch.regenerate_history)
		? (touch.regenerate_history as TouchHistoryEntry[])
		: [];
	if (history.length === 0) {
		throw createError({ statusCode: 409, message: 'No history to restore from.' });
	}

	const [restoreEntry, ...remaining] = history;
	if (!restoreEntry) {
		throw createError({ statusCode: 409, message: 'History head is empty.' });
	}

	let updated: any;
	try {
		updated = await directus.request(
			updateItem('marketing_touches', touchId, {
				audience_filter: restoreEntry.audience_filter,
				send_offset_hours: restoreEntry.send_offset_hours,
				email_subject: restoreEntry.email_subject,
				email_preview_text: restoreEntry.email_preview_text,
				email_body_markdown: restoreEntry.email_body_markdown,
				email_cta: restoreEntry.email_cta,
				social_channel: restoreEntry.social_channel,
				social_caption: restoreEntry.social_caption,
				social_image_brief: restoreEntry.social_image_brief,
				regenerate_history: remaining,
			}),
		);
	} catch (err: any) {
		console.error('[marketing/touches/restore] persist failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to restore touch' });
	}

	const restoredTouch: DraftedTouch = {
		id: touchId,
		kind: updated.kind,
		send_offset_hours: updated.send_offset_hours,
		audience_target: updated.audience_target ?? touch.audience_target,
		audience_filter: updated.audience_filter,
		email_subject: updated.email_subject,
		email_preview_text: updated.email_preview_text,
		email_body_markdown: updated.email_body_markdown,
		email_cta: updated.email_cta,
		social_channel: updated.social_channel,
		social_caption: updated.social_caption,
		social_image_brief: updated.social_image_brief,
		regenerate_history: remaining,
	};

	return { touch: restoredTouch };
});
