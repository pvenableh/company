#!/usr/bin/env npx tsx
/**
 * Directus `director_sessions` / `director_participants` / `director_qa`
 * Collections — Setup Script (the LIVE, multiplayer Director's Office).
 *
 * The single-user Director's Office already persists its "thinking" in
 * `director_briefings` (scripts/setup-director-briefings-collection.ts). This
 * script adds the collaboration layer so a Director can convene a LIVE meeting
 * and invite other org members (admins + members) to the same table in
 * realtime:
 *
 *   director_sessions      — one live (or ended) meeting. Holds the scope, the
 *                            linked plan_id/briefing, who's presenting, the
 *                            shared slide, and a `revision` counter that is
 *                            bumped whenever a step is approved/skipped so every
 *                            attendee re-fetches the steps.
 *   director_participants  — who is at the table (host/member), their live
 *                            presence (current_slide + last_seen), and status.
 *   director_qa            — the shared "Ask Earnest" thread for a session, so
 *                            every attendee sees the same questions + answers.
 *
 * REALTIME: unlike `ai_actions` / `director_briefings` (admin-only, no row
 * perms), these three collections are granted a ROW-SCOPED **read** permission
 * to the team policies so each user's own Directus access token can open a
 * realtime WebSocket subscription (useWebSocketManager) and receive live
 * updates. ALL WRITES still go through the server (admin) endpoints under
 * /server/api/ai/director/sessions/* — clients never write these directly
 * (mirrors the Directus-11 create-perm FK-walk quirk: write via admin token,
 * grant read only). The org row-filter matches setup-org-row-permissions.ts.
 *
 * Modeled on scripts/setup-director-briefings-collection.ts (helpers verbatim).
 *
 * Usage:
 *   pnpm tsx scripts/setup-director-sessions-collection.ts
 *   # then: npm run generate:types
 *
 * Prerequisites:
 *   - Directus running with `organizations` + `org_memberships` collections
 *   - DIRECTUS_SERVER_TOKEN (admin) env var set
 *
 * NOTE: this does nothing until it is actually run against the target Directus.
 * The Director's Office degrades gracefully until then — convening a live
 * session silently no-ops and the office stays single-user (current behaviour).
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// Team policies that get realtime read access (same set as
// setup-org-row-permissions.ts). Scoped by the org row-filter below.
const TARGET_POLICY_NAMES = new Set<string>(['Client Manager', 'Carddesk User']);

// Canonical org row-filter — a user may read rows whose `organization` they are
// an active member of. Identical to ROW_FILTER in setup-org-row-permissions.ts.
const ORG_ROW_FILTER = {
	organization: {
		memberships: {
			user: { _eq: '$CURRENT_USER' },
			status: { _eq: 'active' },
		},
	},
};

async function directusRequest<T = unknown>(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: T | null; error: string | null; status: number }> {
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
			if (response.status === 409) return { data: null, error: 'already_exists', status: response.status };
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists', status: response.status };
			}
			return { data: null, error: `${response.status}: ${text}`, status: response.status };
		}

		const json = text ? JSON.parse(text) : {};
		return { data: (json.data ?? null) as T, error: null, status: response.status };
	} catch (err: any) {
		return { data: null, error: err.message, status: 0 };
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

// ─── director_sessions ────────────────────────────────────────────────────────

async function setupSessions() {
	console.log('\n=== director_sessions ===');

	await createCollection('director_sessions', {
		icon: 'groups',
		note: 'A LIVE Director\'s Office meeting — scope, linked plan, presenter + shared slide, and a revision counter that bumps on every step decision so attendees re-sync.',
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{title}} — {{status}} ({{date_created}})',
	});

	await createField('director_sessions', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization (row-scopes realtime read).' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'host',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'User who convened the meeting.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'presenter',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'Who is currently driving the deck (attendees can follow).' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'title',
		type: 'string',
		meta: { interface: 'input', note: 'Human label (subject / topic).' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Live', value: 'live' }, { text: 'Ended', value: 'ended' }] },
			note: 'Live meetings show in the join list; ended ones are history.',
		},
		schema: { is_nullable: false, default_value: 'live' },
	});
	await createField('director_sessions', {
		field: 'scope_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Org-wide', value: 'org' }, { text: 'Focused entity', value: 'entity' }] },
			note: 'Org-wide meeting or a focused one-entity meeting.',
		},
		schema: { is_nullable: false, default_value: 'org' },
	});
	await createField('director_sessions', {
		field: 'entity_type',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the collection (e.g. "projects").' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'entity_id',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the record id.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'subject',
		type: 'string',
		meta: { interface: 'input', note: 'Agenda subject key or blank for a free topic.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'topic',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Optional free-text steer.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'plan_id',
		type: 'string',
		meta: { interface: 'input', note: 'Ties this session to its proposed steps (ai_actions rows with session_id == this) + briefing.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'current_slide',
		type: 'integer',
		meta: { interface: 'input', note: 'The presenter\'s current slide index (attendees following jump here).' },
		schema: { is_nullable: true, default_value: 0 },
	});
	await createField('director_sessions', {
		field: 'follow_presenter',
		type: 'boolean',
		meta: { interface: 'boolean', note: 'When on, attendees\' decks follow the presenter\'s slide.' },
		schema: { is_nullable: false, default_value: true },
	});
	await createField('director_sessions', {
		field: 'revision',
		type: 'integer',
		meta: { interface: 'input', note: 'Bumped on every step decision / plan change so attendees re-fetch steps.' },
		schema: { is_nullable: false, default_value: 0 },
	});
	await createField('director_sessions', {
		field: 'last_activity',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Last event {actorId, actorName, type, stepId, status, at} — drives the live ticker.' },
		schema: {},
	});

	// ── Curation + screen-sync + participation ───────────────────────────────
	await createField('director_sessions', {
		field: 'included_subjects',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Which advisors (agenda subject keys) are IN the room. null/empty = all. Curation is the privacy lever — omit "money" and no one in the meeting sees the money.' },
		schema: {},
	});
	await createField('director_sessions', {
		field: 'view_only',
		type: 'boolean',
		meta: { interface: 'boolean', note: 'When on, only the presenter can approve/skip; everyone else is a view-only observer (and force-follows).' },
		schema: { is_nullable: false, default_value: false },
	});
	await createField('director_sessions', {
		field: 'shared_subject',
		type: 'string',
		meta: { interface: 'input', note: 'The advisor (subject) the presenter is currently on — followers mirror it.' },
		schema: { is_nullable: true },
	});
	await createField('director_sessions', {
		field: 'shared_view_mode',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Outline', value: 'outline' }, { text: 'Slides', value: 'slides' }] },
			note: 'The presenter\'s current view mode — followers mirror it so they see the same screen.',
		},
		schema: { is_nullable: true },
	});

	await createField('director_sessions', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('director_sessions', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createRelation({
		collection: 'director_sessions', field: 'organization', related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_sessions', field: 'host', related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_sessions', field: 'presenter', related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
	});
}

// ─── director_participants ────────────────────────────────────────────────────

async function setupParticipants() {
	console.log('\n=== director_participants ===');

	await createCollection('director_participants', {
		icon: 'person_raised_hand',
		note: 'Who is at the table for a live Director\'s Office session — role, presence (current_slide + last_seen), and status.',
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{user.first_name}} — {{role}} ({{status}})',
	});

	await createField('director_participants', {
		field: 'session',
		type: 'integer',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'The live session.' },
		schema: { is_nullable: true },
	});
	await createField('director_participants', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization (row-scopes realtime read).' },
		schema: { is_nullable: true },
	});
	await createField('director_participants', {
		field: 'user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'The attendee.' },
		schema: { is_nullable: true },
	});
	await createField('director_participants', {
		field: 'role',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Host', value: 'host' }, { text: 'Member', value: 'member' }] },
			note: 'Host convened; members were invited or joined.',
		},
		schema: { is_nullable: false, default_value: 'member' },
	});
	await createField('director_participants', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Invited', value: 'invited' }, { text: 'Active', value: 'active' }, { text: 'Left', value: 'left' }] },
			note: 'invited (notified, not joined) / active (in the room) / left.',
		},
		schema: { is_nullable: false, default_value: 'active' },
	});
	await createField('director_participants', {
		field: 'current_slide',
		type: 'integer',
		meta: { interface: 'input', note: 'Which slide this attendee is viewing (presence dot).' },
		schema: { is_nullable: true, default_value: 0 },
	});
	await createField('director_participants', {
		field: 'last_seen',
		type: 'timestamp',
		meta: { interface: 'datetime', note: 'Last presence heartbeat.' },
		schema: { is_nullable: true },
	});

	await createField('director_participants', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('director_participants', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createRelation({
		collection: 'director_participants', field: 'session', related_collection: 'director_sessions',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null, one_field: 'participants' },
	});
	await createRelation({
		collection: 'director_participants', field: 'organization', related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_participants', field: 'user', related_collection: 'directus_users',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
	});
}

// ─── director_qa ──────────────────────────────────────────────────────────────

async function setupQa() {
	console.log('\n=== director_qa ===');

	await createCollection('director_qa', {
		icon: 'forum',
		note: 'The shared "Ask Earnest" thread for a live session — every attendee sees the same questions + answers.',
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{role}}: {{text}}',
	});

	await createField('director_qa', {
		field: 'session',
		type: 'integer',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'The live session.' },
		schema: { is_nullable: true },
	});
	await createField('director_qa', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization (row-scopes realtime read).' },
		schema: { is_nullable: true },
	});
	await createField('director_qa', {
		field: 'user',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'Who asked (null for Earnest\'s answer).' },
		schema: { is_nullable: true },
	});
	await createField('director_qa', {
		field: 'role',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'User', value: 'user' }, { text: 'Assistant', value: 'assistant' }] },
			note: 'user question / assistant (Earnest) answer.',
		},
		schema: { is_nullable: false, default_value: 'user' },
	});
	await createField('director_qa', {
		field: 'text',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'The question or answer text.' },
		schema: { is_nullable: true },
	});
	await createField('director_qa', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createRelation({
		collection: 'director_qa', field: 'session', related_collection: 'director_sessions',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null, one_field: 'qa' },
	});
	await createRelation({
		collection: 'director_qa', field: 'organization', related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_qa', field: 'user', related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
	});
}

// ─── Realtime read permissions ────────────────────────────────────────────────
// Grant the team policies a ROW-SCOPED read on all three collections so each
// user's own access token can open a realtime subscription. Writes stay
// server-only (admin token). Idempotent: skips if a read perm already exists.

async function getTargetPolicies(): Promise<Array<{ id: string; name: string }>> {
	const { data } = await directusRequest<any[]>('/policies?fields=id,name,admin_access&limit=-1');
	return (data || [])
		.filter((p) => !p.admin_access && TARGET_POLICY_NAMES.has(p.name))
		.map((p) => ({ id: p.id, name: p.name }));
}

async function readPermissionExists(policyId: string, collection: string): Promise<boolean> {
	const { data } = await directusRequest<any[]>(
		`/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${collection}&filter[action][_eq]=read&limit=1`,
	);
	return Array.isArray(data) && data.length > 0;
}

async function grantReadPermissions() {
	console.log('\n=== realtime read permissions ===');
	const policies = await getTargetPolicies();
	if (!policies.length) {
		console.warn('  No target policies found (Client Manager / Carddesk User). Skipping perms — realtime will be admin-only until granted.');
		return;
	}
	const collections = ['director_sessions', 'director_participants', 'director_qa'];
	for (const policy of policies) {
		console.log(`  Policy: ${policy.name} (${policy.id})`);
		for (const collection of collections) {
			if (await readPermissionExists(policy.id, collection)) {
				console.log(`    [skip] ${collection}.read already exists`);
				continue;
			}
			const { error } = await directusRequest('/permissions', 'POST', {
				policy: policy.id,
				collection,
				action: 'read',
				permissions: ORG_ROW_FILTER,
				validation: null,
				presets: null,
				fields: ['*'],
			});
			if (error) console.error(`    [fail] ${collection}.read: ${error}`);
			else console.log(`    [ok]   ${collection}.read (org-scoped)`);
		}
	}
}

async function main() {
	console.log('==========================================');
	console.log("  director_sessions — LIVE Office Setup");
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setupSessions();
	await setupParticipants();
	await setupQa();
	await grantReadPermissions();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next:');
	console.log('  1. npm run generate:types');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
