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
 * Assign every ticket in an org to the demo user. The /tasks page's
 * "Assigned to Me" tab reads from `tickets.assigned_to.directus_users_id`,
 * so without this junction the right column is empty and the seed-built
 * `tasks_directus_users` rows don't surface anywhere visible. Idempotent
 * via findOrCreate on (tickets_id, directus_users_id).
 */
export async function assignTicketsToUser(orgId: string, userId: string): Promise<void> {
	const filter = encodeURIComponent(JSON.stringify({ organization: { _eq: orgId } }));
	const r = await directusRequest<any[]>(
		`/items/tickets?filter=${filter}&fields=id,title&limit=200`,
	);
	const tickets = (r.data as any[]) ?? [];
	for (const t of tickets) {
		await findOrCreate(
			'tickets_directus_users',
			{ _and: [{ tickets_id: { _eq: t.id } }, { directus_users_id: { _eq: userId } }] },
			{ tickets_id: t.id, directus_users_id: userId },
			`ticket assignee (${t.title ?? t.id})`,
		);
	}
}

/**
 * Seed a handful of appointments anchored to today's date (relative to UTC
 * time-of-call). The scheduler page filters by `user_created` OR attendee,
 * so the appointments are owned by the demo user.
 *
 * Always shifts existing rows to today on re-run — `findOrCreate` would
 * leave the dates frozen on the original seed day, which is why the demo
 * scheduler appeared empty whenever the script wasn't re-run that morning.
 * We match on (user_created, title) and PATCH start_time/end_time.
 */
export async function seedTodayAppointments(opts: {
	userId: string;
	contactId: string | null;
	leadId: number | null;
}): Promise<void> {
	const { userId, leadId } = opts;
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
		// Hours are UTC; comments show the EDT (UTC-4) wall-clock the day
		// timeline will display in. EDT is the relevant zone May–November;
		// shift by +1h in winter if you want exact 9am EST.
		{
			title: 'Atlas Fintech — intro call',
			description: 'First conversation with Julia. Walk through site goals + timeline.',
			startHour: 13, // 9:00am EDT
			durationMinutes: 30,
			isVideo: true,
			linkContact: true,
			linkLead: true,
		},
		{
			title: 'Studio standup',
			description: 'Quick sync on the week.',
			startHour: 15, // 11:30am EDT
			startMinute: 30,
			durationMinutes: 20,
			isVideo: false,
		},
		{
			title: 'Helios West — launch review',
			description: 'Walk through the campaign creative + media plan.',
			startHour: 18, // 2:00pm EDT
			durationMinutes: 60,
			isVideo: true,
			linkContact: true,
		},
		{
			title: 'Driftwood Roasters — packaging walk-through',
			description: 'Review the cover art + label tier options.',
			startHour: 20, // 4:00pm EDT
			durationMinutes: 30,
			isVideo: true,
		},
	];
	for (const a of APPOINTMENTS) {
		const start = at(a.startHour, a.startMinute ?? 0);
		const end = new Date(new Date(start).getTime() + a.durationMinutes * 60_000).toISOString();
		const payload = {
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
		};
		// Find by title only — Directus auto-fills `user_created` from the
		// admin token's user on POST, so prior runs land the row under the
		// API-admin's id rather than the demo user. Filtering by user_created
		// would never match the legacy rows and we'd duplicate every run.
		const existing = await findOne<any>('appointments', {
			title: { _eq: a.title },
		});
		if (existing) {
			const res = await directusRequest(`/items/appointments/${existing.id}`, 'PATCH', {
				start_time: start,
				end_time: end,
				description: a.description,
				is_video: a.isVideo,
				meeting_link: payload.meeting_link,
				room_name: payload.room_name,
				related_lead: payload.related_lead,
				// Force user_created → demo user. Required by useCalendarEvents
				// which subscribes with `user_created.id._eq = current user`.
				user_created: userId,
			});
			if (res.ok) console.log(`  [shift] appointment "${a.title}" → today`);
			else console.warn(`  [warn]  appointment "${a.title}": ${res.error}`);
		} else {
			const res = await directusRequest<any>('/items/appointments', 'POST', payload);
			if (res.ok) {
				console.log(`  [ok]    appointment "${a.title}"`);
				// Directus stamps user_created from the auth token on POST,
				// ignoring the payload value. PATCH after-create to put the
				// demo user back in the seat.
				if (res.data?.id) {
					await directusRequest(`/items/appointments/${res.data.id}`, 'PATCH', {
						user_created: userId,
					});
				}
			} else console.warn(`  [fail]  appointment "${a.title}": ${res.error}`);
		}
	}
}

// ─── Projects + events (Clean Gantt color palette) ────────────────────────

