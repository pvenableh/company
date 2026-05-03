/**
 * Lead-reengagement fact builder.
 *
 * Pulls proof points the org can credibly cite for the cluster's interest
 * topic (e.g. "Brand strategy", "Web redesign"). The cluster's contacts
 * originally inquired about this topic, so the email needs to anchor on
 * recent work in that area.
 *
 * Signal source: candidate_data.cluster.label
 * Match strategy: title/description fuzzy match on the org's completed
 * projects, plus services that contain the cluster keywords.
 */
import { readItems } from '@directus/sdk';
import type { AvailableFact } from './build-dormant-facts';

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32) || 'fact';
}

/**
 * Naive keyword extraction from the cluster label. "Brand strategy" → ['brand', 'strategy'].
 * Filters out obvious stopwords. Used for case-insensitive _icontains matching.
 */
function clusterKeywords(label: string): string[] {
	const STOP = new Set(['and', 'or', 'the', 'for', 'with', 'a', 'an', 'of']);
	return label
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w && w.length > 2 && !STOP.has(w));
}

export interface LeadReengagementCandidate {
	cluster: {
		label: string;
		size?: number;
		representative_intent?: string;
		lead_sources_summary?: string;
	};
	signal?: {
		lead_count?: number;
		avg_days_inactive?: number;
		min_days_inactive?: number;
		max_days_inactive?: number;
	};
	audience: {
		size: number;
		sample_names: string[];
		contact_ids?: string[];
	};
}

export async function buildAvailableFactsForLeadReengagement(args: {
	organizationId: string;
	candidate: LeadReengagementCandidate;
}): Promise<AvailableFact[]> {
	const { organizationId, candidate } = args;
	const directus = getTypedDirectus();
	const facts: AvailableFact[] = [];
	const keywords = clusterKeywords(candidate.cluster?.label || '');
	const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS).toISOString();

	// ── 1. Recent projects matching cluster keywords (top 3) ────────────────
	let projects: any[] = [];
	if (keywords.length > 0) {
		try {
			const orMatches = keywords.flatMap((kw) => [
				{ title: { _icontains: kw } },
				{ description: { _icontains: kw } },
			]);
			projects = await directus.request(
				readItems('projects', {
					filter: {
						_and: [
							{ organization: { _eq: organizationId } },
							{ status: { _eq: 'Completed' } },
							{ date_updated: { _gte: sixMonthsAgo } },
							{ _or: orMatches },
						],
					},
					fields: [
						'id',
						'title',
						'description',
						'date_updated',
						'client.name',
						'service.name',
					],
					sort: ['-date_updated'],
					limit: 3,
				}),
			) as any[];
		} catch (err: any) {
			console.warn('[marketing-facts/lead-reengagement] keyword projects query failed:', err.message);
		}
	}

	// Fallback: just pull the org's most recent completed projects so the
	// generator has something to anchor on rather than fabricating.
	if (projects.length === 0) {
		try {
			projects = await directus.request(
				readItems('projects', {
					filter: {
						_and: [
							{ organization: { _eq: organizationId } },
							{ status: { _eq: 'Completed' } },
						],
					},
					fields: ['id', 'title', 'description', 'date_updated', 'client.name', 'service.name'],
					sort: ['-date_updated'],
					limit: 3,
				}),
			) as any[];
		} catch (err: any) {
			console.warn('[marketing-facts/lead-reengagement] fallback projects query failed:', err.message);
		}
	}

	for (const p of projects || []) {
		const clientName = p.client?.name as string | undefined;
		const serviceName = p.service?.name as string | undefined;
		facts.push({
			id: `proj_${slugify(p.title || `p${p.id}`)}`,
			kind: 'project',
			title: p.title || 'Recent project',
			one_line_summary: serviceName
				? `${serviceName}${clientName ? ` for ${clientName}` : ''}.`
				: clientName
					? `Project for ${clientName}.`
					: 'Recent project.',
			detail: p.description ? String(p.description).slice(0, 280) : undefined,
			date: p.date_updated || undefined,
			client_name: clientName,
		});
	}

	// ── 2. Services matching the cluster topic ──────────────────────────────
	if (keywords.length > 0) {
		try {
			const services = await directus.request(
				readItems('services', {
					filter: {
						_and: [
							{ status: { _eq: 'published' } },
							{
								_or: keywords.flatMap((kw) => [
									{ name: { _icontains: kw } },
									{ description: { _icontains: kw } },
								]),
							},
						],
					},
					fields: ['id', 'name', 'description'],
					limit: 3,
				}),
			) as any[];
			for (const s of services || []) {
				facts.push({
					id: `svc_${slugify(s.name)}`,
					kind: 'service',
					title: s.name,
					one_line_summary: s.description ? String(s.description).slice(0, 140) : `${s.name} engagements.`,
				});
			}
		} catch (err: any) {
			console.warn('[marketing-facts/lead-reengagement] services query failed:', err.message);
		}
	}

	// ── 3. Recent signed contracts as wins ──────────────────────────────────
	try {
		const wins = await directus.request(
			readItems('contracts', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ contract_status: { _eq: 'signed' } },
						{ signed_at: { _gte: sixMonthsAgo } },
					],
				},
				fields: ['id', 'title', 'signed_at', 'total_value'],
				sort: ['-signed_at'],
				limit: 2,
			}),
		) as any[];
		for (const w of wins || []) {
			facts.push({
				id: `win_${slugify(w.title || `c${w.id}`)}`,
				kind: 'win',
				title: w.title || 'Recent signed engagement',
				one_line_summary: 'Recent signed engagement.',
				date: w.signed_at || undefined,
			});
		}
	} catch (err: any) {
		console.warn('[marketing-facts/lead-reengagement] wins query failed:', err.message);
	}

	return facts;
}
