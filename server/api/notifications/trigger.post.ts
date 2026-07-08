// server/api/notifications/trigger.post.ts
/**
 * Webhook endpoint for Directus Flows to fan out notifications.
 *
 * Called by `scripts/setup-notification-flows.ts`-provisioned Flows on
 * item create/update/delete. Resolves recipients via
 * `resolveNotificationTargets`, then hands each target to
 * `emitNotification` which does the bell + email work (including reaction
 * upsert and per-category pref checks).
 *
 * Request body:
 * {
 *   collection: string,         // e.g. 'tickets', 'comments', 'reactions'
 *   action: 'create' | 'update' | 'delete',
 *   item?: object,              // The full/partial item data from the Flow payload
 *   itemId: string,
 *   userId: string,             // The user who triggered the event
 *   orgId?: string,
 *   previousItem?: object,      // Pre-update item (for diff-based triggers)
 *   secret?: string,            // Optional webhook secret
 * }
 */

import { timingSafeEqual } from 'node:crypto';
import { notifyEvent } from '~~/server/utils/notify-event';

// Constant-time secret compare — `===` leaks length/prefix via timing.
function secretsMatch(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();
		const webhookSecret = (config as any).notificationWebhookSecret;

		// Fail closed: if the secret env is unset we reject every request, rather
		// than fall through to admin-privileged Directus reads + bell/email fan-out
		// for anyone on the internet. Production sets NOTIFICATION_WEBHOOK_SECRET;
		// local dev needs it set in .env to exercise this route.
		const body = await readBody(event);
		const { collection, action, item, itemId, userId, orgId, previousItem, secret } = body || {};

		if (!webhookSecret || typeof secret !== 'string' || !secretsMatch(secret, webhookSecret)) {
			throw createError({ statusCode: 403, message: 'Invalid webhook secret' });
		}

		if (!collection || !action || !itemId || !userId) {
			throw createError({
				statusCode: 400,
				message: 'collection, action, itemId, and userId are required',
			});
		}

		// All fan-out (hydrate → resolve → bucket → bell/email) lives in
		// notifyEvent now, shared with the inline server-endpoint callers.
		// The Flow path keeps its default portal behaviour (no staffOnly).
		const { bellSent, emailSent } = await notifyEvent({
			collection,
			action,
			item,
			itemId,
			userId,
			orgId,
			previousItem,
		});

		return { ok: true, bellSent, emailSent };
	} catch (error: any) {
		console.error('[notifications/trigger] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to trigger notifications',
		});
	}
});
