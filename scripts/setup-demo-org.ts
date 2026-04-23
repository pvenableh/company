#!/usr/bin/env npx tsx
/**
 * Directus — Earnest Demo org + user + seed data
 *
 * Provisions a shared "Earnest Demo" organization with a single demo user
 * (demo@earnest.guru, Member role) and a believable slice of seed data so
 * anonymous visitors landing on /try-demo can browse a populated app without
 * signing up.
 *
 * Idempotent: every create is guarded by a find-by-key check; re-running the
 * script never duplicates data.
 *
 * AI is capped via the existing org token budget (10K tokens/month + 3 scan
 * credits/month). The Member role in this org has `ai_usage` bumped to
 * access+read+create so demo visitors can actually use Ask Earnest (normal
 * Member role has ai_usage disabled — the token budget is the real cap).
 *
 * Purgeability: seed data is org-scoped. Dropping the demo org in Directus
 * cascades to clients/projects/tickets/etc. Contacts are tagged with
 * `source='demo'` for extra safety.
 *
 * Usage:
 *   DEMO_USER_PASSWORD=<secret> pnpm tsx scripts/setup-demo-org.ts
 *
 * If DEMO_USER_PASSWORD is unset, the script generates one and prints it.
 * Save it to your env — /api/auth/demo-login reads the same variable.
 */

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '../shared/permissions';
import type { RoleSlug, PermissionMatrix } from '../shared/permissions';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

const DEMO_ORG_NAME = 'Earnest Demo';
const DEMO_ORG_SHORT = 'DEMO';
const DEMO_USER_EMAIL = 'demo@earnest.guru';
const DEMO_USER_FIRST = 'Demo';
const DEMO_USER_LAST = 'Visitor';
const DEMO_AI_TOKEN_LIMIT_MONTHLY = 10_000;
const DEMO_SCAN_LIMIT_MONTHLY = 3;

let demoPassword = process.env.DEMO_USER_PASSWORD || '';
let generatedPassword = false;
if (!demoPassword) {
	demoPassword = randomBytes(16).toString('base64url');
	generatedPassword = true;
}

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var required');
	process.exit(1);
}

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

// Override Member.ai_usage for the demo org so visitors can chat with Earnest.
// Real-world cap is enforced by the org token budget, not the perm matrix.
const DEMO_MEMBER_PERMISSIONS: PermissionMatrix = {
	...DEFAULT_ROLE_PERMISSIONS.member,
	ai_usage: { access: true, read: true, create: true, update: false, delete: false },
};

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${DIRECTUS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await response.text();
	const json = text ? JSON.parse(text) : {};
	return {
		ok: response.ok,
		status: response.status,
		data: response.ok ? ((json.data ?? null) as T) : null,
		error: response.ok ? null : text,
	};
}

async function findOne<T = any>(collection: string, filter: Record<string, any>): Promise<T | null> {
	const qs = `filter=${encodeURIComponent(JSON.stringify(filter))}&limit=1`;
	const res = await directusRequest<T[]>(`/items/${collection}?${qs}`);
	if (res.ok && Array.isArray(res.data) && res.data.length > 0) return res.data[0];
	return null;
}

