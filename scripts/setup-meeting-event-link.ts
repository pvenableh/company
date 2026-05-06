#!/usr/bin/env npx tsx
/**
 * video_meetings.project_event — Setup Script (Session 1 of design-review feature)
 *
 * Adds a nullable m2o FK from video_meetings to project_events so a milestone
 * can have many meetings (kickoff / mid-review / signoff for one Design Round).
 *
 * Direction: o2m on project_events side. Chosen over m2o on the event because
 * milestones routinely span multiple conversations and we want to preserve
 * history rather than overwrite a single FK.
 *
 * Run:
 *   pnpm tsx scripts/setup-meeting-event-link.ts
 *
 * Prerequisites:
 *   - Directus instance running with video_meetings + project_events in schema
 *   - DIRECTUS_SERVER_TOKEN env var set (admin-level)
 *
 * Idempotent: re-running is safe.
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
			if (response.status === 400 && /already exists|already has an associated/i.test(text)) {
				return { data: null, error: 'already_exists' };
			}
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
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
	if (error) {
		console.error(`    -> Error: ${error}`);
		return false;
	}
	console.log(`    -> Created`);
	return true;
}

async function createRelation(data: Record<string, any>) {
	console.log(`  Creating relation: ${data.collection}.${data.field} -> ${data.related_collection}`);
	const { error } = await directusRequest('/relations', 'POST', data);
	if (error === 'already_exists') {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
	if (error) {
		console.error(`    -> Error: ${error}`);
		return false;
	}
	console.log(`    -> Created`);
	return true;
}

async function setup() {
	console.log('\n=== video_meetings.project_event ===');

	// m2o FK on the meeting side
	await createField('video_meetings', {
		field: 'project_event',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			note: 'Project event (milestone) this meeting belongs to',
			options: { template: '{{title}}' },
		},
		schema: { is_nullable: true },
	});

	// Relation: ON DELETE SET NULL — losing the event shouldn't cascade-delete meeting history
	await createRelation({
		collection: 'video_meetings',
		field: 'project_event',
		related_collection: 'project_events',
		schema: { on_delete: 'SET NULL' },
		// Inverse alias on project_events ("meetings" o2m back-reference)
		meta: { one_field: 'meetings', sort_field: null, junction_field: null },
	});

	console.log('\n=== project_events.meetings (inverse alias) ===');
	console.log('  -> Created automatically by relation above (one_field: "meetings")');
}

async function main() {
	console.log('==========================================');
	console.log('  Meeting<->Event Link — Schema Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setup();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: types in shared/directus.ts have already been edited.');
	console.log('      No separate perms script needed — video_meetings perms already cover the new field.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
