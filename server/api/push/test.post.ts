// server/api/push/test.post.ts
//
// Authenticated SELF-test for Web Push. Sends a push to the caller's OWN
// subscriptions only — never to anyone else — so you can confirm the whole
// delivery chain on an environment with VAPID configured:
//   stored subscription → web-push (VAPID) send → SW `push` handler →
//   showNotification → `notificationclick` routing.
//
// Returns a useful diagnostic instead of blindly firing: reports when VAPID
// isn't configured or when the account has no subscriptions yet.
//
// Optional JSON body: { title?, body?, url? } to customise the test payload.

import { readItems } from '@directus/sdk';
import { pushToUser } from '~~/server/utils/web-push';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const config = useRuntimeConfig();
	const vapidReady = !!(config.public?.vapidPublicKey && (config as any).vapidPrivateKey);
	if (!vapidReady) {
		return { ok: false, reason: 'VAPID keys are not configured on this environment.' };
	}

	const body = (await readBody(event).catch(() => ({}))) as any;

	// Surface the subscription count so a "nothing happened" result is explainable
	// (no device subscribed) rather than a silent no-op.
	const directus = getServerDirectus();
	const subs = (await directus
		.request(
			readItems('push_subscriptions' as any, {
				filter: { user: { _eq: userId } } as any,
				fields: ['id'] as any,
				limit: -1,
			}),
		)
		.catch(() => [])) as any[];

	if (!subs.length) {
		return { ok: false, reason: 'No push subscriptions for your account — enable push notifications first, then retry.' };
	}

	await pushToUser(userId, {
		title: body?.title || 'Earnest test push 🔔',
		body: body?.body || 'If you can see this, web push is working end to end.',
		url: body?.url || '/',
		tag: 'earnest-test',
		data: { test: true },
	});

	return { ok: true, subscriptions: subs.length, message: 'Test push dispatched to your device(s) — it may take a few seconds.' };
});
