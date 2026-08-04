// server/api/internal/worker-notify.post.ts
//
// Internal callback for the external earnest-worker (droplet). After it finishes
// a digest or meeting recap, it POSTs here so the APP's existing pipeline sends
// the branded email + web-push — the worker itself has no SendGrid/VAPID stack.
// The worker still writes the in-app bell notification directly via Directus;
// this endpoint adds the email + push legs, respecting each user's preferences.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (the same secret the worker holds).
// Best-effort per leg — a failed email or push never fails the request.

import { readUsers } from '@directus/sdk';
import { sendNotificationEmail } from '~~/server/utils/notification-emails';
import { pushToUser } from '~~/server/utils/web-push';
import type { NotificationCategory } from '~~/server/utils/notification-categories';

interface WorkerNotifyBody {
	recipientId: string;
	category: NotificationCategory;
	subject: string;
	heading?: string;
	body: string;
	link?: string;
	orgId?: string | null;
	sourceCollection?: string | null;
	sourceId?: string | number | null;
	/** Set false to skip the push leg (email only). */
	push?: boolean;
}

// Mirror server/utils/notify-event.ts: email obeys the master toggle + `_all` +
// the per-category opt-out; push obeys `_all` only (not the email master).
function emailAllowed(u: any, category: string): boolean {
	if (u?.email_notifications === false) return false;
	const prefs = u?.notification_preferences || {};
	if (prefs._all === false) return false;
	if (prefs[category] === false) return false;
	return true;
}
function pushAllowed(u: any): boolean {
	const prefs = u?.notification_preferences || {};
	return prefs._all !== false;
}

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const secret = (config as any).cronSecret;
	const auth = getHeader(event, 'authorization');
	if (!secret || auth !== `Bearer ${secret}`) {
		throw createError({ statusCode: 401, message: 'Unauthorized' });
	}

	const b = (await readBody(event).catch(() => ({}))) as WorkerNotifyBody;
	if (!b?.recipientId || !b?.subject || !b?.body || !b?.category) {
		throw createError({ statusCode: 400, message: 'recipientId, category, subject, and body are required' });
	}

	const directus = getServerDirectus();
	const users = (await directus
		.request(readUsers({
			filter: { id: { _eq: b.recipientId } } as any,
			fields: ['id', 'email', 'first_name', 'email_notifications', 'notification_preferences'] as any,
			limit: 1,
		}))
		.catch(() => [])) as any[];
	const u = users[0];
	if (!u) return { ok: false, reason: 'recipient not found' };

	// Absolute link for email; relative is fine for the SW push navigation.
	const appUrl = (config.public as any)?.appUrl || 'https://app.earnest.guru';
	const rel = b.link || '/';
	const absLink = /^https?:\/\//.test(rel) ? rel : `${appUrl}${rel.startsWith('/') ? '' : '/'}${rel}`;

	let emailSent = false;
	if (u.email && emailAllowed(u, b.category)) {
		try {
			await sendNotificationEmail({
				to: u.email,
				recipientName: u.first_name || 'there',
				subject: b.subject,
				heading: b.heading || b.subject,
				body: b.body,
				link: absLink,
				category: b.category,
				orgId: b.orgId ?? null,
				sourceCollection: b.sourceCollection ?? undefined,
				sourceId: b.sourceId ?? null,
			});
			emailSent = true;
		} catch (err: any) {
			console.warn('[worker-notify] email failed:', err?.message || err);
		}
	}

	let pushed = false;
	if (b.push !== false && pushAllowed(u)) {
		try {
			await pushToUser(b.recipientId, {
				title: b.subject,
				body: b.body.slice(0, 180),
				url: rel,
			});
			pushed = true;
		} catch (err: any) {
			console.warn('[worker-notify] push failed:', err?.message || err);
		}
	}

	return { ok: true, emailSent, pushed };
});
