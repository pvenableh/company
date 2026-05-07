#!/usr/bin/env npx tsx
/**
 * Directus contacts.last_contacted_at + last_contacted_channel — Setup Script
 *
 * Adds a "when did we last touch this person" timestamp to the contacts
 * collection so meeting / contact / people-insights surfaces can show
 * something more useful than the email-pixel-only `last_opened_at`.
 *
 *   - last_contacted_at      timestamp, nullable
 *   - last_contacted_channel string ('email' | 'meeting' | 'message' |
 *                            'task' | 'manual'), nullable
 *
 * Why two fields: the timestamp is useful by itself, but pairing it with the
 * channel lets the UI render "Met yesterday" vs "Emailed last week" without
 * a second lookup.
 *
 * Maintenance — see server/utils/contact-touch.ts. Hooks fire after:
 *   - outbound email send (server/api/email/outbound.post.ts)
 *   - new video_meeting_attendees row (server/api/video/join-meeting.post.ts
 *     + server/api/scheduler/book.post.ts)
 *   - new messages row (server/api/messages/index.post.ts)
 *   - new tasks/appointments referencing the contact (idem)
 *
 * Backfill: run scripts/backfill-contact-last-contacted.ts after types are
 * regenerated.
 *
 * Run once:
 *   pnpm tsx scripts/setup-contact-last-contacted-field.ts
 * Then:
 *   pnpm generate:types
 *
 * Idempotent: field create skips on 409 / already-exists.
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
			if (response.status === 400 && /already exists/i.test(text)) return { data: null, error: 'already_exists' };
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

async function main() {
	console.log('==========================================');
	console.log('  contacts.last_contacted_* — Field Setup');
	console.log('==========================================');
	console.log(`Directus URL: ${DIRECTUS_URL}`);

	await createField('contacts', {
		field: 'last_contacted_at',
		type: 'dateTime',
		meta: {
			interface: 'datetime',
			display: 'datetime',
			display_options: { relative: true },
			note: 'Most recent inbound or outbound touch across email / meeting / message / task. Maintained by server hooks; nullable for never-contacted rows.',
			width: 'half',
			readonly: true,
			special: ['date-created'].includes('date-created') ? [] : [],
		},
		schema: { is_nullable: true },
	});

	await createField('contacts', {
		field: 'last_contacted_channel',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			display: 'labels',
			options: {
				choices: [
					{ text: 'Email', value: 'email' },
					{ text: 'Meeting', value: 'meeting' },
					{ text: 'Message', value: 'message' },
					{ text: 'Task', value: 'task' },
					{ text: 'Manual', value: 'manual' },
				],
				allowOther: false,
			},
			note: 'Which channel produced the timestamp in last_contacted_at. Pair with the timestamp to render "Met yesterday" vs "Emailed last week".',
			width: 'half',
			readonly: true,
		},
		schema: { is_nullable: true },
	});

	console.log('');
	console.log('==========================================');
	console.log('  Done');
	console.log('==========================================');
	console.log('Next: pnpm generate:types');
	console.log('Then: pnpm tsx scripts/backfill-contact-last-contacted.ts');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