async function findOrCreate<T extends { id: any } = any>(
	collection: string,
	filter: Record<string, any>,
	payload: Record<string, any>,
	label: string,
): Promise<T | null> {
	const existing = await findOne<T>(collection, filter);
	if (existing) {
		console.log(`  [skip] ${label} (id=${(existing as any).id})`);
		return existing;
	}
	const res = await directusRequest<T>(`/items/${collection}`, 'POST', payload);
	if (!res.ok) {
		console.error(`  [fail] ${label}: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   ${label} (id=${(res.data as any)?.id})`);
	return res.data;
}

async function ensureOrg(): Promise<any | null> {
	const existing = await findOne<any>('organizations', { name: { _eq: DEMO_ORG_NAME } });
	if (existing) {
		console.log(`  [skip] org "${DEMO_ORG_NAME}" (id=${existing.id})`);
		// Ensure budget fields are current
		await directusRequest(`/items/organizations/${existing.id}`, 'PATCH', {
			ai_token_limit_monthly: DEMO_AI_TOKEN_LIMIT_MONTHLY,
			scan_credits_limit_monthly: DEMO_SCAN_LIMIT_MONTHLY,
		});
		return existing;
	}
	const res = await directusRequest<any>('/items/organizations', 'POST', {
		name: DEMO_ORG_NAME,
		short_name: DEMO_ORG_SHORT,
		status: 'published',
		active: true,
		plan: 'solo',
		ai_token_limit_monthly: DEMO_AI_TOKEN_LIMIT_MONTHLY,
		ai_tokens_used_this_period: 0,
		scan_credits_limit_monthly: DEMO_SCAN_LIMIT_MONTHLY,
		scans_used_this_period: 0,
		notes: 'Public demo workspace. Seed data is regenerated by scripts/setup-demo-org.ts.',
	});
	if (!res.ok) {
		console.error(`  [fail] create org: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   org "${DEMO_ORG_NAME}" (id=${res.data?.id})`);
	return res.data;
}

async function ensureRoles(orgId: string): Promise<Record<RoleSlug, string>> {
	const createdRoles = {} as Record<RoleSlug, string>;
	for (const slug of SYSTEM_ROLES) {
		const meta = ROLE_METADATA[slug];
		const permissions = slug === 'member' ? DEMO_MEMBER_PERMISSIONS : DEFAULT_ROLE_PERMISSIONS[slug];
		const role = await findOrCreate<any>(
			'org_roles',
			{ _and: [{ organization: { _eq: orgId } }, { slug: { _eq: slug } }] },
			{
				name: meta.label,
				slug,
				is_system: true,
				permissions,
				organization: orgId,
			},
			`role "${slug}"`,
		);
		if (role) createdRoles[slug] = role.id;
	}
	return createdRoles;
}

async function ensureDemoUser(): Promise<any | null> {
	// Check existing
	const listRes = await directusRequest<any[]>(
		`/users?filter=${encodeURIComponent(JSON.stringify({ email: { _eq: DEMO_USER_EMAIL } }))}&limit=1`,
	);
	if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length > 0) {
		const user = listRes.data[0];
		console.log(`  [skip] user ${DEMO_USER_EMAIL} (id=${user.id})`);
		// Reset password to match current env (covers rotation)
		const patch = await directusRequest(`/users/${user.id}`, 'PATCH', {
			password: demoPassword,
			status: 'active',
		});
		if (!patch.ok) {
			console.error(`  [warn] could not reset demo password: ${patch.error}`);
		}
		return user;
	}

	const config = {
		email: DEMO_USER_EMAIL,
		password: demoPassword,
		first_name: DEMO_USER_FIRST,
		last_name: DEMO_USER_LAST,
		status: 'active',
		role: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER || null,
	};
	const res = await directusRequest<any>('/users', 'POST', config);
	if (!res.ok) {
		console.error(`  [fail] create user: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   user ${DEMO_USER_EMAIL} (id=${res.data?.id})`);
	return res.data;
}

async function ensureMembership(orgId: string, userId: string, memberRoleId: string): Promise<void> {
	await findOrCreate(
		'org_memberships',
		{ _and: [{ organization: { _eq: orgId } }, { user: { _eq: userId } }] },
		{
			organization: orgId,
			user: userId,
			role: memberRoleId,
			status: 'active',
			accepted_at: new Date().toISOString(),
		},
		`org_membership (demo user → Member)`,
	);

	// Legacy junction for backward compat
	await findOrCreate(
		'organizations_directus_users',
		{ _and: [{ organizations_id: { _eq: orgId } }, { directus_users_id: { _eq: userId } }] },
		{ organizations_id: orgId, directus_users_id: userId },
		`legacy org junction`,
	);
}

// ─── Seed data ────────────────────────────────────────────────────────────

type ClientSpec = {
	key: string; // lookup key for idempotency
	name: string;
	industry: string;
	website: string;
	account_state: 'active' | 'prospect' | 'inactive' | 'churned';
	code: string;
};

const CLIENT_SEEDS: ClientSpec[] = [
	{ key: 'helios-studio', name: 'Helios Studio', industry: 'Hospitality', website: 'https://helios.example', account_state: 'active', code: 'HEL' },
	{ key: 'meridian-law', name: 'Meridian Law Group', industry: 'Legal', website: 'https://meridian.example', account_state: 'active', code: 'MER' },
	{ key: 'northwind-dev', name: 'Northwind Development', industry: 'Real Estate', website: 'https://northwind.example', account_state: 'prospect', code: 'NWD' },
	{ key: 'pinecrest-clinic', name: 'Pinecrest Clinic', industry: 'Healthcare', website: 'https://pinecrest.example', account_state: 'inactive', code: 'PIN' },
	{ key: 'atlas-fintech', name: 'Atlas Fintech', industry: 'Finance', website: 'https://atlas.example', account_state: 'churned', code: 'ATL' },
];

async function seedClients(orgId: string): Promise<Record<string, string>> {
	const ids: Record<string, string> = {};
	for (const c of CLIENT_SEEDS) {
		const row = await findOrCreate<any>(
			'clients',
			{ _and: [{ organization: { _eq: orgId } }, { slug: { _eq: c.key } }] },
			{
				name: c.name,
				slug: c.key,
				organization: orgId,
				industry: c.industry,
				website: c.website,
				account_state: c.account_state,
				code: c.code,
				status: 'published',
				notes: 'Demo seed.',
			},
			`client "${c.name}"`,
		);
		if (row) ids[c.key] = row.id;
	}
	return ids;
}

type ContactSpec = {
	first_name: string;
	last_name: string;
	email: string;
	title: string;
	company: string;
	category: 'client' | 'prospect' | 'partner' | 'architect' | 'developer' | 'hospitality' | 'media';
	clientKey?: string; // link to seeded client
	notes?: string;
};

const CONTACT_SEEDS: ContactSpec[] = [
	// Client-side contacts
	{ first_name: 'Sonia', last_name: 'Reyes', email: 'sonia@helios.example', title: 'Owner', company: 'Helios Studio', category: 'client', clientKey: 'helios-studio', notes: 'Primary contact at Helios.' },
	{ first_name: 'David', last_name: 'Park', email: 'david@helios.example', title: 'Head of Operations', company: 'Helios Studio', category: 'client', clientKey: 'helios-studio' },
	{ first_name: 'Amara', last_name: 'Okafor', email: 'amara@meridian.example', title: 'Managing Partner', company: 'Meridian Law Group', category: 'client', clientKey: 'meridian-law' },
	{ first_name: 'Tom', last_name: 'Bennett', email: 'tom@meridian.example', title: 'Office Manager', company: 'Meridian Law Group', category: 'client', clientKey: 'meridian-law' },
	{ first_name: 'Priya', last_name: 'Shah', email: 'priya@pinecrest.example', title: 'Director of Patient Services', company: 'Pinecrest Clinic', category: 'client', clientKey: 'pinecrest-clinic' },

	// Prospects (tied to leads)
	{ first_name: 'Marcus', last_name: 'Levi', email: 'marcus@northwind.example', title: 'Principal', company: 'Northwind Development', category: 'prospect', clientKey: 'northwind-dev' },
	{ first_name: 'Julia', last_name: 'Holt', email: 'julia@atlas.example', title: 'VP Marketing', company: 'Atlas Fintech', category: 'prospect' },
	{ first_name: 'Rae', last_name: 'Nakamura', email: 'rae.nakamura@example.com', title: 'Co-Founder', company: 'Driftwood Roasters', category: 'prospect' },

	// Partners (with contact_connections)
	{ first_name: 'Elena', last_name: 'Vargas', email: 'elena@vargasrealty.example', title: 'Broker', company: 'Vargas Realty', category: 'partner', notes: 'Referral partner. Sent Northwind our way.' },
	{ first_name: 'Hugo', last_name: 'Beck', email: 'hugo@beckcpa.example', title: 'Partner', company: 'Beck & Co CPA', category: 'partner', notes: 'Accounting referral partner.' },
	{ first_name: 'Naomi', last_name: 'Flores', email: 'naomi@flores-arch.example', title: 'Principal Architect', company: 'Flores Architecture', category: 'partner', notes: 'Trades referrals on hospitality projects.' },

	// Architects/developers/media (AEC + press)
	{ first_name: 'Ben', last_name: 'Wu', email: 'ben@wudesign.example', title: 'Senior Architect', company: 'Wu Design Partners', category: 'architect' },
	{ first_name: 'Farrah', last_name: 'Dolan', email: 'farrah@dolanbuilds.example', title: 'Project Manager', company: 'Dolan Construction', category: 'developer' },
	{ first_name: 'Kai', last_name: 'Ito', email: 'kai@designweekly.example', title: 'Editor', company: 'Design Weekly', category: 'media' },
	{ first_name: 'Liv', last_name: 'Carlson', email: 'liv@liv-pr.example', title: 'PR Director', company: 'Liv PR', category: 'partner' },
];

async function seedContacts(
	orgId: string,
	clientIds: Record<string, string>,
): Promise<{ ids: Record<string, string> }> {
	const ids: Record<string, string> = {};
	for (const c of CONTACT_SEEDS) {
		const clientId = c.clientKey ? clientIds[c.clientKey] : null;
		const contact = await findOrCreate<any>(
			'contacts',
			{
				_and: [
					{ email: { _eq: c.email } },
					{ organizations: { organizations_id: { _eq: orgId } } },
				],
			},
			{
				first_name: c.first_name,
				last_name: c.last_name,
				email: c.email,
				title: c.title,
				company: c.company,
				category: c.category,
				client: clientId,
				source: 'demo',
				status: 'published',
				notes: c.notes || null,
				email_subscribed: true,
				unsubscribe_token: randomBytes(16).toString('hex'),
			},
			`contact ${c.first_name} ${c.last_name}`,
		);
		if (contact) {
			ids[c.email] = contact.id;
			await findOrCreate(
				'contacts_organizations',
				{ _and: [{ contacts_id: { _eq: contact.id } }, { organizations_id: { _eq: orgId } }] },
				{ contacts_id: contact.id, organizations_id: orgId },
				`contact junction (${c.first_name})`,
			);
		}
	}
	return { ids };
}

async function seedContactConnections(
	clientIds: Record<string, string>,
	contactIds: Record<string, string>,
): Promise<void> {
	const connections = [
		{ contactEmail: 'elena@vargasrealty.example', clientKey: 'northwind-dev', role: 'referral_partner', introduced_by: 'partner', notes: 'Introduced Marcus Levi at a ULI event.' },
		{ contactEmail: 'hugo@beckcpa.example', clientKey: 'helios-studio', role: 'consultant', introduced_by: 'us', notes: 'Handles Helios quarterly books.' },
		{ contactEmail: 'naomi@flores-arch.example', clientKey: 'helios-studio', role: 'vendor', introduced_by: 'partner', notes: 'AOR on Helios West Hotel renovation.' },
		{ contactEmail: 'liv@liv-pr.example', clientKey: 'meridian-law', role: 'vendor', introduced_by: 'us', notes: 'Outside PR firm for Meridian announcements.' },
	];
	for (const c of connections) {
		const contact = contactIds[c.contactEmail];
		const client = clientIds[c.clientKey];
		if (!contact || !client) continue;
		await findOrCreate(
			'contact_connections',
			{ _and: [{ contact: { _eq: contact } }, { client: { _eq: client } }, { role: { _eq: c.role } }] },
			{ contact, client, role: c.role, introduced_by: c.introduced_by, notes: c.notes },
			`contact_connection ${c.contactEmail} → ${c.clientKey}`,
		);
	}
}

async function seedLeads(
	orgId: string,
	contactIds: Record<string, string>,
	clientIds: Record<string, string>,
): Promise<number[]> {
	const leads = [
		{
			contactEmail: 'marcus@northwind.example',
			stage: 'qualified',
			priority: 'high',
			source: 'referral',
			source_details: 'Introduced by Elena Vargas (Vargas Realty).',
			estimated_value: 85_000,
			project_type: 'Brand identity + website for a new mixed-use property',
			timeline: '1-3 months',
			tags: ['hot', 'referral'],
			notes: 'Budget confirmed. Pending proposal approval from co-principal.',
		},
		{
			contactEmail: 'julia@atlas.example',
			stage: 'contacted',
			priority: 'medium',
			source: 'website',
			source_details: 'Filled out the contact form after a Design Weekly feature.',
			estimated_value: 42_000,
			project_type: 'Marketing site redesign + conversion audit',
			timeline: '3-6 months',
			tags: ['rfp'],
			notes: 'First intro call scheduled for next week.',
		},
		{
			contactEmail: 'rae.nakamura@example.com',
			stage: 'won',
			priority: 'medium',
			source: 'referral',
			source_details: 'Existing Helios client referred them.',
			estimated_value: 28_000,
			actual_value: 31_500,
			project_type: 'Rebrand + packaging for a specialty roaster',
			timeline: 'flexible',
			closed_date: new Date().toISOString().slice(0, 10),
			resulting_client_key: 'helios-studio',
			tags: ['hot'],
			notes: 'Kickoff next month. Contracts signed.',
		},
	];
	const created: number[] = [];
	for (const l of leads) {
		const relatedContact = contactIds[l.contactEmail];
		const resultingClient = (l as any).resulting_client_key ? clientIds[(l as any).resulting_client_key] : null;
		if (!relatedContact) {
			console.log(`  [skip] lead for ${l.contactEmail} — contact not found`);
			continue;
		}
		const row = await findOrCreate<any>(
			'leads',
			{
				_and: [
					{ organization: { _eq: orgId } },
					{ related_contact: { _eq: relatedContact } },
					{ project_type: { _eq: l.project_type } },
				],
			},
			{
				organization: orgId,
				related_contact: relatedContact,
				stage: l.stage,
				priority: l.priority,
				source: l.source,
				source_details: l.source_details,
				estimated_value: l.estimated_value,
				actual_value: (l as any).actual_value ?? null,
				project_type: l.project_type,
				timeline: l.timeline,
				tags: l.tags,
				notes: l.notes,
				closed_date: (l as any).closed_date ?? null,
				resulting_client: resultingClient,
				status: 'published',
			},
			`lead (${l.contactEmail} / ${l.stage})`,
		);
		if (row) created.push(row.id);
	}
	return created;
}

async function seedProjects(orgId: string, clientIds: Record<string, string>): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const projects = [
		{
			key: 'helios-west-hotel',
			title: 'Helios West Hotel Launch',
			description: 'Full brand rollout + launch campaign for the West Village property.',
			clientKey: 'helios-studio',
			status: 'In Progress',
			contract_value: 140_000,
			template: 'branding-project',
		},
		{
			key: 'meridian-site-refresh',
			title: 'Meridian Site Refresh',
			description: 'Marketing site redesign with updated practice-area templates.',
			clientKey: 'meridian-law',
			status: 'Scheduled',
			contract_value: 48_000,
			template: 'web-project',
		},
	];
	for (const p of projects) {
		const clientId = clientIds[p.clientKey];
		const row = await findOrCreate<any>(
			'projects',
			{ _and: [{ organization: { _eq: orgId } }, { title: { _eq: p.title } }] },
			{
				title: p.title,
				description: p.description,
				organization: orgId,
				client: clientId,
				status: p.status,
				contract_value: p.contract_value,
				template: p.template,
				start_date: new Date().toISOString().slice(0, 10),
			},
			`project "${p.title}"`,
		);
		if (row) out[p.key] = row.id;
	}
	return out;
}

async function seedProduct(orgId: string): Promise<string | null> {
	// Minimal product so invoices can have line items.
	const row = await findOrCreate<any>(
		'products',
		{ name: { _eq: 'Demo Services' } },
		{ name: 'Demo Services', status: 'published', description: 'Generic line item for demo invoices.' },
		`product "Demo Services"`,
	);
	return row?.id ?? null;
}

async function seedInvoices(
	orgId: string,
	clientIds: Record<string, string>,
	productId: string | null,
): Promise<void> {
	const today = new Date();
	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const addDays = (d: Date, days: number) => {
		const nd = new Date(d);
		nd.setDate(nd.getDate() + days);
		return nd;
	};

	const invoices = [
		{
			code: 'HEL-0042',
			clientKey: 'helios-studio',
			status: 'paid',
			invoice_date: iso(addDays(today, -30)),
			due_date: iso(addDays(today, -15)),
			total_amount: 18_500,
			note: 'Helios West Hotel — brand system phase 1.',
			lines: [{ description: 'Brand system — phase 1', rate: 18_500, quantity: 1 }],
		},
		{
			code: 'MER-0007',
			clientKey: 'meridian-law',
			status: 'pending',
			invoice_date: iso(addDays(today, -5)),
			due_date: iso(addDays(today, 25)),
			total_amount: 12_000,
			note: 'Meridian Site Refresh — discovery deposit.',
			lines: [{ description: 'Discovery + sitemap workshop', rate: 12_000, quantity: 1 }],
		},
	];

	for (const inv of invoices) {
		const client = clientIds[inv.clientKey];
		if (!client) continue;
		const row = await findOrCreate<any>(
			'invoices',
			{ _and: [{ bill_to: { _eq: orgId } }, { invoice_code: { _eq: inv.code } }] },
			{
				bill_to: orgId,
				client,
				invoice_code: inv.code,
				status: inv.status,
				invoice_date: inv.invoice_date,
				due_date: inv.due_date,
				total_amount: inv.total_amount,
				note: inv.note,
			},
			`invoice ${inv.code}`,
		);
		if (row && productId) {
			for (const line of inv.lines) {
				await findOrCreate(
					'line_items',
					{ _and: [{ invoice_id: { _eq: row.id } }, { description: { _eq: line.description } }] },
					{ invoice_id: row.id, product: productId, description: line.description, rate: line.rate, quantity: line.quantity, amount: line.rate * line.quantity },
					`line_item ${inv.code} / ${line.description}`,
				);
			}
		}
	}
}

async function seedTickets(
	orgId: string,
	projectIds: Record<string, string>,
	clientIds: Record<string, string>,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const tickets = [
		{
			key: 'helios-insta',
			title: 'Helios — Instagram launch assets',
			description: 'Carousel + story templates for the launch-week rollout.',
			status: 'In Progress',
			priority: 'high',
			projectKey: 'helios-west-hotel',
			clientKey: 'helios-studio',
		},
		{
			key: 'meridian-content-audit',
			title: 'Meridian — content audit of practice pages',
			description: 'Pull metrics for each practice area page and flag low-engagement content.',
			status: 'Pending',
			priority: 'medium',
			projectKey: 'meridian-site-refresh',
			clientKey: 'meridian-law',
		},
	];
	for (const t of tickets) {
		const row = await findOrCreate<any>(
			'tickets',
			{ _and: [{ organization: { _eq: orgId } }, { title: { _eq: t.title } }] },
			{
				title: t.title,
				description: t.description,
				organization: orgId,
				project: projectIds[t.projectKey] || null,
				client: clientIds[t.clientKey] || null,
				status: t.status,
				priority: t.priority,
				due_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
			},
			`ticket "${t.title}"`,
		);
		if (row) out[t.key] = row.id;
	}
	return out;
}

async function seedProjectEvents(
	projectIds: Record<string, string>,
): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	const today = new Date();
	const iso = (offsetDays: number) => {
		const d = new Date(today);
		d.setDate(d.getDate() + offsetDays);
		return d.toISOString().slice(0, 10);
	};

	const events: Array<{
		key: string;
		projectKey: string;
		title: string;
		description: string;
		type: 'General' | 'Design' | 'Content' | 'Timeline' | 'Financial' | 'Hours';
		status: 'draft' | 'Scheduled' | 'Active' | 'Completed' | 'archived';
		approval?: 'No Approval Necessary' | 'Need Approval' | 'Approved';
		is_milestone?: boolean;
		event_date: string;
		duration_days?: number;
	}> = [
		{ key: 'helios-discovery', projectKey: 'helios-west-hotel', title: 'Discovery + stakeholder interviews', description: 'Interviews with GM, chef, and ops lead to capture brand pillars.', type: 'General', status: 'Completed', event_date: iso(-28), duration_days: 5 },
		{ key: 'helios-brand-v1', projectKey: 'helios-west-hotel', title: 'Brand system — v1 concepts', description: 'Three distinct directions: Archival, Coastal, Editorial.', type: 'Design', status: 'Completed', approval: 'Approved', event_date: iso(-14), duration_days: 10 },
		{ key: 'helios-site-build', projectKey: 'helios-west-hotel', title: 'Launch site build', description: 'Marketing site + reservation handoff to Cloudbeds.', type: 'Design', status: 'Active', approval: 'Need Approval', event_date: iso(7), duration_days: 14 },
		{ key: 'helios-opening', projectKey: 'helios-west-hotel', title: 'Opening ceremony', description: 'Public launch + press walkthrough.', type: 'Timeline', status: 'Scheduled', is_milestone: true, event_date: iso(21) },

		{ key: 'meridian-kickoff', projectKey: 'meridian-site-refresh', title: 'Kickoff + content inventory', description: 'Walk through current sitemap and tag priority pages.', type: 'General', status: 'Scheduled', event_date: iso(3), duration_days: 3 },
		{ key: 'meridian-wireframes', projectKey: 'meridian-site-refresh', title: 'Practice-page wireframes', description: 'Two layout options for practice-area templates.', type: 'Design', status: 'Scheduled', approval: 'Need Approval', event_date: iso(10), duration_days: 5 },
	];
	for (const e of events) {
		const projectId = projectIds[e.projectKey];
		if (!projectId) continue;
		const row = await findOrCreate<any>(
			'project_events',
			{ _and: [{ project: { _eq: projectId } }, { title: { _eq: e.title } }] },
			{
				project: projectId,
				title: e.title,
				description: e.description,
				type: e.type,
				status: e.status,
				approval: e.approval ?? 'No Approval Necessary',
				is_milestone: e.is_milestone ?? false,
				event_date: e.event_date,
				duration_days: e.duration_days ?? null,
			},
			`project_event "${e.title}"`,
		);
		if (row) out[e.key] = row.id;
	}
	return out;
}

