#!/usr/bin/env npx tsx
/**
 * Seed demo "pursuit" data — leads with a full pursuit history (touchpoints on
 * the new unified `touchpoints.lead` FK) plus a couple of proposals attached to
 * leads. Makes the pursuit-tracking concept + the touchpoint unification
 * demonstrable in the Solo and Agency demo orgs.
 *
 * Idempotent: guarded per-org by a sentinel contact email; re-running is a no-op.
 *
 * Usage:
 *   pnpm tsx scripts/seed-demo-pursuit.ts
 */

import 'dotenv/config';
import { directusRequest } from './lib/demo-seed';

const SOLO_ID = '40c4d2e5-79d2-4008-9a97-9c14f94dfd0e';
const AGENCY_ID = 'd409875b-01d7-4f85-84c8-01c9badbb338';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const daysAhead = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };

interface Touch {
	type: string; summary: string; note?: string; daysAgo: number;
	outcome?: 'positive' | 'neutral' | 'negative' | 'no_response';
	awaiting_response?: boolean; next_action?: string; next_action_daysAhead?: number;
}
interface Prop {
	title: string; total_value: number; proposal_status: 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
	sentDaysAgo: number; validDays: number;
}
interface LeadSpec {
	first: string; last: string; email: string; company: string; source: string;
	stage: string; estimated_value: number; priority?: string; timeline?: string;
	project_type?: string; lost_reason?: string; tags?: string[];
	touches: Touch[]; proposal?: Prop;
}

async function post(collection: string, body: any): Promise<any> {
	const res = await directusRequest<any>(`/items/${collection}`, 'POST', body);
	if (!res.ok) throw new Error(`create ${collection} failed: ${res.error || res.status}`);
	return res.data;
}
async function exists(path: string): Promise<boolean> {
	const res = await directusRequest<any[]>(path);
	return res.ok && Array.isArray(res.data) && res.data.length > 0;
}

async function seedLead(orgId: string, s: LeadSpec) {
	// 1. Contact (+ org junction).
	const contact = await post('contacts', {
		first_name: s.first, last_name: s.last, email: s.email, company: s.company,
		client: null, source: s.source, status: 'published',
	});
	await post('contacts_organizations', { contacts_id: contact.id, organizations_id: orgId });

	// 2. Lead.
	const lead = await post('leads', {
		organization: orgId,
		related_contact: contact.id,
		stage: s.stage,
		source: s.source === 'carddesk' ? 'business card' : 'referral',
		estimated_value: s.estimated_value,
		priority: s.priority || 'medium',
		timeline: s.timeline || '1-3 months',
		project_type: s.project_type || null,
		lead_score: Math.min(90, 40 + s.touches.length * 8),
		tags: ['demo-pursuit-seed', ...(s.tags || [])],
		lost_reason: s.lost_reason || null,
		closed_date: s.stage === 'lost' || s.stage === 'won' ? daysAgo(3) : null,
		status: 'published',
	});

	// 3. Touchpoints (pursuit history) on the lead.
	for (const t of s.touches) {
		await post('touchpoints', {
			organization: orgId,
			lead: lead.id,
			type: t.type,
			summary: t.summary,
			note: t.note || null,
			occurred_at: daysAgo(t.daysAgo),
			outcome: t.outcome || null,
			awaiting_response: t.awaiting_response ?? false,
			next_action: t.next_action || null,
			next_action_date: t.next_action_daysAhead ? daysAhead(t.next_action_daysAhead) : null,
			contacts: [{ contacts_id: contact.id }],
		});
	}

	// 4. Optional proposal attached to the lead.
	if (s.proposal) {
		await post('proposals', {
			organization: orgId,
			lead: lead.id,
			contact: contact.id,
			title: s.proposal.title,
			total_value: s.proposal.total_value,
			proposal_status: s.proposal.proposal_status,
			date_sent: daysAgo(s.proposal.sentDaysAgo),
			valid_until: daysAhead(s.proposal.validDays),
			status: 'published',
		});
	}

	console.log(`  [ok] lead "${s.first} ${s.last}" (${s.stage}) + ${s.touches.length} touchpoints${s.proposal ? ' + proposal' : ''}`);
}