/**
 * One service per category, color-coded. The Project Timeline gantt colors
 * project-level summary bars by `project.service.color`. Without a service,
 * projects render with the gray fallback (#d4d4d8) and the Clean-Gantt
 * palette doesn't show.
 *
 * `services` is a global collection (no `organization` column — see how
 * UnifiedGantt fetches it without an org filter), so we match on name
 * only. Re-runs across multiple demo orgs reuse the same rows.
 */
export interface ServiceSeed {
	name: string;
	color: string;
	description?: string;
}

export const DEFAULT_SERVICE_SEEDS: ServiceSeed[] = [
	{ name: 'Brand & Identity', color: '#f472b6', description: 'Logo, type, color systems.' },
	{ name: 'Web & Digital', color: '#06b6d4', description: 'Marketing sites, portals, apps.' },
	{ name: 'Content & Campaigns', color: '#fb923c', description: 'Editorial, social, launch.' },
	{ name: 'Strategy & Retainer', color: '#a78bfa', description: 'Ongoing partnership work.' },
];

export async function seedDemoServices(
	seeds: ServiceSeed[] = DEFAULT_SERVICE_SEEDS,
): Promise<Record<string, string>> {
	const ids: Record<string, string> = {};
	for (const s of seeds) {
		const row = await findOrCreate<any>(
			'services',
			{ name: { _eq: s.name } },
			{
				name: s.name,
				color: s.color,
				description: s.description ?? null,
				status: 'published',
			},
			`service "${s.name}"`,
		);
		if (row) ids[s.name] = row.id;
	}
	return ids;
}

export interface ProjectEventSeed {
	title: string;
	description?: string;
	type: 'General' | 'Design' | 'Content' | 'Timeline' | 'Financial' | 'Hours';
	status: 'draft' | 'Scheduled' | 'Active' | 'Completed' | 'archived';
	is_milestone?: boolean;
	/** Days from today; negative = past, positive = future. */
	dayOffset: number;
	durationDays?: number;
}

export interface ProjectSeed {
	key: string;
	title: string;
	description: string;
	clientId: string | null;
	serviceName?: string;
	status: 'Scheduled' | 'In Progress' | 'Completed' | 'On Hold';
	contractValue: number;
	/** Days from today; negative = started in past. */
	startDayOffset: number;
	events: ProjectEventSeed[];
}

/**
 * Seed projects + events with mixed statuses + types so the Project Timeline
 * gantt on /command-center renders the full Clean-Gantt color palette
 * (Design pink, Content orange, Timeline cyan, etc.) instead of one flat
 * In-Progress lane. Idempotent on (organization, title) for projects and
 * (project, title) for events.
 */
// ─── Time entries ──────────────────────────────────────────────────────────

export interface TimeEntrySeed {
	/** Stable key used as the `description` find key — re-runs PATCH instead
	 *  of duplicating. */
	key: string;
	description: string;
	/** Days from today; 0 = today, -3 = three days ago. Time entries seeded
	 *  for "this week" tab — keep within -6 to 0 to stay in current week. */
	dayOffset: number;
	/** Wall-clock start hour in EDT (UTC-4). Stored as UTC after shift. */
	edtStartHour: number;
	durationMinutes: number;
	projectKey?: string;
	clientKey?: string;
	billable?: boolean;
	hourlyRate?: number;
	tags?: string[];
	/** When true, leaves end_time null and status='running' so the timer
	 *  dock shows an active session. Should only be set on at most one
	 *  entry per user. */
	running?: boolean;
}

/**
 * Seed time_entries for the demo user. The Time Tracker page defaults to
 * the "This Week" tab, so anchor entries within the current week (Mon-Sun)
 * via dayOffset values relative to today.
 *
 * Idempotent on (organization, user, description) — re-runs PATCH the
 * timestamps to today-relative so a stale seed doesn't fall off the week.
 */
