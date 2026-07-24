#!/usr/bin/env tsx
/**
 * seed-demo-payments.ts
 *
 * Fills the demo orgs with a dated `payments_received` ledger so the
 * financial-clarity "Collected · [period]" cards and the Revenue Certainty
 * "Banked" tier show real, period-varying numbers (the demo orgs ship with
 * invoices/proposals but ~zero collected cash, so those surfaces read $0).
 *
 * PARTIAL payments only (~40–55% of invoice total) so the Hunt / overdue
 * story survives — invoices stay partly outstanding, they just also show
 * some collected. Dates are spread across the period buckets (last 7d / 30d /
 * this month / this quarter / earlier this year / last year) so switching the
 * period visibly changes the number.
 *
 * Idempotent: each payment carries a unique marker note (`<PREFIX> <code>@<day>`)
 * and is skipped if it already exists. Dry-run by default; pass --apply to write.
 *
 *   DIRECTUS_SERVER_TOKEN=… pnpm tsx scripts/seed-demo-payments.ts          # preview
 *   DIRECTUS_SERVER_TOKEN=… pnpm tsx scripts/seed-demo-payments.ts --apply  # write
 */
import 'dotenv/config';
import { assertDirectusToken, directusRequest, findOne } from './lib/demo-seed';

assertDirectusToken();

const APPLY = process.argv.includes('--apply');
const NOTE_PREFIX = 'Demo seed — collected';

const ORGS = [
	{ id: 'd409875b-01d7-4f85-84c8-01c9badbb338', label: 'Agency' },
	{ id: '40c4d2e5-79d2-4008-9a97-9c14f94dfd0e', label: 'Solo' },
];

function isoDaysAgo(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	d.setHours(12, 0, 0, 0);
	return d.toISOString();
}

interface Step { inv: any; daysAgo: number; frac: number; method: string }

async function createPayment(org: { id: string }, s: Step, counters: { created: number; skipped: number; failed: number }) {
	const total = Number(s.inv.total_amount) || 0;
	const amount = Math.round(total * s.frac);
	if (amount <= 0) return;
	const date = isoDaysAgo(s.daysAgo);
	const note = `${NOTE_PREFIX} ${s.inv.invoice_code}@${date.slice(0, 10)}`;

	const existing = await findOne('payments_received', { note: { _eq: note } });
	if (existing) { console.log(`  [skip] ${note}`); counters.skipped++; return; }

	const tag = `$${amount.toLocaleString()} on ${s.inv.invoice_code} (${s.inv.client?.name || 'client'}) @ ${date.slice(0, 10)}`;
	if (!APPLY) { console.log(`  [dry]  ${tag}`); return; }

	const cr = await directusRequest('/items/payments_received', 'POST', {
		invoice_id: s.inv.id,
		organization: org.id,
		amount: amount.toFixed(2),
		status: 'paid',
		stripe_status: 'succeeded',
		payment_method: s.method,
		date_received: date,
		livemode: true,
		note,
	});
	if (cr.ok) { console.log(`  [ok]   ${tag}`); counters.created++; }
	else { console.log(`  [fail] ${tag} — ${cr.error}`); counters.failed++; }
}

async function seedOrg(org: { id: string; label: string }) {
	console.log(`\n▶ ${org.label} (${org.id})`);
	const filter = encodeURIComponent(JSON.stringify({ bill_to: { _eq: org.id } }));
	const fields = 'id,invoice_code,total_amount,client.id,client.name,projects.projects_id';
	const res = await directusRequest<any[]>(`/items/invoices?filter=${filter}&fields=${fields}&sort=-total_amount&limit=25`);
	const invoices = (res.data || []).filter((i) => (Number(i.total_amount) || 0) > 0);
	if (!invoices.length) {
		console.log('  (no invoices — nothing to seed)');
		return;
	}

	// The largest invoice (prefer one linked to a project so the project card
	// lights up too) gets THREE dated partial payments → within-entity period
	// variation, capped at 50% so it stays in the Hunt.
	const projectLinked = invoices.filter((i) => (i.projects || []).length > 0);
	const big = projectLinked[0] || invoices[0];

	// Demo invoices ship client-billed (not linked to a project), so the
	// project-level Collected card + pipeline would read $0. Link the big invoice
	// to its client's largest project so the project surface populates too.
	if (!(big.projects || []).length && big.client?.id) {
		const pf = encodeURIComponent(JSON.stringify({ client: { _eq: big.client.id }, status: { _neq: 'Archived' } }));
		const pr = await directusRequest<any[]>(`/items/projects?filter=${pf}&fields=id,title&sort=-contract_value&limit=1`);
		const proj = (pr.data || [])[0];
		if (proj) {
			const existing = await findOne('invoices_projects', { invoices_id: { _eq: big.id }, projects_id: { _eq: proj.id } });
			if (existing) console.log(`  [skip] link ${big.invoice_code} → ${proj.title}`);
			else if (!APPLY) console.log(`  [dry]  link ${big.invoice_code} → project "${proj.title}"`);
			else {
				const lr = await directusRequest('/items/invoices_projects', 'POST', { invoices_id: big.id, projects_id: proj.id });
				console.log(lr.ok ? `  [ok]   link ${big.invoice_code} → "${proj.title}"` : `  [fail] link ${big.invoice_code} — ${lr.error}`);
			}
		}
	}

	const steps: Step[] = [
		{ inv: big, daysAgo: 2, frac: 0.20, method: 'card' },
		{ inv: big, daysAgo: 60, frac: 0.15, method: 'ach' },
		{ inv: big, daysAgo: 300, frac: 0.15, method: 'card' },
	];
	// One partial (40%) on each of the next invoices, spread across buckets.
	const restOffsets = [19, 44, 131, 400];
	invoices.filter((i) => i.id !== big.id).slice(0, restOffsets.length).forEach((inv, j) => {
		steps.push({ inv, daysAgo: restOffsets[j], frac: 0.4, method: j % 2 ? 'ach' : 'card' });
	});

	const counters = { created: 0, skipped: 0, failed: 0 };
	for (const s of steps) await createPayment(org, s, counters);
	console.log(`  → ${APPLY ? `created ${counters.created}, skipped ${counters.skipped}, failed ${counters.failed}` : 'dry-run (no writes)'}`);
}

async function main() {
	console.log(`Seed demo payments — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (pass --apply to write)'}`);
	for (const org of ORGS) await seedOrg(org);
	console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
