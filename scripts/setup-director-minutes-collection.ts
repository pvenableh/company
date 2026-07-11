#!/usr/bin/env npx tsx
/**
 * Directus `director_minutes` Collection — Setup Script
 * (the async "decision room" recap for the Director's Office).
 *
 * The live/solo Director's Office runs a working meeting: Earnest drafts a plan,
 * the Director approves/skips each step, captures action items, and asks Earnest
 * questions. That work already persists piecemeal (director_briefings holds the
 * thinking; ai_actions holds the steps; director_sessions holds a live table).
 *
 * `director_minutes` is the DURABLE RECORD OF A MEETING'S DECISIONS — one row is
 * a snapshot the Director explicitly saves at the end of a session:
 *
 *   - what was reviewed (scope / subject / topic / the briefing intro + points)
 *   - the metric snapshots on screen (finance / opportunity / client_rating)
 *   - every step and how it was decided (approved / skipped / executed / failed)
 *   - action items captured during the meeting
 *   - the shared Ask-Earnest Q&A thread
 *   - an AI-generated plain-English summary of the outcome
 *   - a rollup (stats) of done / skipped / failed / open
 *
 * It powers the read-only RECAP page (/director/minutes/[id]) and the
 * "share for review" flow (a notification fan-out to teammates). Unlike the live
 * session collections, minutes are READ through a server (admin) endpoint that
 * verifies org membership — so the recap works even before realtime read perms
 * are granted. We still grant a row-scoped read to the team policies for parity
 * (and so the Directus admin can browse them), mirroring the sessions script.
 *
 * ALL WRITES go through the server (admin) endpoints under
 * /server/api/ai/director/minutes/* — clients never write this directly
 * (mirrors the Directus-11 create-perm FK-walk quirk: write via admin token,
 * grant read only).
 *
 * Modeled on scripts/setup-director-sessions-collection.ts (helpers verbatim).
 *
 * Usage:
 *   pnpm tsx scripts/setup-director-minutes-collection.ts
 *   # then: npm run generate:types
 *
 * Prerequisites:
 *   - Directus running with `organizations` + `org_memberships` collections
 *   - DIRECTUS_SERVER_TOKEN (admin) env var set
 *
 * NOTE: this does nothing until it is actually run against the target Directus.
 * The recap layer degrades gracefully until then — saving minutes silently
 * no-ops and the "Record minutes" affordance surfaces a soft "not set up" toast.
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

// Team policies that get realtime/row-scoped read access (same set as
// setup-director-sessions-collection.ts). Scoped by the org row-filter below.
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

// ─── director_minutes ─────────────────────────────────────────────────────────

async function setupMinutes() {
	console.log('\n=== director_minutes ===');

	await createCollection('director_minutes', {
		icon: 'gavel',
		note: 'The durable decision record of a Director\'s Office meeting — scope, briefing snapshot, every step + how it was decided, captured action items, the Q&A thread, and an AI summary. Powers the read-only recap page + share-for-review.',
		color: '#6366F1',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{title}} ({{date_created}})',
	});

	await createField('director_minutes', {
		field: 'organization',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{name}}' }, note: 'Owning organization (row-scopes read).' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'author',
		type: 'uuid',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: '{{first_name}} {{last_name}}' }, note: 'The Director who recorded these minutes.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'session',
		type: 'integer',
		meta: { interface: 'select-dropdown-m2o', special: ['m2o'], note: 'The live session these minutes came from, if any (solo meetings have none).' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'title',
		type: 'string',
		meta: { interface: 'input', note: 'Human label (subject / topic).' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'scope_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Org-wide', value: 'org' }, { text: 'Focused entity', value: 'entity' }, { text: 'My work', value: 'mine' }] },
			note: 'Org-wide, a focused one-entity meeting, or a personal "my work" review.',
		},
		schema: { is_nullable: false, default_value: 'org' },
	});
	await createField('director_minutes', {
		field: 'entity_type',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the collection (e.g. "projects").' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'entity_id',
		type: 'string',
		meta: { interface: 'input', note: 'Focused meeting: the record id.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'subject',
		type: 'string',
		meta: { interface: 'input', note: 'Agenda subject key or blank for a free topic.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'topic',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'Optional free-text steer that framed the meeting.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'plan_id',
		type: 'string',
		meta: { interface: 'input', note: 'The plan whose steps were decided (ai_actions rows with session_id == this).' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'summary',
		type: 'text',
		meta: { interface: 'input-rich-text-md', note: 'AI-generated plain-English recap of what was reviewed and decided.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'intro',
		type: 'text',
		meta: { interface: 'input-multiline', note: 'The briefing intro/rationale carried over so the recap deck reads on its own.' },
		schema: { is_nullable: true },
	});
	await createField('director_minutes', {
		field: 'points',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'TL;DR takeaway bullets for the recap deck.' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'finance',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Money-mode snapshot metrics on screen at recording time.' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'opportunity',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Money-mode opportunity intel snapshot.' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'client_rating',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Focused client-review scorecard snapshot.' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'steps',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Snapshot of every proposed step + how it was decided: [{id, action_type, title, preview, status}].' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'captured',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Action items captured during the meeting: [{type, title, priority, assignees}].' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'qa',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'The Ask-Earnest thread: [{role, text}].' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'stats',
		type: 'json',
		meta: { interface: 'input-code', options: { language: 'json' }, note: 'Rollup {done, skipped, failed, open, total, captured}.' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'status',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			options: { choices: [{ text: 'Recorded', value: 'recorded' }, { text: 'Shared', value: 'shared' }] },
			note: 'recorded (saved) / shared (fanned out to teammates for review).',
		},
		schema: { is_nullable: false, default_value: 'recorded' },
	});

	await createField('director_minutes', {
		field: 'date_created',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-created'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});
	await createField('director_minutes', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { interface: 'datetime', special: ['date-updated'], readonly: true, hidden: true, width: 'half' },
		schema: {},
	});

	await createRelation({
		collection: 'director_minutes', field: 'organization', related_collection: 'organizations',
		schema: { on_delete: 'CASCADE' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_minutes', field: 'author', related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
	});
	await createRelation({
		collection: 'director_minutes', field: 'session', related_collection: 'director_sessions',
		schema: { on_delete: 'SET NULL' }, meta: { sort_field: null },
	});
}

// ─── Row-scoped read permissions ───────────────────────────────────────────────
// Grant the team policies a ROW-SCOPED read so the Directus admin + each user's
// own token can browse minutes for their org. Writes stay server-only (admin
// token). The recap page reads through a membership-checked server endpoint, so
// this perm is for parity/browsing, not a hard dependency. Idempotent.

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
	console.log('\n=== read permissions ===');
	const policies = await getTargetPolicies();
	if (!policies.length) {
		console.warn('  No target policies found (Client Manager / Carddesk User). Skipping perms — recap reads go through the admin server endpoint regardless.');
		return;
	}
	for (const policy of policies) {
		console.log(`  Policy: ${policy.name} (${policy.id})`);
		if (await readPermissionExists(policy.id, 'director_minutes')) {
			console.log(`    [skip] director_minutes.read already exists`);
			continue;
		}
		const { error } = await directusRequest('/permissions', 'POST', {
			policy: policy.id,
			collection: 'director_minutes',
			action: 'read',
			permissions: ORG_ROW_FILTER,
			validation: null,
			presets: null,
			fields: ['*'],
		});
		if (error) console.error(`    [fail] director_minutes.read: ${error}`);
		else console.log(`    [ok]   director_minutes.read (org-scoped)`);
	}
}

async function main() {
	console.log('==========================================');
	console.log("  director_minutes — Decision Record Setup");
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await setupMinutes();
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
