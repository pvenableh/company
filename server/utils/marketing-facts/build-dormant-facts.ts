/**
 * Dormant-clients fact builder.
 *
 * Pulls a narrow, real set of facts an org can credibly reference when
 * reaching back to dormant clients: recent completed projects, the services
 * those projects rode on, and recent signed contracts as "wins".
 *
 * Returns at most ~8 facts. Narrow > broad — the generator is grounded only
 * in what's returned here. If this is sparse, the generator writes more
 * abstractly rather than fabricating specifics.
 *
 * Schema notes:
 *   - `projects.status` is capitalized: `Pending | Scheduled | In Progress | Completed | On Hold`.
 *   - `services` is a global collection (no `organization` column) — we pull
 *     the services actually used by the org's recent projects.
 *   - `contracts.contract_status='signed'` with non-null `signed_at` is the
 *     cleanest win signal. Proposals don't carry `signed_at`.
 */
import { readItems } from '@directus/sdk';

export type AvailableFactKind = 'project' | 'service' | 'win' | 'testimonial';

export interface AvailableFact {
	id: string;
	kind: AvailableFactKind;
	title: string;
	one_line_summary: string;
	detail?: string;
	date?: string;
	client_name?: string;
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32) || 'fact';
}

export async function buildAvailableFactsForDormant(organizationId: string): Promise<AvailableFact[]> {
	const directus = getTypedDirectus();
	const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
	const facts: AvailableFact[] = [];

	// ── 1. Recent completed projects (top 5 by recency) ─────────────────────
	let projects: any[] = [];
	try {
		projects = await directus.request(
			readItems('projects', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ status: { _eq: 'Completed' } },
					],
				},
				fields: [
					'id',
					'title',
					'description',
					'status',
					'date_updated',
					'date_created',
					'client.name',
					'service.name',
				],
				sort: ['-date_updated'],
				limit: 5,
			}),
		) as any[];
	} catch (err: any) {
		console.warn('[marketing-facts/dormant] projects query failed:', err.message);
	}

	for (const p of projects || []) {
		const clientName = p.client?.name as string | undefined;
		const serviceName = p.service?.name as string | undefined;
		const idSlug = `proj_${slugify(p.title || `p${p.id}`)}`;
		facts.push({
			id: idSlug,
			kind: 'project',
			title: p.title || 'Untitled project',
			one_line_summary: serviceName
				? `${serviceName}${clientName ? ` for ${clientName}` : ''}.`
				: clientName
					? `Project for ${clientName}.`
					: 'Recent completed project.',
			detail: p.description ? String(p.description).slice(0, 280) : undefined,
			date: p.date_updated || p.date_created || undefined,
			client_name: clientName,
		});
	}

	// ── 2. Services the org actually uses (derived from completed projects) ──
	const servicesUsed = new Map<string, string>(); // name → first-seen project description
	for (const p of projects || []) {
		const name = p.service?.name as string | undefined;
		if (!name || servicesUsed.has(name)) continue;
		servicesUsed.set(name, '');
	}
	// If we have fewer than 2, top up by querying services directly (no org filter).
	if (servicesUsed.size < 2) {
		try {
			const moreServices = await directus.request(
				readItems('services', {
					filter: { status: { _eq: 'published' } },
					fields: ['id', 'name', 'description'],
					sort: ['name'],
					limit: 4,
				}),
			) as any[];
			for (const s of moreServices || []) {
				if (s.name && !servicesUsed.has(s.name)) {
					servicesUsed.set(s.name, s.description || '');
				}
			}
		} catch (err: any) {
			console.warn('[marketing-facts/dormant] services query failed:', err.message);
		}
	}
	for (const [name, description] of servicesUsed) {
		facts.push({
			id: `svc_${slugify(name)}`,
			kind: 'service',
			title: name,
			one_line_summary: description ? String(description).slice(0, 140) : `${name} engagements.`,
		});
	}

	// ── 3. Wins — recently signed contracts ─────────────────────────────────
	let contracts: any[] = [];
	try {
		contracts = await directus.request(
			readItems('contracts', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ contract_status: { _eq: 'signed' } },
						{ signed_at: { _gte: sixMonthsAgo } },
					],
				},
				fields: ['id', 'title', 'signed_at', 'total_value', 'lead.contact_name'],
				sort: ['-signed_at'],
				limit: 3,
			}),
		) as any[];
	} catch (err: any) {
		console.warn('[marketing-facts/dormant] contracts query failed:', err.message);
	}

	for (const c of contracts || []) {
		const idSlug = `win_${slugify(c.title || `c${c.id}`)}`;
		const value = typeof c.total_value === 'number' && c.total_value > 0
			? ` ($${c.total_value.toLocaleString()})`
			: '';
		facts.push({
			id: idSlug,
			kind: 'win',
			title: c.title || 'Recent signed engagement',
			one_line_summary: `New engagement signed${value}.`,
			date: c.signed_at || undefined,
		});
	}

	return facts;
}
