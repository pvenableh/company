#!/usr/bin/env npx tsx
/**
 * Seed three realistic marketing-feed recommendations for the demo org.
 *
 * Used to dev against the /marketing feed UI before the real signal
 * extractors + ranker are wired. Re-running is safe: a unique
 * ranker_run_id ('seed-v1') is used so prior seeded rows are deleted
 * before re-creating.
 *
 * Run:
 *   pnpm tsx scripts/seed-marketing-recommendations.ts
 *
 * Optional:
 *   pnpm tsx scripts/seed-marketing-recommendations.ts --org <id>
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// Default demo Solo org per memory project_demo_mode.md.
const DEFAULT_ORG_ID = '40c4d2e5-79d2-4008-9a97-9c14f94dfd0e';
const SEED_RUN_ID = 'seed-v1';
const SEED_PROMPT_VERSION = 'seed';

// ─── API Helper ──────────────────────────────────────────────────────────────

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
	try {
		const response = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		const text = await response.text();
		if (!response.ok) {
			return { data: null, error: `${response.status}: ${text}` };
		}
		const json = text ? JSON.parse(text) : {};
		return { data: json.data ?? null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

// ─── Args ────────────────────────────────────────────────────────────────────

function parseOrgId(): string {
	const idx = process.argv.indexOf('--org');
	if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
	return DEFAULT_ORG_ID;
}

// ─── Lead lookup for lead_reengagement seed ────────────────────────────────

interface SeedLead {
	id: number;
	contactId: string;
}

async function fetchBrandStrategyLeads(orgId: string): Promise<SeedLead[]> {
	const filter = encodeURIComponent(JSON.stringify({
		_and: [
			{ organization: { _eq: orgId } },
			{ stage: { _eq: 'qualified' } },
			{ project_type: { _eq: 'Brand strategy' } },
			{ is_junk: { _neq: true } },
		],
	}));
	const { data, error } = await directusRequest<any[]>(
		`/items/leads?filter=${filter}&fields=id,related_contact&limit=20`,
	);
	if (error || !data) return [];
	return data
		.map((l) => ({
			id: l.id,
			contactId: typeof l.related_contact === 'string' ? l.related_contact : l.related_contact?.id ?? null,
		}))
		.filter((l): l is SeedLead => typeof l.contactId === 'string' && l.contactId.length > 0);
}

// ─── Seed Definitions ────────────────────────────────────────────────────────

function buildRecommendations(orgId: string, leadReengagementLeads: SeedLead[]) {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
	const surfaced = now.toISOString();
	const expires = expiresAt.toISOString();

	return [
		// ─── 1. Dormant clients ─────────────────────────────────────────────
		{
			organization: orgId,
			card_type: 'dormant_clients',
			status: 'pending',
			urgency: 75,
			candidate_data: {
				type: 'dormant_clients',
				signal: {
					contact_count: 7,
					avg_days_since_contact: 73,
					longest_gap_days: 142,
					tier: 'high_value',
					lifetime_revenue_usd: 84000,
				},
				audience: {
					size: 7,
					sample_names: ['Sarah Chen', 'Marcus Reed', 'Elena Park'],
				},
				recency_days: 0,
				impact_score: 78,
				deliverables: '3 personalized emails + 1 LinkedIn post',
				token_estimate: 1800,
			},
			ranker_output: {
				why_now: '7 high-value clients have gone an average of 73 days without contact.',
				urgency: 75,
				audience_overlap_with: [],
			},
			ranker_run_id: SEED_RUN_ID,
			ranker_prompt_version: SEED_PROMPT_VERSION,
			surfaced_at: surfaced,
			expires_at: expires,
		},

		// ─── 2. Project complete (testimonial-ask phase) ────────────────────
		{
			organization: orgId,
			card_type: 'project_complete',
			status: 'pending',
			urgency: 65,
			candidate_data: {
				type: 'project_complete',
				phase: 'request_testimonial',
				signal: {
					project_title: 'Terra Wellness rebrand',
					client_name: 'Terra Wellness',
					primary_contact_name: 'Sarah Chen',
					days_since_complete: 4,
					budget_usd: 42000,
					recent_win: 'Awwwards Site of the Day',
				},
				audience: {
					size: 1,
					sample_names: ['Sarah Chen'],
				},
				recency_days: 4,
				impact_score: 71,
				deliverables: '1 testimonial-ask email',
				token_estimate: 700,
			},
			ranker_output: {
				why_now: 'Terra Wellness rebrand wrapped 4 days ago and just hit Awwwards — fresh moment to ask.',
				urgency: 65,
				audience_overlap_with: [],
			},
			ranker_run_id: SEED_RUN_ID,
			ranker_prompt_version: SEED_PROMPT_VERSION,
			surfaced_at: surfaced,
			expires_at: expires,
		},

		// ─── 3. Lead re-engagement ──────────────────────────────────────────
		{
			organization: orgId,
			card_type: 'lead_reengagement',
			status: 'pending',
			urgency: 55,
			candidate_data: {
				type: 'lead_reengagement',
				signal: {
					lead_count: 7,
					avg_days_inactive: 41,
					min_days_inactive: 32,
					max_days_inactive: 58,
				},
				cluster: {
					label: 'Brand strategy',
					size: leadReengagementLeads.length || 7,
					representative_intent: 'Inquired about brand strategy / identity refresh',
					lead_sources_summary: '3 demo_request, 4 contact_form_with_topic',
					lead_ids: leadReengagementLeads.map((l) => l.id),
				},
				audience: {
					size: leadReengagementLeads.length || 7,
					sample_names: ['Tom Bell', 'Anna Wu', 'Devon Reyes'],
					contact_ids: leadReengagementLeads.map((l) => l.contactId),
				},
				recency_days: 7,
				impact_score: 68,
				deliverables: '1 case-study email',
				token_estimate: 1400,
			},
			ranker_output: {
				why_now: '7 brand-strategy leads have been inactive an average of 41 days.',
				urgency: 55,
				audience_overlap_with: [],
			},
			ranker_run_id: SEED_RUN_ID,
			ranker_prompt_version: SEED_PROMPT_VERSION,
			surfaced_at: surfaced,
			expires_at: expires,
		},
	];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const orgId = parseOrgId();

	console.log('==========================================');
	console.log('  Seed marketing_recommendations');
	console.log('==========================================');
	console.log(`Org: ${orgId}`);
	console.log(`Run ID: ${SEED_RUN_ID}`);

	// Connectivity check.
	{
		const { error } = await directusRequest('/server/info');
		if (error) {
			console.error(`\nCannot connect: ${error}`);
			process.exit(1);
		}
	}

	// Verify org exists.
	{
		const { data, error } = await directusRequest<{ id: string; name: string }>(
			`/items/organizations/${orgId}?fields=id,name`,
		);
		if (error || !data) {
			console.error(`\nOrg not found: ${error}`);
			process.exit(1);
		}
		console.log(`Org found: ${data.name}\n`);
	}

	// Delete prior seeded rows for idempotency.
	const filterParam = encodeURIComponent(
		JSON.stringify({ ranker_run_id: { _eq: SEED_RUN_ID }, organization: { _eq: orgId } }),
	);
	const { data: existing } = await directusRequest<{ id: number }[]>(
		`/items/marketing_recommendations?filter=${filterParam}&fields=id&limit=100`,
	);

	if (existing && existing.length > 0) {
		console.log(`Removing ${existing.length} prior seeded row(s)...`);
		const ids = existing.map((r) => r.id);
		const { error } = await directusRequest('/items/marketing_recommendations', 'DELETE', ids);
		if (error) {
			console.error(`  Error during cleanup: ${error}`);
			process.exit(1);
		}
		console.log('  Cleared.\n');
	}

	// Look up real Brand-strategy leads so the lead_reengagement seed carries
	// resolvable cluster.lead_ids + audience.contact_ids. Falls back to an
	// empty list if seed-marketing-source-data.ts hasn't been run yet — the
	// generate endpoint will still persist the campaign, but personalize
	// will 409 until the source data is seeded.
	const leadReengagementLeads = await fetchBrandStrategyLeads(orgId);
	if (leadReengagementLeads.length === 0) {
		console.warn(
			'  ! No qualified Brand-strategy leads found. lead_reengagement seed will lack lead_ids/contact_ids.',
		);
		console.warn('    Run `pnpm tsx scripts/seed-marketing-source-data.ts` first.');
	} else {
		console.log(`Found ${leadReengagementLeads.length} Brand-strategy lead(s) for lead_reengagement seed.`);
	}

	// Insert fresh seed rows.
	const recs = buildRecommendations(orgId, leadReengagementLeads);
	console.log(`Creating ${recs.length} recommendations...`);

	for (const rec of recs) {
		const { data, error } = await directusRequest<{ id: number }>(
			'/items/marketing_recommendations',
			'POST',
			rec,
		);
		if (error) {
			console.error(`  ${rec.card_type}: error -> ${error}`);
			process.exit(1);
		}
		console.log(`  ${rec.card_type} (urgency ${rec.urgency}) -> id ${data?.id}`);
	}

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log(`Test endpoint: GET /api/marketing/recommendations?organizationId=${orgId}`);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