async function seedProjectTasks(
	projectIds: Record<string, string>,
	eventIds: Record<string, string>,
): Promise<void> {
	const tasks: Array<{ projectKey: string; eventKey: string; title: string; description: string; completed?: boolean; priority?: 'low' | 'medium' | 'high' }> = [
		{ projectKey: 'helios-west-hotel', eventKey: 'helios-discovery', title: 'GM interview notes', description: 'Capture quotes for brand story.', completed: true, priority: 'medium' },
		{ projectKey: 'helios-west-hotel', eventKey: 'helios-discovery', title: 'Ops walkthrough — back of house', description: 'Photo reference for brand moodboards.', completed: true, priority: 'low' },
		{ projectKey: 'helios-west-hotel', eventKey: 'helios-brand-v1', title: 'Package concept files for review', description: 'PDF + Figma share link for Sonia.', completed: true, priority: 'high' },
		{ projectKey: 'helios-west-hotel', eventKey: 'helios-site-build', title: 'Hand off reservation schema to Cloudbeds', description: 'Document required fields + UTM tagging.', priority: 'high' },
		{ projectKey: 'helios-west-hotel', eventKey: 'helios-site-build', title: 'Shoot hero gallery', description: 'Coordinate with Ben Wu on interior photography.', priority: 'medium' },
		{ projectKey: 'meridian-site-refresh', eventKey: 'meridian-kickoff', title: 'Pull analytics snapshot', description: 'Last 90 days — top 20 pages + bounce.', priority: 'medium' },
		{ projectKey: 'meridian-site-refresh', eventKey: 'meridian-wireframes', title: 'Practice-area content model', description: 'Fields, repeaters, and CTA slots.', priority: 'high' },
	];
	for (const t of tasks) {
		const projectId = projectIds[t.projectKey];
		const eventId = eventIds[t.eventKey];
		if (!projectId || !eventId) continue;
		await findOrCreate(
			'project_tasks',
			{ _and: [{ event_id: { _eq: eventId } }, { title: { _eq: t.title } }] },
			{
				event_id: eventId,
				project: projectId,
				title: t.title,
				description: t.description,
				completed: t.completed ?? false,
				completed_at: t.completed ? new Date().toISOString() : null,
				priority: t.priority || 'medium',
				status: 'published',
			},
			`project_task "${t.title}"`,
		);
	}
}

