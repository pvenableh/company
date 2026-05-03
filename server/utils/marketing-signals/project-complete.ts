/**
 * Project-complete signal extractor.
 *
 * Scans recently completed projects and emits a per-project candidate
 * with a phase tag:
 *   - request_testimonial: 0..10 days since complete, no testimonial yet
 *   - repurpose_to_campaign: 11..28 days since complete (use as case study)
 *
 * v1 simplification: "no testimonial yet" is approximated by NOT querying a
 * testimonials collection (it doesn't reliably exist on this DB). Worst case
 * we surface the same project for both phases over its lifetime — the
 * weekly cadence + the 7-day expires_at window keep this from being noisy.
 */
import { readItems } from '@directus/sdk';
import type { RecommendationCandidate } from './types';

const TWENTY_EIGHT_DAYS_MS = 1000 * 60 * 60 * 24 * 28;

function daysBetween(a: Date, b: Date): number {
	return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
	if (!c) return 'the client lead';
	return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'the client lead';
}

export async function extractProjectCompleteCandidates(
	organizationId: string,
): Promise<RecommendationCandidate[]> {
	const directus = getTypedDirectus();
	const since = new Date(Date.now() - TWENTY_EIGHT_DAYS_MS).toISOString();

	let projects: any[] = [];
	try {
		projects = await directus.request(
			readItems('projects', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ status: { _eq: 'Completed' } },
						{ date_updated: { _gte: since } },
					],
				},
				fields: [
					'id',
					'title',
					'date_updated',
					'date_created',
					'contract_value',
					'client.id',
					'client.name',
					'client.contacts.id',
					'client.contacts.first_name',
					'client.contacts.last_name',
					'client.contacts.is_billing_contact',
					'client.contacts.category',
				],
				sort: ['-date_updated'],
				limit: 10,
			}),
		) as any[];
	} catch (err: any) {
		console.warn('[marketing-signals/project-complete] projects query failed:', err.message);
		return [];
	}

	const now = new Date();
	const out: RecommendationCandidate[] = [];

	for (const p of projects || []) {
		const completedAt = p.date_updated ? new Date(p.date_updated) : null;
		if (!completedAt) continue;
		const days = daysBetween(now, completedAt);
		if (days > 28) continue;
		const phase: 'request_testimonial' | 'repurpose_to_campaign' =
			days <= 10 ? 'request_testimonial' : 'repurpose_to_campaign';

		const clientName = (p.client?.name as string | undefined) || undefined;
		const contacts = (p.client?.contacts as any[] | undefined) || [];
		// Prefer billing contact, then category=client, then first contact.
		const primary =
			contacts.find((c) => c?.is_billing_contact) ||
			contacts.find((c) => c?.category === 'client') ||
			contacts[0] ||
			null;
		const primaryName = fullName(primary);

		const impactScore = Math.min(90, Math.round(50 + (28 - days) * 1.2));

		out.push({
			organization: organizationId,
			card_type: 'project_complete',
			candidate_data: {
				type: 'project_complete',
				phase,
				signal: {
					project_title: p.title,
					client_name: clientName,
					primary_contact_name: primaryName,
					days_since_complete: days,
					budget_usd: typeof p.contract_value === 'number' ? p.contract_value : 0,
				},
				audience: {
					size: phase === 'request_testimonial' ? 1 : 0,
					sample_names: phase === 'request_testimonial' ? [primaryName] : [],
				},
				recency_days: days,
				impact_score: impactScore,
				deliverables:
					phase === 'request_testimonial'
						? '1 testimonial-ask email'
						: '1-2 case-study emails + optionally one social post',
				token_estimate: phase === 'request_testimonial' ? 700 : 2200,
			},
			impact_score: impactScore,
			recency_days: days,
			why_now:
				phase === 'request_testimonial'
					? `${p.title} wrapped ${days} day${days === 1 ? '' : 's'} ago — fresh moment to ask for a testimonial.`
					: `${p.title} is ready to repurpose into a case-study campaign.`,
			token_estimate: phase === 'request_testimonial' ? 700 : 2200,
			deliverables:
				phase === 'request_testimonial'
					? '1 testimonial-ask email'
					: '1-2 case-study emails + optionally one social post',
		});
	}

	return out;
}
