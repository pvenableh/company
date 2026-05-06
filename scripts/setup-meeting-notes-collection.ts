#!/usr/bin/env npx tsx
/**
 * meeting_notes — Phase 4 (Meeting capture + persistence)
 *
 * Adds a new collection to capture in-meeting Notes & Decisions, plus a
 * source_meeting FK on tasks so action items promoted from a meeting
 * keep a back-link.
 *
 *   meeting_notes
 *     id                       uuid (pk)
 *     meeting                  uuid m2o → video_meetings (CASCADE)
 *     author                   uuid m2o → directus_users (SET NULL)
 *     content                  text
 *     note_type                enum: note | decision
 *     meeting_offset_seconds   int  — for transcript alignment
 *     date_created / user_created / date_updated / user_updated
 *
 *   tasks.source_meeting       uuid m2o → video_meetings (SET NULL)
 *     Lets us "Promote to task" an AI-extracted action_item or a manual
 *     note into a real tasks row while keeping the back-pointer.
 *
 * Run:
 *   pnpm tsx scripts/setup-meeting-notes-collection.ts
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
	if (error === 'already_exists' || error?.includes('already exists')) {
		console.log(`    -> Already exists, skipping`);
		return true;
	}
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

async function setupMeetingNotes() {
	console.log('\n=== meeting_notes ===');

	await createCollection('meeting_notes', {
		icon: 'edit_note',
		note: 'In-meeting notes & decisions captured during a video_meeting',
		color: '#10B981',
		hidden: false,
		singleton: false,
		accountability: 'all',
		display_template: '{{note_type}} — {{content}}',
	});

	await createField('meeting_notes', {
		field: 'id',
		type: 'uuid',
		meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
		schema: { is_primary_key: true, has_auto_increment: false },
	});

	await createField('meeting_notes', {
		field: 'date_created',
		type: 'timestamp',
		meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	});

	await createField('meeting_notes', {
		field: 'date_updated',
		type: 'timestamp',
		meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true },
		schema: {},
	});

	await createField('meeting_notes', {
		field: 'user_created',
		type: 'uuid',
		meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
		schema: {},
	});

	await createField('meeting_notes', {
		field: 'user_updated',
		type: 'uuid',
		meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true },
		schema: {},
	});

	await createField('meeting_notes', {
		field: 'meeting',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			required: true,
			note: 'Meeting this note belongs to',
			options: { template: '{{title}}' },
		},
		schema: { is_nullable: false },
	});

	await createField('meeting_notes', {
		field: 'author',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			note: 'Who captured the note (set on create, read-only thereafter)',
		},
		schema: { is_nullable: true },
	});

	await createField('meeting_notes', {
		field: 'note_type',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			required: true,
			options: {
				choices: [
					{ text: 'Note', value: 'note' },
					{ text: 'Decision', value: 'decision' },
				],
			},
			note: 'Distinguishes general notes from team-binding decisions',
		},
		schema: { is_nullable: false, default_value: 'note' },
	});

	await createField('meeting_notes', {
		field: 'content',
		type: 'text',
		meta: { interface: 'input-multiline', required: true },
		schema: { is_nullable: false },
	});

	await createField('meeting_notes', {
		field: 'meeting_offset_seconds',
		type: 'integer',
		meta: {
			interface: 'input',
			note: 'Seconds since meeting actual_start when the note was captured (lets the recap align notes to transcript)',
		},
		schema: { is_nullable: true },
	});

	// Relations
	await createRelation({
		collection: 'meeting_notes',
		field: 'meeting',
		related_collection: 'video_meetings',
		schema: { on_delete: 'CASCADE' },
		// Inverse alias on video_meetings — "notes" o2m
		meta: { one_field: 'notes', sort_field: null, junction_field: null },
	});

	await createRelation({
		collection: 'meeting_notes',
		field: 'author',
		related_collection: 'directus_users',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

async function setupTasksSourceMeeting() {
	console.log('\n=== tasks.source_meeting ===');

	await createField('tasks', {
		field: 'source_meeting',
		type: 'uuid',
		meta: {
			interface: 'select-dropdown-m2o',
			special: ['m2o'],
			note: 'Meeting this task was promoted from (action item back-link)',
			options: { template: '{{title}}' },
		},
		schema: { is_nullable: true },
	});

	await createRelation({
		collection: 'tasks',
		field: 'source_meeting',
		related_collection: 'video_meetings',
		schema: { on_delete: 'SET NULL' },
		meta: { sort_field: null },
	});
}

async function main() {
	console.log('==========================================');
	console.log('  Phase 4 — meeting_notes + tasks.source_meeting');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);
	console.log('');

	await setupMeetingNotes();
	await setupTasksSourceMeeting();

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next:');
	console.log('  - Apply Member-role perms in Directus admin (read meeting_notes via meeting.related_organization FK-walk; write goes through /api/video/meetings/[id]/notes server endpoint).');
	console.log('  - Types in shared/directus.ts have already been edited.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
