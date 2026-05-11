// PATCH /api/user/notification-preferences
// Persists the current user's per-event-type email opt-out map onto
// directus_users.notification_preferences (a JSON map: key → boolean).
// `email_notifications` (the global toggle) is also accepted in the same body
// so the settings UI can update both with one request.
//
// Auth: requires a valid session. Writes via the admin token because user
// policies don't grant directus_users.update on the "settings"-style fields
// across all org roles — this is account-level state, not org-scoped.

import { updateUser } from '@directus/sdk';

interface Body {
	email_notifications?: boolean | null;
	notification_preferences?: Record<string, boolean> | null;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<Body>(event);
	if (!body || typeof body !== 'object') {
		throw createError({ statusCode: 400, message: 'Body is required' });
	}

	const patch: Record<string, any> = {};
	if ('email_notifications' in body) {
		patch.email_notifications = body.email_notifications;
	}
	if ('notification_preferences' in body) {
		if (body.notification_preferences === null) {
			patch.notification_preferences = null;
		} else if (typeof body.notification_preferences === 'object') {
			// Coerce to a flat record of booleans to avoid leaking unrelated junk.
			const sanitized: Record<string, boolean> = {};
			for (const [k, v] of Object.entries(body.notification_preferences)) {
				if (typeof v === 'boolean') sanitized[k] = v;
			}
			patch.notification_preferences = sanitized;
		}
	}

	if (Object.keys(patch).length === 0) {
		return { success: true, data: null };
	}

	const directus = getTypedDirectus();
	try {
		const updated = await directus.request(
			updateUser(userId, patch as any),
		);
		return {
			success: true,
			data: {
				email_notifications: (updated as any)?.email_notifications ?? null,
				notification_preferences: (updated as any)?.notification_preferences ?? null,
			},
		};
	} catch (err: any) {
		// If the JSON field hasn't been added to Directus yet, surface a clear
		// message rather than the raw Directus error.
		const msg = err?.errors?.[0]?.message || err?.message || 'Failed to save preferences';
		if (/notification_preferences/i.test(msg) && /unknown|field|column/i.test(msg)) {
			throw createError({
				statusCode: 500,
				message: 'notification_preferences field missing on directus_users — add a JSON field in Directus admin.',
			});
		}
		throw createError({ statusCode: 500, message: msg });
	}
});