async function seedQuickTasks(
	orgId: string,
	projectIds: Record<string, string>,
	ticketIds: Record<string, string>,
	clientIds: Record<string, string>,
): Promise<void> {
	const tasks: Array<{ title: string; description?: string; schedule?: 'today' | 'this_week' | 'later'; priority?: 'low' | 'medium' | 'high' | 'urgent'; status?: 'new' | 'in_progress' | 'completed'; category?: 'quick' | 'ticket' | 'project'; projectKey?: string; ticketKey?: string; clientKey?: string }> = [
		{ title: 'Reply to Julia Holt (Atlas) re: intro call', schedule: 'today', priority: 'high', status: 'new', category: 'quick', clientKey: undefined },
		{ title: 'Draft Northwind SOW exec summary', schedule: 'this_week', priority: 'high', status: 'in_progress', category: 'quick' },
		{ title: 'Confirm HEL-0042 payment received', schedule: 'today', priority: 'medium', status: 'completed', category: 'project', projectKey: 'helios-west-hotel', clientKey: 'helios-studio' },
		{ title: 'Storyboard Helios launch reel', description: 'Voiceover + three scene beats. Share with Liv PR for embargo timing.', schedule: 'this_week', priority: 'medium', status: 'in_progress', category: 'ticket', ticketKey: 'helios-insta', projectKey: 'helios-west-hotel', clientKey: 'helios-studio' },
		{ title: 'Schedule Meridian kickoff call', schedule: 'today', priority: 'medium', status: 'new', category: 'project', projectKey: 'meridian-site-refresh', clientKey: 'meridian-law' },
	];
	for (const t of tasks) {
		await findOrCreate(
			'tasks',
			{ _and: [{ organization_id: { _eq: orgId } }, { title: { _eq: t.title } }] },
			{
				title: t.title,
				description: t.description || null,
				organization_id: orgId,
				project_id: t.projectKey ? projectIds[t.projectKey] || null : null,
				ticket_id: t.ticketKey ? ticketIds[t.ticketKey] || null : null,
				client_id: t.clientKey ? clientIds[t.clientKey] || null : null,
				schedule: t.schedule || 'this_week',
				priority: t.priority || 'medium',
				status: t.status || 'new',
				category: t.category || 'quick',
			},
			`task "${t.title}"`,
		);
	}
}

