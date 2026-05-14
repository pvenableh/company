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
	| 'video-invite'
	| 'marketing-touch'
	| 'newsletter';

const TEMPLATES: TemplateName[] = [
	'welcome',
	'notification',
	'meeting-invited',
	'meeting-time-changed',
	'meeting-cancelled',
	'meeting-removed',
	'meeting-reminder',
	'video-invite',
	'marketing-touch',
	'newsletter',
];

const SAMPLE_UNSUBSCRIBE_URL = 'https://app.earnest.guru/unsubscribe?token=preview-sample-token';

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
		case 'marketing-touch': {
			const physicalAddress = org?.mailing_address || '123 Main St, Suite 100\nSan Francisco, CA 94105';
			return renderOrgEmail({
				org,
				subject: 'A quick note from the studio',
				preheader: 'Sharing what we shipped this quarter.',
				heading: null,
				bodyHtml: `
					<p style="margin:0 0 12px;">Hi Jane,</p>
					<p style="margin:0 0 12px;">We just wrapped a packed quarter — three brand launches, a site redesign for a long-time client, and a new identity system we're particularly proud of.</p>
					<p style="margin:0 0 12px;">If any of this resonates, hit reply — we're booking work for the back half of the year and would love to hear what you're up to.</p>
					<p style="margin:0 0 12px;">— ${escapeHtml(orgName)}</p>
				`,
				unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL,
				physicalAddress,
			});
		}
		case 'newsletter': {
			const physicalAddress = org?.mailing_address || '123 Main St, Suite 100\nSan Francisco, CA 94105';
			return renderOrgEmail({
				org,
				subject: `The ${orgName} Quarterly`,
				preheader: 'What we made, what we learned, and what is next.',
				heading: null,
				bodyHtml: `
					<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#141210;">Q2 dispatch</h2>
					<p style="margin:0 0 12px;">A short read on what's shipped, what's planned, and the work we're most excited about.</p>
					<h3 style="margin:24px 0 8px;font-size:16px;color:#141210;">Recent work</h3>
					<ul style="margin:0 0 12px;padding-left:20px;"><li>Brand for a regional bakery — wordmark, packaging, and signage.</li><li>Site rebuild for a 20-person SaaS company.</li><li>Identity system for a new podcast network.</li></ul>
					<h3 style="margin:24px 0 8px;font-size:16px;color:#141210;">Looking ahead</h3>
					<p style="margin:0 0 12px;">We're picking up two new engagements in Q3 and have room for one more. If you've been waiting on a project, now's a good time to reach out.</p>
				`,
				cta: { label: 'See the full case study', url: 'https://app.earnest.guru/work/sample' },
				unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL,
				physicalAddress,
			});
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
