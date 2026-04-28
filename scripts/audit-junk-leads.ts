#!/usr/bin/env npx tsx
/**
 * Junk-lead sweep — flags suspected spam leads with `is_junk: true`.
 *
 * Heuristics live in `server/utils/junk-detection.ts` so the same scoring is
 * available to any future public lead-submission endpoint.
 *
 * Usage:
 *
 *   pnpm tsx scripts/audit-junk-leads.ts            # dry-run, prints what would change
 *   pnpm tsx scripts/audit-junk-leads.ts --apply    # actually patches leads to is_junk=true
 *   pnpm tsx scripts/audit-junk-leads.ts --apply --threshold=4   # tighter threshold
 *
 * Prerequisites:
 *   - DIRECTUS_URL + DIRECTUS_SERVER_TOKEN in env
 *
 * Reviewed leads keep their existing `status` (we only set is_junk + archive
 * via the same `useLeads.junkLead` shape so the UI hides them in the same way
 * as user-flagged junk).
 */

import 'dotenv/config';
import { scoreJunk } from '../server/utils/junk-detection';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var is required');
	process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const THRESHOLD = (() => {
	const arg = process.argv.find((a) => a.startsWith('--threshold='));
	if (!arg) return 5;
	const n = Number(arg.split('=')[1]);
	return Number.isFinite(n) && n > 0 ? n : 5;
})();

interface LeadRow {
	id: number;
	status: string | null;
	is_junk: boolean | null;
	notes: string | null;
	source: string | null;
	source_details: string | null;
	related_contact:
		| {
				id: string;
				first_name: string | null;
				last_name: string | null;
				email: string | null;
				company: string | null;
		  }
		| null;
}

async function fetchLeads(): Promise<LeadRow[]> {
	const all: LeadRow[] = [];
	const limit = 100;
	let page = 1;
	while (true) {
		const url = `${DIRECTUS_URL}/items/leads?fields=id,status,is_junk,notes,source,source_details,related_contact.id,related_contact.first_name,related_contact.last_name,related_contact.email,related_contact.company&limit=${limit}&page=${page}&filter[is_junk][_neq]=true`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		});
		if (!res.ok) {
			throw new Error(`Failed to fetch leads page ${page}: ${res.status} ${await res.text()}`);
		}
		const json = (await res.json()) as { data: LeadRow[] };
		const batch = json.data || [];
		all.push(...batch);
		if (batch.length < limit) break;
		page += 1;
	}
	return all;
}

async function flagLead(id: number): Promise<void> {
	const res = await fetch(`${DIRECTUS_URL}/items/leads/${id}`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: JSON.stringify({ is_junk: true, status: 'archived' }),
	});
	if (!res.ok) {
		throw new Error(`PATCH /items/leads/${id} failed: ${res.status} ${await res.text()}`);
	}
}

async function main() {
	console.log('==========================================');
	console.log('  Junk-lead audit');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log(`Mode:         ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
	console.log(`Threshold:    ${THRESHOLD} (score >= threshold flagged)`);
	console.log('');

	const leads = await fetchLeads();
	console.log(`Scanning ${leads.length} non-junk leads...\n`);

	const flagged: Array<{ id: number; score: number; reasons: string[]; preview: string }> = [];

	for (const lead of leads) {
		const c = lead.related_contact || null;
		const result = scoreJunk({
			firstName: c?.first_name ?? null,
			lastName: c?.last_name ?? null,
			email: c?.email ?? null,
			notes: lead.notes ?? null,
			company: c?.company ?? null,
		});
		if (result.score >= THRESHOLD) {
			const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || '(no name)';
			const email = c?.email || '(no email)';
			flagged.push({
				id: lead.id,
				score: result.score,
				reasons: result.reasons,
				preview: `${name} <${email}>`,
			});
		}
	}

	flagged.sort((a, b) => b.score - a.score);

	console.log(`Flagged: ${flagged.length}\n`);
	for (const f of flagged) {
		console.log(`  [${String(f.score).padStart(2, ' ')}] #${f.id}  ${f.preview}`);
		console.log(`         ${f.reasons.join(' · ')}`);
	}

	if (!APPLY) {
		console.log('');
		console.log(`Dry-run only. Re-run with --apply to mark these is_junk=true + archived.`);
		return;
	}

	if (flagged.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	console.log('');
	console.log(`Applying is_junk=true to ${flagged.length} leads...`);
	let ok = 0;
	let fail = 0;
	for (const f of flagged) {
		try {
			await flagLead(f.id);
			ok += 1;
		} catch (err) {
			console.error(`  ! lead #${f.id}: ${(err as Error).message}`);
			fail += 1;
		}
	}
	console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
