/**
 * Motivational digest — server-side payload builder.
 *
 * Gathers ONE user's cross-entity roll-up for one org: recent wins, a short
 * suggested-action list, and per-section rollups (tasks, tickets, projects,
 * proposals, contracts, clients). Only the sections the user opted into are
 * computed. Every query is defensive — a failed section yields empty, never a
 * throw, so a partial digest still goes out.
 *
 * Consumed by:
 *   - the in-repo direct-send fallback (renders the MJML template), and
 *   - the earnest-worker (which composes the AI copy from the same structured
 *     payload we enqueue).
 */

import { readItems } from '@directus/sdk';
import { collectRecentWins, collectPersonalAgenda } from './personal-agenda';
import { proposalPursuitState as _pps } from '~~/shared/proposals';
import { levelTitle } from './earnestScoreUser';
import { type DigestStyle, DEFAULT_DIGEST_STYLE, normalizeDigestStyle } from '~~/shared/digest';

export interface DigestSuggestion {
	title: string;
	description: string;
	priority: string;
	entityType?: string;
	entityId?: string;
}

export interface DigestPayload {
	userId: string;
	orgId: string;
	orgName: string | null;
	tone: 'motivational' | 'forward' | 'wins';
	/** How the email is framed — see DigestStyle. Renderer branches on this. */
	style: DigestStyle;
	wins: { tasksDone: number; ticketsClosed: number; sampleTitle: string | null; any: boolean };
	/** Earnest score snapshot for the scoreboard hero (null when no record yet). */
	score: {
		currentScore: number;
		level: number;
		levelTitle: string;
		streak: number;
		daysActiveThisWeek: number;
		totalEp: number;
	} | null;
	suggestions: DigestSuggestion[];
	sections: {
		tasks?: { dueSoon: number; overdue: number };
		tickets?: { open: number; overdue: number };
		projects?: { active: number; sampleTitles: string[] };
		proposals?: { liveValue: number; liveCount: number; wonValue: number; cold: number; coldTitles: string[] };
		contracts?: { awaitingSignature: number; titles: string[] };
		invoices?: { outstanding: number; unpaidCount: number; overdueCount: number; overdueAmount: number; collectedThisWeek: number };
		clients?: { total: number };
		crm?: {
			leads?: { open: number; pipelineValue: number; overdueFollowUps: number; won: number };
			carddesk?: { contacts: number; hot: number; streak: number };
		};
		/** Client feedback from the portal (CSAT) — lives under the People app. */
		feedback?: { csatCount: number; csatAvg: number };
		/**
		 * Marketing = CONTENT CREATION + emails, NOT publishing. Social publishing
		 * is on hold pending Meta/LinkedIn permissions, so we recap Studio pieces
		 * created / awaiting review + marketing emails — never scheduled/published/
		 * failed post counts. See project_social_publishing_killswitch.
		 */
		marketing?: { studioCreated: number; inReview: number; emails: number };
	};
	/** True when there is at least SOMETHING worth emailing about. */
	hasContent: boolean;
}

const money = (n: number) => Math.round(n || 0);

/** Flatten the personal agenda's grouped notices into a flat, ranked list. */
function flattenSuggestions(agenda: Awaited<ReturnType<typeof collectPersonalAgenda>>, limit = 6): DigestSuggestion[] {
	const rank: Record<string, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
	const all: DigestSuggestion[] = [];
	for (const g of agenda.groups) {
		for (const n of g.notices) {
			all.push({ title: n.title, description: n.description, priority: n.priority, entityType: n.entityType, entityId: n.entityId });
		}
	}
	all.sort((a, b) => (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0));
	return all.slice(0, limit);
}

