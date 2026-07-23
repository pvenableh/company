#!/usr/bin/env npx tsx
/**
 * Backfill the `touchpoints` key into every org_roles.permissions matrix.
 *
 * Touchpoints became a first-class FeatureKey (shared/permissions.ts). Existing
 * `org_roles` rows were seeded before the key existed, so their stored
 * `permissions` JSON has no `touchpoints` entry. The CLIENT gate
 * (`useOrgRole.hasPermission`) reads the *stored* matrix with no default
 * fallback, so manager/member/client would resolve `touchpoints` → false until
 * backfilled. (Owner/Admin bypass the matrix, and the SERVER util
 * `requireOrgPermission` does fall back to defaults — but touchpoints is
 * client-gated, so this backfill is what actually turns it on.)
 *
 * For each role we set `permissions.touchpoints` from
 * DEFAULT_ROLE_PERMISSIONS[slug].touchpoints. If a row's `permissions` is null
 * or not an object (an unconfigured role), we seed the whole default matrix for
 * that slug so the role becomes valid.
 *
 * Idempotent — skips rows that already carry a `touchpoints` key. Safe to re-run.
 *   pnpm tsx scripts/backfill-touchpoints-role-permission.ts
 */
import 'dotenv/config';
import { DEFAULT_ROLE_PERMISSIONS } from '../shared/permissions';
import type { RoleSlug, PermissionMatrix } from '../shared/permissions';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function req<T = unknown>(path: string, method: 'GET' | 'PATCH' = 'GET', body?: unknown): Promise<{ data: T | null; error: string | null }> {
	try {
		const r = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
			body: body ? JSON.stringify(body) : undefined,
		});
		const text = await r.text();
		if (!r.ok) return { data: null, error: `${r.status}: ${text}` };
		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null };
	} catch (err) { return { data: null, error: String(err) }; }
}

interface OrgRoleRow {
	id: string;
	slug: string;
	organization: string | null;
	permissions: Record<string, unknown> | null;
}

async function main() {
	console.log(`Backfill touchpoints role permission @ ${DIRECTUS_URL}\n`);

	const { data: roles, error } = await req<OrgRoleRow[]>(
		'/items/org_roles?fields=id,slug,organization,permissions&limit=-1',
	);
	if (error || !roles) { console.error(`Failed to read org_roles: ${error}`); process.exit(1); }

	let updated = 0, skipped = 0, seeded = 0, failed = 0;

	for (const role of roles) {
		const slug = role.slug as RoleSlug;
		const defaults = DEFAULT_ROLE_PERMISSIONS[slug];
		if (!defaults) {
			console.warn(`  [warn] role ${role.id} has unknown slug "${role.slug}" — skipping`);
			skipped++;
			continue;
		}

		const perms = role.permissions;
		const isObject = perms && typeof perms === 'object' && !Array.isArray(perms);

		// Already has the key → nothing to do.
		if (isObject && 'touchpoints' in perms) { skipped++; continue; }

		let nextPermissions: PermissionMatrix | Record<string, unknown>;
		let mode: 'add-key' | 'seed-matrix';
		if (isObject) {
			nextPermissions = { ...perms, touchpoints: defaults.touchpoints };
			mode = 'add-key';
		} else {
			// Unconfigured role (null / malformed) — seed the full default matrix.
			nextPermissions = defaults;
			mode = 'seed-matrix';
		}

		const { error: patchErr } = await req(`/items/org_roles/${role.id}`, 'PATCH', { permissions: nextPermissions });
		if (patchErr) {
			console.error(`  [fail] ${slug} (${role.id}) org=${role.organization}: ${patchErr}`);
			failed++;
			continue;
		}
		console.log(`  [ok]   ${slug} (${role.id}) org=${role.organization} — ${mode}`);
		if (mode === 'seed-matrix') seeded++; else updated++;
	}

	console.log(`\nDone. ${updated} key-added, ${seeded} matrix-seeded, ${skipped} already-present/skipped, ${failed} failed.`);
	if (failed) process.exit(1);
}

main().catch((err) => { console.error('Backfill failed:', err); process.exit(1); });
