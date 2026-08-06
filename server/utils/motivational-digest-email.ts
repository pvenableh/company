/**
 * Motivational digest — in-repo direct-send fallback.
 *
 * Composes a deterministic, branded HTML digest from a DigestPayload and sends
 * it through the shared `generic` MJML shell. This is the fallback path used
 * when the earnest-worker (which composes richer AI copy from the same payload)
 * isn't running — so a subscriber always gets their morning email.
 *
 * All entity titles are user/client-controlled → escaped before interpolation
 * (the MJML compiler runs Handlebars with noEscape).
 */
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail, fetchOrgBrand } from './email-send';
import { escapeHtml, type OrgBrandRef } from './email-shell';
import type { DigestPayload } from './motivational-digest';
import { composeDigestCopy, type DigestCopy } from './motivational-digest-ai';

const usd = (n: number) => `$${(Math.round(n || 0)).toLocaleString('en-US')}`;

function toneIntro(payload: DigestPayload, firstName: string): { subject: string; heading: string; lead: string } {
	const name = firstName || 'there';
	if (payload.tone === 'motivational') {
		return {
			subject: 'New week, let’s go 💪',
			heading: 'A fresh week, a clean slate',
			lead: `Happy Monday, ${name}! Fresh week, blank canvas — the good kind of blank. Here's where everything stands so you can pick your first win and get rolling.`,
		};
	}
	if (payload.tone === 'wins') {
		return {
			subject: 'Look what you pulled off this week 🎉',
			heading: 'That was a good week',
			lead: `Look at you go, ${name}. 🎉 Before you clock out, here's the week you just had — and a couple of things worth one last peek.`,
		};
	}
	return {
		subject: 'Your day, at a glance ☀️',
		heading: 'Here’s your day ☀️',
		lead: `Morning, ${name}! ☕ Here's the quick lay of the land so you start the day already knowing your next move — no digging required.`,
	};
}

// Action-list framing — leaner and verb-forward. Keeps a light weekday nod
// (fresh-week Monday, wrap-up Friday) without the motivational scaffolding.
function actionIntro(payload: DigestPayload, firstName: string): { subject: string; heading: string; lead: string } {
	const name = firstName || 'there';
	const count = payload.suggestions.length + derivedActionCount(payload);
	const tally = count ? `${count} thing${count === 1 ? '' : 's'} worth doing` : 'a clear slate';
	if (payload.tone === 'motivational') {
		return { subject: `Your Monday action list ✅`, heading: 'Today’s action list', lead: `Fresh week, ${name} — here's ${tally}, in priority order. Knock out the top one first.` };
	}
	if (payload.tone === 'wins') {
		return { subject: `Close out the week ✅`, heading: 'Before you clock out', lead: `Almost there, ${name}. Here's ${tally} to tie a bow on the week.` };
	}
	return { subject: `Your action list for today ✅`, heading: 'Today’s action list', lead: `Morning, ${name} — here's ${tally}, in priority order.` };
}

// Count only, so actionIntro can tally without rebuilding the rows (which need
// appUrl). Mirrors the conditions in derivedActions.
function derivedActionCount(p: DigestPayload): number {
	const s = p.sections;
	let n = 0;
	if (s.contracts?.awaitingSignature) n++;
	if (s.invoices?.overdueCount) n++;
	if (s.proposals?.cold) n++;
	if (s.crm?.leads?.overdueFollowUps) n++;
	return n;
}

// ── Inline lucide icons (the same glyphs the Earnest app uses) ──────────────
// Bodies lifted verbatim from @iconify-json/lucide; they use currentColor, so
// the wrapper's `color` sets the stroke. Inline SVG renders in Apple Mail, Gmail,
// and most modern clients; Outlook ignores it and simply shows the title text.
const ICONS = {
	work: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7m4-7v4m4-4v9"/></g>',
	people: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></g>',
	money: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M16 7h6v6"/><path d="m22 7l-8.5 8.5l-5-5L2 17"/></g>',
	marketing: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2a2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14M8 6v8"/></g>',
	wins: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978m7-7.318v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978M18 9h1.5a1 1 0 0 0 0-5H18M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zm0 0H4.5a1 1 0 0 1 0-5H6"/></g>',
	suggestions: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5h8m-8 7h8m-8 7h8M3 17l2 2l4-4M3 7l2 2l4-4"/>',
} as const;