async function seedAppointments(
	leadIds: number[],
	userId: string,
): Promise<void> {
	const mkTime = (daysAhead: number, hour: number) => {
		const d = new Date();
		d.setDate(d.getDate() + daysAhead);
		d.setHours(hour, 0, 0, 0);
		return d.toISOString();
	};
	const appointments = [
		{
			title: 'Atlas Fintech — intro call',
			description: 'First call with Julia. Walk through the Design Weekly piece and gather site-refresh goals.',
			start_time: mkTime(2, 10),
			end_time: mkTime(2, 11),
			is_video: true,
			meeting_link: 'https://meet.example/atlas-intro',
			leadIdx: 1, // contacted lead
		},
		{
			title: 'Helios launch prep — weekly sync',
			description: 'Standing meeting with Sonia + the studio pod.',
			start_time: mkTime(1, 14),
			end_time: mkTime(1, 15),
			is_video: false,
		},
	];
	for (const a of appointments) {
		const leadId = typeof (a as any).leadIdx === 'number' ? leadIds[(a as any).leadIdx] : undefined;
		await findOrCreate(
			'appointments',
			{ _and: [{ title: { _eq: a.title } }, { start_time: { _eq: a.start_time } }] },
			{
				title: a.title,
				description: a.description,
				start_time: a.start_time,
				end_time: a.end_time,
				is_video: a.is_video,
				meeting_link: (a as any).meeting_link ?? null,
				related_lead: leadId ?? null,
				status: 'confirmed',
				user_created: userId,
			},
			`appointment "${a.title}"`,
		);
	}
}

