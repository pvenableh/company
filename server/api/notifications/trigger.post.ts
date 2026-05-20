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
import { readItem } from '@directus/sdk';
import { resolveNotificationTargets } from '~~/server/utils/notificationRecipients';
import { emitNotification } from '~~/server/utils/notify-event';

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

		const directus = getServerDirectus();

		// If the Flow only sent the diff (item.status, item.assigned_to, ...),
		// hydrate the rest from Directus so we have enough context for routing.
		let fullItem = item || {};
		if (!fullItem || Object.keys(fullItem).length < 2) {
			try {
				fullItem = await directus.request(readItem(collection, itemId, { fields: ['*'] as any })) as any;
			} catch {
				// Read failures fall through — the resolvers handle missing fields.
			}
		}

		const targets = await resolveNotificationTargets(directus, {
			collection,
			action,
			item: fullItem,
			itemId,
			userId,
			orgId,
			previousItem,
		});

		if (targets.length === 0) {
			return { ok: true, bellSent: 0, emailSent: 0 };
		}

		// Look up the actor's name once so reaction-upsert messages and email
		// CTAs render meaningfully ("Bob reacted" vs "Someone reacted").
		let actorName: string | null = null;
		try {
			const actor = await directus.request(readItem('directus_users' as any, userId, {
				fields: ['first_name', 'last_name', 'email'] as any,
			})) as any;
			actorName = [actor?.first_name, actor?.last_name].filter(Boolean).join(' ').trim() || actor?.email || null;
		} catch {
			// Non-fatal: messages render generically without the name.
		}

		// Group targets by (recipient, category, collection, itemId) so a
		// recipient who hits multiple branches (e.g. assignee + portal) only
		// gets one bell row per (item, category).
		type Bucket = {
			recipientIds: string[];
			category: any;
			type: string;
			subject: string;
			message: string;
			collection: string;
			itemId: string;
			metadata?: Record<string, any>;
		};
		const buckets = new Map<string, Bucket>();
		for (const t of targets) {
			const key = `${t.category}|${t.collection}|${t.itemId}|${t.type}|${t.subject}|${t.message}`;
			const existing = buckets.get(key);
			if (existing) {
				if (!existing.recipientIds.includes(t.recipientId)) existing.recipientIds.push(t.recipientId);
			} else {
				buckets.set(key, {
					recipientIds: [t.recipientId],
					category: t.category,
					type: t.type,
					subject: t.subject,
					message: t.message,
					collection: t.collection,
					itemId: t.itemId,
					metadata: t.metadata,
				});
			}
		}

		let totalBell = 0;
		let totalEmail = 0;
		const base = config.public?.appBaseUrl || (config as any).appBaseUrl || '';

		for (const b of buckets.values()) {
			const res = await emitNotification({
				category: b.category,
				type: b.type,
				collection: b.collection,
				itemId: b.itemId,
				orgId,
				actorId: userId,
				actorName,
				recipientIds: b.recipientIds,
				subject: b.subject,
				message: b.message,
				link: buildItemLink(base, b.collection, b.itemId),
				metadata: b.metadata,
			});
			totalBell += res.bellSent;
			totalEmail += res.emailSent;
		}

		return { ok: true, bellSent: totalBell, emailSent: totalEmail };
	} catch (error: any) {
		console.error('[notifications/trigger] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to trigger notifications',
		});
	}
});

function buildItemLink(baseUrl: string, collection: string, itemId: string): string | null {
	const path = itemPath(collection, itemId);
	if (!path) return null;
	if (!baseUrl) return path;
	return baseUrl.replace(/\/$/, '') + path;
}

function itemPath(collection: string, itemId: string): string | null {
	switch (collection) {
		case 'tickets': return `/tickets/${itemId}`;
		case 'projects': return `/projects/${itemId}`;
		case 'tasks': return `/projects/${itemId}`;
		case 'invoices': return `/invoices/${itemId}`;
		case 'contracts': return `/contracts/${itemId}`;
		case 'proposals': return `/proposals/${itemId}`;
		case 'video_meetings': return `/meetings/${itemId}`;
		default: return null;
	}
}
