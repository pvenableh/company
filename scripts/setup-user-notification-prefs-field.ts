#!/usr/bin/env npx tsx
/**
 * Directus directus_users — add the missing `notification_preferences` field.
 *
 * The app has always ASSUMED this field exists: it's the per-category prefs
 * map (a JSON `{ [category]: boolean }`) that gates whether a recipient gets
 * an email/push for each notification category. It's read by
 * `server/utils/notify-event.ts` (emitNotification's RECIPIENT_FIELDS) and
 * `server/utils/meeting-notifications.ts`, written by
 * `server/api/user/notification-preferences.patch.ts`, and edited in
 * `NotificationsMenu.vue`.
 *
 * But the column was never created on prod. Because emitNotification selects
 * it in a bulk `readUsers` with no fallback, the whole recipient load 403s
 * ("no permission to access field ... or it does not exist") and the fan-out
 * silently returns { bellSent: 0, emailSent: 0 } — so NO bell or email is ever
 * sent (this broke the Sprint-1 return-leg notify, and all emitNotification
 * bells/emails generally). The get/patch endpoints already degrade gracefully
 * with a message literally saying "add a JSON field in Directus admin"; this
 * script is that step.
 *
 * Missing keys default to opt-in (see emailAllowed/pushAllowed), so a NULL
 * value on every existing user is the correct "no explicit opt-outs" default —
 * no backfill needed.
 *
 * Idempotent — re-running is safe (Directus returns 409/"already exists").
 *
 * Run:
 *   pnpm tsx scripts/setup-user-notification-prefs-field.ts
 */
import 'dotenv/config';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';

if (!DIRECTUS_TOKEN) {
	console.error('Error: DIRECTUS_SERVER_TOKEN or DIRECTUS_ADMIN_TOKEN environment variable is required');
	process.exit(1);
}

async function directusRequest(
	path: string,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
): Promise<{ data: any; error: string | null }> {
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

async function main() {
	console.log('\n=== directus_users — add notification_preferences (JSON) ===');

	// If it already exists, bail early with a clear note.
	const existing = await directusRequest('/fields/directus_users/notification_preferences');
	if (existing.data) {
		console.log('  notification_preferences already present — nothing to do.');
		return;
	}

	const { error } = await directusRequest('/fields/directus_users', 'POST', {
		field: 'notification_preferences',
		type: 'json',
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			special: ['cast-json'],
			note: 'Per-category notification opt-outs: { [category]: boolean }. Missing key = opt-in. `_all: false` mutes everything.',
			width: 'full',
		},
		schema: {
			// nullable — a NULL value means "no explicit opt-outs" (all categories opt-in).
			is_nullable: true,
		},
	});

	if (error === 'already_exists') {
		console.log('  -> Already exists, skipping');
	} else if (error) {
		console.error(`  -> Error: ${error}`);
		process.exit(1);
	} else {
		console.log('  -> Created');
	}

	// Verify the server token can now read it (the exact failure mode we fixed).
	const check = await directusRequest(
		'/users?limit=1&fields=id,email_notifications,notification_preferences',
	);
	if (check.error) {
		console.error(`\n  VERIFY FAILED — server token still can't read the field: ${check.error}`);
		process.exit(1);
	}
	console.log('  VERIFY OK — server token can read notification_preferences in a bulk readUsers.');
	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
