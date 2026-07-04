// server/api/email/preview-mjml.get.ts
/**
 * Dev/QA preview for the local MJML transactional templates.
 *
 *   GET /api/email/preview-mjml?template=<name>&brand=earnest|org
 *       ?format=json   → { html, text, errors } instead of raw HTML
 *       ?org=<id>      → pull real org brand (logo/color) instead of the sample
 *
 * Renders each template with representative sample data through the exact
 * same `renderBrandedTemplate` path the senders use, so what you see here
 * is what ships. Open in dev; auth-gated in prod (sample data only, but the
 * ?org fetch touches a real org row).
 */

import { renderBrandedTemplate, type BrandContext } from '~~/server/utils/email-templates';
import { fetchOrgBrand } from '~~/server/utils/email-send';
import type { OrgBrandRef } from '~~/server/utils/email-shell';

export const TRANSACTIONAL_TEMPLATES = [
	'welcome',
	'invite',
	'notification',
	'password-reset',
	'video-invite',
	'generic',
	'meeting-invited',
	'meeting-time-changed',
	'meeting-removed',
	'meeting-cancelled',
	'meeting-reminder',
] as const;

type TemplateName = (typeof TRANSACTIONAL_TEMPLATES)[number];

const SAMPLE_ORG: OrgBrandRef = {
	id: 'sample',
	name: 'Northwind Studio',
	logo: null,
	brand_color: '#4f46e5',
	whitelabel: false,
	website: 'https://example.com',
	mailing_address: '123 Market St, Suite 400, Portland, OR 97204',
};

function meetingSample() {
	// Fixed offset from a stable base — Date.now() is unavailable in some
	// sandboxes and we only need plausible-looking copy here.
	const start = new Date('2026-08-14T15:00:00Z');
	const prev = new Date('2026-08-12T10:00:00Z');
	const fmt = (d: Date) => ({
		date: d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
		time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }),
	});
	const s = fmt(start);
	const p = fmt(prev);
	return {
		recipientName: 'Alex',
		hostName: 'Jordan Lee',
		kindLabel: 'meeting',
		meetingTitle: 'Brand strategy review',
		date: s.date,
		time: s.time,
		duration: 45,
		prevDate: p.date,
		prevTime: p.time,
		ctaUrl: 'https://app.earnest.guru/meetings/sample',
	};
}