export async function seedTimeEntries(opts: {
	orgId: string;
	userId: string;
	clientIds: Record<string, string>;
	projectIds: Record<string, string>;
	entries: TimeEntrySeed[];
}): Promise<void> {
	const { orgId, userId, clientIds, projectIds, entries } = opts;
	const todayMidnight = new Date();
	todayMidnight.setUTCHours(0, 0, 0, 0);
	for (const e of entries) {
		const day = new Date(todayMidnight);
		day.setUTCDate(day.getUTCDate() + e.dayOffset);
		// EDT = UTC-4 → wall-clock hour 9 = 13 UTC. Convert by +4.
		day.setUTCHours(e.edtStartHour + 4, 0, 0, 0);
		const start = day.toISOString();
		const end = e.running
			? null
			: new Date(day.getTime() + e.durationMinutes * 60_000).toISOString();
		const dateOnly = start.slice(0, 10);
		const projectId = e.projectKey ? projectIds[e.projectKey] ?? null : null;
		const clientId = e.clientKey ? clientIds[e.clientKey] ?? null : null;
		const payload: Record<string, any> = {
			organization: orgId,
			user: userId,
			description: e.description,
			start_time: start,
			end_time: end,
			duration_minutes: e.running ? null : e.durationMinutes,
			date: dateOnly,
			billable: e.billable ?? true,
			hourly_rate: e.hourlyRate ?? 175,
			billed: false,
			status: e.running ? 'running' : 'completed',
			project: projectId,
			client: clientId,
			tags: e.tags ?? null,
		};
		const existing = await findOne<any>('time_entries', {
			_and: [
				{ organization: { _eq: orgId } },
				{ user: { _eq: userId } },
				{ description: { _eq: e.description } },
			],
		});
		if (existing) {
			await directusRequest(`/items/time_entries/${existing.id}`, 'PATCH', {
				start_time: start,
				end_time: end,
				duration_minutes: payload.duration_minutes,
				date: dateOnly,
				status: payload.status,
				project: projectId,
				client: clientId,
				billable: payload.billable,
				hourly_rate: payload.hourly_rate,
				tags: payload.tags,
			});
		} else {
			await directusRequest('/items/time_entries', 'POST', payload);
		}
	}
	console.log(`  [ok]   ${entries.length} time entries (this-week)`);
}

export async function seedDemoProjects(opts: {
	orgId: string;
	projects: ProjectSeed[];
	serviceIds?: Record<string, string>;
}): Promise<Record<string, string>> {
	const { orgId, projects, serviceIds = {} } = opts;
	const todayIso = (offset: number) => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + offset);
		return d.toISOString().slice(0, 10);
	};
	const out: Record<string, string> = {};
	for (const p of projects) {
		const serviceId = p.serviceName ? serviceIds[p.serviceName] ?? null : null;
		const projectPayload: Record<string, any> = {
			title: p.title,
			description: p.description,
			organization: orgId,
			client: p.clientId,
			status: p.status,
			contract_value: p.contractValue,
			start_date: todayIso(p.startDayOffset),
		};
		if (serviceId) projectPayload.service = serviceId;
		// PATCH on conflict so re-runs flip status / shift dates without dup.
		const existing = await findOne<any>('projects', {
			_and: [{ organization: { _eq: orgId } }, { title: { _eq: p.title } }],
		});
		let projectId: string | null = null;
		if (existing) {
			projectId = existing.id;
			await directusRequest(`/items/projects/${projectId}`, 'PATCH', {
				status: p.status,
				start_date: projectPayload.start_date,
				...(serviceId ? { service: serviceId } : {}),
			});
			console.log(`  [shift] project "${p.title}" → ${p.status}`);
		} else {
			const res = await directusRequest<any>('/items/projects', 'POST', projectPayload);
			if (!res.ok) {
				console.warn(`  [fail] project "${p.title}": ${res.error}`);
				continue;
			}
			projectId = (res.data as any)?.id ?? null;
			console.log(`  [ok]   project "${p.title}" (id=${projectId})`);
		}
		if (!projectId) continue;
		out[p.key] = projectId;

		for (const e of p.events) {
			const eventDate = todayIso(e.dayOffset);
			const eventPayload = {
				project: projectId,
				title: e.title,
				description: e.description ?? null,
				type: e.type,
				status: e.status,
				approval: 'No Approval Necessary',
				is_milestone: e.is_milestone ?? false,
				event_date: eventDate,
				duration_days: e.durationDays ?? null,
			};
			const existingEvt = await findOne<any>('project_events', {
				_and: [{ project: { _eq: projectId } }, { title: { _eq: e.title } }],
			});
			if (existingEvt) {
				await directusRequest(`/items/project_events/${existingEvt.id}`, 'PATCH', {
					status: e.status,
					event_date: eventDate,
					duration_days: e.durationDays ?? null,
				});
			} else {
				await directusRequest('/items/project_events', 'POST', eventPayload);
			}
		}
	}
	console.log(`  [ok]   ${projects.length} projects + ${projects.reduce((n, p) => n + p.events.length, 0)} events`);
	return out;
}

// ── Social demo seed ─────────────────────────────────────────────────────────
// Inserts placeholder social_accounts + social_posts so the demo orgs surface
// realistic UI. Tokens are non-functional placeholders — diagnostics will
// show decrypt-fail / 401 for these accounts, which is accurate.
type SocialPlatform = 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'threads';

