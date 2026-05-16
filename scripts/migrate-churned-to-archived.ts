#!/usr/bin/env npx tsx
/**
 * Migrate churned clients → archived.
 *
 * "Churned" was an account_state enum value used to flag former customers.
 * Product decided to fold it into the archived lifecycle so churned clients
 * are out of sight by default (Archived tab on /clients) without losing the
 * row. Per churned row:
 *
 *   1. account_state = 'inactive'   (keep relationship signal)
 *   2. status        = 'archived'   (hide from primary tabs)
 *
 * The remaining Directus field cleanup (drop the 'churned' option from the
 * account_state enum) is a separate apply step on setup-client-account-state-field.ts
 * after this migration has been verified.
 *
 * Safety:
 *   - Dry-run by default. Requires `--apply` to write.
 *   - Idempotent: rows already at status='archived' are skipped (still
 *     reset account_state if it lingered as 'churned').
 *   - Reports a sample (up to 10) of planned changes before writing.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');

type ClientRow = {
	id: string;
	name: string;
	status: string | null;
	account_state: string | null;
};

async function directusRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${DIRECTUS_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			'Content-Type': 'application/json',
			...(init.headers || {}),
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Directus ${init.method ?? 'GET'} ${path} failed ${res.status}: ${body}`);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

async function main() {
	console.log('Migrating churned clients → archived');
	console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

	const { data: rows } = await directusRequest<{ data: ClientRow[] }>(
		'/items/clients?filter[account_state][_eq]=churned&fields=id,name,status,account_state&limit=-1',
	);

	console.log(`Found ${rows.length} client rows with account_state='churned'`);
	if (!rows.length) return;

	const planned = rows.map((r) => ({
		id: r.id,
		name: r.name,
		from: { status: r.status, account_state: r.account_state },
		to: { status: 'archived', account_state: 'inactive' },
	}));

	console.log(`\nSample (up to 10):`);
	planned.slice(0, 10).forEach((p) => {
		console.log(`  - ${p.name} [${p.id}]  status: ${p.from.status} → archived,  account_state: churned → inactive`);
	});

	if (!APPLY) {
		console.log('\nDry run only. Re-run with --apply to write.');
		return;
	}

	let written = 0;
	for (const p of planned) {
		try {
			await directusRequest(`/items/clients/${p.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'archived', account_state: 'inactive' }),
			});
			written += 1;
		} catch (err) {
			console.error(`  FAIL ${p.name} [${p.id}]:`, err);
		}
	}
	console.log(`\nWrote ${written}/${planned.length} rows.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
