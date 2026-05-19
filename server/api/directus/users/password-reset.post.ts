// server/api/directus/users/password-reset.post.ts
/**
 * Earnest-branded password reset (token redemption).
 *
 * Companion to `password-reset-request.post.ts`. Accepts `{ token, password }`,
 * validates the token against the `password_reset_tokens` collection
 * (exists / not expired / not yet used), then writes the new password to
 * `directus_users` via the admin Directus client.
 *
 * Replaces the prior `passwordReset` SDK call which depended on Directus's
 * own JWT-based reset tokens — incompatible with our self-issued tokens
 * and required Directus's mail config to function in the first place.
 */

import { readItems, updateItem, updateUser } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);
		const token = (body?.token || '').toString().trim();
		const password = (body?.password || '').toString();

		if (!token || !password) {
			throw createError({ statusCode: 400, message: 'Token and password are required.' });
		}
		if (password.length < 6) {
			throw createError({ statusCode: 400, message: 'Password must be at least 6 characters.' });
		}

		const directus = getServerDirectus();

		// 1. Look up the token. Server token reads bypass perms, so we can
		//    query freely. Hidden + admin-only collection means an attacker
		//    can't brute-force this endpoint to discover valid tokens.
		const rows = (await directus.request(
			readItems('password_reset_tokens' as any, {
				filter: { token: { _eq: token } } as any,
				fields: ['id', 'user', 'expires_at', 'used_at'],
				limit: 1,
			}),
		).catch(() => [])) as any[];

		const row = rows[0];
		if (!row) {
			throw createError({ statusCode: 400, message: 'Invalid or expired reset link.' });
		}
		if (row.used_at) {
			throw createError({ statusCode: 400, message: 'This reset link has already been used. Request a new one.' });
		}
		if (!row.expires_at || new Date(row.expires_at).getTime() < Date.now()) {
			throw createError({ statusCode: 400, message: 'This reset link has expired. Request a new one.' });
		}

		const userId = typeof row.user === 'object' ? row.user?.id : row.user;
		if (!userId) {
			console.error('[password-reset] token row missing user FK', row);
			throw createError({ statusCode: 500, message: 'Reset record is corrupt. Request a new link.' });
		}

		// 2. Write the new password via the admin Directus client.
		try {
			await directus.request(updateUser(userId, { password } as any));
		} catch (err: any) {
			console.error('[password-reset] updateUser failed:', err?.message || err);
			throw createError({ statusCode: 500, message: 'Failed to set your password. Try again or request a new link.' });
		}

		// 3. Burn the token so it can't be replayed. Best-effort — if this
		//    fails after the password change succeeded, log but don't 500
		//    (the password is set; rendering an error would confuse the user).
		try {
			await directus.request(
				updateItem('password_reset_tokens' as any, row.id, {
					used_at: new Date().toISOString(),
				} as any),
			);
		} catch (err: any) {
			console.warn('[password-reset] failed to mark token used:', err?.message || err);
		}

		return {
			success: true,
			message: 'Password reset successfully.',
		};
	} catch (error: any) {
		// Pass through createError objects so the client sees the right
		// status + message; otherwise wrap as 500.
		if (error?.statusCode) throw error;
		console.error('[password-reset] unexpected:', error?.message || error);
		throw createError({
			statusCode: 500,
			message: 'Failed to reset password. Please try again.',
		});
	}
});