const PLATFORM_HANDLE_HINT: Record<SocialPlatform, string> = {
	instagram: 'ig',
	tiktok: 'tt',
	linkedin: 'in',
	facebook: 'fb',
	threads: 'th',
};

export interface SocialSeedAssignment {
	clientId: string | null;
	clientName: string;
	platforms: SocialPlatform[];
}

const SAMPLE_CAPTIONS: { caption: string; type: 'image' | 'video' | 'text' }[] = [
	{ caption: "Excited to share what we've been working on this quarter — a full brand refresh for one of our favorite clients.", type: 'image' },
	{ caption: "Behind-the-scenes from yesterday's shoot. The team brought everything together in 4 hours flat.", type: 'image' },
	{ caption: 'Three takeaways from our latest case study. ✨', type: 'text' },
	{ caption: "New work, new week. Here's a peek at the campaign launching Friday.", type: 'video' },
	{ caption: "When the strategy doc and the design comps line up perfectly — that's the magic.", type: 'image' },
	{ caption: 'Tip of the day: clarity beats cleverness, every time.', type: 'text' },
	{ caption: 'Our favorite design tools of 2026 — link in bio for the full breakdown.', type: 'image' },
	{ caption: 'Just shipped! Big shoutout to the whole team. 🎉', type: 'image' },
];

export async function seedSocial(opts: {
	orgId: string;
	assignments: SocialSeedAssignment[];
	postCount: number;
}): Promise<{ accountIds: string[]; postIds: string[] }> {
	console.log(`\n--- social ---`);
	const accountIds: string[] = [];
	const createdAccounts: Array<{ id: string; platform: SocialPlatform; name: string; handle: string; client: string | null }> = [];

	for (const assignment of opts.assignments) {
		for (const platform of assignment.platforms) {
			const slug = assignment.clientName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18) || 'house';
			const handle = `${slug}_${PLATFORM_HANDLE_HINT[platform]}`;
			const platformUserId = `demo_${assignment.clientId ?? 'house'}_${platform}_${Math.random().toString(36).slice(2, 8)}`;
			const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
			const displayName = assignment.clientName === 'House' ? 'Earnest Demo' : assignment.clientName;

			const accRes = await directusRequest<{ id: string }>('/items/social_accounts', 'POST', {
				organization: opts.orgId,
				client: assignment.clientId,
				platform,
				platform_user_id: platformUserId,
				account_name: displayName,
				account_handle: handle,
				profile_picture_url: null,
				access_token: 'demo-placeholder-token-not-encrypted',
				token_expires_at: tokenExpiresAt,
				account_status: 'active',
				metadata: { demo: true },
			});
			if (!accRes.ok || !accRes.data) {
				console.warn(`  [skip] ${platform} for ${displayName}: ${accRes.error || accRes.status}`);
				continue;
			}
			const acc = accRes.data;
			accountIds.push(acc.id);
			createdAccounts.push({ id: acc.id, platform, name: displayName, handle, client: assignment.clientId });
		}
	}
	console.log(`  [ok]   ${accountIds.length} social_accounts`);

	const postIds: string[] = [];
	const now = Date.now();
	for (let i = 0; i < opts.postCount; i++) {
		const acc = createdAccounts[i % createdAccounts.length]!;
		const sample = SAMPLE_CAPTIONS[i % SAMPLE_CAPTIONS.length]!;
		const bucket = i % 3;
		const offsetDays = bucket === 0 ? -((i + 1) * 3) : bucket === 1 ? (i + 1) * 2 : 0;
		const scheduledAt = new Date(now + offsetDays * 24 * 60 * 60 * 1000).toISOString();
		const status = bucket === 0 ? 'published' : bucket === 1 ? 'scheduled' : 'draft';
		const postRes = await directusRequest<{ id: string }>('/items/social_posts', 'POST', {
			organization: opts.orgId,
			client: acc.client,
			caption: sample.caption,
			media_urls: sample.type === 'text' ? [] : ['https://images.unsplash.com/photo-1545239351-cefa43af60f3?w=800'],
			media_types: sample.type === 'text' ? [] : [sample.type],
			platforms: [{ platform: acc.platform, account_id: acc.id, account_name: acc.name }],
			post_type: sample.type,
			scheduled_at: scheduledAt,
			post_status: status,
			published_at: status === 'published' ? scheduledAt : null,
		});
		if (!postRes.ok || !postRes.data) {
			console.warn(`  [skip] post ${i}: ${postRes.error || postRes.status}`);
			continue;
		}
		postIds.push(postRes.data.id);
	}
	console.log(`  [ok]   ${postIds.length} social_posts`);

	return { accountIds, postIds };
}
