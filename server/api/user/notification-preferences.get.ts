// GET /api/user/notification-preferences
// Returns the current user's notification preference shape:
//   { email_notifications: boolean | null, notification_preferences: Record<string, boolean> | null }
// Used by the settings UI to hydrate its form state.

import { readUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const directus = getTypedDirectus();
	try {
		const user = await directus.request(
			readUser(userId, {
				fields: ['email_notifications', 'notification_preferences'] as any,
			}),
		) as any;
		return {
			email_notifications: user?.email_notifications ?? null,
			notification_preferences: user?.notification_preferences ?? null,
		};
	} catch (err: any) {
		// Graceful fallback when the field hasn't been added yet — return the
		// global flag only and let the UI show defaults for the per-type rows.
		const msg = err?.errors?.[0]?.message || err?.message || '';
		if (/notification_preferences/i.test(msg) && /unknown|field|column/i.test(msg)) {
			try {
				const user = await directus.request(
					readUser(userId, { fields: ['email_notifications'] as any }),
				) as any;
				return {
					email_notifications: user?.email_notifications ?? null,
					notification_preferences: null,
				};
			} catch {}
		}
		throw createError({ statusCode: 500, message: msg || 'Failed to load preferences' });
	}
});
