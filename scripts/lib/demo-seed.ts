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
