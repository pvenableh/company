#!/usr/bin/env npx tsx
/**
 * Audit script: compare `people` (legacy) and `contacts` collections by email.
 *
 * Reports:
 *   - Total people rows
 *   - Total contacts rows
 *   - People rows whose email is NOT in contacts (these would be lost on drop)
 *   - People rows that look like team members (`is_team_member: true`) and
 *     whether the corresponding user already has a contact row
 *
 * Read-only. No mutations.
 *
 *   pnpm tsx scripts/audit-people-vs-contacts.ts
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var is required');
	process.exit(1);
}

interface PersonRow {
	id: string | number;
	email?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	is_team_member?: boolean | null;
	user?: string | null;
	organizations?: string[] | null;
}

interface ContactRow {
	id: string;
	email?: string | null;
	user?: string | null;
}

async function fetchAll<T>(collection: string, fields: string[]): Promise<T[]> {
	const all: T[] = [];
	const limit = 100;
	let page = 1;
	while (true) {
		const url = `${DIRECTUS_URL}/items/${collection}?fields=${fields.join(',')}&limit=${limit}&page=${page}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } });
		if (!res.ok) {
			if (res.status === 403 || res.status === 404) {
				console.warn(`  (collection "${collection}" not accessible: ${res.status} — assuming empty)`);
				return [];
			}
			throw new Error(`Failed to fetch ${collection} page ${page}: ${res.status} ${await res.text()}`);
		}
		const json = (await res.json()) as { data: T[] };
		const batch = json.data || [];
		all.push(...batch);
		if (batch.length < limit) break;
		page += 1;
	}
	return all;
}

function normalize(email: string | null | undefined): string | null {
	if (!email) return null;
	return email.trim().toLowerCase();
}

async function main() {
	console.log('==========================================');
	console.log('  people vs contacts — audit');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	console.log('Fetching people...');
	const people = await fetchAll<PersonRow>('people', [
		'id',
		'email',
		'first_name',
		'last_name',
		'is_team_member',
		'user',
	]);
	console.log(`  ${people.length} rows`);

	console.log('Fetching contacts...');
	const contacts = await fetchAll<ContactRow>('contacts', ['id', 'email', 'user']);
	console.log(`  ${contacts.length} rows`);
	console.log('');

	const contactEmails = new Set(contacts.map((c) => normalize(c.email)).filter(Boolean) as string[]);
	const contactUsers = new Set(contacts.map((c) => c.user).filter(Boolean) as string[]);

	const orphanedByEmail: PersonRow[] = [];
	const teamMembersWithoutContact: PersonRow[] = [];
	const dupes: PersonRow[] = [];

	for (const p of people) {
		const email = normalize(p.email);
		if (email) {
			if (!contactEmails.has(email)) {
				orphanedByEmail.push(p);
			} else {
				dupes.push(p);
			}
		} else if (!p.user) {
			orphanedByEmail.push(p);
		}

		if (p.is_team_member && p.user && !contactUsers.has(p.user)) {
			teamMembersWithoutContact.push(p);
		}
	}

	console.log(`Orphaned (people email NOT in contacts): ${orphanedByEmail.length}`);
	for (const p of orphanedByEmail) {
		console.log(`  #${p.id}  ${[p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)'} <${p.email || '(no email)'}>  team=${!!p.is_team_member} user=${p.user || '-'}`);
	}

	console.log('');
	console.log(`Already covered (people email IS in contacts): ${dupes.length}`);

	console.log('');
	console.log(`Team-member people with no matching contact (by user FK): ${teamMembersWithoutContact.length}`);
	for (const p of teamMembersWithoutContact) {
		console.log(`  #${p.id}  ${[p.first_name, p.last_name].filter(Boolean).join(' ')} user=${p.user}`);
	}

	console.log('');
	console.log('==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  people:    ${people.length}`);
	console.log(`  contacts:  ${contacts.length}`);
	console.log(`  orphaned:  ${orphanedByEmail.length}  (would be lost on drop)`);
	console.log(`  team-only: ${teamMembersWithoutContact.length}  (need contact upsert)`);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
