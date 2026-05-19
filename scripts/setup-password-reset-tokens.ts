#!/usr/bin/env npx tsx
/**
 * Directus — `password_reset_tokens` collection.
 *
 * Backs the Earnest-branded password reset flow that replaces Directus's
 * default `passwordRequest`/`passwordReset` SDK calls (which trigger
 * Directus's own mail config, often missing in our envs, and render an
 * un-styled default template).
 *
 * Shape:
 *   id            uuid pk
 *   user          m2o → directus_users (CASCADE on delete)
 *   token         string (indexed, 64-char hex)
 *   expires_at    timestamp (1h TTL by convention)
 *   used_at       timestamp nullable (set when the token redeems a reset)
 *   requested_ip  string nullable
 *
 * Idempotent — re-running is safe. Tokens are server-only (no public
 * read/write perms); the reset request + reset routes use the admin
 * Directus client to read/write rows, so a leaked token alone can't be
 * walked back to the user without admin access.
 *
 * Usage:
 *   pnpm tsx scripts/setup-password-reset-tokens.ts             # apply
 *   pnpm tsx scripts/setup-password-reset-tokens.ts --dry-run   # plan only
 *
 * Then:
 *   pnpm generate:types
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

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
	let json: any = {};
	try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
	return {
		ok: response.ok,
		status: response.status,
		data: response.ok ? ((json.data ?? null) as T) : null,
		error: response.ok ? null : text,
	};
}

async function collectionExists(name: string): Promise<boolean> {
	const res = await directusRequest(`/collections/${name}`);
	return res.ok;
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/fields/${collection}/${field}`);
	return res.ok;
}

async function relationExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/relations/${collection}/${field}`);
	return res.ok;
}

type Result = 'created' | 'skipped' | 'failed' | 'planned';

async function ensureCollection(): Promise<Result> {
	if (await collectionExists('password_reset_tokens')) {
		console.log('  [skip] collection password_reset_tokens already exists');
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log('  [plan] would create collection password_reset_tokens');
		return 'planned';
	}
	const res = await directusRequest('/collections', 'POST', {
		collection: 'password_reset_tokens',
		meta: {
			icon: 'key',
			note: 'Single-use password reset tokens. 1h TTL. Used by /api/directus/users/password-reset* routes.',
			singleton: false,
			hidden: true, // server-only; no need for an admin UI listing
			sort_field: null,
			archive_field: null,
		},
		schema: { name: 'password_reset_tokens' },
		fields: [
			{
				field: 'id',
				type: 'uuid',
				meta: { hidden: true, interface: 'input', readonly: true, special: ['uuid'] },
				schema: { is_primary_key: true },
			},
			{
				field: 'date_created',
				type: 'timestamp',
				meta: {
					interface: 'datetime',
					special: ['date-created'],
					readonly: true,
					hidden: true,
					width: 'half',
				},
				schema: { is_nullable: true },
			},
		],
	});
	if (!res.ok) {
		console.error(`  [fail] collection password_reset_tokens: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   collection password_reset_tokens created');
	return 'created';
}

async function ensureField(
	field: string,
	type: string,
	meta: Record<string, any>,
	schema: Record<string, any> = { is_nullable: true },
): Promise<Result> {
	if (await fieldExists('password_reset_tokens', field)) {
		console.log(`  [skip] field password_reset_tokens.${field} already exists`);
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log(`  [plan] would create field password_reset_tokens.${field}`);
		return 'planned';
	}
	const res = await directusRequest('/fields/password_reset_tokens', 'POST', { field, type, meta, schema });
	if (!res.ok) {
		console.error(`  [fail] field password_reset_tokens.${field}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field password_reset_tokens.${field} created`);
	return 'created';
}

async function ensureUserRelation(): Promise<Result> {
	if (await relationExists('password_reset_tokens', 'user')) {
		console.log('  [skip] relation password_reset_tokens.user already exists');
		return 'skipped';
	}
	if (DRY_RUN) {
		console.log('  [plan] would create relation password_reset_tokens.user → directus_users');
		return 'planned';
	}
	const res = await directusRequest('/relations', 'POST', {
		collection: 'password_reset_tokens',
		field: 'user',
		related_collection: 'directus_users',
		meta: { sort_field: null },
		schema: { on_delete: 'CASCADE' },
	});
	if (!res.ok) {
		console.error(`  [fail] relation password_reset_tokens.user: ${res.error}`);
		return 'failed';
	}
	console.log('  [ok]   relation password_reset_tokens.user → directus_users created');
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  password_reset_tokens setup');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}`);
	if (DRY_RUN) console.log('Mode:   DRY RUN (no writes)');
	console.log('');

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	console.log('--- collection ---');
	const collRes = await ensureCollection();

	console.log('\n--- fields ---');
	const fields: Result[] = [];
	fields.push(await ensureField('user', 'uuid', {
		interface: 'select-dropdown-m2o',
		special: ['m2o'],
		options: { template: '{{first_name}} {{last_name}} ({{email}})' },
		note: 'User this reset token belongs to.',
		width: 'half',
	}, { is_nullable: false }));
	fields.push(await ensureField('token', 'string', {
		interface: 'input',
		note: '64-char hex (crypto.randomBytes(32).toString("hex")). Indexed.',
		width: 'full',
		readonly: true,
	}, { is_nullable: false, length: 128 }));
	fields.push(await ensureField('expires_at', 'timestamp', {
		interface: 'datetime',
		note: 'Token becomes invalid after this time. Set to 1h after creation by convention.',
		width: 'half',
	}, { is_nullable: false }));
	fields.push(await ensureField('used_at', 'timestamp', {
		interface: 'datetime',
		note: 'Set when the token is redeemed. Single-use — non-null means burnt.',
		width: 'half',
	}));
	fields.push(await ensureField('requested_ip', 'string', {
		interface: 'input',
		note: 'IP that requested the reset (best-effort, from req headers).',
		width: 'half',
	}, { is_nullable: true, length: 64 }));

	console.log('\n--- relations ---');
	const userRel = await ensureUserRelation();

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  collection:    ${collRes}`);
	console.log(`  fields:        ${fields.join(', ')}`);
	console.log(`  user relation: ${userRel}`);

	const all = [collRes, ...fields, userRel];
	if (all.includes('failed')) {
		process.exit(1);
	}
	console.log('');
	if (DRY_RUN) {
		console.log('Dry run complete — no writes performed.');
	} else {
		console.log('Done. Run `pnpm generate:types` to refresh shared/directus.ts.');
		console.log('No perm patches needed — the routes use the admin Directus client.');
	}
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
