#!/usr/bin/env npx tsx
/**
 * Tier-B fix: ADD org-scoped role read grants so the public read can be closed.
 *
 * The Tier-B collections (see project_public_read_exposure_audit) had the Public
 * policy as their ONLY read grant — so closing public would break the
 * authenticated pages that read them. This CREATES a properly-scoped read grant
 * on the non-admin policies (Client / Client Manager / Carddesk User) for each,
 * so signed-in users can read their own org's rows; then `close-tierb-public-reads.ts`
 * removes the public grant with no regression.
 *
 * Filters verified from the relations graph (direct org FK vs parent path):
 *   - scheduler_settings is per-USER (user_id) → user-scoped, not org.
 *   - phone/business_hours/call_routes → org via phone_settings.organization.
 *   - lead_activities(_files) → org via lead.organization.
 *   - video_meeting_attendees → org via video_meeting.organization.
 * Grants go to all three non-admin policies with the org filter, so no authed
 * page can break regardless of the user's policy (org-scoped = harmless breadth).
 *
 * comment_reports is intentionally EXCLUDED — its correct scope (moderation:
 * reporter-only? org? global?) needs a product decision. Handle separately.
 *
 * DRY-RUN default; --only=<cols>; --apply creates. Idempotent: skips a policy
 * that already has a read grant on the collection. Access-control WRITE — human-run.
 * Takes effect immediately on prod (no deploy).
 *
 *   pnpm tsx scripts/add-tierb-role-grants.ts                 # preview
 *   pnpm tsx scripts/add-tierb-role-grants.ts --only=earnest_scores --apply
 *   pnpm tsx scripts/add-tierb-role-grants.ts --apply         # all
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
const GRANT_POLICIES = ['Client', 'Client Manager', 'Carddesk User'];

const FILTERS: Record<string, any> = {
	scheduler_settings: { user_id: { _eq: '$CURRENT_USER' } },       // per-user
	phone_settings: { organization: inOrgs },
	business_hours: { phone_settings_id: { organization: inOrgs } },
	call_routes: { phone_settings_id: { organization: inOrgs } },
	earnest_scores: { organization: inOrgs },
	earnest_history: { organization: inOrgs },
	lead_activities: { lead: { organization: inOrgs } },
	lead_activities_files: { lead_activities_id: { lead: { organization: inOrgs } } },
	projects_directus_users: { projects_id: { organization: inOrgs } },
	video_meeting_attendees: { video_meeting: { organization: inOrgs } },
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

async function main() {
	console.log(`\n── Add Tier-B org-scoped role grants ── ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply)'}\n`);

	const { data: policies } = await req('/policies?limit=-1&fields=id,name');
	const idOf = new Map<string, string>((policies || []).map((p: any) => [p.name, p.id]));
	const targetPolicyIds = GRANT_POLICIES.map((n) => ({ name: n, id: idOf.get(n) })).filter((p) => p.id);

	// Existing read grants, to skip duplicates.
	const { data: perms } = await req('/permissions?limit=-1&filter[action][_eq]=read&fields=collection,policy');
	const existing = new Set<string>((perms || []).map((p: any) => `${p.collection}::${p.policy}`));

	let planned = 0, created = 0, skipped = 0;
	for (const [collection, filter] of Object.entries(FILTERS)) {
		if (ONLY && !ONLY.has(collection)) continue;
		for (const pol of targetPolicyIds) {
			if (existing.has(`${collection}::${pol.id}`)) { skipped++; continue; }
			planned++;
			if (!APPLY) {
				console.log(`  + ${collection.padEnd(24)} | ${pol.name.padEnd(15)} → ${JSON.stringify(filter)}`);
				continue;
			}
			await req('/permissions', 'POST', { policy: pol.id, collection, action: 'read', fields: ['*'], permissions: filter });
			created++;
			console.log(`  ✓ granted ${collection} | ${pol.name}`);
		}
	}

	console.log(`\n${APPLY
		? `Done. Created ${created}, skipped ${skipped} (already granted).`
		: `Preview: ${planned} grants to create, ${skipped} already exist. Re-run with --apply.`}`);
	console.log('After applying + smoke-testing, close public with scripts/close-tierb-public-reads.ts.\n');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
