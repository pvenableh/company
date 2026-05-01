/**
 * Shared helpers for the demo setup scripts.
 *
 * setup-demo-org.ts (Solo) and setup-demo-agency-org.ts (Agency) both need
 * the same Directus bootstrap plumbing — auth header, find-or-create,
 * org-role seeding with the PermissionMatrix. Factor it here so the two
 * scripts diverge only on seed data, not on provisioning mechanics.
 */

import { randomBytes } from 'node:crypto';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '../../shared/permissions';
import type { RoleSlug, PermissionMatrix } from '../../shared/permissions';

export const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
export const DIRECTUS_TOKEN =
	process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

export const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export function assertDirectusToken(): void {
	if (!DIRECTUS_TOKEN) {
		console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var required');
		process.exit(1);
	}
}

export async function directusRequest<T = unknown>(
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

export async function findOne<T = any>(
	collection: string,
	filter: Record<string, any>,
): Promise<T | null> {
	const qs = `filter=${encodeURIComponent(JSON.stringify(filter))}&limit=1`;
	const res = await directusRequest<T[]>(`/items/${collection}?${qs}`);
	if (res.ok && Array.isArray(res.data) && res.data.length > 0) return res.data[0];
	return null;
}

export async function findOrCreate<T extends { id: any } = any>(
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

/**
 * Ensure the five system roles exist for a given org. `permissionOverrides`
 * lets a caller adjust a specific role's stored PermissionMatrix (e.g. the
 * solo demo bumps Member.ai_usage so visitors can chat with Earnest, and
 * the agency demo can similarly gate destructive Admin actions).
 */
export async function ensureRoles(
	orgId: string,
	permissionOverrides: Partial<Record<RoleSlug, PermissionMatrix>> = {},
): Promise<Record<RoleSlug, string>> {
	const createdRoles = {} as Record<RoleSlug, string>;
	for (const slug of SYSTEM_ROLES) {
		const meta = ROLE_METADATA[slug];
		const permissions = permissionOverrides[slug] ?? DEFAULT_ROLE_PERMISSIONS[slug];
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

export interface DemoUserSpec {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
}

/**
 * Find-or-create a Directus user. Password is always reset to match the
 * passed value so env-var rotation and script re-runs stay in sync.
 */
export async function ensureUser(spec: DemoUserSpec): Promise<any | null> {
	const listRes = await directusRequest<any[]>(
		`/users?filter=${encodeURIComponent(JSON.stringify({ email: { _eq: spec.email } }))}&limit=1`,
	);
	if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length > 0) {
		const user = listRes.data[0];
		console.log(`  [skip] user ${spec.email} (id=${user.id})`);
		const patch = await directusRequest(`/users/${user.id}`, 'PATCH', {
			password: spec.password,
			status: 'active',
		});
		if (!patch.ok) {
			console.error(`  [warn] could not reset password for ${spec.email}: ${patch.error}`);
		}
		return user;
	}

	const config = {
		email: spec.email,
		password: spec.password,
		first_name: spec.firstName,
		last_name: spec.lastName,
		status: 'active',
		role: process.env.NUXT_PUBLIC_DIRECTUS_ROLE_USER || null,
	};
	const res = await directusRequest<any>('/users', 'POST', config);
	if (!res.ok) {
		console.error(`  [fail] create user ${spec.email}: ${res.error}`);
		return null;
	}
	console.log(`  [ok]   user ${spec.email} (id=${res.data?.id})`);
	return res.data;
}

export async function ensureMembership(
	orgId: string,
	userId: string,
	roleId: string,
	label: string,
): Promise<void> {
	await findOrCreate(
		'org_memberships',
		{ _and: [{ organization: { _eq: orgId } }, { user: { _eq: userId } }] },
		{
			organization: orgId,
			user: userId,
			role: roleId,
			status: 'active',
			accepted_at: new Date().toISOString(),
		},
		`org_membership (${label})`,
	);

	// Legacy junction — kept in sync for backward compat
	await findOrCreate(
		'organizations_directus_users',
		{ _and: [{ organizations_id: { _eq: orgId } }, { directus_users_id: { _eq: userId } }] },
		{ organizations_id: orgId, directus_users_id: userId },
		`legacy org junction (${label})`,
	);
}

export function generatePassword(): string {
	return randomBytes(16).toString('base64url');
}

export function randomToken(): string {
	return randomBytes(16).toString('hex');
}

export async function pingDirectus(): Promise<void> {
	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
}

/**
 * Spread `date_created` across the last `windowDays` days for the given
 * contact ids, deterministic by index so re-runs don't shuffle the chart.
 *
 * Demo orgs create all contacts at seed time, which makes the People
 * Intelligence growth-line render flat-then-spike. Backdating gives the
 * chart visible variance for screenshots without inventing data.
 *
 * Directus allows overriding the audit field `date_created` on PATCH when
 * authenticated with the admin server token. Won't work without admin.
 */
export async function backdateContacts(
	contactIds: string[],
	windowDays = 88,
): Promise<void> {
	if (contactIds.length === 0) return;
	const now = Date.now();
	const dayMs = 86_400_000;
	for (let i = 0; i < contactIds.length; i++) {
		const id = contactIds[i];
		// Even spread, oldest first. Add a small per-index hour jitter so
		// week-buckets don't all land at midnight on a single day.
		const fraction = contactIds.length === 1 ? 0 : i / (contactIds.length - 1);
		const offsetDays = Math.floor((1 - fraction) * windowDays);
		const jitterMs = ((i * 7) % 24) * 3_600_000;
		const ts = new Date(now - offsetDays * dayMs - jitterMs).toISOString();
		const res = await directusRequest(`/items/contacts/${id}`, 'PATCH', { date_created: ts });
		if (!res.ok) {
			console.warn(`  [warn] backdate contact ${id}: ${res.error}`);
		}
	}
	console.log(`  [ok]   backdated ${contactIds.length} contacts across ${windowDays} days`);
}

// ─── Document system fixtures ─────────────────────────────────────────────

interface BlockSeed {
	key: string;
	name: string;
	category: string;
	description: string;
	content: string;
	applies_to: string[];
}

const BLOCK_SEEDS: BlockSeed[] = [
	{
		key: 'studio-bio',
		name: 'Studio bio',
		category: 'bio',
		description: 'About-us paragraph for the cover page.',
		content:
			'## About the studio\n\nWe partner with growing brands to build identity systems, websites, and launch campaigns that look right and pull their weight commercially. Independent since 2019, based in San Francisco, fluent on shipping schedules.',
		applies_to: ['proposals', 'contracts'],
	},
	{
		key: 'references',
		name: 'Selected references',
		category: 'references',
		description: 'Three short client references.',
		content:
			'## References\n\n- **Northwind Logistics** — full rebrand + investor deck. Handed off in 12 weeks.\n- **Helios West Hotel** — opening campaign + booking flow. 80% week-one occupancy.\n- **Atlas Fintech** — site redesign + onboarding emails. CTR up 31% in Q3.',
		applies_to: ['proposals', 'contracts'],
	},
	{
		key: 'deliverables',
		name: 'Standard deliverables',
		category: 'deliverables',
		description: 'Phased deliverables block — adapt per engagement.',
		content:
			'## Deliverables\n\n**Phase 1 — Discovery (week 1–2)**\n- Stakeholder interviews + brand audit\n- Competitive landscape + positioning brief\n\n**Phase 2 — Design (week 3–6)**\n- Identity system: logo, type, color, motion\n- Two creative directions, then one to refinement\n\n**Phase 3 — Rollout (week 7–10)**\n- Production-ready guidelines (PDF + Figma)\n- Launch assets: site, social, OOH templates',
		applies_to: ['proposals', 'contracts'],
	},
	{
		key: 'standard-terms',
		name: 'Standard terms',
		category: 'terms',
		description: 'Payment, IP transfer, kill-fee.',
		content:
			'## Terms\n\n**Payment** — 50% deposit on signing, balance net-15 on delivery.\n\n**IP transfer** — full transfer of final deliverables on payment of the final invoice. Working files remain ours.\n\n**Kill-fee** — if cancelled mid-engagement, fees billed pro-rata against work completed plus a 15% restocking fee on phases not yet started.\n\n**Revisions** — two rounds per phase included; further rounds billed at $200/hr.',
		applies_to: ['proposals', 'contracts'],
	},
	{
		key: 'mutual-nda',
		name: 'Mutual NDA',
		category: 'nda',
		description: 'Confidentiality clause for inclusion in proposals.',
		content:
			'## Confidentiality\n\nBoth parties agree to keep confidential any non-public information shared during the engagement, including financial figures, strategic plans, and unreleased product details. This obligation survives termination of the agreement for two (2) years.',
		applies_to: ['proposals', 'contracts'],
	},
];

/**
 * Seed the per-org document_blocks library with five reusable blocks.
 * Returns a map from seed `key` → block UUID. Idempotent.
 */
export async function seedDocumentBlocks(orgId: string): Promise<Record<string, string>> {
	const ids: Record<string, string> = {};
	let sort = 0;
	for (const b of BLOCK_SEEDS) {
		const row = await findOrCreate<any>(
			'document_blocks',
			{ _and: [{ organization: { _eq: orgId } }, { name: { _eq: b.name } }] },
			{
				name: b.name,
				category: b.category,
				description: b.description,
				content: b.content,
				applies_to: b.applies_to,
				organization: orgId,
				status: 'published',
				sort: sort++,
			},
			`document_block "${b.name}"`,
		);
		if (row?.id) ids[b.key] = row.id;
	}
	return ids;
}

interface ServiceTemplateSeed {
	key: string;
	name: string;
	category: string;
	description: string;
	scope_template: string;
	default_total: number;
	default_duration_days: number;
}

const SERVICE_TEMPLATE_SEEDS: ServiceTemplateSeed[] = [
	{
		key: 'brand-identity',
		name: 'Brand Identity Package',
		category: 'branding',
		description: 'Wordmark + system + guidelines for a launching or rebranding company.',
		scope_template:
			'Discovery, two creative directions, identity system (logo, type, color, motion principles), guidelines PDF + Figma library. 10-week engagement, two revision rounds per phase.',
		default_total: 38_000,
		default_duration_days: 70,
	},
	{
		key: 'marketing-site',
		name: 'Marketing Site Redesign',
		category: 'web',
		description: 'Strategy → design → build for a 6–12 page marketing site on Webflow or Nuxt.',
		scope_template:
			'Audit + sitemap, content workshops, key-page design, full responsive build, CMS setup, launch + analytics.',
		default_total: 28_000,
		default_duration_days: 56,
	},
	{
		key: 'launch-retainer',
		name: 'Launch Retainer (3 months)',
		category: 'retainer',
		description: 'Hands-on launch support: campaigns, social, email, light design.',
		scope_template:
			'Three-month retainer covering campaign planning, social content, email sequences, and ongoing creative across channels. Weekly cadence; monthly review.',
		default_total: 18_000,
		default_duration_days: 90,
	},
];

/**
 * Seed the per-org service_templates with three starter templates. Returns
 * a map from seed `key` → template UUID. Idempotent.
 */
export async function seedServiceTemplates(orgId: string): Promise<Record<string, string>> {
	const ids: Record<string, string> = {};
	for (const t of SERVICE_TEMPLATE_SEEDS) {
		const row = await findOrCreate<any>(
			'service_templates',
			{ _and: [{ organization: { _eq: orgId } }, { name: { _eq: t.name } }] },
			{
				name: t.name,
				category: t.category,
				description: t.description,
				scope_template: t.scope_template,
				default_total: t.default_total,
				default_duration_days: t.default_duration_days,
				organization: orgId,
				status: 'published',
			},
			`service_template "${t.name}"`,
		);
		if (row?.id) ids[t.key] = row.id;
	}
	return ids;
}

/**
 * Build the proposal/contract `blocks` json array. Includes a cover-page
 * intro block (block_id=null inline), then library references for bio,
 * deliverables, references, and standard terms.
 */
function buildComposedBlocks(
	blockIds: Record<string, string>,
	intro: { heading: string; content: string },
): Array<{ block_id: string | null; heading: string | null; content: string; page_break_after?: boolean }> {
	const blocks: Array<{
		block_id: string | null;
		heading: string | null;
		content: string;
		page_break_after?: boolean;
	}> = [
		{
			block_id: null,
			heading: intro.heading,
			content: intro.content,
			page_break_after: true,
		},
	];
	const lib = (key: string, heading: string) => {
		const id = blockIds[key];
		if (!id) return null;
		const seed = BLOCK_SEEDS.find((b) => b.key === key);
		return {
			block_id: id,
			heading,
			content: seed?.content ?? '',
		};
	};
	for (const entry of [
		lib('studio-bio', 'About us'),
		lib('deliverables', 'Scope of work'),
		lib('references', 'Selected references'),
		lib('standard-terms', 'Terms'),
	]) {
		if (entry) blocks.push(entry);
	}
	return blocks;
}

/**
 * Seed a proposal with composed blocks (cover intro + 4 library blocks).
 * Idempotent on (organization, title). Returns the proposal id or null.
 */
export async function seedDemoProposal(opts: {
	orgId: string;
	leadId: number | null;
	contactId: string | null;
	blockIds: Record<string, string>;
	title: string;
	totalValue: number;
	intro: { heading: string; content: string };
}): Promise<string | null> {
	const { orgId, leadId, contactId, blockIds, title, totalValue, intro } = opts;
	const blocks = buildComposedBlocks(blockIds, intro);
	const today = new Date().toISOString().slice(0, 10);
	const validUntil = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
	const row = await findOrCreate<any>(
		'proposals',
		{ _and: [{ organization: { _eq: orgId } }, { title: { _eq: title } }] },
		{
			title,
			organization: orgId,
			lead: leadId,
			contact: contactId,
			total_value: totalValue,
			proposal_status: 'sent',
			date_sent: today,
			valid_until: validUntil,
			notes: 'Auto-seeded for the demo. Composed from the document-blocks library.',
			blocks,
		},
		`proposal "${title}"`,
	);
	return row?.id ?? null;
}

interface ContractSeed {
	title: string;
	contract_status: 'draft' | 'sent' | 'signed';
	total_value: number;
	signer?: { name: string; email: string };
}

/**
 * Seed up to N contracts for the demo. The first one is signed (so the
 * /contracts list and the signed-state detail screenshot both have content);
 * the rest stay in `sent`. Idempotent on (organization, title).
 */
export async function seedDemoContracts(opts: {
	orgId: string;
	leadId: number | null;
	contactId: string | null;
	proposalId: string | null;
	blockIds: Record<string, string>;
	contracts: ContractSeed[];
}): Promise<string[]> {
	const { orgId, leadId, contactId, proposalId, blockIds, contracts } = opts;
	const today = new Date().toISOString().slice(0, 10);
	const ids: string[] = [];
	for (const c of contracts) {
		const blocks = buildComposedBlocks(blockIds, {
			heading: c.title,
			content:
				'This Master Services Agreement is entered into on the effective date below between the parties identified in the cover page. The full terms follow.',
		});
		const signedAt = c.contract_status === 'signed' ? new Date().toISOString() : null;
		const validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		const row = await findOrCreate<any>(
			'contracts',
			{ _and: [{ organization: { _eq: orgId } }, { title: { _eq: c.title } }] },
			{
				title: c.title,
				organization: orgId,
				lead: leadId,
				contact: contactId,
				proposal: proposalId,
				total_value: c.total_value,
				contract_status: c.contract_status,
				date_sent: today,
				valid_until: validUntil,
				effective_date: c.contract_status === 'signed' ? today : null,
				notes: 'Auto-seeded for the demo.',
				blocks,
				signed_at: signedAt,
				signed_by_name: c.signer?.name ?? null,
				signed_by_email: c.signer?.email ?? null,
				signature_data: c.signer?.name ?? null,
				signing_token: c.contract_status === 'sent' ? randomToken() : null,
			},
			`contract "${c.title}" (${c.contract_status})`,
		);
		if (row?.id) ids.push(row.id);
	}
	return ids;
}

/**
 * Seed a handful of appointments anchored to today's date (relative to UTC
 * time-of-call). The scheduler page filters by `user_created` OR attendee,
 * so the appointments are owned by the demo user. Idempotent on
 * (user_created, title).
 */
export async function seedTodayAppointments(opts: {
	userId: string;
	contactId: string | null;
	leadId: number | null;
}): Promise<void> {
	const { userId, contactId, leadId } = opts;
	const todayMidnight = new Date();
	todayMidnight.setUTCHours(0, 0, 0, 0);
	const at = (hour: number, minute = 0) => {
		const d = new Date(todayMidnight);
		d.setUTCHours(hour, minute, 0, 0);
		return d.toISOString();
	};
	const APPOINTMENTS: Array<{
		title: string;
		description: string;
		startHour: number;
		startMinute?: number;
		durationMinutes: number;
		isVideo: boolean;
		linkContact?: boolean;
		linkLead?: boolean;
	}> = [
		{
			title: 'Atlas Fintech — intro call',
			description: 'First conversation with Julia. Walk through site goals + timeline.',
			startHour: 9,
			durationMinutes: 30,
			isVideo: true,
			linkContact: true,
			linkLead: true,
		},
		{
			title: 'Studio standup',
			description: 'Quick sync on the week.',
			startHour: 11,
			startMinute: 30,
			durationMinutes: 20,
			isVideo: false,
		},
		{
			title: 'Helios West — launch review',
			description: 'Walk through the campaign creative + media plan.',
			startHour: 14,
			durationMinutes: 60,
			isVideo: true,
			linkContact: true,
		},
		{
			title: 'Northwind — proposal follow-up',
			description: 'Open questions from the Phase 2 proposal.',
			startHour: 16,
			durationMinutes: 30,
			isVideo: true,
		},
	];
	for (const a of APPOINTMENTS) {
		const start = at(a.startHour, a.startMinute ?? 0);
		const end = new Date(new Date(start).getTime() + a.durationMinutes * 60_000).toISOString();
		await findOrCreate(
			'appointments',
			{ _and: [{ user_created: { _eq: userId } }, { title: { _eq: a.title } }] },
			{
				title: a.title,
				description: a.description,
				start_time: start,
				end_time: end,
				status: 'published',
				is_video: a.isVideo,
				meeting_link: a.isVideo ? 'https://meet.daily.co/demo-room' : null,
				room_name: a.isVideo ? 'demo-room' : null,
				related_lead: a.linkLead ? leadId : null,
				user_created: userId,
			},
			`appointment "${a.title}"`,
		);
	}
}