function agencyLeads(): LeadSpec[] {
	return [
		{
			first: 'Maya', last: 'Chen', email: 'maya.chen@northwind.demo', company: 'Northwind Ventures',
			source: 'carddesk', stage: 'proposal_sent', estimated_value: 48000, priority: 'high', project_type: 'Brand + site',
			touches: [
				{ type: 'note', summary: 'Business-card scan', note: 'Met at the AIGA mixer.', daysAgo: 30, outcome: 'positive' },
				{ type: 'call', summary: 'Intro call (15m)', note: 'Loved the portfolio, wants a quote.', daysAgo: 28, outcome: 'positive' },
				{ type: 'note', summary: 'Proposal sent — Brand system + site', note: '$48k, valid 2 weeks.', daysAgo: 25 },
				{ type: 'email', summary: 'Follow-up email', note: 'Checked in, no reply.', daysAgo: 18, outcome: 'no_response', awaiting_response: true, next_action: 'Try a phased $14k option', next_action_daysAhead: 2 },
			],
			proposal: { title: 'Brand system + website', total_value: 48000, proposal_status: 'viewed', sentDaysAgo: 25, validDays: -3 },
		},
		{
			first: 'Daniel', last: 'Ortiz', email: 'daniel.ortiz@harbor.demo', company: 'Harbor Co.',
			source: 'referral', stage: 'negotiating', estimated_value: 54000, priority: 'high', project_type: 'Rebrand',
			touches: [
				{ type: 'note', summary: 'Referral from Helios', daysAgo: 21, outcome: 'positive' },
				{ type: 'call', summary: 'Discovery call (30m)', daysAgo: 19, outcome: 'positive' },
				{ type: 'note', summary: 'Proposal sent — Harbor rebrand', daysAgo: 12 },
				{ type: 'meeting', summary: 'Scope review', note: 'Negotiating timeline + payment terms.', daysAgo: 4, outcome: 'positive', awaiting_response: true },
			],
			proposal: { title: 'Harbor rebrand', total_value: 54000, proposal_status: 'sent', sentDaysAgo: 12, validDays: 10 },
		},
		{
			first: 'Priya', last: 'Nair', email: 'priya.nair@lumen.demo', company: 'Lumen Health',
			source: 'website', stage: 'qualified', estimated_value: 18000, priority: 'medium', project_type: 'Marketing site',
			touches: [
				{ type: 'note', summary: 'Website inquiry', note: 'Filled the contact form.', daysAgo: 9 },
				{ type: 'email', summary: 'Sent intro + rate card', daysAgo: 8 },
				{ type: 'call', summary: 'Qualification call', note: 'Budget confirmed ~$18k.', daysAgo: 5, outcome: 'neutral', next_action: 'Send tailored proposal', next_action_daysAhead: 3 },
			],
		},
		{
			first: 'Tom', last: 'Reyes', email: 'tom.reyes@orion.demo', company: 'Orion Group',
			source: 'referral', stage: 'lost', estimated_value: 60000, priority: 'medium', project_type: 'Platform', lost_reason: 'Went with an in-house team',
			touches: [
				{ type: 'call', summary: 'Intro call', daysAgo: 40, outcome: 'positive' },
				{ type: 'note', summary: 'Proposal sent — Orion platform', daysAgo: 33 },
				{ type: 'email', summary: 'Follow-up', daysAgo: 20, outcome: 'no_response' },
				{ type: 'note', summary: 'Lost — in-house team', note: 'Reason: went with an in-house team.', daysAgo: 6, outcome: 'negative' },
			],
			proposal: { title: 'Orion platform', total_value: 60000, proposal_status: 'rejected', sentDaysAgo: 33, validDays: -12 },
		},
	];
}

function soloLeads(): LeadSpec[] {
	return [
		{
			first: 'Sofia', last: 'Marino', email: 'sofia.marino@bloom.demo', company: 'Bloom Cafe',
			source: 'carddesk', stage: 'contacted', estimated_value: 6500, priority: 'medium', project_type: 'Logo + menu',
			touches: [
				{ type: 'note', summary: 'Business-card scan', note: 'Coffee shop owner, needs a brand.', daysAgo: 12, outcome: 'positive' },
				{ type: 'text', summary: 'Texted to set up a call', daysAgo: 10, awaiting_response: true, next_action: 'Call Thursday', next_action_daysAhead: 1 },
			],
		},
		{
			first: 'Marcus', last: 'Webb', email: 'marcus.webb@ridgeline.demo', company: 'Ridgeline Gear',
			source: 'website', stage: 'proposal_sent', estimated_value: 12000, priority: 'high', project_type: 'E-commerce site',
			touches: [
				{ type: 'email', summary: 'Inbound: needs a Shopify redesign', daysAgo: 15 },
				{ type: 'call', summary: 'Scoping call', daysAgo: 13, outcome: 'positive' },
				{ type: 'note', summary: 'Proposal sent — Shopify redesign', daysAgo: 9 },
				{ type: 'email', summary: 'Nudge', daysAgo: 3, outcome: 'no_response', awaiting_response: true },
			],
			proposal: { title: 'Shopify redesign', total_value: 12000, proposal_status: 'viewed', sentDaysAgo: 9, validDays: 5 },
		},
	];
}

async function seedOrg(name: string, orgId: string, specs: LeadSpec[]) {
	console.log(`\n=== ${name} demo ===`);
	const sentinel = specs[0]!.email;
	if (await exists(`/items/contacts?filter[email][_eq]=${encodeURIComponent(sentinel)}&limit=1`)) {
		console.log(`  already seeded (found ${sentinel}) — skipping`);
		return;
	}
	for (const s of specs) await seedLead(orgId, s);
}

async function main() {
	console.log('========================================');
	console.log('  Seed demo pursuit data (leads + touchpoints + proposals)');
	console.log('========================================');
	await seedOrg('Agency', AGENCY_ID, agencyLeads());
	await seedOrg('Solo', SOLO_ID, soloLeads());
	console.log('\nDone.');
}

main().catch((err) => { console.error('Seed failed:', err.message || err); process.exit(1); });
