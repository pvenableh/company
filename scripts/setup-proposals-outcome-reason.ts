#!/usr/bin/env npx tsx
/**
 * Pursuit tracking — capture WHY a proposal went cold or was rejected.
 * Adds `proposals.outcome_reason` (select, nullable) so lost/cold deals become
 * learning (loss-reason rollups) instead of just history. Additive + idempotent.
 *
 * Usage: pnpm tsx scripts/setup-proposals-outcome-reason.ts  (then pnpm generate:types)
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('Error: DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req(path: string, method = 'GET', body?: unknown) {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { ok: r.ok, status: r.status, error: r.ok ? null : await r.text().catch(() => '') };
}

async function main() {
	console.log(`Directus: ${DIRECTUS_URL}\n`);
	const exists = (await req('/fields/proposals/outcome_reason')).ok;
	if (exists) { console.log('  [skip] proposals.outcome_reason already exists'); return; }
	const res = await req('/fields/proposals', 'POST', {
		field: 'outcome_reason',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [
				{ text: 'Price', value: 'price' },
				{ text: 'Timing', value: 'timing' },
				{ text: 'Lost to competitor', value: 'competitor' },
				{ text: 'No response / ghosted', value: 'no_response' },
				{ text: 'Scope mismatch', value: 'scope' },
				{ text: 'Budget', value: 'budget' },
				{ text: 'Other', value: 'other' },
			] },
			note: 'Why a proposal went cold or was rejected — the learning signal for the pursuit pipeline.',
			width: 'half',
		},
		schema: { is_nullable: true },
	});
	if (!res.ok) { console.error(`  [fail] ${res.error}`); process.exit(1); }
	console.log('  [ok]   proposals.outcome_reason created');
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
