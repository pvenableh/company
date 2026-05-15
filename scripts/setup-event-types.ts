#!/usr/bin/env npx tsx
/**
 * Directus event_types Collection — Setup Script (Stage 4 of the "Me" lens plan)
 *
 * Replaces the hardcoded consultation/discovery/general meeting types with a
 * user-defined collection. One row per host event type ("Intro Call 30m",
 * "Strategy 60m"), org-scoped, with intake_schema for per-event-type intake
 * forms and a nullable price_cents (Stage 5 wires Stripe).
 *
 * Also:
 *   - Adds `appointments.event_type` (m2o FK, nullable — legacy rows have none)
 *   - Adds `appointments.intake_responses` (JSON)
 *   - Backfills three default event types (Consultation, Discovery, General)
 *     for every existing scheduler_settings row so live bookings keep working.
 *   - Patches policy perms so all org members can read event_types (booking
 *     page lists them) and CRUD their own (host_user._eq.$CURRENT_USER).
 *
 * Run:
 *   pnpm tsx scripts/setup-event-types.ts
 *
 * Idempotent — re-running is safe.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// Policy IDs (same constants used across other setup scripts)
const CLIENT_POLICY_ID = 'cdadd1fd-280e-4d4a-83e6-1b911889af46'; // Client (Member + portal users)
const CLIENT_MANAGER_POLICY_ID = '012beff9-150c-49e9-a284-1a7e2757e0dd';
const CARDDESK_USER_POLICY_ID = '14b84634-157a-4ddb-bb2a-74e70f01798e';

// ─── API Helper ───────────────────────────────────────────────────────────────

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
	try {
		const response = await fetch(`${DIRECTUS_URL}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${DIRECTUS_TOKEN}`,
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		const text = await response.text();
		if (!response.ok) {
			if (response.status === 409) return { data: null, error: 'already_exists' };
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) return { data: null, error: 'already_exists' };
			return { data: null, error: `${response.status}: ${text}` };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: json.data ?? null, error: null };
	} catch (err: any) {
		return { data: null, error: err.message };
	}
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  Creating collection: ${collection}`);
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function setupEventTypesCollection() {
	console.log('\n=== event_types ===');

	await createCollection('event_types', {
		icon: 'event',
		note: 'User-defined booking event types (Intro 30m, Strategy 60m, etc.). One row per host event type. Replaces hardcoded consultation/discovery/general.',
		color: '#10B981',
		hidden: false,
		singleton: false,
		accountability: 'all',
		sort_field: 'sort',
		archive_field: 'status',
		archive_value: 'archived',
		unarchive_value: 'published',
		display_template: '{{title}} ({{duration}}m)',
	});

	// Directus auto-creates an integer auto-increment `id` PK when the collection
	// is created with an empty schema. We intentionally keep that — matches the
	// pattern used by marketing_recommendations and lead_activities. EventType.id
	// is `number` in shared/directus.ts.

	await createField('event_types', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: { choices: [
				{ text: 'Published', value: 'published' },
				{ text: 'Draft', value: 'draft' },
				{ text: 'Archived', value: 'archived' },
			] },
			width: 'half',
		},
		schema: { default_value: 'published', is_nullable: false },
	});

	await createField('event_types', {
		field: 'sort',
		type: 'integer',
		meta: { interface: 'input', width: 'half', hidden: true },
		schema: {},
	});

	await createField('event_types', {
		field: 'organization',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			options: { template: '{{name}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('event_types', {
		field: 'host_user',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			width: 'half',
			note: 'Host who owns the event type. Slug uniqueness is per-host.',
			options: { template: '{{first_name}} {{last_name}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('event_types', {
		field: 'title',
		type: 'string',
		meta: { interface: 'input', required: true, width: 'half', note: 'e.g. "Intro Call"' },
		schema: { is_nullable: false },
	});

	await createField('event_types', {
		field: 'slug',
		type: 'string',
		meta: { interface: 'input', required: true, width: 'half', note: 'URL-safe slug. Unique per host_user.' },
		schema: { is_nullable: false },
	});

	await createField('event_types', {
		field: 'description',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Shown on the booking page.' },
		schema: {},
	});

	await createField('event_types', {
		field: 'duration',
		type: 'integer',
		meta: {
			interface: 'select-dropdown',
			required: true,
			width: 'half',
			options: { choices: [
				{ text: '15 minutes', value: 15 },
				{ text: '30 minutes', value: 30 },
				{ text: '45 minutes', value: 45 },
				{ text: '60 minutes', value: 60 },
				{ text: '90 minutes', value: 90 },
				{ text: '120 minutes', value: 120 },
			], allowOther: true },
		},
		schema: { default_value: 30, is_nullable: false },
	});

	await createField('event_types', {
		field: 'color',
		type: 'string',
		meta: { interface: 'select-color', width: 'half', note: 'Hex color or design-token; defaults to --accent.' },
		schema: {},
	});

	await createField('event_types', {
		field: 'intake_schema',
		type: 'json',
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			note: 'Array of { name, label, type, required, options? } describing the intake form. Empty = skip intake step.',
		},
		schema: {},
	});

	await createField('event_types', {
		field: 'price_cents',
		type: 'integer',
		meta: { interface: 'input', width: 'half', note: 'Null = free. Stage 5 wires Stripe Connect.' },
		schema: {},
	});

	await createField('event_types', {
		field: 'is_default',
		type: 'boolean',
		meta: { interface: 'boolean', width: 'half', note: 'Exactly one per host_user. Bare /book/<org>/<user> renders this one.' },
		schema: { default_value: false, is_nullable: false },
	});

	await createField('event_types', {
		field: 'enabled',
		type: 'boolean',
		meta: { interface: 'boolean', width: 'half' },
		schema: { default_value: true, is_nullable: false },
	});

	// Audit fields
	await createField('event_types', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('event_types', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('event_types', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('event_types', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	// Relations
	await createRelation({
		collection: 'event_types',
		field: 'organization',
		related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});

	await createRelation({
		collection: 'event_types',
		field: 'host_user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

async function setupAppointmentFields() {
	console.log('\n=== appointments.event_type + appointments.intake_responses ===');

	await createField('appointments', {
		field: 'event_type',
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			width: 'half',
			note: 'Event type used when this appointment was booked. Null for legacy/pre-Stage-4 rows.',
			options: { template: '{{title}}' },
		},
		schema: { is_nullable: true },
	});

	await createField('appointments', {
		field: 'intake_responses',
		type: 'json',
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			note: 'Answers to the event type intake form. Shape mirrors intake_schema fields.',
		},
		schema: {},
	});

	await createRelation({
		collection: 'appointments',
		field: 'event_type',
		related_collection: 'event_types',
		schema: { on_delete: 'SET NULL' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Permissions ──────────────────────────────────────────────────────────────

async function permissionExists(policyId: string, collection: string, action: string): Promise<{ id: number; fields: string[] | null; permissions: any } | null> {
	const { data } = await directusRequest<Array<{ id: number; fields: string[] | null; permissions: any }>>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&limit=1`,
	);
	return (data && data[0]) || null;
}

async function ensurePermission(
	policyId: string,
	collection: string,
	action: 'create' | 'read' | 'update' | 'delete',
	rule: { permissions?: any; validation?: any; presets?: any; fields?: string[] },
) {
	const existing = await permissionExists(policyId, collection, action);
	if (existing) {
		console.log(`    [skip] ${collection}.${action} (policy=${policyId}) already exists`);
		return;
	}
	const { error } = await directusRequest('/permissions', 'POST', {
		policy: policyId,
		collection,
		action,
		permissions: rule.permissions ?? null,
		validation: rule.validation ?? null,
		presets: rule.presets ?? null,
		fields: rule.fields ?? ['*'],
	});
	if (error) console.error(`    [fail] ${collection}.${action}: ${error}`);
	else console.log(`    [ok]   ${collection}.${action}`);
}

async function setupPermissions() {
	console.log('\n=== event_types permissions ===');

	// Read scope: any member of the same org (staff path). Booking page reads
	// go through the server static token, so this is for in-app lookups.
	const orgScopeRead = {
		organization: { _in: '$CURRENT_USER.organizations.organizations_id' },
	};

	// CRUD scope: only the host owns their event types.
	const hostScope = {
		host_user: { _eq: '$CURRENT_USER' },
	};

	// Apply to every app policy. Admin policy bypasses.
	for (const policyId of [CLIENT_POLICY_ID, CLIENT_MANAGER_POLICY_ID, CARDDESK_USER_POLICY_ID]) {
		console.log(`\n  Policy ${policyId}:`);
		await ensurePermission(policyId, 'event_types', 'read', { permissions: orgScopeRead });
		await ensurePermission(policyId, 'event_types', 'create', {
			validation: { host_user: { _eq: '$CURRENT_USER' } },
		});
		await ensurePermission(policyId, 'event_types', 'update', { permissions: hostScope });
		await ensurePermission(policyId, 'event_types', 'delete', { permissions: hostScope });
	}

	// Make sure the directus_users.update perm on the Client policy still works.
	// (No new user-pref fields added in Stage 4; nothing to do.)
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

const DEFAULTS = [
	{
		slug: 'consultation',
		title: 'Consultation',
		duration: 30,
		description: 'Quick chat to discuss your needs',
		is_default: true,
		color: '#6366F1',
	},
	{
		slug: 'discovery',
		title: 'Discovery Call',
		duration: 45,
		description: 'In-depth discussion about your project',
		is_default: false,
		color: '#10B981',
	},
	{
		slug: 'general',
		title: 'General Meeting',
		duration: 30,
		description: 'A general meeting',
		is_default: false,
		color: '#F59E0B',
	},
];

async function backfillDefaults() {
	console.log('\n=== Backfilling default event types ===');

	const { data: settingsRows, error } = await directusRequest<Array<{ id: string; user_id: string }>>(
		`/items/scheduler_settings?fields=id,user_id&limit=-1`,
	);
	if (error || !settingsRows) {
		console.error(`  Could not load scheduler_settings: ${error}`);
		return;
	}
	console.log(`  Found ${settingsRows.length} scheduler_settings row(s).`);

	let created = 0;
	let skipped = 0;

	for (const setting of settingsRows) {
		const userId = setting.user_id;
		if (!userId) continue;

		// Find the user's primary org. Use the users.organizations junction.
		const { data: userRows } = await directusRequest<Array<{ organizations: Array<{ organizations_id: string }> }>>(
			`/users/${userId}?fields=organizations.organizations_id`,
		);
		const orgs = (userRows as any)?.organizations as Array<{ organizations_id: string }> | undefined;
		const orgId = orgs && orgs.length > 0 ? orgs[0]!.organizations_id : null;
		if (!orgId) {
			console.log(`  [skip] user ${userId} has no organization`);
			continue;
		}

		// Skip if any event_type already exists for this host_user.
		const { data: existing } = await directusRequest<Array<{ id: string }>>(
			`/items/event_types?filter[host_user][_eq]=${userId}&limit=1`,
		);
		if (existing && existing.length > 0) {
			console.log(`  [skip] user ${userId} already has event types`);
			skipped++;
			continue;
		}

		for (let i = 0; i < DEFAULTS.length; i++) {
			const def = DEFAULTS[i]!;
			const { error: createErr } = await directusRequest('/items/event_types', 'POST', {
				organization: orgId,
				host_user: userId,
				title: def.title,
				slug: def.slug,
				description: def.description,
				duration: def.duration,
				color: def.color,
				is_default: def.is_default,
				enabled: true,
				status: 'published',
				sort: i + 1,
				intake_schema: [],
			});
			if (createErr) {
				console.error(`  [fail] ${userId}/${def.slug}: ${createErr}`);
			} else {
				created++;
			}
		}
		console.log(`  [ok]   seeded 3 defaults for user ${userId}`);
	}

	console.log(`\n  Created ${created} event_type rows. Skipped ${skipped} user(s).`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  event_types — Setup (Stage 4)');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	await setupEventTypesCollection();
	await setupAppointmentFields();
	await setupPermissions();
	await backfillDefaults();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
