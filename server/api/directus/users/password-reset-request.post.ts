// server/api/directus/users/password-reset-request.post.ts
/**
 * Earnest-branded password reset request.
 *
 * Replaces Directus's default `passwordRequest` SDK call (which renders an
 * un-styled email and depends on Directus's own SMTP config — often missing
 * in our envs). Flow:
 *
 *   1. Look up the user by email via the admin Directus client. Silent fail
 *      if missing — we always 200 so attackers can't enumerate addresses.
 *   2. Generate a 64-char hex token (32 random bytes) + 1h TTL.
 *   3. Insert a row in `password_reset_tokens` (collection created by
 *      `scripts/setup-password-reset-tokens.ts`).
 *   4. Render a branded email via `renderEarnestEmail` (Earnest chrome,
 *      with the user's primary org name/logo mentioned in the body for
 *      context) and ship through SendGrid.
 *
 * The reset link points at `/auth/password-reset?token=<hex>` and is
 * consumed by `password-reset.post.ts` (same dir).
 */

import crypto from 'node:crypto';
import { readItems, readUsers, createItem } from '@directus/sdk';
import { renderEarnestEmail, escapeHtml } from '~~/server/utils/email-shell';
import { sendBrandedEmail } from '~~/server/utils/email-send';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';

	// Pull IP best-effort for audit. Don't fail the request if it's missing.
	const requestedIp = getRequestIP(event, { xForwardedFor: true }) || null;

	try {
		const body = await readBody(event);
		const email = (body?.email || '').toString().trim().toLowerCase();
		if (!email) {
			throw createError({ statusCode: 400, message: 'Email is required' });
		}

		const directus = getServerDirectus();

		// 1. Find the user. Use the admin Directus client + `readUsers` (the
		//    SDK's directus_users-specific endpoint — `readItems('directus_users')`
		//    silently returns empty results even with admin token).
		const users = (await directus.request(
			readUsers({
				filter: { email: { _eq: email } } as any,
				fields: ['id', 'first_name', 'last_name', 'email'],
				limit: 1,
			}),
		).catch((err: any) => {
			console.error('[password-reset-request] readUsers error:', err?.message || err);
			return [];
		})) as any[];

		const user = users[0];

		// Always 200 below, even when the user doesn't exist — prevents
		// account enumeration. Log internally so we can debug genuine
		// delivery failures.
		if (!user) {
			console.log('[password-reset-request] no user for', email, '— silent 200');
			return {
				success: true,
				message: 'If an account exists with this email, a password reset link has been sent.',
			};
		}

		// 2. Generate token + TTL.
		const token = crypto.randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

		// 3. Persist. Failure here is genuinely server-side; surface a 500
		//    but keep the body opaque so we don't leak existence.
		try {
			await directus.request(
				createItem('password_reset_tokens' as any, {
					user: user.id,
					token,
					expires_at: expiresAt,
					requested_ip: requestedIp,
				} as any),
			);
		} catch (err: any) {
			console.error('[password-reset-request] token persist failed:', err?.message || err);
			// Still 200 to the client — they shouldn't know whether the row write
			// succeeded. Operators see the warning in logs.
			return {
				success: true,
				message: 'If an account exists with this email, a password reset link has been sent.',
			};
		}

		// 4. Resolve the user's primary org NAME for body context only. Chrome
		//    stays Earnest, so we don't fetch the full brand row — the From
		//    name + reply-to are deliberately Earnest-platform values.
		let orgName: string | null = null;
		try {
			const memberships = (await directus.request(
				readItems('org_memberships' as any, {
					filter: { user: { _eq: user.id } } as any,
					fields: ['id', 'role', 'organization.id', 'organization.name'],
					sort: ['date_created'] as any,
					limit: 1,
				}),
			).catch(() => [])) as any[];
			orgName = memberships[0]?.organization?.name || null;
		} catch {
			// org context is nice-to-have; don't gate the email on it.
		}

		const resetUrl = `${appUrl}/auth/password-reset?token=${encodeURIComponent(token)}`;
		const firstName = (user.first_name || '').toString().trim();
		const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';

		const orgContextLine = orgName
			? `<p style="margin:0 0 12px;color:#666;font-size:13px;">For your <strong>${escapeHtml(orgName)}</strong> workspace on Earnest.</p>`
			: '';

		const bodyHtml = `
			<p style="margin:0 0 12px;">${greeting}</p>
			<p style="margin:0 0 12px;">We received a request to reset the password on your Earnest account. If this was you, click the button below to set a new one. The link expires in <strong>1 hour</strong>.</p>
			${orgContextLine}
			<p style="margin:16px 0 0;font-size:13px;color:#888;">If you didn't request this, you can safely ignore this email — your password won't change unless you click the link and set a new one.</p>
		`;

		const subject = 'Reset your Earnest password';
		const heading = 'Reset your password';

		const rendered = renderEarnestEmail({
			subject,
			preheader: 'Set a new password for your Earnest account. Link expires in 1 hour.',
			heading,
			bodyHtml,
			cta: { label: 'Set new password', url: resetUrl },
		});

		const sendResult = await sendBrandedEmail({
			to: user.email,
			subject,
			html: rendered.html,
			text: rendered.text,
			// Intentionally NOT passing `org` here. sendBrandedEmail uses
			// org.name as the From name when provided, which would surface
			// the user's workspace ("hue") as the sender of an
			// Earnest-chrome transactional email — confusing + opens spoof
			// vectors if someone reuses Earnest's domain for marketing.
			// The org context already appears in the rendered body copy.
			org: null,
			// Org reply-to would route account-recovery replies to the
			// workspace admin, which is wrong — these are Earnest-platform
			// emails. Fall through to SENDGRID_REPLY_TO_EMAIL (or no reply-to).
			replyTo: null,
			categories: ['transactional', 'password-reset'],
		});

		if (!sendResult.sent) {
			console.warn('[password-reset-request] send failed:', sendResult.reason);
		} else {
			console.log('[password-reset-request] sent reset link to', user.email);
		}

		return {
			success: true,
			message: 'If an account exists with this email, a password reset link has been sent.',
		};
	} catch (err: any) {
		// Validation errors fall through here. For anything else we still
		// avoid leaking — log + return the opaque success body.
		if (err?.statusCode && err.statusCode < 500) {
			throw err;
		}
		console.error('[password-reset-request] unexpected:', err?.message || err);
		return {
			success: true,
			message: 'If an account exists with this email, a password reset link has been sent.',
		};
	}
});