export async function buildDigestPayload(opts: {
	directus: any;
	userId: string;
	orgId: string;
	orgName?: string | null;
	tone: 'motivational' | 'forward' | 'wins';
	sections: string[];
	style?: DigestStyle;
	now?: Date;
}): Promise<DigestPayload> {
	const { directus, userId, orgId, tone } = opts;
	const now = opts.now || new Date();
	const want = new Set(opts.sections);

	const payload: DigestPayload = {
		userId,
		orgId,
		orgName: opts.orgName ?? null,
		tone,
		style: normalizeDigestStyle(opts.style ?? DEFAULT_DIGEST_STYLE),
		wins: { tasksDone: 0, ticketsClosed: 0, sampleTitle: null, any: false },
		score: null,
		suggestions: [],
		sections: {},
		hasContent: false,
	};

	// Earnest score snapshot — always attempted (it anchors the motivational hero).
	try {
		const rows = await directus.request(readItems('earnest_scores' as any, {
			filter: { _and: [{ organization: { _eq: orgId } }, { user_created: { _eq: userId } }] } as any,
			fields: ['total_ep', 'level', 'current_score', 'streak', 'best_streak', 'days_active_this_week'] as any,
			limit: 1,
		})).catch(() => []) as any[];
		if (rows[0]) {
			const r = rows[0];
			payload.score = {
				currentScore: Number(r.current_score) || 0,
				level: Number(r.level) || 1,
				levelTitle: levelTitle(Number(r.level) || 1),
				streak: Number(r.streak) || 0,
				daysActiveThisWeek: Number(r.days_active_this_week) || 0,
				totalEp: Number(r.total_ep) || 0,
			};
		}
	} catch { /* score is non-critical */ }

	// Wins + suggestions lean on the existing personal-agenda helpers.
	if (want.has('wins')) {
		try {
			payload.wins = await collectRecentWins(directus, orgId, userId, now);
		} catch { /* keep zeros */ }
	}
	if (want.has('suggestions')) {
		try {
			const agenda = await collectPersonalAgenda(directus, orgId, userId, now);
			payload.suggestions = flattenSuggestions(agenda);
		} catch { /* keep empty */ }
	}

	const soon = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
	const todayStr = now.toISOString().slice(0, 10);

	// Tasks — due-soon + overdue counts (assigned to this user). [Work app]
	if (want.has('work')) {
		try {
			const [dueSoon, overdue] = await Promise.all([
				directus.request(readItems('tasks' as any, {
					filter: { _and: [
						{ organization_id: { _eq: orgId } },
						{ assigned_to: { directus_users_id: { _eq: userId } } },
						{ status: { _nin: ['done', 'complete', 'completed', 'cancelled', 'canceled', 'archived'] } },
						{ due_date: { _between: [todayStr, soon] } },
					] } as any,
					fields: ['id'] as any, limit: -1,
				})).then((r: any) => r.length).catch(() => 0),
				directus.request(readItems('tasks' as any, {
					filter: { _and: [
						{ organization_id: { _eq: orgId } },
						{ assigned_to: { directus_users_id: { _eq: userId } } },
						{ status: { _nin: ['done', 'complete', 'completed', 'cancelled', 'canceled', 'archived'] } },
						{ due_date: { _lt: todayStr } },
					] } as any,
					fields: ['id'] as any, limit: -1,
				})).then((r: any) => r.length).catch(() => 0),
			]);
			payload.sections.tasks = { dueSoon, overdue };
		} catch { /* skip */ }
	}

	// Tickets — open + overdue. [Work app]
	if (want.has('work')) {
		try {
			const open = await directus.request(readItems('tickets' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ status: { _nin: ['Resolved', 'Closed', 'Cancelled', 'Canceled'] } },
				] } as any,
				fields: ['id', 'due_date'] as any, limit: -1,
			})).catch(() => []) as any[];
			const overdue = open.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < todayStr).length;
			payload.sections.tickets = { open: open.length, overdue };
		} catch { /* skip */ }
	}

	// Projects — active count + a couple of titles. [Work app]
	if (want.has('work')) {
		try {
			const rows = await directus.request(readItems('projects' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ status: { _nin: ['completed', 'Archived'] } },
				] } as any,
				fields: ['id', 'title'] as any, sort: ['-date_updated'] as any, limit: 5,
			})).catch(() => []) as any[];
			const count = await directus.request(readItems('projects' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ status: { _nin: ['completed', 'Archived'] } },
				] } as any,
				fields: ['id'] as any, limit: -1,
			})).then((r: any) => r.length).catch(() => rows.length);
			payload.sections.projects = { active: count, sampleTitles: rows.map((r) => r.title).filter(Boolean).slice(0, 3) };
		} catch { /* skip */ }
	}

	// Proposals — momentum + what's gone cold. [Money app]
	if (want.has('money')) {
		try {
			const rows = await directus.request(readItems('proposals' as any, {
				filter: { organization: { _eq: orgId } } as any,
				fields: ['id', 'title', 'total_value', 'proposal_status', 'date_sent', 'valid_until', 'date_created'] as any,
				limit: 200,
			})).catch(() => []) as any[];
			let liveValue = 0, liveCount = 0, wonValue = 0, cold = 0;
			const coldTitles: string[] = [];
			for (const p of rows) {
				const value = Number(p.total_value) || 0;
				const { state, isCold } = _pps(p as any, now);
				if (state === 'won') wonValue += value;
				else if (state !== 'draft' && state !== 'lost') { liveValue += value; liveCount++; }
				if (isCold) { cold++; if (coldTitles.length < 3 && p.title) coldTitles.push(p.title); }
			}
			payload.sections.proposals = { liveValue: money(liveValue), liveCount, wonValue: money(wonValue), cold, coldTitles };
		} catch { /* skip */ }
	}

	// Contracts — awaiting signature. [Money app]
	if (want.has('money')) {
		try {
			const rows = await directus.request(readItems('contracts' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ contract_status: { _eq: 'sent' } },
				] } as any,
				fields: ['id', 'title'] as any, sort: ['-date_sent'] as any, limit: 10,
			})).catch(() => []) as any[];
			payload.sections.contracts = { awaitingSignature: rows.length, titles: rows.map((r) => r.title).filter(Boolean).slice(0, 3) };
		} catch { /* skip */ }
	}

	// Money — outstanding + overdue (invoices billed by this org) and what was
	// collected in the last week (payments_received), for a positive counterweight.
	if (want.has('money')) {
		try {
			const invoices = await directus.request(readItems('invoices' as any, {
				filter: { _and: [
					{ bill_to: { _eq: orgId } },
					{ status: { _in: ['pending', 'processing'] } },
				] } as any,
				fields: ['id', 'total_amount', 'due_date', 'status'] as any,
				limit: -1,
			})).catch(() => []) as any[];

			let outstanding = 0, overdueCount = 0, overdueAmount = 0;
			for (const inv of invoices) {
				const amt = Number(inv.total_amount) || 0;
				outstanding += amt;
				if (inv.status === 'pending' && inv.due_date && String(inv.due_date).slice(0, 10) < todayStr) {
					overdueCount++;
					overdueAmount += amt;
				}
			}

			const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
			const payments = await directus.request(readItems('payments_received' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ date_received: { _gte: weekAgo } },
				] } as any,
				fields: ['amount'] as any,
				limit: -1,
			})).catch(() => []) as any[];
			const collectedThisWeek = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

			if (invoices.length || collectedThisWeek) {
				payload.sections.invoices = { outstanding: money(outstanding), unpaidCount: invoices.length, overdueCount, overdueAmount: money(overdueAmount), collectedThisWeek: money(collectedThisWeek) };
			}
		} catch { /* skip invoices */ }
	}

	// People — leads/pipeline (org-scoped) + CardDesk networking (user-scoped).
	// Each half only surfaces when there's real activity, so users without
	// CardDesk or a lead pipeline never see an empty row. [People app]
	if (want.has('people')) {
		const crm: NonNullable<DigestPayload['sections']['crm']> = {};
		try {
			const leads = await directus.request(readItems('leads' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ status: { _eq: 'published' } },
					{ converted_to_customer: { _neq: true } },
				] } as any,
				fields: ['id', 'estimated_value', 'next_follow_up', 'stage'] as any,
				limit: -1,
			})).catch(() => []) as any[];
			if (leads.length) {
				let pipelineValue = 0, overdueFollowUps = 0, won = 0, open = 0;
				for (const l of leads) {
					const stage = l.stage;
					if (stage === 'won') { won++; continue; }
					if (stage === 'lost') continue;
					open++;
					pipelineValue += Number(l.estimated_value) || 0;
					if (l.next_follow_up && String(l.next_follow_up).slice(0, 10) < todayStr) overdueFollowUps++;
				}
				if (open || won || pipelineValue) crm.leads = { open, pipelineValue: money(pipelineValue), overdueFollowUps, won };
			}
		} catch { /* skip leads */ }

		try {
			const contacts = await directus.request(readItems('cd_contacts' as any, {
				filter: { _and: [
					{ user_created: { _eq: userId } },
					{ status: { _eq: 'published' } },
				] } as any,
				fields: ['id', 'rating'] as any,
				limit: -1,
			})).catch(() => []) as any[];
			if (contacts.length) {
				const hot = contacts.filter((c) => c.rating === 'hot').length;
				let streak = 0;
				try {
					const xp = await directus.request(readItems('cd_xp_state' as any, {
						filter: { user_created: { _eq: userId } } as any,
						fields: ['streak'] as any, limit: 1,
					})).catch(() => []) as any[];
					streak = Number(xp[0]?.streak) || 0;
				} catch { /* streak best-effort */ }
				crm.carddesk = { contacts: contacts.length, hot, streak };
			}
		} catch { /* skip carddesk */ }

		if (crm.leads || crm.carddesk) payload.sections.crm = crm;

		// Portal feedback — CSAT ratings clients submitted in the last week.
		try {
			const weekAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString();
			const rated = await directus.request(readItems('projects' as any, {
				filter: { _and: [
					{ organization: { _eq: orgId } },
					{ csat_submitted_at: { _gte: weekAgoIso } },
				] } as any,
				fields: ['csat_rating'] as any,
				limit: -1,
			})).catch(() => []) as any[];
			if (rated.length) {
				const sum = rated.reduce((acc, p) => acc + (Number(p.csat_rating) || 0), 0);
				payload.sections.feedback = { csatCount: rated.length, csatAvg: Math.round((sum / rated.length) * 10) / 10 };
			}
		} catch { /* skip feedback */ }
	}

	// Clients — total active. [People app]
	if (want.has('people')) {
		try {
			const total = await directus.request(readItems('clients' as any, {
				filter: { organization: { _eq: orgId } } as any,
				fields: ['id'] as any, limit: -1,
			})).then((r: any) => r.length).catch(() => 0);
			payload.sections.clients = { total };
		} catch { /* skip */ }
	}

	// Marketing — CONTENT CREATION + emails, not publishing. Social publishing is
	// on hold pending permissions (project_social_publishing_killswitch), so we
	// recap Studio pieces created + awaiting review, and marketing emails — never
	// scheduled/published/failed post counts. [Marketing app]
	if (want.has('marketing')) {
		try {
			const weekAgoIso = new Date(now.getTime() - 7 * 86400000).toISOString();
			const [studioCreated, inReview, emails] = await Promise.all([
				directus.request(readItems('social_posts' as any, {
					filter: { _and: [{ organization: { _eq: orgId } }, { date_created: { _gte: weekAgoIso } }] } as any,
					fields: ['id'] as any, limit: -1,
				})).then((r: any) => r.length).catch(() => 0),
				directus.request(readItems('social_posts' as any, {
					filter: { _and: [{ organization: { _eq: orgId } }, { approval_state: { _eq: 'in_review' } }] } as any,
					fields: ['id'] as any, limit: -1,
				})).then((r: any) => r.length).catch(() => 0),
				directus.request(readItems('marketing_campaigns' as any, {
					filter: { _and: [{ organization: { _eq: orgId } }, { type: { _eq: 'campaign' } }, { date_created: { _gte: weekAgoIso } }] } as any,
					fields: ['id'] as any, limit: -1,
				})).then((r: any) => r.length).catch(() => 0),
			]);
			if (studioCreated || inReview || emails) payload.sections.marketing = { studioCreated, inReview, emails };
		} catch { /* skip marketing */ }
	}

	// Decide whether there's anything worth sending.
	const s = payload.sections;
	payload.hasContent = !!(
		payload.wins.any ||
		payload.suggestions.length ||
		(s.tasks && (s.tasks.dueSoon || s.tasks.overdue)) ||
		(s.tickets && s.tickets.open) ||
		(s.projects && s.projects.active) ||
		(s.proposals && (s.proposals.liveCount || s.proposals.cold || s.proposals.wonValue)) ||
		(s.contracts && s.contracts.awaitingSignature) ||
		(s.invoices && (s.invoices.outstanding || s.invoices.collectedThisWeek)) ||
		(s.clients && s.clients.total) ||
		(s.crm && (s.crm.leads || s.crm.carddesk)) ||
		(s.feedback && s.feedback.csatCount) ||
		(s.marketing && (s.marketing.studioCreated || s.marketing.inReview || s.marketing.emails))
	);

	return payload;
}