async function seedLeadActivities(
	leadIds: number[],
	contactIds: Record<string, string>,
): Promise<void> {
	if (leadIds.length < 3) return;
	const [qualifiedLead, contactedLead, wonLead] = leadIds;
	const marcus = contactIds['marcus@northwind.example'];
	const julia = contactIds['julia@atlas.example'];
	const rae = contactIds['rae.nakamura@example.com'];

	const iso = (daysAgo: number) => {
		const d = new Date();
		d.setDate(d.getDate() - daysAgo);
		return d.toISOString();
	};

	const activities = [
		// Marcus / Northwind (qualified)
		{ lead: qualifiedLead, contact: marcus, activity_type: 'phone call', activity_date: iso(10), subject: 'Kickoff intro call', description: 'Marcus walked us through the Northwind portfolio and the mixed-use site. Budget confirmed around $85K.', outcome: 'positive', duration_minutes: 45, next_action: 'Send scoping doc', next_action_date: iso(-3) },
		{ lead: qualifiedLead, contact: marcus, activity_type: 'proposal sent', activity_date: iso(3), subject: 'SOW v1 sent', description: 'Branding + site + launch support. 21-day validity.', outcome: 'neutral' },

		// Julia / Atlas (contacted)
		{ lead: contactedLead, contact: julia, activity_type: 'email sent', activity_date: iso(5), subject: 'Intro reply', description: 'Replied to Julia\'s site form. Proposed three time slots for a discovery call.', outcome: 'positive' },
		{ lead: contactedLead, contact: julia, activity_type: 'note', activity_date: iso(4), subject: 'Context', description: 'Atlas was featured in Design Weekly last month — Kai Ito may be a useful warm intro if we need one.', outcome: 'neutral' },

		// Rae / won
		{ lead: wonLead, contact: rae, activity_type: 'meeting', activity_date: iso(21), subject: 'Scoping + packaging review', description: 'In-person at the roastery. Reviewed package concepts and timeline.', outcome: 'positive', duration_minutes: 60 },
		{ lead: wonLead, contact: rae, activity_type: 'follow up', activity_date: iso(2), subject: 'Contracts signed', description: 'Signed SOW returned. Kickoff scheduled.', outcome: 'positive' },
	];
	for (const a of activities) {
		if (!a.lead || !a.contact) continue;
		await findOrCreate(
			'lead_activities',
			{ _and: [{ lead: { _eq: a.lead } }, { subject: { _eq: a.subject } }] },
			{
				lead: a.lead,
				contact: a.contact,
				activity_type: a.activity_type,
				activity_date: a.activity_date,
				subject: a.subject,
				description: a.description,
				outcome: a.outcome,
				duration_minutes: (a as any).duration_minutes ?? null,
				next_action: (a as any).next_action ?? null,
				next_action_date: (a as any).next_action_date ?? null,
				status: 'published',
			},
			`lead_activity "${a.subject}"`,
		);
	}
}

