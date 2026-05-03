#!/usr/bin/env npx tsx
/**
 * Seed source data so the marketing-cron extractors find real signals
 * for the demo Solo org without hand-creating rows.
 *
 *   - backdate 7 client-category contacts so dormant_clients fires
 *   - backdate 7 qualified leads with project_type='Brand strategy'
 *     so lead_reengagement clusters them
 *   - leaves project_complete extractor to find the existing
 *     recently-completed project (no new work needed)
 *
 * Run:
 *   pnpm tsx scripts/seed-marketing-source-data.ts
 *
 * Optional:
 *   pnpm tsx scripts/seed-marketing-source-data.ts --org <id>
 *
 * Idempotent: PATCHes existing rows by id rather than creating new ones.
 * If there aren't enough qualified leads, creates synthetic ones tagged
 * with `marketing-demo` so a future cleanup pass can drop them.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN required');
	process.exit(1);
}

const DEFAULT_ORG_ID = '40c4d2e5-79d2-4008-9a97-9c14f94dfd0e';

async function api<T = any>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown): Promise<T> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const txt = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${txt.slice(0, 300)}`);
	return (txt ? JSON.parse(txt).data : null) as T;
}

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function ageContacts(orgId: string): Promise<number> {
	// Pull up to 12 client-category contacts attached to the org via the
	// junction collection; back-date their date_updated + last_clicked_at
	// past the 60-day dormant cutoff.
	const filter = encodeURIComponent(JSON.stringify({
		_and: [
			{ organizations: { organizations_id: { _eq: orgId } } },
			{ category: { _in: ['client', 'hospitality', 'partner'] } },
			{ email: { _nnull: true } },
		],
	}));
	const contacts = await api<any[]>(
		`/items/contacts?filter=${filter}&limit=12&fields=id,first_name,last_name,date_updated`,
	);

	let updated = 0;
	const targetDays = [62, 75, 90, 105, 120, 142, 158];
	for (let i = 0; i < Math.min(contacts.length, targetDays.length); i++) {
		const c = contacts[i];
		const days = targetDays[i];
		try {
			await api(`/items/contacts/${c.id}`, 'PATCH', {
				last_clicked_at: daysAgo(days),
				last_opened_at: daysAgo(days - 2),
				date_updated: daysAgo(days),
			});
			updated++;
		} catch (err: any) {
			console.warn(`  ! failed to age contact ${c.id}: ${err.message.slice(0, 100)}`);
		}
	}
	return updated;
}

async function ensureQualifiedLeads(orgId: string): Promise<number> {
	const TARGET = 7;
	const TOPIC = 'Brand strategy';

	// 1. Bring eligible existing leads up to qualified + backdate.
	const existingFilter = encodeURIComponent(JSON.stringify({
		_and: [
			{ organization: { _eq: orgId } },
			{ stage: { _in: ['contacted', 'qualified', 'new'] } },
			{ is_junk: { _neq: true } },
		],
	}));
	const existing = await api<any[]>(
		`/items/leads?filter=${existingFilter}&limit=${TARGET}&fields=id,stage,project_type,date_updated`,
	);

	const targetDays = [32, 38, 41, 47, 52, 58, 60];
	let touched = 0;
	for (let i = 0; i < Math.min(existing.length, TARGET); i++) {
		const lead = existing[i];
		try {
			await api(`/items/leads/${lead.id}`, 'PATCH', {
				stage: 'qualified',
				project_type: TOPIC,
				date_updated: daysAgo(targetDays[i] || 41),
			});
			touched++;
		} catch (err: any) {
			console.warn(`  ! failed to age lead ${lead.id}: ${err.message.slice(0, 100)}`);
		}
	}

	// 2. Top up with synthetic leads if the org doesn't have enough.
	let created = 0;
	const need = TARGET - touched;
	if (need > 0) {
		const sampleFirst = ['Tom', 'Anna', 'Devon', 'Riley', 'Casey', 'Morgan', 'Jordan'];
		const sampleLast = ['Bell', 'Wu', 'Reyes', 'Hart', 'Quinn', 'Pierce', 'Ng'];
		for (let i = 0; i < need; i++) {
			const first = sampleFirst[(touched + i) % sampleFirst.length];
			const last = sampleLast[(touched + i) % sampleLast.length];
			try {
				const contact = await api<any>('/items/contacts', 'POST', {
					first_name: first,
					last_name: last,
					email: `${first.toLowerCase()}.${last.toLowerCase()}+demo@example.invalid`,
					category: 'prospect',
					source: 'marketing-demo',
					tags: ['marketing-demo'],
					organizations: { create: [{ organizations_id: orgId }] },
				});
				await api('/items/leads', 'POST', {
					organization: orgId,
					stage: 'qualified',
					project_type: TOPIC,
					source: 'website',
					priority: 'medium',
					notes: '[marketing-demo] synthetic lead for cron extractor',
					related_contact: contact.id,
					date_updated: daysAgo(targetDays[(touched + i) % targetDays.length] || 41),
				});
				created++;
			} catch (err: any) {
				console.warn(`  ! failed to create synthetic lead: ${err.message.slice(0, 120)}`);
			}
		}
	}

	return touched + created;
}

async function main() {
	const argIdx = process.argv.indexOf('--org');
	const orgId = argIdx >= 0 ? process.argv[argIdx + 1]! : DEFAULT_ORG_ID;

	console.log('==========================================');
	console.log('  Seed marketing source data');
	console.log('==========================================');
	console.log(`Org: ${orgId}`);

	const aged = await ageContacts(orgId);
	console.log(`Backdated ${aged} contact(s) past the 60-day dormant cutoff.`);

	const leads = await ensureQualifiedLeads(orgId);
	console.log(`Have ${leads} qualified Brand-strategy leads inactive 30+ days.`);

	console.log('\nDone. Run the cron in dry-run to verify it now finds candidates:');
	console.log(`  curl -sX POST "${process.env.SITE_URL || 'http://127.0.0.1:3000'}/api/marketing/cron/refresh-recommendations" \\`);
	console.log(`    -H 'content-type: application/json' \\`);
	console.log(`    -d '{"organizationId":"${orgId}","dryRun":true}'`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
