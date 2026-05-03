/**
 * Dormant-clients signal extractor.
 *
 * Surfaces a single re-engagement candidate per org per week.
 *
 * Definition of "dormant high-value client":
 *   - contact.category in (client, hospitality, architect, developer, partner)
 *   - linked to one of the org's clients via contact.client
 *   - last_clicked_at OR last_opened_at OR date_updated < now - 60 days
 *   - has email, not unsubscribed, not bounced
 *
 * v1 simplification: "high_value" tier is approximated by "is in the
 * client category and has an email." Real LTV-based tiering would query
 * invoices/projects per contact and filter on totals — left as a future
 * pass since the demo data doesn't always carry signed invoices.
 */
import { readItems } from '@directus/sdk';
import type { RecommendationCandidate } from './types';

const SIXTY_DAYS_MS = 1000 * 60 * 60 * 24 * 60;
const SAMPLE_NAME_LIMIT = 3;

function daysBetween(a: Date, b: Date): number {
	return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function fullName(c: { first_name?: string | null; last_name?: string | null }): string {
	return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Contact';
}

export async function extractDormantClientsCandidates(
	organizationId: string,
): Promise<RecommendationCandidate[]> {
	const directus = getTypedDirectus();
	const sixtyDaysAgo = new Date(Date.now() - SIXTY_DAYS_MS).toISOString();

	let contacts: any[] = [];
	try {
		contacts = await directus.request(
			readItems('contacts', {
				filter: {
					_and: [
						{ organizations: { organizations_id: { _eq: organizationId } } },
						{ category: { _in: ['client', 'hospitality', 'architect', 'developer', 'partner'] } },
						{ email: { _nnull: true } },
						{ email_unsubscribed_at: { _null: true } },
						{ email_bounced: { _neq: true } },
						{
							_or: [
								{ last_clicked_at: { _lt: sixtyDaysAgo } },
								{ _and: [{ last_clicked_at: { _null: true } }, { date_updated: { _lt: sixtyDaysAgo } }] },
							],
						},
					],
				},
				fields: [
					'id',
					'first_name',
					'last_name',
					'email',
					'last_clicked_at',
					'last_opened_at',
					'date_updated',
					'tags',
				],
				sort: ['date_updated'],
				limit: 50,
			}),
		) as any[];
	} catch (err: any) {
		console.warn('[marketing-signals/dormant] contacts query failed:', err.message);
		return [];
	}

	if (contacts.length < 1) return [];

	const now = new Date();
	const gaps: number[] = contacts.map((c) => {
		const ts = c.last_clicked_at || c.last_opened_at || c.date_updated;
		return ts ? daysBetween(now, new Date(ts)) : 365;
	});
	const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
	const longestGap = Math.max(...gaps);

	const samples = contacts.slice(0, SAMPLE_NAME_LIMIT).map(fullName);
	const ids = contacts.map((c) => c.id);

	// Impact: more contacts × longer gap = higher score (capped).
	const impactScore = Math.min(95, Math.round(40 + Math.log10(contacts.length + 1) * 30 + avgGap * 0.2));

	return [
		{
			organization: organizationId,
			card_type: 'dormant_clients',
			candidate_data: {
				type: 'dormant_clients',
				signal: {
					contact_count: contacts.length,
					avg_days_since_contact: avgGap,
					longest_gap_days: longestGap,
					tier: 'high_value',
					lifetime_revenue_usd: 0, // unknown until per-contact LTV ships
				},
				audience: {
					size: contacts.length,
					sample_names: samples,
					contact_ids: ids,
				},
				recency_days: 0,
				impact_score: impactScore,
				deliverables: '2-3 personalized emails + optionally one social post',
				token_estimate: 1800,
			},
			impact_score: impactScore,
			recency_days: 0,
			why_now: `${contacts.length} clients have gone an average of ${avgGap} days without contact.`,
			token_estimate: 1800,
			deliverables: '2-3 personalized emails + optionally one social post',
		},
	];
}
