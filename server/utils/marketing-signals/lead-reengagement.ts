/**
 * Lead-reengagement signal extractor.
 *
 * Pulls qualified leads that have been quiet for 30+ days and clusters
 * them by `project_type` (the closest stand-in for an interest topic on
 * this schema). Each cluster of size ≥3 becomes a candidate.
 *
 * v1 simplification: clustering is exact-match on `project_type` (case-
 * normalized). Tag-based or LLM-based clustering can come later.
 */
import { readItems } from '@directus/sdk';
import type { RecommendationCandidate } from './types';

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const MIN_CLUSTER_SIZE = 3;
const MAX_CLUSTERS_PER_ORG = 2;

function daysBetween(a: Date, b: Date): number {
	return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
	if (!c) return 'Lead';
	return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Lead';
}

function normalizeTopic(s: string): string {
	return s.trim().replace(/\s+/g, ' ');
}

function topicToSourcesSummary(stages: string[]): string {
	const counts: Record<string, number> = {};
	for (const s of stages) {
		const k = s || 'unknown';
		counts[k] = (counts[k] || 0) + 1;
	}
	return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
}

export async function extractLeadReengagementCandidates(
	organizationId: string,
): Promise<RecommendationCandidate[]> {
	const directus = getTypedDirectus();
	const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

	let leads: any[] = [];
	try {
		leads = await directus.request(
			readItems('leads', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ stage: { _eq: 'qualified' } },
						{ is_junk: { _neq: true } },
						{ project_type: { _nnull: true } },
						{ date_updated: { _lt: thirtyDaysAgo } },
					],
				},
				fields: [
					'id',
					'project_type',
					'source',
					'date_updated',
					'related_contact.id',
					'related_contact.first_name',
					'related_contact.last_name',
					'related_contact.email_unsubscribed_at',
					'related_contact.email_bounced',
				],
				limit: 200,
			}),
		) as any[];
	} catch (err: any) {
		console.warn('[marketing-signals/lead-reengagement] leads query failed:', err.message);
		return [];
	}

	// Drop leads whose contact is unsubscribed or bounced.
	const eligible = leads.filter((l) => {
		const c = l.related_contact;
		if (!c) return false;
		if (c.email_unsubscribed_at) return false;
		if (c.email_bounced) return false;
		return true;
	});

	if (eligible.length < MIN_CLUSTER_SIZE) return [];

	// Cluster by normalized project_type.
	const clusters = new Map<string, any[]>();
	for (const l of eligible) {
		const topic = normalizeTopic(String(l.project_type || ''));
		if (!topic) continue;
		const key = topic.toLowerCase();
		if (!clusters.has(key)) clusters.set(key, []);
		clusters.get(key)!.push({ ...l, _topic: topic });
	}

	const now = new Date();
	const candidates: RecommendationCandidate[] = [];

	for (const [, members] of clusters) {
		if (members.length < MIN_CLUSTER_SIZE) continue;

		const topic = members[0]._topic as string;
		const gaps: number[] = members.map((l) =>
			l.date_updated ? daysBetween(now, new Date(l.date_updated)) : 365,
		);
		const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
		const samples = members.slice(0, 3).map((l) => fullName(l.related_contact));
		const ids = members.map((l) => l.related_contact?.id).filter(Boolean);
		const sources = topicToSourcesSummary(members.map((l) => l.source || 'unknown'));

		const impactScore = Math.min(85, Math.round(35 + Math.log10(members.length + 1) * 25 + avg * 0.15));

		candidates.push({
			organization: organizationId,
			card_type: 'lead_reengagement',
			candidate_data: {
				type: 'lead_reengagement',
				signal: {
					lead_count: members.length,
					avg_days_inactive: avg,
					min_days_inactive: Math.min(...gaps),
					max_days_inactive: Math.max(...gaps),
				},
				cluster: {
					label: topic,
					size: members.length,
					representative_intent: `Inquired about ${topic.toLowerCase()}`,
					lead_sources_summary: sources,
				},
				audience: {
					size: members.length,
					sample_names: samples,
					contact_ids: ids,
				},
				recency_days: 7,
				impact_score: impactScore,
				deliverables: '1 case-study email',
				token_estimate: 1400,
			},
			impact_score: impactScore,
			recency_days: 7,
			why_now: `${members.length} ${topic.toLowerCase()} leads have been inactive an average of ${avg} days.`,
			token_estimate: 1400,
			deliverables: '1 case-study email',
		});
	}

	// Limit per org so we don't drown the feed in clusters.
	candidates.sort((a, b) => b.impact_score - a.impact_score);
	return candidates.slice(0, MAX_CLUSTERS_PER_ORG);
}
