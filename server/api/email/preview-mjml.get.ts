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
import { escapeHtml, type OrgBrandRef } from '~~/server/utils/email-shell';
import { ctaLabelFor } from '~~/server/utils/notification-emails';
import type { NotificationCategory } from '~~/server/utils/notification-categories';

export const TRANSACTIONAL_TEMPLATES = [
	'welcome',
	'early-access-welcome',
	'invite',
	'notification',
	'password-reset',
	'token-purchase',
	'video-invite',
	'generic',
	'meeting-invited',
	'meeting-time-changed',
	'meeting-removed',
	'meeting-cancelled',
	'meeting-reminder',
] as const;

type TemplateName = (typeof TRANSACTIONAL_TEMPLATES)[number];

/**
 * Every notification category renders through the single `notification.mjml`
 * template (via server/utils/notification-emails.ts). The preview exposes each
 * one as a `notification:<category>` variant so all nine are individually
 * reviewable with content that mirrors what the app actually sends
 * (subject/heading/body/CTA come from notificationRecipients.ts +
 * CATEGORY_CTA). Selectable in preview-transactional.vue.
 */
export const NOTIFICATION_CATEGORIES = [
	'conversations',
	'reactions',
	'tickets',
	'tasks',
	'projects',
	'invoices',
	'contracts',
	'proposals',
	'meetings',
] as const satisfies readonly NotificationCategory[];

const APP = 'https://app.earnest.guru';

// Representative (subject, plain-text body, click-through link) per category —
// pulled from the real strings in server/utils/notificationRecipients.ts so the
// preview reflects production copy, not invented samples.
const NOTIFICATION_SAMPLES: Record<NotificationCategory, { subject: string; body: string; link: string }> = {
	conversations: { subject: 'New comment on Brand refresh', body: 'Jordan Lee: Can we push the launch banner live by Friday?', link: `${APP}/tickets/T-241` },
	// Faithful to notificationRecipients.ts: the reaction message says "Someone"
	// even though the actor is known (see findings report — a copy weakness).
	reactions: { subject: 'New reaction', body: 'Someone reacted 🎉 to your comment', link: `${APP}/tickets/T-241` },
	tickets: { subject: 'Ticket status: In Progress', body: 'Brand refresh — landing page hero', link: `${APP}/tickets/T-241` },
	tasks: { subject: 'You were assigned to a task', body: 'Draft the August newsletter', link: `${APP}/projects/P-12` },
	projects: { subject: 'Project completed', body: '"Website redesign" has been marked complete.', link: `${APP}/projects/P-12` },
	invoices: { subject: 'Invoice paid: INV-1042', body: 'Invoice INV-1042 has been paid.', link: `${APP}/invoices/INV-1042` },
	contracts: { subject: 'Contract signed: MSA-2026', body: '"MSA-2026" has been signed.', link: `${APP}/contracts/C-30` },
	proposals: { subject: 'Proposal accepted: PRO-88', body: '"PRO-88" was accepted.', link: `${APP}/proposals/PRO-88` },
	// Meetings normally ship via the bespoke meeting-* templates; this covers the
	// generic notification path (e.g. an appointment status change).
	meetings: { subject: 'Meeting scheduled: Brand strategy review', body: 'Brand strategy review — Friday, August 14 at 3:00 PM EDT', link: `${APP}/meetings/M-7` },
};

/**
 * Build the exact `notification.mjml` vars that
 * server/utils/notification-emails.ts → sendNotificationEmail would produce for
 * a given category, so the preview is faithful to a real send (heading ==
 * subject, HTML-escaped body with <br>, per-category CTA label, explicit
 * plain-text alternative).
 */
function notificationSample(category: NotificationCategory): Record<string, any> {
	const { subject, body, link } = NOTIFICATION_SAMPLES[category];
	const recipientName = 'Alex';
	const label = ctaLabelFor(category);
	const bodyHtml = escapeHtml(body).replace(/\n/g, '<br />');
	return {
		subject,
		preheader: body.slice(0, 140),
		heading: subject,
		recipientName,
		bodyHtml,
		ctaUrl: link,
		ctaLabel: label,
		text: `Hi ${recipientName},\n\n${body}${link ? `\n\n${label}: ${link}` : ''}`,
	};
}

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
		case 'early-access-welcome':
			return {
				subject: "You're on the Earnest early-access list",
				preheader: "Thanks for requesting early access — here's what happens next.",
				firstName: 'Alex',
				name: 'Alex Rivera',
				ctaUrl: 'https://app.earnest.guru/try-demo',
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
		case 'token-purchase':
			return {
				subject: 'Your Earnest token top-up is confirmed',
				preheader: '500,000 tokens added to Northwind Studio.',
				heading: 'Your tokens are ready',
				firstName: 'Alex',
				orgName: 'Northwind Studio',
				packageName: '500K Tokens',
				tokensAddedFormatted: '500,000 tokens',
				newBalanceFormatted: '612,480 tokens',
				ctaUrl: 'https://app.earnest.guru/organization?tab=ai-usage',
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
	const rawName = String(query.template || 'welcome');

	// `notification:<category>` variants render the shared notification.mjml with
	// per-category sample content; everything else is a 1:1 template name.
	let renderName: TemplateName = 'welcome';
	let vars: Record<string, any>;
	if (rawName.startsWith('notification:')) {
		const category = rawName.slice('notification:'.length) as NotificationCategory;
		if (!NOTIFICATION_CATEGORIES.includes(category)) {
			throw createError({ statusCode: 400, message: `Unknown notification category "${category}". Valid: ${NOTIFICATION_CATEGORIES.join(', ')}` });
		}
		renderName = 'notification';
		vars = notificationSample(category);
	} else {
		const name = rawName as TemplateName;
		if (!TRANSACTIONAL_TEMPLATES.includes(name)) {
			throw createError({ statusCode: 400, message: `Unknown template "${name}". Valid: ${TRANSACTIONAL_TEMPLATES.join(', ')}` });
		}
		renderName = name;
		vars = sampleVars(name);
	}

	const brandMode = String(query.brand || 'earnest');
	let brand: BrandContext = {};
	if (query.org) {
		const org = await fetchOrgBrand(String(query.org));
		brand = { org };
	} else if (brandMode === 'org') {
		brand = { org: SAMPLE_ORG };
	}

	// The glass background is app-hosted (public/email), so it resolves to an
	// absolute prod URL that isn't reachable from a local dev preview — point it
	// at the local file. The logo + early-access imagery are Directus-hosted
	// (absolute public URLs), so they render as-is in dev and need no override.
	if (import.meta.dev) {
		(vars as any).glassBgUrl = '/email/bg-glass.jpg';
	}

	const { html, text, errors } = await renderBrandedTemplate(renderName, vars, brand);

	if (String(query.format) === 'json') {
		return { template: rawName, brand: brandMode, errors, html, text };
	}

	setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
	return html;
});
