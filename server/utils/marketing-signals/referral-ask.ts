/**
 * Referral-ask signal extractor.
 *
 * A finished, real project is the warmest moment to ask a happy client "know
 * anyone who needs similar work?" — cheaper than any cold lead. We scan projects
 * completed 7–60 days ago (past the immediate testimonial window handled by
 * project_complete, before the relationship cools) that carried real value, and
 * emit one referral-ask candidate per client.
 */
import { readItems } from '@directus/sdk';
import type { RecommendationCandidate } from './types';

const DAY = 1000 * 60 * 60 * 24;

function daysBetween(a: Date, b: Date): number {
	return Math.floor((a.getTime() - b.getTime()) / DAY);
}
function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
	if (!c) return 'the client';
	return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'the client';
}

export async function extractReferralAskCandidates(
	organizationId: string,
): Promise<RecommendationCandidate[]> {
	const directus = getTypedDirectus();
	const now = new Date();
	const since = new Date(now.getTime() - 60 * DAY).toISOString();
	const until = new Date(now.getTime() - 7 * DAY).toISOString();

	let projects: any[] = [];
	try {
		projects = (await directus.request(
			readItems('projects', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ status: { _eq: 'Completed' } },
						{ date_updated: { _gte: since } },
						{ date_updated: { _lte: until } },
					],
				},
				fields: [
					'id', 'title', 'date_updated', 'contract_value',
					'client.id', 'client.name',
					'client.contacts.id', 'client.contacts.first_name', 'client.contacts.last_name',
					'client.contacts.is_billing_contact', 'client.contacts.category',
				],
				sort: ['-date_updated'],
				limit: 10,
			}),
		)) as any[];
	} catch (err: any) {
		console.warn('[marketing-signals/referral-ask] projects query failed:', err.message);
		return [];
	}

	const out: RecommendationCandidate[] = [];
	const seenClients = new Set<string>();

	for (const p of projects || []) {
		const completedAt = p.date_updated ? new Date(p.date_updated) : null;
		if (!completedAt) continue;
		const days = daysBetween(now, completedAt);
		if (days < 7 || days > 60) continue;

		const clientId = p.client?.id ? String(p.client.id) : null;
		if (!clientId || seenClients.has(clientId)) continue; // one referral ask per client
		seenClients.add(clientId);

		const clientName = (p.client?.name as string | undefined) || 'the client';
		const contacts = (p.client?.contacts as any[] | undefined) || [];
		const primary =
			contacts.find((c) => c?.is_billing_contact) ||
			contacts.find((c) => c?.category === 'client') ||
			contacts[0] || null;
		const primaryName = fullName(primary);
		const budget = typeof p.contract_value === 'number' ? p.contract_value : 0;

		// Bigger, more recent wins are more referral-worthy.
		const impactScore = Math.min(88, Math.round(46 + (60 - days) * 0.5 + Math.log10(budget + 1) * 5));

		out.push({
			organization: organizationId,
			card_type: 'referral_ask',
			candidate_data: {
				type: 'referral_ask',
				signal: {
					project_title: p.title,
					client_name: clientName,
					primary_contact_name: primaryName,
					days_since_complete: days,
					budget_usd: budget,
				},
				audience: {
					size: primary ? 1 : 0,
					sample_names: primary ? [primaryName] : [],
					contact_ids: primary?.id ? [String(primary.id)] : [],
				},
				recency_days: days,
				impact_score: impactScore,
				deliverables: '1 warm referral-ask email',
				token_estimate: 700,
			},
			impact_score: impactScore,
			recency_days: days,
			why_now: `${clientName}'s "${p.title}" wrapped ${days} days ago — a warm moment to ask a happy client for a referral.`,
			token_estimate: 700,
			deliverables: '1 warm referral-ask email',
		});
	}

	return out;
}
