#!/usr/bin/env npx tsx
/**
 * Add org filters to the UNFILTERED non-public read grants that leak cross-org
 * (see project_public_read_exposure_audit "secondary finding").
 *
 * 29 role read grants (Client / Client Manager / Carddesk User) on org-scoped
 * collections have `permissions: null` → any authenticated user reads every
 * org's rows. This sets an org-scoping filter on each so a user only sees rows
 * belonging to THEIR organizations (`$CURRENT_USER.organizations.organizations_id`,
 * the same token the existing invoices/clients grants use).
 *
 * Filters are EXPLICIT + hand-verified per collection against the relations
 * graph (direct org FK vs parent path; tasks uses `organization_id`, invoices
 * scope via `client.organization`, people via its `organizations` M2M alias).
 * `fields` is left untouched (kept `*`, matching the existing org-scoped grants).
 *
 * DRY-RUN BY DEFAULT — prints current→proposed for every matching grant. Pass
 * --apply to PATCH. Idempotent: a grant that is already filtered is skipped.
 * Only unfiltered read grants under non-public, non-admin policies are touched.
 *
 *   pnpm tsx scripts/add-org-filters-to-role-grants.ts                     # preview all
 *   pnpm tsx scripts/add-org-filters-to-role-grants.ts --only=people      # preview one
 *   pnpm tsx scripts/add-org-filters-to-role-grants.ts --only=people --apply
 *   pnpm tsx scripts/add-org-filters-to-role-grants.ts --apply            # execute all
 *
 * These take effect IMMEDIATELY on prod (Directus perm change, no deploy). Apply
 * incrementally with --only and smoke-test the live app between batches. To
 * revert one, set that permission's `permissions` back to null (re-opens it).
 *
 * ⚠️ Verify with a real session per policy after applying — especially `people`
 * (its filter unions the M2M org link and the client-contact path; confirm no
 * legitimate person disappears from people surfaces).
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)) : null;

const ORGS = '$CURRENT_USER.organizations.organizations_id';
const inOrgs = { _in: ORGS };

// Explicit, verified org filter per collection.
const FILTERS: Record<string, any> = {
	// ── DIRECT: collection has its own org FK ──
	ai_usage_logs: { organization: inOrgs },
	contacts_organizations: { organizations_id: inOrgs },
	email_partials: { organization: inOrgs },
	lead_stage_list_rules: { organization: inOrgs },
	organizations_directus_users: { organizations_id: inOrgs },
	people_organizations: { organizations_id: inOrgs },
	// ── PARENT: org-scoped through a parent relation ──
	clients_directus_users: { clients_id: { organization: inOrgs } },
	clients_teams: { clients_id: { organization: inOrgs } },
	invoices_products: { invoices_id: { client: { organization: inOrgs } } },
	invoices_projects: { invoices_id: { client: { organization: inOrgs } } },
	junction_directus_users_teams: { teams_id: { organization: inOrgs } },
	line_items: { invoice_id: { client: { organization: inOrgs } } },
	// people: org via the people_organizations M2M alias, OR via its client contact.
	people: { _or: [{ organizations: { organizations_id: inOrgs } }, { client: { organization: inOrgs } }] },
	project_events: { project: { organization: inOrgs } },
	project_events_invoices: { invoices_id: { client: { organization: inOrgs } } },
	tasks_directus_users: { tasks_id: { organization_id: inOrgs } },
	template_blocks: { template_id: { organization: inOrgs } },
	tickets_comments: { tickets_id: { organization: inOrgs } },
	tickets_directus_users: { tickets_id: { organization: inOrgs } },
	tickets_files: { tickets_id: { organization: inOrgs } },
	tickets_services: { tickets_id: { organization: inOrgs } },
};

async function req(path: string, method = 'GET', body?: any) {
	const r = await fetch(BASE + path, {
		method,
		headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

const unfiltered = (p: any) => p == null || (typeof p === 'object' && Object.keys(p).length === 0);

async function main() {
	console.log(`\n── Add org filters to role grants ── ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply)'}\n`);

	const { data: policies } = await req('/policies?limit=-1&fields=id,name');
	const nameOf = new Map<string, string>((policies || []).map((p: any) => [p.id, p.name]));
	const skip = (id: string) => /public|admin/i.test(nameOf.get(id) || '');

	const collections = Object.keys(FILTERS);
	const { data: perms } = await req(
		`/permissions?limit=-1&filter[action][_eq]=read&fields=id,collection,policy,permissions`,
	);

	let planned = 0, applied = 0, skipped = 0;
	for (const p of perms || []) {
		if (!FILTERS[p.collection]) continue;
		if (ONLY && !ONLY.has(p.collection)) continue;
		if (p.policy == null || skip(p.policy)) continue;
		if (!unfiltered(p.permissions)) { skipped++; continue; }   // already filtered
		const filter = FILTERS[p.collection];
		planned++;
		const who = nameOf.get(p.policy) || p.policy;
		if (!APPLY) {
			console.log(`  perm ${String(p.id).padEnd(5)} | ${p.collection.padEnd(30)} | ${who}`);
			console.log(`      → ${JSON.stringify(filter)}`);
			continue;
		}
		await req(`/permissions/${p.id}`, 'PATCH', { permissions: filter });
		applied++;
		console.log(`  ✓ perm ${p.id} | ${p.collection} | ${who} — filter set`);
	}

	console.log(`\n${APPLY
		? `Done. Filtered ${applied}, already-filtered ${skipped}.`
		: `Preview: ${planned} grants to filter, ${skipped} already filtered. Re-run with --apply.`}\n`);
	if (!APPLY) console.log('After applying, verify each policy with a real session (people first).\n');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
