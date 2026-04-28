#!/usr/bin/env npx tsx
/**
 * Backfill orphaned `people` rows into `contacts`.
 *
 * Run after `audit-people-vs-contacts.ts` has confirmed which rows are
 * orphaned (people email NOT in contacts). Skips obvious test data
 * (`.test`, `.example.com`, missing email).
 *
 * Usage:
 *
 *   pnpm tsx scripts/backfill-people-to-contacts.ts          # dry-run
 *   pnpm tsx scripts/backfill-people-to-contacts.ts --apply  # actually create contacts
 *
 * Idempotent: re-running skips any people whose email now exists in contacts.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var is required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const SHARED_FIELDS = [
	'email',
	'first_name',
	'last_name',
	'phone',
	'title',
	'prefix',
	'photo',
	'company',
	'industry',
	'website',
	'linkedin_url',
	'instagram_handle',
	'timezone',
	'mailing_address',
	'source',
	'notes',
	'tags',
	'custom_fields',
	'status',
	'email_subscribed',
	'email_bounced',
	'total_emails_sent',
	'total_opens',
	'total_clicks',
	'unsubscribe_token',
	'category',
] as const;

interface PersonRow {
	id: number;
	email: string | null;
	first_name: string | null;
	last_name: string | null;
	[key: string]: unknown;
}

interface ContactRow {
	id: string;
	email: string | null;
}

async function fetchAll<T>(collection: string, fields: string[]): Promise<T[]> {
	const all: T[] = [];
	const limit = 100;
	let page = 1;
	while (true) {
		const url = `${DIRECTUS_URL}/items/${collection}?fields=${fields.join(',')}&limit=${limit}&page=${page}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
		if (!res.ok) throw new Error(`Failed to fetch ${collection}: ${res.status} ${await res.text()}`);
		const json = (await res.json()) as { data: T[] };
		const batch = json.data || [];
		all.push(...batch);
		if (batch.length < limit) break;
		page += 1;
	}
	return all;
}

const normEmail = (e: string | null | undefined) => (e ? e.trim().toLowerCase() : null);

function isObviousTestRow(p: PersonRow): boolean {
	const email = normEmail(p.email);
	if (!email) return true;
	if (/\.test$/.test(email) || /@example\.(com|test|org)$/.test(email)) return true;
	if (/^pass\d+/i.test(p.first_name || '') || /verify-/i.test(email)) return true;
	return false;
}

async function createContact(payload: Record<string, unknown>): Promise<string> {
	const res = await fetch(`${DIRECTUS_URL}/items/contacts`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error(`POST /items/contacts failed: ${res.status} ${await res.text()}`);
	const json = (await res.json()) as { data: { id: string } };
	return json.data.id;
}

async function main() {
	console.log('==========================================');
	console.log('  Backfill people → contacts');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log(`Mode:         ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
	console.log('');

	const people = await fetchAll<PersonRow>('people', ['*']);
	const contacts = await fetchAll<ContactRow>('contacts', ['id', 'email']);

	const contactEmails = new Set(contacts.map((c) => normEmail(c.email)).filter(Boolean) as string[]);

	const candidates: PersonRow[] = [];
	const skipped: Array<{ id: number; reason: string }> = [];

	for (const p of people) {
		const email = normEmail(p.email);
		if (!email) {
			skipped.push({ id: p.id, reason: 'no email' });
			continue;
		}
		if (contactEmails.has(email)) continue;
		if (isObviousTestRow(p)) {
			skipped.push({ id: p.id, reason: 'looks like test data' });
			continue;
		}
		candidates.push(p);
	}

	console.log(`Candidates to backfill: ${candidates.length}`);
	for (const p of candidates) {
		const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)';
		console.log(`  -> #${p.id}  ${name} <${p.email}>`);
	}

	console.log('');
	console.log(`Skipped: ${skipped.length}`);
	for (const s of skipped) {
		console.log(`  -- #${s.id}  (${s.reason})`);
	}

	if (!APPLY) {
		console.log('');
		console.log('Dry-run only. Re-run with --apply to create contact rows.');
		return;
	}

	if (candidates.length === 0) {
		console.log('');
		console.log('Nothing to apply.');
		return;
	}

	console.log('');
	console.log('Creating contacts...');
	let ok = 0;
	let fail = 0;
	for (const p of candidates) {
		const payload: Record<string, unknown> = {};
		for (const f of SHARED_FIELDS) {
			if (p[f] !== undefined && p[f] !== null) payload[f] = p[f];
		}
		try {
			const id = await createContact(payload);
			console.log(`  ok  people #${p.id}  ->  contacts ${id}  (${p.email})`);
			ok += 1;
		} catch (err) {
			console.error(`  !!  people #${p.id}: ${(err as Error).message}`);
			fail += 1;
		}
	}
	console.log('');
	console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