function lucide(body: string, size = 15, color = '#141210'): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color};vertical-align:-3px;display:inline-block">${body}</svg>`;
}

// Deep-link paths (relative to appUrl) for each roll-up row.
const APP_ROUTES = {
	tasks: '/apps/work?floor=tasks',
	tickets: '/apps/work?floor=tickets',
	projects: '/apps/work?floor=projects',
	proposals: '/apps/money?floor=documents&tab=proposals',
	contracts: '/apps/money?floor=documents&tab=contracts',
	invoices: '/apps/money?floor=invoices',
	payments: '/apps/money?floor=payments',
	clients: '/apps/clients',
	leads: '/apps/clients?view=pipeline',
	carddesk: '/apps/clients?view=carddesk',
	studio: '/apps/marketing?floor=studio',
	campaigns: '/apps/marketing?floor=campaigns',
} as const;

function table(rows: string[]): string {
	return `<table style="width:100%;border-collapse:collapse">${rows.join('')}</table>`;
}

// Deep-link straight to a SPECIFIC entity via the slide-over stack convention
// (`?slide=type:id`, consumed by useAppSlideOverStack). Only the entity kinds
// the personal agenda emits today (task, ticket) map to a slide; anything else
// returns null and the caller falls back to a plain (unlinked) row.
function entityHref(appUrl: string, entityType?: string, entityId?: string): string | null {
	if (!entityType || !entityId) return null;
	const id = encodeURIComponent(entityId);
	switch (entityType) {
		case 'task': return `${appUrl}${APP_ROUTES.tasks}&slide=task:${id}`;
		case 'ticket': return `${appUrl}${APP_ROUTES.tickets}&slide=ticket:${id}`;
		default: return null;
	}
}

// The trailing ↗ open-link, shared by stat rows and checklist rows. Kept as a
// separate glyph (not a wrapped title) so mail clients don't auto-style the
// title text brand-blue/underlined.
function openArrow(href: string): string {
	return ` <a href="${href}" title="Open in Earnest" style="display:inline-block;padding:1px 5px;color:#b3aca4;text-decoration:none;font-size:13px;line-height:1">↗</a>`;
}

// ── Motivational blocks ──────────────────────────────────────────────────────

function winsBlock(p: DigestPayload): string {
	if (!p.wins.any) return '';
	const bits: string[] = [];
	if (p.wins.tasksDone) bits.push(`<strong>${p.wins.tasksDone}</strong> task${p.wins.tasksDone === 1 ? '' : 's'} done`);
	if (p.wins.ticketsClosed) bits.push(`<strong>${p.wins.ticketsClosed}</strong> ticket${p.wins.ticketsClosed === 1 ? '' : 's'} closed`);
	const sample = p.wins.sampleTitle ? ` — including “${escapeHtml(p.wins.sampleTitle)}”` : '';
	return iconCard(ICONS.wins, 'Recent wins', `<p style="margin:0">You wrapped up ${bits.join(' and ')}${sample}. Momentum looks good on you.</p>`);
}

function suggestionsBlock(p: DigestPayload, appUrl: string): string {
	if (!p.suggestions.length) return '';
	const items = p.suggestions
		.map((s) => {
			const href = entityHref(appUrl, s.entityType, s.entityId);
			const link = href ? openArrow(href) : '';
			return `<li style="margin:0 0 6px 0"><strong>${escapeHtml(s.title)}</strong>${link}${s.description ? ` — <span style="color:#6b6560">${escapeHtml(s.description)}</span>` : ''}</li>`;
		})
		.join('');
	return iconCard(ICONS.suggestions, 'Suggested next moves', `<ul style="margin:0;padding-left:18px">${items}</ul>`);
}

// ── Action-list mode ─────────────────────────────────────────────────────────
// A verb-first checklist. Rows come from two sources: the per-item personal
// agenda (tasks/tickets, deep-linked to the exact item) and section-level
// alerts synthesised into a single "do this" line (contracts to sign, invoices
// to chase, cold proposals, overdue lead follow-ups) linked to the app section.

interface ActionRow { html: string; href: string | null }

