// server/api/email/preview-motivational-digest.get.ts
/**
 * Dev/QA preview for the motivational digest email.
 *
 *   GET /api/email/preview-motivational-digest?tone=motivational|forward|wins
 *       ?org=<id>   → render with a real org's brand
 *       ?format=json → { html } instead of raw HTML
 *
 * Uses a representative sample payload (no Directus needed) through the exact
 * renderDigestBodyHtml + generic-template path the cron's direct-send uses, so
 * what you see here is what ships. Open in dev; auth-gated in prod.
 */

import { renderBrandedTemplate } from '~~/server/utils/email-templates';
import { fetchOrgBrand } from '~~/server/utils/email-send';
import { renderDigestBodyHtml } from '~~/server/utils/motivational-digest-email';
import { composeDigestCopy } from '~~/server/utils/motivational-digest-ai';
import type { DigestPayload } from '~~/server/utils/motivational-digest';
import { DEFAULT_DIGEST_SECTIONS, type DigestTone } from '~~/shared/digest';

function samplePayload(tone: DigestTone, leadWithActions: boolean): DigestPayload {
	const enabledSections = [...DEFAULT_DIGEST_SECTIONS]; // includes 'actions'
	return {
		userId: 'sample',
		orgId: 'sample',
		orgName: 'Acme Studio',
		tone,
		enabledSections,
		leadWithActions,
		lean: leadWithActions && enabledSections.includes('actions'),
		wins: { tasksDone: 4, ticketsClosed: 2, sampleTitle: 'Ship the homepage hero', any: true },
		score: { currentScore: 78, level: 4, levelTitle: 'Devoted', streak: 6, daysActiveThisWeek: 4, totalEp: 1240 },
		suggestions: [
			{ title: 'Finish the launch banner copy', description: 'Due today', priority: 'urgent', entityType: 'task', entityId: '1042' },
			{ title: 'Reply to Jordan on the support ticket', description: 'Waiting since yesterday', priority: 'high', entityType: 'ticket', entityId: '318' },
			{ title: 'Review the homepage hero task', description: 'Blocking the rest of the sprint', priority: 'medium', entityType: 'task', entityId: '1055' },
		],
		sections: {
			tasks: { dueSoon: 3, overdue: 1 },
			tickets: { open: 5, overdue: 2 },
			projects: { active: 6, sampleTitles: ['Website refresh', 'Q3 campaign'] },
			proposals: { liveValue: 48500, liveCount: 4, wonValue: 22000, cold: 2, coldTitles: ['Northwind rebrand', 'Globex retainer'] },
			contracts: { awaitingSignature: 1, titles: ['Globex MSA'] },
			invoices: { outstanding: 27400, unpaidCount: 6, overdueCount: 2, overdueAmount: 8200, collectedThisWeek: 12500 },
			clients: { total: 12 },
			crm: {
				leads: { open: 7, pipelineValue: 63000, overdueFollowUps: 2, won: 3 },
				carddesk: { contacts: 41, hot: 5, streak: 9 },
			},
			feedback: { csatCount: 3, csatAvg: 4.7 },
			marketing: { studioCreated: 6, inReview: 2, emails: 2 },
		},
		hasContent: true,
	};
}

export default defineEventHandler(async (event) => {
	if (!import.meta.dev) {
		await requireUserSession(event);
	}

	const q = getQuery(event);
	const tone = (['motivational', 'forward', 'wins'].includes(String(q.tone)) ? q.tone : 'forward') as DigestTone;
	// ?lead=1 (or ?style=actions, kept as an alias) → lead with the action list.
	const leadWithActions = q.lead === '1' || q.lead === 'true' || q.style === 'actions';
	const org = q.org ? await fetchOrgBrand(String(q.org)) : null;

	const payload = samplePayload(tone, leadWithActions);
	// ?ai=1 exercises the LLM-written intro (needs NUXT_LLM_API_KEY; falls back to
	// the template copy on any failure).
	const introOverride = (q.ai === '1' || q.ai === 'true') ? await composeDigestCopy(payload, 'Camila') : null;
	const { subject, heading, bodyHtml, text } = renderDigestBodyHtml(payload, 'Camila', 'https://app.earnest.guru', introOverride);

	const { html } = await renderBrandedTemplate('generic', {
		subject,
		preheader: 'Your daily read on projects, tasks, proposals and more.',
		heading,
		bodyHtml,
		ctaUrl: 'https://app.earnest.guru',
		ctaLabel: 'Open Earnest',
		text,
	}, { org });

	if (q.format === 'json') return { subject, html };

	setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
	return html;
});
