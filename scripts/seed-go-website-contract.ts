#!/usr/bin/env npx tsx
/**
 * Seed the Greater Opportunities — Website Refresh & Directus CMS Upgrade
 * contract using the new typed-block document system.
 *
 * Demonstrates the post-upgrade authoring pattern end-to-end:
 *   - rich_text blocks (heading + markdown body) for prose sections
 *   - scope_tree block with per-phase deliverables (replaces free-text scope)
 *   - page_break_after flags to control PDF pagination
 *
 * Idempotent: looks up the contract by title within the Hue org and
 * PATCHes the existing row if it already exists.
 *
 *   pnpm tsx scripts/seed-go-website-contract.ts
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { assertDirectusToken, directusRequest, findOne } from './lib/demo-seed';

const CONTRACT_TITLE = 'Website Refresh & Directus CMS Upgrade';
const CLIENT_NAME = 'Greater Opportunities';
const CLIENT_SHORT = 'GO';
const CONTACT_FIRST = 'Mark';
const CONTACT_LAST = 'Silvanic';
const CONTACT_PHONE = '(607) 723-6493';
const CLIENT_ADDRESS = '5 W State St, Binghamton, NY 13901';
const CLIENT_WEBSITE = 'greaterops.org';
const AGREEMENT_DATE = '2026-05-05';
const VALID_UNTIL = '2026-05-26'; // +21 days
const PROJECT_START = '2026-05-11';
const TOTAL_VALUE = 9670;

type Block = {
	id: string;
	type: 'rich_text' | 'scope_tree';
	payload: any;
	library_ref: null;
	page_break_after?: boolean;
};

function rich(heading: string | null, body_markdown: string, opts?: { page_break_after?: boolean }): Block {
	return {
		id: randomUUID(),
		type: 'rich_text',
		payload: { heading, body_markdown },
		library_ref: null,
		...(opts?.page_break_after ? { page_break_after: true } : {}),
	};
}

function scopeNode(heading: string, summary: string, deliverables: string[]) {
	return {
		id: randomUUID(),
		heading,
		summary,
		bullets: [],
		deliverables,
		show_deliverables: true,
	};
}

async function resolveHueOrg(): Promise<any | null> {
	const org =
		(await findOne<any>('organizations', { slug: { _eq: 'hue' } })) ||
		(await findOne<any>('organizations', { code: { _eq: 'HUE' } })) ||
		(await findOne<any>('organizations', { name: { _eq: 'Hue' } }));
	return org;
}

async function findOrCreateContact(orgId: string): Promise<any | null> {
	const existing =
		(await findOne<any>('contacts', {
			_and: [
				{ organization: { _eq: orgId } },
				{ first_name: { _eq: CONTACT_FIRST } },
				{ last_name: { _eq: CONTACT_LAST } },
			],
		})) ||
		(await findOne<any>('contacts', {
			_and: [
				{ organization: { _eq: orgId } },
				{ company: { _eq: CLIENT_NAME } },
			],
		}));
	if (existing) {
		console.log(`  [skip] contact ${CONTACT_FIRST} ${CONTACT_LAST} (id=${existing.id})`);
		return existing;
	}
	const res = await directusRequest<any>('/items/contacts', 'POST', {
		organization: orgId,
		first_name: CONTACT_FIRST,
		last_name: CONTACT_LAST,
		company: CLIENT_NAME,
		phone: CONTACT_PHONE,
		website: CLIENT_WEBSITE,
		address: CLIENT_ADDRESS,
	});
	if (!res.ok) {
		console.error(`  [fail] create contact: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   contact ${CONTACT_FIRST} ${CONTACT_LAST} (id=${(res.data as any)?.id})`);
	return res.data;
}

function buildBlocks(): Block[] {
	const blocks: Block[] = [];

	blocks.push(
		rich(
			'1. Parties',
			[
				'This Service Agreement (the "Agreement") is entered into between **Hue** (the "Agency") and **Greater Opportunities (GO)** (the "Client").',
				'',
				'**Agency**  ',
				'Hue · 1033 Lenox Ave, #314, Miami Beach, FL 33139  ',
				'Peter Hoffman, Digital Director · (305) 680-0485 · huestudios.com',
				'',
				'**Client**  ',
				`Greater Opportunities (${CLIENT_SHORT}) · ${CLIENT_ADDRESS}  `,
				`${CONTACT_FIRST} ${CONTACT_LAST} · ${CONTACT_PHONE} · ${CLIENT_WEBSITE}`,
				'',
				`Agreement Date: **${AGREEMENT_DATE}** · Project Start: **${PROJECT_START}** · Contract Value: **$${TOTAL_VALUE.toLocaleString()}**`,
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'2. Scope of Work',
			'Hue will deliver the following phases as a website and CMS upgrade. The backend architecture will be built API-first, laying the foundation for future app integration should the Client choose to pursue that at a later date.',
		),
	);

	blocks.push({
		id: randomUUID(),
		type: 'scope_tree',
		payload: {
			numbering_style: 'phase_word',
			phases: [
				scopeNode(
					'Web Content Structure',
					'Reorganization of site content and CMS data model to improve flow and SEO targeting.',
					[
						'Reorganization of content to improve visitor flow throughout the site',
						'Improved SEO targeting the right audience',
						'CMS update to modularize data (separation of data from design)',
					],
				),
				scopeNode(
					'Website Refresh (Design)',
					'Three rounds of design covering look, feel, motion, and responsive behavior.',
					[
						'3 design rounds to establish look and feel of the website',
						'Wireframe of website to demonstrate navigation and movement',
						'Page template designs for dynamic content',
						'Mobile site design (responsive design)',
						'Purposeful animated interactions to enhance user experience',
						'CMS and database design',
						'Identification and planning of targeted dynamic content',
					],
				),
				scopeNode(
					'Website Development',
					'Frontend + headless CMS build with analytics, PWA, and integration hooks.',
					[
						'Complete development in latest standards-based HTML/CSS',
						'Vue.js / Nuxt.js JavaScript framework for the frontend experience',
						'Directus headless CMS: installed, configured, and customized',
						'User management including roles, invitations, and registrations',
						'Custom email service for confirmations and notifications',
						'All content available via API for future integrations',
						'Google Analytics installed and configured for visitor tracking and reporting',
						'JavaScript animations following industry best practices',
						'SEO programming based on Google research and target audience',
						'Publishing of existing content onto new platform',
						'Progressive Web App (PWA) support installed',
						'JavaScript hooks for sign-ups and user interactions',
						'Social media integration',
					],
				),
				scopeNode(
					'Data Migration',
					'Export from the current site and import into the new CMS for archival reference.',
					[
						'Compile and export users and past event data',
						'Import users and past event data into new CMS for archival reference',
					],
				),
				scopeNode(
					'Website Launch',
					'Deployment, cross-device QA, and social/SEO verification.',
					[
						'Compile web files for distribution',
						'Setup repository for site deployment and connect to Vercel',
						'Full browser and device testing across all major browsers',
						'Open Graph debugger check and social sharing tag verification',
					],
				),
			],
		},
		library_ref: null,
		page_break_after: true,
	});

	blocks.push(
		rich(
			'3. Fees & Payment Schedule',
			[
				`The total project fee for all work described in Section 2 is **$${TOTAL_VALUE.toLocaleString()}**. Payment is structured across three milestones:`,
				'',
				'| Payment Milestone | Amount |',
				'| --- | ---: |',
				'| 50% Deposit — Due upon signing to initiate project | $4,835.00 |',
				'| 25% — Due upon completion of Phase 2 (design approved) | $2,417.50 |',
				'| 25% — Due upon website launch (Phase 5) | $2,417.50 |',
				'| **Total Project Fee** | **$9,670.00** |',
				'',
				'All invoices are due within 14 days of receipt. Work will pause on overdue accounts. Payments may be made by check, ACH transfer, or credit card (3% processing fee applies to card payments).',
				'',
				'**Maintenance Plan** — Website and CMS Hosting (Vercel): **$50/month**.',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'4. Timeline',
			[
				'The estimated project duration is **10–14 weeks** from the project start date. The timeline is contingent on timely client feedback and approvals at each phase. Delays caused by the Client may extend the timeline and are not the responsibility of Hue.',
				'',
				'- Phase 1 — Content Structure: Weeks 1–2',
				'- Phase 2 — Design: Weeks 2–6 (includes 3 design rounds)',
				'- Phase 3 — Development: Weeks 6–11',
				'- Phase 4 — Data Migration: Weeks 10–12',
				'- Phase 5 — Launch: Weeks 12–14',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'5. Client Responsibilities',
			[
				'Greater Opportunities agrees to:',
				'',
				'- Provide timely access to existing website credentials, hosting accounts, and content assets',
				'- Supply all copy, images, logos, and other brand materials needed for the project',
				'- Designate a primary point of contact for approvals and feedback',
				'- Provide written approval at the end of each design round within 5 business days',
				'- Ensure all content provided to Hue is owned by or properly licensed to the Client',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'6. Intellectual Property & Ownership',
			[
				'Upon receipt of final payment, the Client shall own all custom deliverables produced under this Agreement, including website code, design assets, and CMS configurations. Hue retains the right to display the completed work in its portfolio.',
				'',
				'Third-party software and frameworks (including Vue.js, Nuxt.js, Directus, Google Analytics, and Vercel) remain subject to their respective licenses. The Client is responsible for maintaining any required subscriptions or licenses after project completion.',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'7. Revisions & Change Orders',
			[
				'This Agreement includes three (3) design rounds as described in Phase 2. Each round consists of an interactive presentation with multiple design concepts.',
				'',
				'Any requests for work outside the defined scope — including additional pages, features, or functionality not described in Section 2 — will be quoted separately as a Change Order. No out-of-scope work will commence without written approval and a signed Change Order.',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'8. Cancellation & Termination',
			[
				'- Either party may terminate this Agreement with 14 days written notice.',
				'- If the Client cancels before Phase 2 begins: the deposit will be refunded minus any hours worked.',
				'- If the Client cancels after Phase 2 begins: a 50% cancellation fee ($4,835) applies and is non-refundable.',
				'- If Hue terminates the Agreement without cause, all prepaid fees for work not yet completed will be refunded.',
				'- Upon termination, Hue will deliver all work completed to date. Ownership transfers only upon receipt of full payment.',
			].join('\n'),
		),
	);

	blocks.push(
		rich(
			'9. Confidentiality',
			'Both parties agree to keep confidential any proprietary information disclosed during the course of the project. This obligation survives termination of this Agreement.',
		),
	);

	blocks.push(
		rich(
			'10. Limitation of Liability',
			'Hue\'s total liability under this Agreement shall not exceed the total fees paid by the Client. Hue shall not be liable for indirect, incidental, or consequential damages. Hue is not responsible for third-party service outages including hosting providers and analytics platforms.',
		),
	);

	blocks.push(
		rich(
			'11. General Terms',
			[
				'**Validity:** This proposal is valid for 21 days from the Agreement Date.  ',
				'**Governing Law:** This Agreement is governed by the laws of the State of Florida.  ',
				'**Entire Agreement:** This Agreement supersedes all prior proposals, negotiations, and representations.  ',
				'**Amendments:** Any modifications must be in writing and signed by both parties.  ',
				'**Severability:** If any provision is found invalid, the remaining provisions remain in full effect.',
			].join('\n'),
		),
	);

	return blocks;
}

async function run() {
	assertDirectusToken();

	console.log('▶ Resolving Hue organization…');
	const hue = await resolveHueOrg();
	if (!hue) {
		console.error('  [fail] Hue organization not found. Set slug=hue, code=HUE, or name=Hue.');
		process.exit(1);
	}
	console.log(`  [ok]   Hue org id=${hue.id}`);

	console.log('▶ Resolving Greater Opportunities contact…');
	const contact = await findOrCreateContact(hue.id);
	if (!contact) {
		console.error('  [fail] could not resolve contact.');
		process.exit(1);
	}

	console.log('▶ Building typed-block content…');
	const blocks = buildBlocks();
	console.log(`  [ok]   ${blocks.length} blocks ready (1 scope_tree, ${blocks.length - 1} rich_text)`);

	console.log('▶ Find-or-create contract…');
	const existing = await findOne<any>('contracts', {
		_and: [
			{ organization: { _eq: hue.id } },
			{ title: { _eq: CONTRACT_TITLE } },
		],
	});

	const payload = {
		title: CONTRACT_TITLE,
		organization: hue.id,
		contact: contact.id,
		total_value: TOTAL_VALUE,
		effective_date: AGREEMENT_DATE,
		valid_until: VALID_UNTIL,
		date_sent: AGREEMENT_DATE,
		contract_status: 'draft',
		blocks,
	};

	if (existing) {
		console.log(`  [skip] contract exists (id=${existing.id}) — PATCHing blocks + metadata`);
		const res = await directusRequest<any>(`/items/contracts/${existing.id}`, 'PATCH', payload);
		if (!res.ok) {
			console.error(`  [fail] PATCH: ${res.error}`);
			process.exit(1);
		}
		console.log(`  [ok]   updated contract ${existing.id}`);
		console.log('');
		console.log(`✔ Open it: /contracts/${existing.id}`);
		console.log(`✔ Edit mode: /contracts/${existing.id}?edit=1`);
		return;
	}

	const res = await directusRequest<any>('/items/contracts', 'POST', payload);
	if (!res.ok) {
		console.error(`  [fail] POST: ${res.error}`);
		process.exit(1);
	}
	const id = (res.data as any)?.id;
	console.log(`  [ok]   created contract ${id}`);
	console.log('');
	console.log(`✔ Open it: /contracts/${id}`);
	console.log(`✔ Edit mode: /contracts/${id}?edit=1`);
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
