/**
 * Send the early-access welcome email.
 *
 * Fired when someone requests early access (the marketing site posts to a
 * Directus Flow, which calls `POST /api/early-access/welcome`). Earnest is the
 * sender — no org brand context — so it renders with plain Earnest chrome from
 * `server/emails/early-access-welcome.mjml` (the drop-in design zone).
 *
 * Non-fatal: returns silently on any failure (missing API key, send error) so a
 * flaky email never blocks the signup itself.
 */
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';

interface EarlyAccessWelcomeParams {
	to: string;
	/** Full name as submitted; the first token is used for the greeting. */
	name?: string | null;
}

export async function sendEarlyAccessWelcomeEmail(
	params: EarlyAccessWelcomeParams,
): Promise<{ sent: boolean; reason?: string }> {
	const { to } = params;
	if (!to) return { sent: false, reason: 'No recipient email' };

	const firstName = (params.name || '').trim().split(/\s+/)[0] || '';

	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	const demoUrl = `${appUrl.replace(/\/$/, '')}/try-demo`;

	const subject = "You're on the Earnest early-access list";

	// Dynamic values are passed raw — the MJML template HTML-escapes them via
	// Handlebars {{ }}. `text` supplies the plaintext part (renderer falls back
	// to a stripped-HTML version if omitted).
	const { html, text } = await renderBrandedTemplate('early-access-welcome', {
		subject,
		preheader: "Thanks for requesting early access — here's what happens next.",
		firstName,
		name: params.name || '',
		ctaUrl: demoUrl,
		text: `${firstName ? `Hi ${firstName},` : 'Hi there,'}\n\nThanks for requesting early access to Earnest — the calm, AI-native workspace for running your business. We're inviting new users in small batches while we finish production, and you're in the queue.\n\nWhat happens next: we'll email you a personal invite with a link to set up your workspace. In the meantime you can explore a live demo — no account needed:\n${demoUrl}\n\nQuestions, or want to jump the line? Just reply to this email — a real person reads it.`,
	});

	const res = await sendBrandedEmail({
		to,
		subject,
		html,
		text,
		categories: ['transactional', 'early-access-welcome'],
		emailName: 'early-access-welcome',
	});
	if (!res.sent) {
		console.warn('[early-access-email] Send failed (non-fatal):', res.reason);
	}
	return res;
}
