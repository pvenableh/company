#!/usr/bin/env npx tsx
/**
 * Root-cause the anonymous-read exposure (see project_public_read_exposure_audit).
 *
 * The anon-probe sweep (audit-public-read-leaks.ts) showed 114 collections
 * readable unauthenticated. This inspects the PERMISSION CONFIG behind that:
 * which policy/policies grant public read, how many collections each covers,
 * and whether each grant is UNFILTERED (permissions:null) + FULL-FIELD
 * (fields:['*']) — i.e. a clear leak vs a deliberately scoped public read.
 *
 * That answers "one over-permissive Public policy, or many grants?" — which
 * decides whether remediation is a single policy edit or N targeted deletions.
 *
 * READ-ONLY — enumerates directus_policies + directus_permissions via the admin
 * REST API. Makes no changes.
 *
 * Run: pnpm tsx scripts/audit-public-read-grants.ts
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string) {
	const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

// Sensitive set from the sweep (financial / PII / business / cross-org).
const SENSITIVE = new Set([
	'payments_received','invoices','invoices_products','invoices_projects','line_items','emails',
	'people','people_organizations','clients','clients_directus_users','clients_teams','contacts_organizations',
	'organizations','organizations_directus_users','projects_directus_users','junction_directus_users_teams',
	'goals','goal_snapshots','earnest_scores','earnest_history','earnest_scan_credits','earnest_token_pools',
	'ai_usage_logs','lead_activities','lead_activities_files','meeting_requests','requests','reactions',
	'scheduler_settings','phone_settings','call_routes','business_hours','availability','appointments_directus_users',
	'project_events','ar_clients','ar_analytics','comment_reports','earnest_reviews',
	'tickets_comments','tickets_directus_users','tickets_services','tasks_directus_users','user_presence','video_meeting_attendees',
]);

async function main() {
	console.log('\n── Public read GRANTS root-cause ──');
	console.log(`Target: ${BASE}\n`);

	// 1. Policies — identify the public one by name (role field is not readable
	// with this token). Directus' built-in Public policy is labelled "$t:public_label".
	const pol = await req('/policies?limit=-1&fields=id,name,description');
	const policies: any[] = pol.data || [];
	const polById = new Map(policies.map((p) => [p.id, p]));
	const isPublic = (p: any) => /public/i.test(p?.name || '') || /public/i.test(p?.description || '');
	console.log(`Policies (${policies.length}):`);
	for (const p of policies) console.log(`  - ${p.id} | ${p.name}${isPublic(p) ? '  [PUBLIC candidate]' : ''}`);

	// 2. All READ permissions with their policy + shape.
	const perm = await req('/permissions?limit=-1&filter[action][_eq]=read&fields=id,collection,policy,fields,permissions');
	const reads: any[] = perm.data || [];

	// Group read grants by policy.
	const byPolicy = new Map<string, any[]>();
	for (const r of reads) {
		const key = String(r.policy);
		if (!byPolicy.has(key)) byPolicy.set(key, []);
		byPolicy.get(key)!.push(r);
	}

	console.log(`\nRead-permission rows: ${reads.length}, across ${byPolicy.size} policies.\n`);
	for (const [polId, rows] of [...byPolicy.entries()].sort((a, b) => b[1].length - a[1].length)) {
		const p = polById.get(polId);
		const roleNote = p && isPublic(p) ? ' [PUBLIC]' : '';
		console.log(`Policy ${p?.name ?? polId}${roleNote}: ${rows.length} read grants`);
	}

	// 3. Focus: for each PUBLIC-named policy, detail the sensitive + unfiltered grants.
	const publicPolicies = policies.filter((p) => isPublic(p));
	console.log(`\n── Public-policy read grants detail (${publicPolicies.length} public policies) ──`);
	for (const pp of publicPolicies) {
		const rows = byPolicy.get(String(pp.id)) || [];
		const unfiltered = rows.filter((r) => r.permissions == null || Object.keys(r.permissions || {}).length === 0);
		const sensitiveRows = rows.filter((r) => SENSITIVE.has(r.collection));
		console.log(`\nPolicy "${pp.name}" (${pp.id}): ${rows.length} read grants, ${unfiltered.length} UNFILTERED.`);
		if (sensitiveRows.length) {
			console.log(`  ⚠️  ${sensitiveRows.length} SENSITIVE collections granted public read:`);
			for (const r of sensitiveRows.sort((a, b) => a.collection.localeCompare(b.collection))) {
				const filt = (r.permissions == null || Object.keys(r.permissions || {}).length === 0) ? 'UNFILTERED' : 'filtered';
				const flds = Array.isArray(r.fields) && r.fields.includes('*') ? 'fields:*' : `fields:${(r.fields || []).length}`;
				console.log(`     - perm ${r.id} | ${r.collection} | ${filt} | ${flds}`);
			}
		}
	}
	console.log('\n── Done (read-only) ──\n');
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