async function seedTeam(orgId: string): Promise<string | null> {
	const row = await findOrCreate<any>(
		'teams',
		{ _and: [{ organization: { _eq: orgId } }, { name: { _eq: 'Studio' } }] },
		{
			name: 'Studio',
			description: 'The core design + strategy pod.',
			organization: orgId,
			active: true,
			focus: 'Brand systems, hospitality launches, and long-term accounts.',
			goals: 'Ship Helios West Hotel by Q3; land one new partner-sourced retainer.',
		},
		`team "Studio"`,
	);
	return row?.id ?? null;
}

async function seedProposal(orgId: string, leadIds: number[], contactIds: Record<string, string>): Promise<void> {
	if (leadIds.length === 0) return;
	const leadId = leadIds[0];
	const contactId = contactIds['marcus@northwind.example'];
	await findOrCreate(
		'proposals',
		{ _and: [{ organization: { _eq: orgId } }, { title: { _eq: 'Northwind — Brand + Site SOW' } }] },
		{
			title: 'Northwind — Brand + Site SOW',
			organization: orgId,
			lead: leadId,
			contact: contactId || null,
			total_value: 85_000,
			proposal_status: 'sent',
			date_sent: new Date().toISOString().slice(0, 10),
			valid_until: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
			notes: 'Includes brand system + 15-page marketing site + launch support.',
		},
		`proposal "Northwind — Brand + Site SOW"`,
	);
}