function derivedActions(p: DigestPayload, appUrl: string): ActionRow[] {
	const s = p.sections;
	const href = (path: string) => `${appUrl}${path}`;
	const out: ActionRow[] = [];
	if (s.contracts?.awaitingSignature) {
		const n = s.contracts.awaitingSignature;
		out.push({ html: `Chase <strong>${n}</strong> contract${n === 1 ? '' : 's'} awaiting signature`, href: href(APP_ROUTES.contracts) });
	}
	if (s.invoices?.overdueCount) {
		out.push({ html: `Chase <strong>${usd(s.invoices.overdueAmount)}</strong> across <strong>${s.invoices.overdueCount}</strong> overdue invoice${s.invoices.overdueCount === 1 ? '' : 's'}`, href: href(APP_ROUTES.invoices) });
	}
	if (s.proposals?.cold) {
		const n = s.proposals.cold;
		out.push({ html: `Follow up on <strong>${n}</strong> proposal${n === 1 ? '' : 's'} that ${n === 1 ? 'has' : 'have'} gone quiet`, href: href(APP_ROUTES.proposals) });
	}
	if (s.crm?.leads?.overdueFollowUps) {
		const n = s.crm.leads.overdueFollowUps;
		out.push({ html: `Reconnect on <strong>${n}</strong> overdue lead follow-up${n === 1 ? '' : 's'}`, href: href(APP_ROUTES.leads) });
	}
	return out;
}

function checklistRow(html: string, href: string | null): string {
	const link = href ? openArrow(href) : '';
	return `<tr>
		<td style="width:20px;padding:6px 0;vertical-align:top;color:#c9c3bb;font-size:15px;line-height:1.4">☐</td>
		<td style="padding:6px 0;color:#141210;font-size:14px;line-height:1.45">${html}${link}</td>
	</tr>`;
}

function actionChecklistBlock(p: DigestPayload, appUrl: string): string {
	const rows: string[] = [];
	// Per-item agenda first (already priority-sorted upstream), each deep-linked.
	for (const s of p.suggestions) {
		const href = entityHref(appUrl, s.entityType, s.entityId);
		const desc = s.description ? ` <span style="color:#8a837c">— ${escapeHtml(s.description)}</span>` : '';
		rows.push(checklistRow(`<strong>${escapeHtml(s.title)}</strong>${desc}`, href));
	}
	// Then the money/people alerts, framed as concrete moves.
	for (const a of derivedActions(p, appUrl)) rows.push(checklistRow(a.html, a.href));
	if (!rows.length) return '';
	return iconCard(ICONS.suggestions, 'Your action list', `<table style="width:100%;border-collapse:collapse">${rows.join('')}</table>`);
}

// Compact one-line rollup that rides beneath the checklist in action mode, so
// the numbers are still a tap away without competing with the to-dos. Respects
// the sections the user opted into (payload.sections only holds computed ones).
function statsFooterBlock(p: DigestPayload, appUrl: string): string {
	const s = p.sections;
	const bits: string[] = [];
	if (s.projects?.active) bits.push(`${s.projects.active} active project${s.projects.active === 1 ? '' : 's'}`);
	if (s.tasks?.dueSoon) bits.push(`${s.tasks.dueSoon} task${s.tasks.dueSoon === 1 ? '' : 's'} due soon`);
	if (s.tickets?.open) bits.push(`${s.tickets.open} open ticket${s.tickets.open === 1 ? '' : 's'}`);
	if (s.invoices?.outstanding) bits.push(`${usd(s.invoices.outstanding)} unpaid`);
	if (s.proposals?.liveCount) bits.push(`${usd(s.proposals.liveValue)} out for review`);
	if (!bits.length) return '';
	return `<div style="margin:0 0 16px 0;padding:12px 16px;background:#faf9f7;border:1px solid #eeeeee;border-radius:12px">
		<p style="margin:0;font-size:12px;line-height:1.5;color:#8a837c"><a href="${appUrl}" style="color:#8a837c;text-decoration:none">By the numbers:</a> ${bits.join(' &nbsp;·&nbsp; ')}</p>
	</div>`;
}

// ── App-shaped blocks (Work · People · Money · Marketing) ────────────────────

function workBlock(p: DigestPayload, appUrl: string): string {
	const s = p.sections;
	const href = (path: string) => `${appUrl}${path}`;
	const rows: string[] = [];
	if (s.projects && s.projects.active) rows.push(statRow('Projects', `${s.projects.active} active${s.projects.sampleTitles.length ? ` · e.g. ${escapeHtml(s.projects.sampleTitles[0])}` : ''}`, href(APP_ROUTES.projects)));
	if (s.tasks && (s.tasks.dueSoon || s.tasks.overdue)) rows.push(statRow('Tasks', `${s.tasks.overdue} overdue · ${s.tasks.dueSoon} due soon`, href(APP_ROUTES.tasks)));
	if (s.tickets && s.tickets.open) rows.push(statRow('Tickets', `${s.tickets.open} open${s.tickets.overdue ? ` · ${s.tickets.overdue} overdue` : ''}`, href(APP_ROUTES.tickets)));
	if (!rows.length) return '';
	return iconCard(ICONS.work, 'Work', table(rows));
}

