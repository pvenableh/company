/**
 * Send the org-welcome transactional email.
 *
 * Earnest is the sender on this one — fresh signup, the user just paid
 * Earnest. So we use renderEarnestEmail, not the org-branded shell.
 *
 * Non-fatal: returns silently on any failure (missing API key, send error).
 */
import { renderEarnestEmail, escapeHtml } from './email-shell';
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

	const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';
	const planLabel = plan === 'free' ? 'Free' : plan.charAt(0).toUpperCase() + plan.slice(1);

	const bodyHtml = `
		<p style="margin:0 0 12px;">${greeting}</p>
		<p style="margin:0 0 12px;">Your organization <strong>${escapeHtml(orgName)}</strong> is set up on the <strong>${escapeHtml(planLabel)}</strong> plan and ready to go.</p>
		<p style="margin:0 0 12px;">The dashboard is the fastest way to get started — invite teammates, bring in clients, and start tracking work.</p>
		<p style="margin:16px 0 0;font-size:13px;color:#888;">Questions? Just reply to this email — a real person reads it.</p>
	`;

	const { html, text } = renderEarnestEmail({
		subject: `Welcome to Earnest — ${orgName} is ready`,
		preheader: `${orgName} is set up on the ${planLabel} plan.`,
		heading: `Welcome to Earnest, ${orgName}!`,
		bodyHtml,
		cta: { label: 'Open your dashboard', url: dashboardUrl },
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
