#!/usr/bin/env npx tsx
/**
 * Scheduler v2 — Setup Script (Calendar/Scheduler upgrade)
 *
 * Additive, idempotent schema for the "Calendly + Earnest AI" upgrade. Grown
 * per phase; every field/collection creation is skip-on-exists so re-running is
 * always safe.
 *
 * Phase 1 (this pass): host-level booking-policy columns on `scheduler_settings`
 * that let the server become the authoritative slot source, plus the
 * `ical_feed_token` the (now-fixed) iCal feed validates against.
 *   - ical_feed_token         (string, unique) + backfill randomUUID per row
 *   - minimum_notice_minutes  (int, default 120)
 *   - booking_horizon_days    (int, default 30)
 *   - daily_booking_limit     (int, nullable — no cap)
 *   - slot_interval_minutes   (int, default 15)
 *   - google_access_token / google_token_expiry     (cached OAuth token)
 *   - outlook_access_token / outlook_token_expiry    (cached OAuth token)
 *
 * Later phases extend this file (freebusy cache collection, event_type
 * scheduling_type/audience, event_type_hosts pool).
 *
 * Run:
 *   pnpm tsx scripts/setup-scheduler-v2.ts
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

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

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  Creating field: ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists' || error?.includes('already exists')) { console.log(`    -> Already exists, skipping`); return true; }
	if (error) { console.error(`    -> Error: ${error}`); return false; }
	console.log(`    -> Created`);
	return true;
}

async function createCollection(collection: string, meta: Record<string, any>) {
	console.log(`  Creating collection: ${collection}`);
	const { error } = await directusRequest('/collections', 'POST', { collection, meta, schema: {} });
	if (error === 'already_exists') { console.log(`    -> Already exists, skipping`); return true; }
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

// ─── Phase 1: scheduler_settings policy columns ────────────────────────────────

async function setupSchedulerSettingsPolicyFields() {
	console.log('\n=== scheduler_settings — booking-policy columns ===');

	await createField('scheduler_settings', {
		field: 'ical_feed_token',
		type: 'string',
		meta: {
			interface: 'input',
			readonly: true,
			note: 'Secret token that validates the iCal subscription feed at /api/calendar/ical/<userId>?token=…',
			width: 'full',
		},
		schema: { is_unique: true, is_nullable: true },
	});

	await createField('scheduler_settings', {
		field: 'minimum_notice_minutes',
		type: 'integer',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Invitees cannot book a slot starting sooner than this many minutes from now.',
		},
		schema: { default_value: 120, is_nullable: false },
	});

	await createField('scheduler_settings', {
		field: 'booking_horizon_days',
		type: 'integer',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'How many days into the future invitees may book.',
		},
		schema: { default_value: 30, is_nullable: false },
	});

	await createField('scheduler_settings', {
		field: 'daily_booking_limit',
		type: 'integer',
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Max bookings accepted per day across all event types. Null = no cap.',
		},
		schema: { is_nullable: true },
	});

	await createField('scheduler_settings', {
		field: 'slot_interval_minutes',
		type: 'integer',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			options: { choices: [
				{ text: '5 minutes', value: 5 },
				{ text: '10 minutes', value: 10 },
				{ text: '15 minutes', value: 15 },
				{ text: '20 minutes', value: 20 },
				{ text: '30 minutes', value: 30 },
				{ text: '60 minutes', value: 60 },
			] },
			note: 'Granularity of the offered start-time grid.',
		},
		schema: { default_value: 15, is_nullable: false },
	});

	// Cached OAuth access tokens (avoid a refresh round-trip on every slot query).
	for (const provider of ['google', 'outlook']) {
		await createField('scheduler_settings', {
			field: `${provider}_access_token`,
			type: 'text',
			meta: { interface: 'input', hidden: true, note: `Cached ${provider} access token (short-lived).` },
			schema: { is_nullable: true },
		});
		await createField('scheduler_settings', {
			field: `${provider}_token_expiry`,
			type: 'timestamp',
			meta: { interface: 'datetime', hidden: true, note: `Expiry of the cached ${provider} access token.` },
			schema: { is_nullable: true },
		});
	}
}

// ─── Phase 2: external free/busy cache ─────────────────────────────────────────

async function setupFreebusyCache() {
	console.log('\n=== calendar_freebusy_cache ===');

	await createCollection('calendar_freebusy_cache', {
		icon: 'sync',
		note: 'Short-TTL cache of external (Google/Outlook) free/busy per host+provider. Not a source of truth — see server/utils/freebusy.ts.',
		hidden: true,
		singleton: false,
	});

	await createField('calendar_freebusy_cache', {
		field: 'host_user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' },
		schema: { is_nullable: false },
	});
	await createField('calendar_freebusy_cache', {
		field: 'provider',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			options: { choices: [{ text: 'Google', value: 'google' }, { text: 'Outlook', value: 'outlook' }] },
		},
		schema: { is_nullable: false },
	});
	await createField('calendar_freebusy_cache', {
		field: 'window_start',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half' },
		schema: { is_nullable: false },
	});
	await createField('calendar_freebusy_cache', {
		field: 'window_end',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half' },
		schema: { is_nullable: false },
	});
	await createField('calendar_freebusy_cache', {
		field: 'busy',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Array of { start, end } ISO intervals.' },
		schema: {},
	});
	await createField('calendar_freebusy_cache', {
		field: 'fetched_at',
		type: 'timestamp',
		meta: { interface: 'datetime', width: 'half' },
		schema: { is_nullable: false },
	});
	await createField('calendar_freebusy_cache', {
		field: 'stale',
		type: 'boolean',
		meta: { interface: 'boolean', width: 'half' },
		schema: { default_value: false },
	});

	await createRelation({
		collection: 'calendar_freebusy_cache',
		field: 'host_user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Phase 3: multi-calendar connections ───────────────────────────────────────

async function setupCalendarConnections() {
	console.log('\n=== calendar_connections ===');

	await createCollection('calendar_connections', {
		icon: 'event_available',
		note: 'One row per connected external calendar (multiple Google/Outlook accounts per user). Replaces the single inline google_/outlook_ fields on scheduler_settings.',
		hidden: false,
		singleton: false,
	});

	const fields: Array<Record<string, any>> = [
		{ field: 'user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' }, schema: { is_nullable: false } },
		{ field: 'provider', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Google', value: 'google' }, { text: 'Outlook', value: 'outlook' }] } }, schema: { is_nullable: false } },
		{ field: 'account_email', type: 'string', meta: { interface: 'input', width: 'half', note: 'Email of the connected account.' }, schema: {} },
		{ field: 'display_name', type: 'string', meta: { interface: 'input', width: 'half', note: 'Friendly label shown in settings.' }, schema: {} },
		{ field: 'color', type: 'string', meta: { interface: 'select-color', width: 'half', note: 'Color used when this calendar overlays the in-app calendar.' }, schema: {} },
		{ field: 'calendar_id', type: 'string', meta: { interface: 'input', width: 'half', note: "External calendar id (Google) or 'primary'." }, schema: { default_value: 'primary' } },
		{ field: 'refresh_token', type: 'text', meta: { interface: 'input', hidden: true }, schema: {} },
		{ field: 'access_token', type: 'text', meta: { interface: 'input', hidden: true }, schema: {} },
		{ field: 'token_expiry', type: 'timestamp', meta: { interface: 'datetime', hidden: true }, schema: {} },
		{ field: 'blocks_availability', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'Busy times on this calendar hide booking slots.' }, schema: { default_value: true, is_nullable: false } },
		{ field: 'show_on_calendar', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'Overlay this calendar\'s events on the in-app calendar (opt-in).' }, schema: { default_value: false, is_nullable: false } },
		{ field: 'is_write_target', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: 'New bookings are pushed to this calendar.' }, schema: { default_value: true, is_nullable: false } },
		{ field: 'enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: true, is_nullable: false } },
		{ field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
		{ field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true }, schema: {} },
	];
	for (const f of fields) await createField('calendar_connections', f);

	await createRelation({
		collection: 'calendar_connections',
		field: 'user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

const PROVIDER_DEFAULT_COLOR: Record<string, string> = { google: '#4285F4', outlook: '#0F6CBD' };

async function backfillCalendarConnections() {
	console.log('\n=== Backfilling calendar_connections from scheduler_settings ===');

	const { data: rows, error } = await directusRequest<Array<any>>(
		`/items/scheduler_settings?fields=user_id,google_calendar_enabled,google_refresh_token,google_calendar_id,outlook_calendar_enabled,outlook_refresh_token&limit=-1`,
	);
	if (error || !rows) {
		console.error(`  Could not load scheduler_settings: ${error}`);
		return;
	}

	let created = 0;
	for (const s of rows) {
		const userId = typeof s.user_id === 'object' ? s.user_id?.id : s.user_id;
		if (!userId) continue;

		for (const provider of ['google', 'outlook'] as const) {
			const refresh = provider === 'google' ? s.google_refresh_token : s.outlook_refresh_token;
			if (!refresh) continue;

			// Skip if a connection already exists for this user+provider.
			const { data: existing } = await directusRequest<Array<{ id: number }>>(
				`/items/calendar_connections?filter[user][_eq]=${userId}&filter[provider][_eq]=${provider}&limit=1`,
			);
			if (existing && existing.length > 0) continue;

			const { error: createErr } = await directusRequest('/items/calendar_connections', 'POST', {
				user: userId,
				provider,
				display_name: provider === 'google' ? 'Google Calendar' : 'Outlook Calendar',
				color: PROVIDER_DEFAULT_COLOR[provider],
				calendar_id: provider === 'google' ? (s.google_calendar_id || 'primary') : 'primary',
				refresh_token: refresh,
				blocks_availability: true,
				show_on_calendar: false,
				is_write_target: true,
				enabled: provider === 'google' ? s.google_calendar_enabled !== false : s.outlook_calendar_enabled !== false,
			});
			if (createErr) console.error(`  [fail] ${userId}/${provider}: ${createErr}`);
			else created++;
		}
	}
	console.log(`  Backfilled ${created} calendar connection(s).`);
}

// ─── Phase 5: team / round-robin event types ───────────────────────────────────

async function setupTeamEventTypes() {
	console.log('\n=== event_types: scheduling_type + audience ===');

	await createField('event_types', {
		field: 'scheduling_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			options: { choices: [
				{ text: 'Single host', value: 'single' },
				{ text: 'Round-robin (any free host)', value: 'round_robin' },
				{ text: 'Collective (all hosts attend)', value: 'collective' },
			] },
			note: 'How a booking is routed when there is a host pool.',
		},
		schema: { default_value: 'single', is_nullable: false },
	});

	await createField('event_types', {
		field: 'audience',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'half',
			options: { choices: [
				{ text: 'Public (anyone with the link)', value: 'public' },
				{ text: 'Clients (portal login)', value: 'client_portal' },
				{ text: 'Internal (org members)', value: 'internal' },
			] },
			note: 'Who may book this event type.',
		},
		schema: { default_value: 'public', is_nullable: false },
	});

	console.log('\n=== event_type_hosts (round-robin/collective pool) ===');

	await createCollection('event_type_hosts', {
		icon: 'groups',
		note: 'Host pool for round-robin / collective event types. One row per (event_type, host).',
		hidden: true,
		singleton: false,
	});

	const fields: Array<Record<string, any>> = [
		{ field: 'event_type', type: 'integer', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' }, schema: { is_nullable: false } },
		{ field: 'host_user', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half' }, schema: { is_nullable: false } },
		{ field: 'priority', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Lower = preferred in round-robin ties.' }, schema: { default_value: 0 } },
		{ field: 'weight', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Weighted round-robin (optional).' }, schema: { default_value: 1 } },
		{ field: 'enabled', type: 'boolean', meta: { interface: 'boolean', width: 'half' }, schema: { default_value: true, is_nullable: false } },
	];
	for (const f of fields) await createField('event_type_hosts', f);

	// The reverse o2m alias `event_types.hosts` must be created EXPLICITLY — Directus
	// does not always materialize the directus_fields alias row from the relation's
	// one_field, and without it `event_types?fields=hosts.*` 403s (reverse-o2m gotcha).
	await createField('event_types', {
		field: 'hosts',
		type: 'alias',
		meta: {
			special: ['o2m'],
			interface: 'list-o2m',
			options: { template: '{{host_user.first_name}} {{host_user.last_name}}' },
			note: 'Round-robin / collective host pool (event_type_hosts).',
		},
		schema: null,
	});

	// event_type_hosts.event_type → event_types (o2m alias `hosts` on event_types)
	await createRelation({
		collection: 'event_type_hosts',
		field: 'event_type',
		related_collection: 'event_types',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: 'hosts', sort_field: null, one_deselect_action: 'delete' },
	});
	await createRelation({
		collection: 'event_type_hosts',
		field: 'host_user',
		related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' },
		meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
	});
}

// ─── Backfill: give every existing row an iCal feed token ──────────────────────

async function backfillIcalTokens() {
	console.log('\n=== Backfilling ical_feed_token ===');

	const { data: rows, error } = await directusRequest<Array<{ id: string; ical_feed_token: string | null }>>(
		`/items/scheduler_settings?fields=id,ical_feed_token&limit=-1`,
	);
	if (error || !rows) {
		console.error(`  Could not load scheduler_settings: ${error}`);
		return;
	}

	let filled = 0;
	for (const row of rows) {
		if (row.ical_feed_token) continue;
		const { error: patchErr } = await directusRequest(`/items/scheduler_settings/${row.id}`, 'PATCH', {
			ical_feed_token: randomUUID(),
		});
		if (patchErr) console.error(`  [fail] ${row.id}: ${patchErr}`);
		else filled++;
	}
	console.log(`  Backfilled ${filled} token(s). ${rows.length - filled} already had one.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('==========================================');
	console.log('  Scheduler v2 — Setup (Phase 1)');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	const { error } = await directusRequest('/server/info');
	if (error) {
		console.error(`\nCannot connect to Directus: ${error}`);
		process.exit(1);
	}
	console.log('Connected\n');

	await setupSchedulerSettingsPolicyFields();
	await setupFreebusyCache();
	await setupCalendarConnections();
	await setupTeamEventTypes();
	await backfillIcalTokens();
	await backfillCalendarConnections();

	console.log('');
	console.log('==========================================');
	console.log('  Done — run `pnpm generate:types` next');
	console.log('==========================================');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