async function seedChannel(orgId: string, projectIds: Record<string, string>, userId: string): Promise<void> {
	const channel = await findOrCreate<any>(
		'channels',
		{ _and: [{ organization: { _eq: orgId } }, { name: { _eq: '#helios-launch' } }] },
		{
			name: '#helios-launch',
			description: 'Launch coordination for Helios West Hotel.',
			organization: orgId,
			project: projectIds['helios-west-hotel'] || null,
			status: 'published',
		},
		`channel "#helios-launch"`,
	);
	if (!channel) return;

	const messages = [
		'Opening ceremony locked for the 18th — Sonia confirmed with the GM.',
		'Launch carousel assets in review; Naomi Flores approved the interior shots.',
		'Reminder: invoice HEL-0042 is paid, so phase 2 scope can kick off.',
		'Pinged Liv PR about embargoed press drops — she has Design Weekly + one trade title lined up.',
		'Next sync: Thursday 10am. Agenda in the doc (punchlist, press, and paid social).',
	];
	for (let i = 0; i < messages.length; i++) {
		const text = messages[i];
		await findOrCreate(
			'messages',
			{ _and: [{ channel: { _eq: channel.id } }, { text: { _eq: text } }] },
			{ channel: channel.id, text, user_created: userId, status: 'published' },
			`message #${i + 1}`,
		);
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
	console.log('=========================================');
	console.log('  Earnest Demo — org + user + seed data');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}

	console.log('--- org ---');
	const org = await ensureOrg();
	if (!org) process.exit(1);

	console.log('\n--- system roles ---');
	const roles = await ensureRoles(org.id);
	if (!roles.member) {
		console.error('No Member role id — aborting.');
		process.exit(1);
	}

	console.log('\n--- demo user ---');
	const user = await ensureDemoUser();
	if (!user) process.exit(1);

	console.log('\n--- membership ---');
	await ensureMembership(org.id, user.id, roles.member);

	console.log('\n--- clients ---');
	const clientIds = await seedClients(org.id);

	console.log('\n--- contacts ---');
	const { ids: contactIds } = await seedContacts(org.id, clientIds);

	console.log('\n--- contact_connections (partners) ---');
	await seedContactConnections(clientIds, contactIds);

	console.log('\n--- leads ---');
	const leadIds = await seedLeads(org.id, contactIds, clientIds);

	console.log('\n--- projects ---');
	const projectIds = await seedProjects(org.id, clientIds);

	console.log('\n--- products + invoices ---');
	const productId = await seedProduct(org.id);
	await seedInvoices(org.id, clientIds, productId);

	console.log('\n--- tickets ---');
	const ticketIds = await seedTickets(org.id, projectIds, clientIds);

	console.log('\n--- project events (timeline) ---');
	const eventIds = await seedProjectEvents(projectIds);

	console.log('\n--- project tasks (checklists) ---');
	await seedProjectTasks(projectIds, eventIds);

	console.log('\n--- quick tasks ---');
	await seedQuickTasks(org.id, projectIds, ticketIds, clientIds);

	console.log('\n--- appointments ---');
	await seedAppointments(leadIds, user.id);

	console.log('\n--- lead activities ---');
	await seedLeadActivities(leadIds, contactIds);

	console.log('\n--- team ---');
	await seedTeam(org.id);

	console.log('\n--- proposal ---');
	await seedProposal(org.id, leadIds, contactIds);

	console.log('\n--- channel + messages ---');
	await seedChannel(org.id, projectIds, user.id);

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  Org ID:  ${org.id}`);
	console.log(`  User ID: ${user.id}`);
	console.log(`  Email:   ${DEMO_USER_EMAIL}`);
	if (generatedPassword) {
		console.log('');
		console.log('  ⚠ Generated a new demo password. Save this to your env as');
		console.log('    DEMO_USER_PASSWORD — /api/auth/demo-login reads it on every request.');
		console.log(`    DEMO_USER_PASSWORD="${demoPassword}"`);
	} else {
		console.log('  Password: (from env DEMO_USER_PASSWORD)');
	}
	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
