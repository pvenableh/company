// server/api/email/preview.get.ts
/**
 * Stage-1 transactional preview endpoint.
 *
 *   GET /api/email/preview?org=<orgId>&template=<name>
 *
 * Returns rendered HTML so QA can eyeball the branded shell against
 * each transactional template, with sample data:
 *
 *   ?template=welcome          → renderEarnestEmail welcome
 *   ?template=notification     → renderOrgEmail generic notification
 *   ?template=meeting-invited  → meeting invite invited
 *   ?template=meeting-time-changed
 *   ?template=meeting-cancelled
 *   ?template=meeting-reminder
 *   ?template=video-invite     → external-guest video room invite
 *
 *   ?org=...    → org-branded variants pull logo/brand_color/whitelabel
 *                 from the org row. Omit to render with Earnest defaults.
 *   ?format=json (optional)  → returns { html, text } JSON instead of HTML
 *
 * Auth: requires an authenticated session (any signed-in user) — this is
 * a dev/QA tool, not a public endpoint. Stage 3 admin UI will wrap it.
 */

import { renderEarnestEmail, renderOrgEmail, escapeHtml, type OrgBrandRef } from '~~/server/utils/email-shell';
import { fetchOrgBrand } from '~~/server/utils/email-send';

type TemplateName =
	| 'welcome'
	| 'notification'
	| 'meeting-invited'
	| 'meeting-time-changed'
	| 'meeting-cancelled'
	| 'meeting-removed'
	| 'meeting-reminder'
	| 'video-invite';

const TEMPLATES: TemplateName[] = [
	'welcome',
	'notification',
	'meeting-invited',
	'meeting-time-changed',
	'meeting-cancelled',
	'meeting-removed',
	'meeting-reminder',
	'video-invite',
];

function sampleDetails() {
	const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
	return {
		title: 'Brand strategy review',
		date: start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
		time: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }),
		durationMinutes: 45,
		joinUrl: 'https://app.earnest.guru/meeting/sample-room',
	};
}

function detailsBlock() {
	const d = sampleDetails();
	return `
		<div style="background:#f7f5f2;padding:16px 20px;border-radius:8px;margin:16px 0;">
			<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#141210;">${escapeHtml(d.title)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Date:</strong> ${escapeHtml(d.date)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Time:</strong> ${escapeHtml(d.time)}</p>
			<p style="margin:0;font-size:14px;color:#444;"><strong>Duration:</strong> ${d.durationMinutes} minutes</p>
		</div>
	`;
}

function renderForTemplate(name: TemplateName, org: OrgBrandRef | null) {
	const d = sampleDetails();
	const joinCta = { label: 'Join meeting', url: d.joinUrl };
	const orgName = org?.name || 'Your team';

	switch (name) {
		case 'welcome': {
			return renderEarnestEmail({
				subject: 'Welcome to Earnest — Sample Studio is ready',
				preheader: 'Sample Studio is set up on the Studio plan.',
				heading: 'Welcome to Earnest, Sample Studio!',
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;">Your organization <strong>Sample Studio</strong> is set up on the <strong>Studio</strong> plan and ready to go.</p>
					<p style="margin:0 0 12px;">The dashboard is the fastest way to get started — invite teammates, bring in clients, and start tracking work.</p>
				`,
				cta: { label: 'Open your dashboard', url: 'https://app.earnest.guru/' },
			});
		}
		case 'notification': {
			const subject = `New comment on project`;
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject,
				heading: subject,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;">Sam left a comment on the brand-direction project: "Loving the second logo direction — let's run with it for the next round."</p>
				`,
				cta: { label: 'View conversation', url: 'https://app.earnest.guru/projects/sample' },
			} as any);
		}
		case 'meeting-invited': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Meeting: ${d.title}`,
				heading: `You've been added to a meeting`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(orgName)}</strong> added you to a meeting.</p>
					${detailsBlock()}
				`,
				cta: joinCta,
			} as any);
		}
		case 'meeting-time-changed': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Rescheduled: ${d.title}`,
				heading: `Meeting time changed`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(orgName)}</strong> rescheduled <strong>${escapeHtml(d.title)}</strong>.</p>
					<p style="margin:0 0 12px;color:#888;"><s>Tuesday at 2:00 PM</s></p>
					${detailsBlock()}
				`,
				cta: joinCta,
			} as any);
		}
		case 'meeting-cancelled': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Cancelled: ${d.title}`,
				heading: `Meeting cancelled`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(orgName)}</strong> cancelled <strong>${escapeHtml(d.title)}</strong> (${escapeHtml(d.date)} at ${escapeHtml(d.time)}).</p>
				`,
			} as any);
		}
		case 'meeting-removed': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Removed: ${d.title}`,
				heading: `You were removed from a meeting`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(orgName)}</strong> removed you from <strong>${escapeHtml(d.title)}</strong> (${escapeHtml(d.date)} at ${escapeHtml(d.time)}).</p>
				`,
			} as any);
		}
		case 'meeting-reminder': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Starting in 15 minutes: ${d.title}`,
				heading: `Your meeting starts in 15 minutes`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(d.title)}</strong> begins at ${escapeHtml(d.time)}.</p>
					${detailsBlock()}
				`,
				cta: joinCta,
			} as any);
		}
		case 'video-invite': {
			return (org ? renderOrgEmail : renderEarnestEmail)({
				...(org ? { org } : {}),
				subject: `Video Meeting Invitation: ${d.title}`,
				heading: `You're invited to a video meeting`,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;"><strong>${escapeHtml(orgName)}</strong> has invited you to a video meeting.</p>
					${detailsBlock()}
				`,
				cta: joinCta,
			} as any);
		}
	}
}

export default defineEventHandler(async (event) => {
	// Require a signed-in user — keeps this off the public surface.
	const session = await getUserSession(event);
	if (!session?.user?.id) {
		throw createError({ statusCode: 401, message: 'Sign in to use the preview endpoint' });
	}

	const query = getQuery(event) as {
		org?: string;
		template?: string;
		format?: string;
	};

	const template = (query.template as TemplateName) || 'welcome';
	if (!TEMPLATES.includes(template)) {
		throw createError({
			statusCode: 400,
			message: `Unknown template "${template}". Valid: ${TEMPLATES.join(', ')}`,
		});
	}

	const org = query.org ? await fetchOrgBrand(query.org) : null;
	const rendered = renderForTemplate(template, org);

	if (query.format === 'json') {
		return { template, org: org ? { id: org.id, name: org.name } : null, ...rendered };
	}

	setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8');
	return rendered.html;
});
