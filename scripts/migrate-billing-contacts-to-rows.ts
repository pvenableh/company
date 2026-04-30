#!/usr/bin/env npx tsx
/**
 * Migrate clients.billing_contacts JSON → per-contact rows
 * ────────────────────────────────────────────────────────
 * For each client with a non-empty `billing_contacts` JSON array:
 *
 *   For each { name, email } entry:
 *     1. Find an existing contact row in the same org with this email.
 *        - Already attached to THIS client → PATCH is_billing_contact=true.
 *        - Attached to a different client → CREATE a new contact row for this
 *          client (don't poach from the other client).
 *        - Unattached but in this org → PATCH client + is_billing_contact=true.
 *     2. Otherwise CREATE a new contact (first_name/last_name parsed from
 *        the JSON `name`), link to client + org junction, set
 *        is_billing_contact=true.
 *
 *   After all entries handled, PATCH client.billing_contacts = [] so the
 *   recursive billing-walk no longer falls through the legacy JSON path.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-billing-contacts-to-rows.ts            # dry-run
 *   pnpm tsx scripts/migrate-billing-contacts-to-rows.ts --apply    # commit
 *
 * Idempotent: re-running after --apply is a no-op since the JSON arrays
 * are cleared.
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
		headers: {
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			'Content-Type': 'application/json',
			...(init.headers || {}),
		},
	});
	if (!r.ok) {
		const body = await r.text().catch(() => '');
		throw new Error(`${r.status} ${r.statusText} on ${init.method || 'GET'} ${path}\n${body}`);
	}
	if (r.status === 204) return undefined as any;
	const j = await r.json();
	return j.data ?? j;
}

interface BillingEntry {
	name?: string | null;
	email?: string | null;
}

interface ClientRow {
	id: string;
	name: string;
	organization: string;
	billing_contacts: BillingEntry[] | null;
}

interface ContactRow {
	id: string;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	client: string | null;
	is_billing_contact: boolean | null;
}

function splitName(full?: string | null): { first: string; last: string } {
	const t = (full || '').trim();
	if (!t) return { first: '', last: '' };
	const parts = t.split(/\s+/);
	if (parts.length === 1) return { first: parts[0]!, last: '' };
	return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

async function main() {
	console.log('==========================================');
	console.log('  billing_contacts JSON → per-row migration');
	console.log(`  Mode: ${APPLY ? 'APPLY (writes!)' : 'DRY-RUN (no writes)'}`);
	console.log(`  Directus: ${DIRECTUS_URL}`);
	console.log('==========================================\n');

	// 1. Load every client with a non-empty billing_contacts array.
	const clients = await api<ClientRow[]>(
		`/items/clients?fields=id,name,organization,billing_contacts&filter[billing_contacts][_nnull]=true&limit=-1`,
	);
	const candidates = clients.filter(c => Array.isArray(c.billing_contacts) && c.billing_contacts.length > 0);
	console.log(`Found ${candidates.length} client(s) with legacy billing_contacts entries.\n`);

	let totalEntries = 0;
	let totalCreated = 0;
	let totalLinked = 0;
	let totalFlagged = 0;
	let totalSkipped = 0;
	let totalCleared = 0;

	for (const client of candidates) {
		const entries = (client.billing_contacts || []).filter(e => e?.email?.trim());
		if (!entries.length) {
			console.log(`  [skip] client "${client.name}" — no entries with email`);
			continue;
		}

		console.log(`\nClient: "${client.name}" (org=${client.organization})`);
		console.log(`  ${entries.length} legacy entrie(s)`);

		for (const entry of entries) {
			totalEntries++;
			const email = entry.email!.trim();
			const { first, last } = splitName(entry.name);

			// 2. Look up an existing contact in the same org with this email.
			const sameOrgQuery =
				`/items/contacts` +
				`?fields=id,first_name,last_name,email,client,is_billing_contact` +
				`&filter[email][_eq]=${encodeURIComponent(email)}` +
				`&filter[organizations][organizations_id][_eq]=${encodeURIComponent(client.organization)}` +
				`&limit=10`;
			const matches = await api<ContactRow[]>(sameOrgQuery);

			const sameClient = matches.find(m => m.client === client.id);
			const otherClient = matches.find(m => m.client && m.client !== client.id);
			const unattached = matches.find(m => !m.client);

			if (sameClient) {
				if (sameClient.is_billing_contact) {
					console.log(`    [skip] ${email} — already flagged on this client`);
					totalSkipped++;
				} else {
					console.log(`    [flag] ${email} — set is_billing_contact=true on ${sameClient.id}`);
					totalFlagged++;
					if (APPLY) {
						await api(`/items/contacts/${sameClient.id}`, {
							method: 'PATCH',
							body: JSON.stringify({ is_billing_contact: true }),
						});
					}
				}
			} else if (unattached) {
				console.log(`    [link] ${email} — attach existing unattached contact ${unattached.id} + flag billing`);
				totalLinked++;
				if (APPLY) {
					await api(`/items/contacts/${unattached.id}`, {
						method: 'PATCH',
						body: JSON.stringify({
							client: client.id,
							is_billing_contact: true,
						}),
					});
				}
			} else if (otherClient) {
				// Don't poach from another client — create a new row instead so both
				// clients keep their ledger of who-billed-whom.
				console.log(`    [create] ${email} — exists at client ${otherClient.client}; create new for "${client.name}"`);
				totalCreated++;
				if (APPLY) {
					const created = await api<ContactRow>(`/items/contacts`, {
						method: 'POST',
						body: JSON.stringify({
							first_name: first || null,
							last_name: last || null,
							email,
							client: client.id,
							is_billing_contact: true,
							status: 'published',
							source: 'billing-migration',
						}),
					});
					await api(`/items/contacts_organizations`, {
						method: 'POST',
						body: JSON.stringify({
							contacts_id: created.id,
							organizations_id: client.organization,
						}),
					});
				}
			} else {
				console.log(`    [create] ${email} — no existing row; create new "${first} ${last}".trim()`);
				totalCreated++;
				if (APPLY) {
					const created = await api<ContactRow>(`/items/contacts`, {
						method: 'POST',
						body: JSON.stringify({
							first_name: first || null,
							last_name: last || null,
							email,
							client: client.id,
							is_billing_contact: true,
							status: 'published',
							source: 'billing-migration',
						}),
					});
					await api(`/items/contacts_organizations`, {
						method: 'POST',
						body: JSON.stringify({
							contacts_id: created.id,
							organizations_id: client.organization,
						}),
					});
				}
			}
		}

		// 3. Clear the legacy JSON so the billing-walk uses the new rows.
		console.log(`  [clear] billing_contacts JSON → []`);
		totalCleared++;
		if (APPLY) {
			await api(`/items/clients/${client.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ billing_contacts: [] }),
			});
		}
	}

	console.log('\n==========================================');
	console.log('  Summary');
	console.log('==========================================');
	console.log(`  Clients touched:        ${candidates.length}`);
	console.log(`  Legacy entries seen:    ${totalEntries}`);
	console.log(`  → Already flagged:      ${totalSkipped}`);
	console.log(`  → Newly flagged:        ${totalFlagged}`);
	console.log(`  → Linked + flagged:     ${totalLinked}`);
	console.log(`  → New contacts created: ${totalCreated}`);
	console.log(`  Clients with JSON cleared: ${totalCleared}`);
	console.log('');
	if (!APPLY) {
		console.log('  This was a DRY-RUN. Re-run with --apply to write changes.');
	} else {
		console.log('  Done.');
	}
}

main().catch(err => {
	console.error('Fatal:', err);
	process.exit(1);
});