function peopleBlock(p: DigestPayload, appUrl: string): string {
	const s = p.sections;
	const href = (path: string) => `${appUrl}${path}`;
	const rows: string[] = [];
	if (s.clients && s.clients.total) rows.push(statRow('Clients', `${s.clients.total} active`, href(APP_ROUTES.clients)));
	if (s.crm?.leads) {
		const l = s.crm.leads;
		const overdue = l.overdueFollowUps ? alertLine(`${l.overdueFollowUps} follow-up${l.overdueFollowUps === 1 ? '' : 's'} overdue`) : '';
		rows.push(statRow('Leads', `${l.open} open · ${usd(l.pipelineValue)} in pipeline${l.won ? ` · ${l.won} won` : ''}${overdue}`, href(APP_ROUTES.leads)));
	}
	if (s.crm?.carddesk) {
		const c = s.crm.carddesk;
		const streak = c.streak ? ` · 🔥 ${c.streak}-day streak` : '';
		rows.push(statRow('CardDesk', `${c.contacts} contact${c.contacts === 1 ? '' : 's'}${c.hot ? ` · ${c.hot} hot` : ''}${streak}`, href(APP_ROUTES.carddesk)));
	}
	if (s.feedback && s.feedback.csatCount) {
		const f = s.feedback;
		rows.push(statRow('Feedback', `<span style="color:#3a9152;font-weight:600">${f.csatCount}</span> client rating${f.csatCount === 1 ? '' : 's'} this week · avg ${f.csatAvg.toFixed(1)}★`, href(APP_ROUTES.clients)));
	}
	if (!rows.length) return '';
	return iconCard(ICONS.people, 'People', table(rows));
}

function moneyBlock(p: DigestPayload, appUrl: string): string {
	const s = p.sections;
	const href = (path: string) => `${appUrl}${path}`;
	const rows: string[] = [];
	if (s.proposals && (s.proposals.liveCount || s.proposals.wonValue || s.proposals.cold)) {
		const alert = s.proposals.cold ? alertLine(`${s.proposals.cold} gone quiet — worth a nudge`) : '';
		rows.push(statRow('Proposals', `${usd(s.proposals.liveValue)} out for review (${s.proposals.liveCount})${s.proposals.wonValue ? ` · ${usd(s.proposals.wonValue)} won` : ''}${alert}`, href(APP_ROUTES.proposals)));
	}
	if (s.contracts && s.contracts.awaitingSignature) rows.push(statRow('Contracts', `${s.contracts.awaitingSignature} awaiting signature`, href(APP_ROUTES.contracts)));
	if (s.invoices && (s.invoices.outstanding || s.invoices.unpaidCount)) {
		const overdue = s.invoices.overdueCount ? alertLine(`${s.invoices.overdueCount} overdue · ${usd(s.invoices.overdueAmount)} to chase`) : '';
		rows.push(statRow('Unpaid', `${usd(s.invoices.outstanding)} across ${s.invoices.unpaidCount} invoice${s.invoices.unpaidCount === 1 ? '' : 's'}${overdue}`, href(APP_ROUTES.invoices)));
	}
	if (s.invoices && s.invoices.collectedThisWeek) rows.push(statRow('Collected', `<span style="color:#3a9152;font-weight:600">${usd(s.invoices.collectedThisWeek)}</span> in the last 7 days 🎉`, href(APP_ROUTES.payments)));
	if (!rows.length) return '';
	return iconCard(ICONS.money, 'Money', table(rows));
}

