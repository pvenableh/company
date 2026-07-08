#!/usr/bin/env npx tsx
/**
 * Close public read on the Tier-B collections AFTER their org-scoped role grants
 * exist (run scripts/add-tierb-role-grants.ts first + smoke-test).
 *
 * Deletes only the Public policy's read grant per collection. Once the role
 * grants from add-tierb-role-grants.ts are in place, signed-in users keep
 * reading their own org's rows and anonymous access is cut.
 *
 * comment_reports is NOT here (its scope is undecided — see the add script).
 * DRY-RUN default; --only=<cols>; --apply executes. Idempotent. Human-run.
 *
 *   pnpm tsx scripts/close-tierb-public-reads.ts           # preview
 *   pnpm tsx scripts/close-tierb-public-reads.ts --apply   # execute
 */
import 'dotenv/config';

const BASE = (process.env.DIRECTUS_URL || 'https://admin.earnest.guru').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)) : null;

const TIER_B = [
	'scheduler_settings', 'phone_settings', 'business_hours', 'call_routes',
	'earnest_scores', 'earnest_history', 'lead_activities', 'lead_activities_files',
	'projects_directus_users', 'video_meeting_attendees',
];

async function req(path: string, method = 'GET') {
	const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
	const text = await r.text();
	const json = text ? JSON.parse(text) : {};
	if (!r.ok) throw new Error(json.errors?.[0]?.message || `HTTP ${r.status}`);
	return json;
}

async function main() {
	console.log(`\n── Close Tier-B public reads ── ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply)'}\n`);
	const { data: pols } = await req('/policies?limit=-1&fields=id,name');
	const pub = (pols || []).find((p: any) => /public/i.test(p.name || ''));
	if (!pub) { console.error('Could not find the Public policy.'); process.exit(1); }

	const { data: perms } = await req(
		`/permissions?limit=-1&filter[action][_eq]=read&filter[policy][_eq]=${pub.id}&fields=id,collection`,
	);
	const byCollection = new Map<string, number>((perms || []).map((p: any) => [p.collection, p.id]));

	for (const c of TIER_B) {
		if (ONLY && !ONLY.has(c)) continue;
		const permId = byCollection.get(c);
		if (!permId) { console.log(`  · ${c} — no public read (already closed)`); continue; }
		if (!APPLY) { console.log(`  would delete: perm ${permId} | ${c}`); continue; }
		await req(`/permissions/${permId}`, 'DELETE');
		const anon = await fetch(`${BASE}/items/${c}?limit=1`);
		console.log(`  ✗ deleted perm ${permId} | ${c} — anon read now HTTP ${anon.status}`);
	}
	console.log(`\n${APPLY ? 'Done.' : 'Preview only. Ensure add-tierb-role-grants.ts ran first, then --apply.'}\n`);
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
