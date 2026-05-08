#!/usr/bin/env npx tsx
/**
 * Opt-in recording + transcription — schema setup
 *
 * Adds the fields the meeting page now reads to decide whether to auto-start
 * cloud recording / Deepgram transcription on host join.
 *
 *   video_meetings.transcription_enabled   boolean (nullable, default null)
 *   organizations.default_recording        boolean (nullable, default null)
 *   organizations.default_transcription    boolean (nullable, default null)
 *
 * `recording_enabled` already exists on video_meetings — we just stop ignoring
 * it. Org-level booleans are nullable so we can distinguish "explicitly off"
 * from "fall through to plan default".
 *
 *   pnpm tsx scripts/setup-meeting-opt-in-fields.ts
 *
 * Idempotent: re-running is safe.
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!DIRECTUS_TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ error: string | null }> {
	const r = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_TOKEN}` },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await r.text();
	if (!r.ok) {
		if (r.status === 400 && /already exists/i.test(text)) return { error: 'already_exists' };
		return { error: `${r.status}: ${text}` };
	}
	return { error: null };
}

async function createField(collection: string, field: Record<string, any>) {
	console.log(`  ${collection}.${field.field}`);
	const { error } = await directusRequest(`/fields/${collection}`, 'POST', field);
	if (error === 'already_exists') {
		console.log('    -> Already exists');
		return;
	}
	if (error) {
		console.error('    -> Error:', error);
		process.exit(1);
	}
	console.log('    -> Created');
}

async function main() {
	console.log('=== Opt-in recording/transcription — schema setup ===');

	await createField('video_meetings', {
		field: 'transcription_enabled',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			special: ['cast-boolean'],
			note: 'Auto-start Deepgram transcription on host join. Null = inherit org default.',
			width: 'half',
		},
		schema: { default_value: null, is_nullable: true },
	});

	await createField('organizations', {
		field: 'default_recording',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			special: ['cast-boolean'],
			note: 'Org default for new meetings. Null = inherit plan default (free=off, studio+=on).',
			width: 'half',
			group: 'meeting_defaults' as any,
		},
		schema: { default_value: null, is_nullable: true },
	});

	await createField('organizations', {
		field: 'default_transcription',
		type: 'boolean',
		meta: {
			interface: 'boolean',
			special: ['cast-boolean'],
			note: 'Org default for new meetings. Null = inherit plan default (free=off, solo+=on).',
			width: 'half',
			group: 'meeting_defaults' as any,
		},
		schema: { default_value: null, is_nullable: true },
	});

	console.log('Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