function marketingBlock(p: DigestPayload, appUrl: string): string {
	const mk = p.sections.marketing;
	if (!mk) return '';
	const href = (path: string) => `${appUrl}${path}`;
	const rows: string[] = [];
	// Content creation focus — publishing is on hold (see killswitch memory).
	if (mk.studioCreated || mk.inReview) {
		const review = mk.inReview ? ` · ${mk.inReview} in review` : '';
		rows.push(statRow('Studio', `${mk.studioCreated} piece${mk.studioCreated === 1 ? '' : 's'} created this week${review}`, href(APP_ROUTES.studio)));
	}
	if (mk.emails) rows.push(statRow('Emails', `${mk.emails} campaign${mk.emails === 1 ? '' : 's'} this week`, href(APP_ROUTES.campaigns)));
	if (!rows.length) return '';
	return iconCard(ICONS.marketing, 'Marketing', table(rows));
}

// An action flag (cold proposals, overdue follow-ups) — dropped to its own line,
// smaller + amber, so it reads as "needs attention" rather than a neutral count.
function alertLine(text: string): string {
	return `<div style="margin-top:3px;font-size:12px;line-height:1.4;color:#c2891b">⚠︎ ${escapeHtml(text)}</div>`;
}

function statRow(label: string, value: string, href?: string): string {
	// Only the ↗ glyph is the link — the title stays plain text so mail clients
	// don't auto-style it (underline / brand-blue). The link carries generous
	// padding so it's an easy tap target. (Email-safe text arrow; icon fonts
	// don't render in mail clients.)
	const link = href ? openArrow(href) : '';
	return `<tr>
		<td style="padding:6px 0;vertical-align:top;white-space:nowrap;width:112px"><span style="color:#8a837c;font-size:12px;text-transform:uppercase;letter-spacing:0.4px">${escapeHtml(label)}</span>${link}</td>
		<td style="padding:6px 0;color:#141210;font-size:14px">${value}</td>
	</tr>`;
}

function iconCard(iconBody: string, title: string, inner: string): string {
	// White-on-white: the card matches the email body, held apart only by a hairline
	// border + the faintest shadow. The title carries the app's own lucide glyph.
	return `<div style="margin:0 0 16px 0;padding:16px 18px;background:#ffffff;border:1px solid #eeeeee;border-radius:14px;box-shadow:0 1px 2px rgba(20,18,16,0.04)">
		<p style="margin:0 0 10px 0;font-size:13px;font-weight:600;color:#141210">${lucide(iconBody)} <span style="vertical-align:middle">${escapeHtml(title)}</span></p>
		<div style="font-size:14px;line-height:1.5;color:#141210">${inner}</div>
	</div>`;
}

/** Fire-based activity rating from streak + weekly cadence. */
function activityRating(streak: number, daysActive: number): { emoji: string; label: string } {
	const s = streak || 0;
	const d = daysActive || 0;
	if (s >= 14 || d >= 6) return { emoji: '🔥🔥🔥', label: 'On fire' };
	if (s >= 7 || d >= 4) return { emoji: '🔥🔥', label: 'Rolling' };
	if (s >= 2 || d >= 2) return { emoji: '🔥', label: 'Warming up' };
	return { emoji: '✨', label: 'Fresh start' };
}

/** Scoreboard hero — Earnest score + level + streak/fire rating. */
function scoreboardBlock(p: DigestPayload): string {
	if (!p.score) return '';
	const { currentScore, levelTitle, streak, daysActiveThisWeek } = p.score;
	const rating = activityRating(streak, daysActiveThisWeek);
	const streakLine = streak > 0 ? `${streak}-day streak` : `${daysActiveThisWeek} active day${daysActiveThisWeek === 1 ? '' : 's'} this week`;
	return `<div style="margin:0 0 16px 0;padding:16px 18px;background:#ffffff;border:1px solid #eeeeee;border-radius:14px;box-shadow:0 1px 2px rgba(20,18,16,0.04)">
		<table style="width:100%;border-collapse:collapse">
			<tr>
				<td style="vertical-align:middle">
					<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8a837c">Earnest score</p>
					<p style="margin:2px 0 0 0;font-size:28px;font-weight:700;color:#141210;line-height:1">${currentScore}<span style="font-size:13px;font-weight:500;color:#8a837c"> · ${escapeHtml(levelTitle)}</span></p>
				</td>
				<td style="vertical-align:middle;text-align:right;white-space:nowrap">
					<p style="margin:0;font-size:22px;line-height:1">${rating.emoji}</p>
					<p style="margin:2px 0 0 0;font-size:12px;font-weight:600;color:#141210">${rating.label}</p>
					<p style="margin:1px 0 0 0;font-size:11px;color:#8a837c">${streakLine}</p>
				</td>
			</tr>
		</table>
	</div>`;
}