function sampleVars(name: TemplateName): Record<string, any> {
	switch (name) {
		case 'welcome':
			return {
				subject: 'Welcome to Earnest — Northwind Studio is ready',
				preheader: 'Northwind Studio is set up on the Studio plan.',
				firstName: 'Alex',
				orgName: 'Northwind Studio',
				planLabel: 'Studio',
				ctaUrl: 'https://app.earnest.guru/',
			};
		case 'invite':
			return {
				subject: 'Northwind Studio invited you to join their team on Earnest',
				preheader: 'Northwind Studio invited you to Earnest.',
				heading: "You're invited to Northwind Studio",
				introHtml: '<strong>Jordan Lee</strong> (jordan@example.com) invited you to <strong>Northwind Studio</strong>. Click below to set your password and finish creating your account.',
				roleLabel: 'Member',
				ctaUrl: 'https://app.earnest.guru/auth/accept-org-invite?membership=sample',
			};
		case 'notification':
			return {
				subject: 'New comment on Brand refresh',
				preheader: 'Jordan Lee commented on a ticket you follow.',
				heading: 'New comment on Brand refresh',
				recipientName: 'Alex',
				bodyHtml: 'Jordan Lee left a comment: “Can we push the launch banner live by Friday?”',
				ctaUrl: 'https://app.earnest.guru/tickets/sample',
				ctaLabel: 'View ticket',
			};
		case 'password-reset':
			return {
				subject: 'Reset your Earnest password',
				preheader: 'Set a new password for your Earnest account. Link expires in 1 hour.',
				heading: 'Reset your password',
				firstName: 'Alex',
				orgName: 'Northwind Studio',
				ctaUrl: 'https://app.earnest.guru/auth/password-reset?token=sample',
			};
		case 'video-invite':
			return {
				subject: 'Video Meeting Invitation: Brand strategy review',
				preheader: 'Jordan Lee invited you to a video meeting.',
				heading: "You're invited to a video meeting",
				recipientName: 'Alex',
				introHtml: '<strong>Jordan Lee</strong> has invited you to a video meeting.',
				meetingTitle: 'Brand strategy review',
				detailRows: [
					{ label: 'Date', value: 'Friday, August 14, 2026' },
					{ label: 'Time', value: '3:00 PM UTC' },
					{ label: 'Duration', value: '45 minutes' },
				],
				noteHtml: "This meeting link is unique to you. Don't share it with others unless you want them to join.",
				ctaUrl: 'https://app.earnest.guru/meetings/sample',
				ctaLabel: 'Join meeting',
			};
		case 'generic':
			return {
				subject: 'A quick update from Northwind Studio',
				preheader: 'A quick update from Northwind Studio.',
				heading: 'A quick update',
				bodyHtml: '<p style="margin:0 0 12px;">Hi Alex,</p><p style="margin:0 0 12px;">This is an AI-composed message wrapped in the branded chrome. It can contain <strong>rich HTML</strong> and multiple paragraphs.</p>',
				ctaUrl: 'https://app.earnest.guru/',
				ctaLabel: 'Open Earnest',
			};
		case 'meeting-invited': {
			const m = meetingSample();
			return { subject: `Meeting: ${m.meetingTitle}`, preheader: 'You were added to a meeting.', heading: "You've been added to a meeting", ...m };
		}
		case 'meeting-time-changed': {
			const m = meetingSample();
			return { subject: `Rescheduled: ${m.meetingTitle}`, preheader: 'A meeting was rescheduled.', heading: 'Meeting time changed', ...m };
		}
		case 'meeting-removed': {
			const m = meetingSample();
			return { subject: `Removed: ${m.meetingTitle}`, preheader: 'You were removed from a meeting.', heading: 'You were removed from a meeting', ...m };
		}
		case 'meeting-cancelled': {
			const m = meetingSample();
			return { subject: `Cancelled: ${m.meetingTitle}`, preheader: 'A meeting was cancelled.', heading: 'Meeting cancelled', ...m };
		}
		case 'meeting-reminder': {
			const m = meetingSample();
			return { subject: `Starting in 15 minutes: ${m.meetingTitle}`, preheader: 'Your meeting starts soon.', heading: 'Your meeting starts in 15 minutes', ...m };
		}
	}
}

export default defineEventHandler(async (event) => {
	if (!import.meta.dev) {
		await requireUserSession(event);
	}

	const query = getQuery(event);
	const name = String(query.template || 'welcome') as TemplateName;
	if (!TRANSACTIONAL_TEMPLATES.includes(name)) {
		throw createError({ statusCode: 400, message: `Unknown template "${name}". Valid: ${TRANSACTIONAL_TEMPLATES.join(', ')}` });
	}

	const brandMode = String(query.brand || 'earnest');
	let brand: BrandContext = {};
	if (query.org) {
		const org = await fetchOrgBrand(String(query.org));
		brand = { org };
	} else if (brandMode === 'org') {
		brand = { org: SAMPLE_ORG };
	}

	const vars = sampleVars(name);
	// The renderer resolves the Earnest logo to an absolute prod URL, which
	// isn't reachable from a local dev preview. Point it at the local file so
	// the preview shows it; real sends always use the absolute URL.
	if (import.meta.dev) (vars as any).earnestLogoUrl = '/email/earnest-logo.png';

	const { html, text, errors } = await renderBrandedTemplate(name, vars, brand);

	if (String(query.format) === 'json') {
		return { template: name, brand: brandMode, errors, html, text };
	}

	setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
	return html;
});
