#!/usr/bin/env npx tsx
/**
 * Migrate lead_activities → touchpoints (unification backfill)
 * ───────────────────────────────────────────────────────────
 * Copies every published lead_activity into the unified `touchpoints` collection
 * (which now has a `lead` FK), then ARCHIVES the source row (status='archived')
 * so re-runs are idempotent and no data is destroyed.
 *
 * Field map:
 *   activity_type    → type      (verbatim; touchpoints.type is a free varchar)
 *   subject          → summary
 *   description      → note
 *   outcome          → outcome   ('no response' → 'no_response')
 *   next_action      → next_action
 *   next_action_date → next_action_date
 *   activity_date    → occurred_at
 *   contact          → contacts m2m (touchpoints_contacts)
 *   (lead's org)     → organization (required on touchpoints)
 *   duration_minutes → dropped (no equivalent; noted in the run summary)
 *
 * Usage:
 *   pnpm tsx scripts/migrate-lead-activities-to-touchpoints.ts          # dry-run
 *   pnpm tsx scripts/migrate-lead-activities-to-touchpoints.ts --apply  # commit
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
	});
	if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${init.method || 'GET'} ${path}\n${await r.text().catch(() => '')}`);
	if (r.status === 204) return undefined as any;
	const j = await r.json();
	return j.data ?? j;
}

interface Activity {
	id: number;
	lead: number | null;
	contact: string | null;
	activity_type: string | null;
	subject: string | null;
	description: string | null;
	outcome: string | null;
	next_action: string | null;
	next_action_date: string | null;
	activity_date: string | null;
	date_created: string | null;
	duration_minutes: number | null;
}

const normOutcome = (o?: string | null) => (o === 'no response' ? 'no_response' : (o || null));

async function main() {
	console.log('==========================================');
	console.log('  lead_activities → touchpoints migration');
	console.log(`  Mode: ${APPLY ? 'APPLY (writes!)' : 'DRY-RUN (no writes)'}`);
	console.log(`  Directus: ${DIRECTUS_URL}`);
	console.log('==========================================\n');

	// 1. All published, lead-linked activities not yet migrated.
	const activities = await api<Activity[]>(
		'/items/lead_activities?filter[status][_neq]=archived&filter[lead][_nnull]=true' +
		'&fields=id,lead,contact,activity_type,subject,description,outcome,next_action,next_action_date,activity_date,date_created,duration_minutes&limit=-1',
	);
	console.log(`Found ${activities.length} activit(y/ies) to migrate.\n`);
	if (!activities.length) { console.log('  Nothing to do.'); return; }

	// 2. Resolve each lead's organization (touchpoints.organization is required).
	const leadIds = [...new Set(activities.map((a) => a.lead).filter((x): x is number => x != null))];
	const leadOrg = new Map<number, string>();
	for (let i = 0; i < leadIds.length; i += 100) {
		const batch = leadIds.slice(i, i + 100);
		const rows = await api<any[]>(`/items/leads?filter[id][_in]=${batch.join(',')}&fields=id,organization&limit=-1`);
		for (const r of rows) if (r.organization) leadOrg.set(Number(r.id), typeof r.organization === 'object' ? r.organization.id : r.organization);
	}

	let created = 0, archived = 0, skippedNoOrg = 0, droppedDuration = 0;

	for (const a of activities) {
		const org = a.lead != null ? leadOrg.get(Number(a.lead)) : null;
		if (!org) { skippedNoOrg++; console.log(`  [skip] activity ${a.id} — lead ${a.lead} has no organization`); continue; }
		if (a.duration_minutes) droppedDuration++;

		const payload: Record<string, any> = {
			organization: org,
			lead: a.lead,
			type: a.activity_type || 'note',
			summary: a.subject || null,
			note: a.description || null,
			outcome: normOutcome(a.outcome),
			next_action: a.next_action || null,
			next_action_date: a.next_action_date || null,
			occurred_at: a.activity_date || a.date_created || null,
		};
		if (a.contact) payload.contacts = [{ contacts_id: a.contact }];

		console.log(`  [migrate] activity ${a.id} (${a.activity_type || 'note'}) → touchpoint on lead ${a.lead}`);
		if (APPLY) {
			await api('/items/touchpoints', { method: 'POST', body: JSON.stringify(payload) });
			await api(`/items/lead_activities/${a.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
			created++; archived++;
		}
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Activities seen:          ${activities.length}`);
	console.log(`  → Touchpoints created:    ${APPLY ? created : '(dry-run)'}`);
	console.log(`  → Source rows archived:   ${APPLY ? archived : '(dry-run)'}`);
	console.log(`  → Skipped (no org):       ${skippedNoOrg}`);
	console.log(`  → duration_minutes dropped on: ${droppedDuration}`);
	console.log(APPLY ? '\n  Done.' : '\n  DRY-RUN. Re-run with --apply to write.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