/**
 * Compose the full inner-HTML body for the digest. Exported for previews.
 * `introOverride` (the AI-written subject/heading/lead) wins over the
 * deterministic template copy when supplied.
 */
export function renderDigestBodyHtml(payload: DigestPayload, firstName: string, appUrl = 'https://app.earnest.guru', introOverride?: DigestCopy | null): { subject: string; heading: string; bodyHtml: string; text: string } {
	const isActions = payload.style === 'actions';
	const intro = introOverride || (isActions ? actionIntro(payload, firstName) : toneIntro(payload, firstName));

	// intro.lead is model- or template-generated text → escape once here (it
	// lands in raw {{{bodyHtml}}}). firstName is passed raw and escaped in the
	// same pass, so there's no double-escaping.
	const leadHtml = `<p style="margin:0 0 16px 0">${escapeHtml(intro.lead)}</p>`;

	// Action mode leads with the checklist and demotes the rollups to a one-line
	// footer; overview mode is the original motivational layout.
	const blocks = isActions
		? [
			leadHtml,
			actionChecklistBlock(payload, appUrl),
			statsFooterBlock(payload, appUrl),
			winsBlock(payload),
		]
		: [
			leadHtml,
			scoreboardBlock(payload),
			winsBlock(payload),
			suggestionsBlock(payload, appUrl),
			workBlock(payload, appUrl),
			peopleBlock(payload, appUrl),
			moneyBlock(payload, appUrl),
			marketingBlock(payload, appUrl),
		];
	const body = blocks.filter(Boolean).join('');

	// Plain-text fallback — screen readers + text-only clients.
	const textParts: string[] = [intro.lead, ''];
	if (isActions) {
		textParts.push('Your action list:');
		payload.suggestions.forEach((s) => textParts.push(`- ${s.title}${s.description ? ` — ${s.description}` : ''}`));
		derivedActions(payload, appUrl).forEach((a) => textParts.push(`- ${stripTags(a.html)}`));
	} else {
		if (payload.wins.any) textParts.push(`Recent wins: ${payload.wins.tasksDone} tasks done, ${payload.wins.ticketsClosed} tickets closed.`);
		if (payload.suggestions.length) {
			textParts.push('', 'Suggested next moves:');
			payload.suggestions.forEach((s) => textParts.push(`- ${s.title}${s.description ? ` — ${s.description}` : ''}`));
		}
	}
	return { subject: intro.subject, heading: intro.heading, bodyHtml: body, text: textParts.join('\n') };
}

/** Strip the small amount of inline markup we put in derived-action html for the plain-text leg. */
function stripTags(html: string): string {
	return html.replace(/<[^>]+>/g, '');
}

export async function sendMotivationalDigest(params: {
	to: string;
	firstName?: string | null;
	payload: DigestPayload;
	org?: OrgBrandRef | null;
	orgId?: string | null;
	appUrl?: string;
	/** When true, the LLM writes the subject/heading/lead (falls back to template on failure). */
	ai?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
	const { to, payload } = params;
	if (!to) return { sent: false, reason: 'No recipient email' };
	if (!payload.hasContent) return { sent: false, reason: 'Nothing to report' };

	const org = params.org ?? (params.orgId ? await fetchOrgBrand(params.orgId) : null);
	const firstName = (params.firstName || '').trim();
	const appUrl = params.appUrl || 'https://app.earnest.guru';
	// AI copy (best-effort) — null on any failure, so we keep the template copy.
	const introOverride = params.ai ? await composeDigestCopy(payload, firstName) : null;
	const { subject, heading, bodyHtml, text } = renderDigestBodyHtml(payload, firstName, appUrl, introOverride);

	const { html, text: renderedText } = await renderBrandedTemplate('generic', {
		subject,
		preheader: 'Your daily read on projects, tasks, proposals and more.',
		heading,
		bodyHtml,
		ctaUrl: appUrl,
		ctaLabel: 'Open Earnest',
		text: `${text}\n\nOpen Earnest: ${appUrl}`,
	}, { org });

	const res = await sendBrandedEmail({
		to,
		subject,
		html,
		text: renderedText || text,
		org,
		categories: ['digest', 'motivational-digest'],
		emailName: 'motivational-digest',
	});
	if (!res.sent) console.warn('[motivational-digest-email] Send failed (non-fatal):', res.reason);
	return res;
}
