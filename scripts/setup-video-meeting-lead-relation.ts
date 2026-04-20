#!/usr/bin/env npx tsx
/**
 * Directus — video_meetings.related_lead + appointments.related_lead
 *
 * Adds a nullable M2O from `video_meetings` and `appointments` to `leads`,
 * so a scheduled meeting can be linked to the lead it's about.
 *
 * These fields were expected by:
 *   - server/api/video/create-room.post.ts (writes related_lead on both)
 *   - app/composables/useCalendarEvents.ts  (requests related_lead.*)
 *   - app/pages/leads/[id].vue              (fetchUpcomingMeetings filter)
 *   - README.md (docs the M2O as if it existed)
 *
 * …but never actually got created in Directus, causing 403s on reads.
 *
 * Idempotent: checks for existing field/relation before creating.
 *
 * Usage:
 *   pnpm tsx scripts/setup-video-meeting-lead-relation.ts
 *
 * Prerequisites:
 *   - Directus instance running with leads, appointments, video_meetings collections
 *   - DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN env var set
 */

import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

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
	const json = text ? JSON.parse(text) : {};
	return {
		ok: response.ok,
		status: response.status,
		data: response.ok ? ((json.data ?? null) as T) : null,
		error: response.ok ? null : text,
	};
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest(`/fields/${collection}/${field}`);
	return res.ok;
}

async function relationExists(collection: string, field: string): Promise<boolean> {
	const res = await directusRequest<Array<unknown>>(
		`/relations?filter[many_collection][_eq]=${collection}&filter[many_field][_eq]=${field}&limit=1`,
	);
	return res.ok && Array.isArray(res.data) && res.data.length > 0;
}

type FieldSpec = {
	collection: 'appointments' | 'video_meetings';
	field: string;
	note: string;
	width: 'half' | 'full';
	sort: number;
};

const FIELDS: FieldSpec[] = [
	{
		collection: 'appointments',
		field: 'related_lead',
		note: 'Linked lead (if this appointment is about a lead)',
		width: 'full',
		sort: 22,
	},
	{
		collection: 'video_meetings',
		field: 'related_lead',
		note: 'Linked lead (if this meeting is about a lead)',
		width: 'half',
		sort: 40,
	},
];

async function ensureField(spec: FieldSpec): Promise<'created' | 'skipped' | 'failed'> {
	const label = `${spec.collection}.${spec.field}`;
	if (await fieldExists(spec.collection, spec.field)) {
		console.log(`  [skip] field ${label} already exists`);
		return 'skipped';
	}

	const res = await directusRequest(`/fields/${spec.collection}`, 'POST', {
		field: spec.field,
		type: 'integer',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			options: { template: '{{related_contact.first_name}} {{related_contact.last_name}}' },
			note: spec.note,
			width: spec.width,
			sort: spec.sort,
		},
		schema: { is_nullable: true },
	});

	if (!res.ok) {
		console.error(`  [fail] field ${label}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   field ${label} created`);
	return 'created';
}

async function ensureRelation(spec: FieldSpec): Promise<'created' | 'skipped' | 'failed'> {
	const label = `${spec.collection}.${spec.field} -> leads`;
	if (await relationExists(spec.collection, spec.field)) {
		console.log(`  [skip] relation ${label} already exists`);
		return 'skipped';
	}

	const res = await directusRequest('/relations', 'POST', {
		collection: spec.collection,
		field: spec.field,
		related_collection: 'leads',
		meta: { sort_field: null },
		schema: { on_delete: 'SET NULL' },
	});

	if (!res.ok) {
		console.error(`  [fail] relation ${label}: ${res.error}`);
		return 'failed';
	}
	console.log(`  [ok]   relation ${label} created`);
	return 'created';
}

async function main() {
	console.log('=========================================');
	console.log('  video_meeting/appointment -> lead relation');
	console.log('=========================================');
	console.log(`Target: ${DIRECTUS_URL}\n`);

	const ping = await directusRequest('/server/info');
	if (!ping.ok) {
		console.error(`Cannot connect to Directus: ${ping.error}`);
		process.exit(1);
	}
	console.log('Connected to Directus\n');

	let created = 0;
	let skipped = 0;
	let failed = 0;

	for (const spec of FIELDS) {
		console.log(`--- ${spec.collection} ---`);
		const fieldResult = await ensureField(spec);
		if (fieldResult === 'created') created++;
		else if (fieldResult === 'skipped') skipped++;
		else failed++;

		const relResult = await ensureRelation(spec);
		if (relResult === 'created') created++;
		else if (relResult === 'skipped') skipped++;
		else failed++;
	}

	console.log('\n=========================================');
	console.log('  Summary');
	console.log('=========================================');
	console.log(`  Created: ${created}`);
	console.log(`  Skipped: ${skipped}`);
	if (failed > 0) {
		console.log(`  Failed:  ${failed}`);
		process.exit(1);
	}
	console.log('');
	console.log('Done. No permission changes needed — existing policies on');
	console.log('appointments/video_meetings use fields=["*"] so the new field');
	console.log('is covered automatically.');
}

main().catch((err) => {
	console.error('Setup failed:', err);
	process.exit(1);
});
