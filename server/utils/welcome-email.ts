/**
 * Send the org-welcome transactional email.
 *
 * Earnest is the sender on this one — fresh signup, the user just paid
 * Earnest. So we render with Earnest chrome (no org brand context passed to
 * renderBrandedTemplate → server/emails/welcome.mjml).
 *
 * Non-fatal: returns silently on any failure (missing API key, send error).
 */
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';

interface WelcomeEmailParams {
	to: string;
	firstName?: string | null;
	orgName: string;
	plan: string;
	dashboardUrl?: string;
}

export async function sendOrgWelcomeEmail(params: WelcomeEmailParams): Promise<{ sent: boolean; reason?: string }> {
	const { to, firstName, orgName, plan } = params;
	if (!to) return { sent: false, reason: 'No recipient email' };

	const config = useRuntimeConfig() as any;
	const appUrl = config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
	const dashboardUrl = params.dashboardUrl || `${appUrl}/`;

	const planLabel = plan === 'free' ? 'Free' : plan.charAt(0).toUpperCase() + plan.slice(1);

	// Dynamic values are passed raw — the MJML template (server/emails/welcome.mjml)
	// HTML-escapes them via Handlebars {{ }}.
	const { html, text } = await renderBrandedTemplate('welcome', {
		subject: `Welcome to Earnest — ${orgName} is ready`,
		preheader: `${orgName} is set up on the ${planLabel} plan.`,
		firstName: firstName || '',
		orgName,
		planLabel,
		ctaUrl: dashboardUrl,
		text: `${firstName ? `Hi ${firstName},` : 'Hi there,'}\n\nYour organization ${orgName} is set up on the ${planLabel} plan and ready to go.\n\nOpen your dashboard: ${dashboardUrl}\n\nQuestions? Just reply to this email — a real person reads it.`,
	});

	const res = await sendBrandedEmail({
		to,
		subject: `Welcome to Earnest — ${orgName} is ready`,
		html,
		text,
		categories: ['transactional', 'welcome'],
	});
	if (!res.sent) {
		console.warn('[welcome-email] Send failed (non-fatal):', res.reason);
	}
	return res;
}
