#!/usr/bin/env npx tsx
/**
 * Grant read/create/delete on `projects_contacts` to non-admin org users.
 *
 * The junction is created idempotently by `setup-projects-contacts-junction.ts`.
 * Without explicit perms, Directus's "Client" + "Client Manager" policies
 * deny access entirely, so the ProjectWorkspace Contacts tab silently 403s on
 * every list/read.
 *
 * Two policies are patched (admin role is unrestricted, no patch needed):
 *   - Client          (Member + portal users)
 *   - Client Manager  (org owner/admin/manager)
 *
 * Row filter for both:
 *   project.organization is in (orgs the current user belongs to)
 *
 * That mirrors the project-read filter used by `projects` itself, so
 * cross-org leakage is impossible.
 *
 * Idempotent — re-running upserts each (policy, collection, action) row.
 *
 * Usage:
 *   pnpm tsx scripts/setup-projects-contacts-perms.ts             # apply
 *   pnpm tsx scripts/setup-projects-contacts-perms.ts --dry-run   # plan only
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
	console.error('Missing DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN');
	process.exit(1);
}

// Same constants used across other scripts (setup-event-types.ts, etc.)
const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46';
const CLIENT_MANAGER_POLICY_ID = '012beff9-150c-49e9-a284-1a7e2757e0dd';

const COLLECTION = 'projects_contacts';

// Row filter: the junction row's project must belong to an org the user
// is a member of. Walks `project.organization.users.directus_users_id`.
const orgScopeFilter = {
	project: {
		organization: {
			users: { directus_users_id: { _eq: '$CURRENT_USER' } },
		},
	},
} as const;

type Action = 'read' | 'create' | 'delete' | 'update';

interface Permission {
	id?: number;
	policy: string;
	collection: string;
	action: Action;
	permissions?: Record<string, any> | null;
	validation?: Record<string, any> | null;
	presets?: Record<string, any> | null;
	fields?: string[] | null;
}

async function findPermission(policy: string, action: Action): Promise<Permission | null> {
	const url = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${COLLECTION}&filter[action][_eq]=${action}&filter[policy][_eq]=${policy}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
	if (!res.ok) return null;
	const json = await res.json();
	return (json.data as Permission[])[0] ?? null;
}

async function upsertPermission(policy: string, action: Action): Promise<'created' | 'updated' | 'skipped' | 'planned' | 'failed'> {
	const existing = await findPermission(policy, action);
	const desired: Permission = {
		policy,
		collection: COLLECTION,
		action,
		permissions: orgScopeFilter as any,
		validation: null,
		presets: null,
		fields: ['*'],
	};
	if (existing) {
		// Compare on the filter only — if it already matches, skip.
		const same = JSON.stringify(existing.permissions || {}) === JSON.stringify(desired.permissions);
		if (same && JSON.stringify(existing.fields || []) === JSON.stringify(desired.fields)) {
			console.log(`  [skip] ${action} on policy ${policy.slice(0, 8)}… already matches`);
			return 'skipped';
		}
		if (DRY_RUN) {
			console.log(`  [plan] would update ${action} on policy ${policy.slice(0, 8)}…`);
			return 'planned';
		}
		const res = await fetch(`${DIRECTUS_URL}/permissions/${existing.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
			body: JSON.stringify({ permissions: desired.permissions, fields: desired.fields }),
		});
		if (!res.ok) {
			console.error(`  [fail] update ${action}: ${await res.text()}`);
			return 'failed';
		}
		console.log(`  [ok]   updated ${action} on policy ${policy.slice(0, 8)}…`);
		return 'updated';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create ${action} on policy ${policy.slice(0, 8)}…`);
		return 'planned';
	}
	const res = await fetch(`${DIRECTUS_URL}/permissions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify(desired),
	});
	if (!res.ok) {
		console.error(`  [fail] create ${action}: ${await res.text()}`);
		return 'failed';
	}
	console.log(`  [ok]   created ${action} on policy ${policy.slice(0, 8)}…`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  projects_contacts perms patch');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	if (DRY_RUN) console.log('Mode:   DRY RUN (no writes)');
	console.log('');

	const ping = await fetch(`${DIRECTUS_URL}/server/info`, { headers: { Authorization: `Bearer ${TOKEN}` } });
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${await ping.text()}`);
		process.exit(1);
	}

	const actions: Action[] = ['read', 'create', 'delete'];
	const policies = [
		{ id: CLIENT_POLICY_ID, label: 'Client (Member)' },
		{ id: CLIENT_MANAGER_POLICY_ID, label: 'Client Manager (Owner/Admin/Manager)' },
	];

	const results: string[] = [];
	for (const policy of policies) {
		console.log(`\n--- ${policy.label} (${policy.id.slice(0, 8)}…) ---`);
		for (const action of actions) {
			const r = await upsertPermission(policy.id, action);
			results.push(`${policy.label} ${action}: ${r}`);
		}
	}

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	for (const r of results) console.log(`  ${r}`);

	if (results.some((r) => r.endsWith('failed'))) {
		process.exit(1);
	}
	console.log('');
	if (DRY_RUN) {
		console.log('Dry run complete — no writes performed.');
	} else {
		console.log('Done.');
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
