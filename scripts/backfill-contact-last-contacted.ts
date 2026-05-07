#!/usr/bin/env npx tsx
/**
 * Backfill contacts.last_contacted_at + last_contacted_channel from existing
 * data. Safe to run repeatedly — for each contact we pick the most recent
 * touch across these signals:
 *
 *   - last_opened_at         (email open)
 *   - last_clicked_at        (email click — also counts as "email")
 *   - latest video_meeting_attendees.date_created where guest_email matches
 *   - latest appointments.date_created indirectly via related video_meeting
 *     (skipped — too lossy without a real contact FK)
 *
 * The newest of (last_opened_at, last_clicked_at) → channel='email'.
 * A meeting-attendee row newer than that → channel='meeting'.
 *
 * Dry-run by default. Pass --apply to actually write.
 *
 *   pnpm tsx scripts/backfill-contact-last-contacted.ts            # dry-run
 *   pnpm tsx scripts/backfill-contact-last-contacted.ts --apply
 */

import 'dotenv/config';

const URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_ADMIN_TOKEN || '';
if (!TOKEN) { console.error('DIRECTUS_SERVER_TOKEN required'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(`${URL}${path}`, {
		...init,
		headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
	});
	if (!r.ok) {
		const body = await r.text().catch(() => '');
		throw new Error(`${r.status} on ${path}\n${body}`);
	}
	if (r.status === 204) return undefined as any;
	const j = await r.json();
	return j.data;
}

interface Contact {
	id: string;
	email: string | null;
	last_opened_at: string | null;
	last_clicked_at: string | null;
	last_contacted_at: string | null;
	last_contacted_channel: string | null;
}

interface Attendee {
	id: number;
	guest_email: string | null;
	date_created: string | null;
	directus_user: { email?: string | null } | string | null;
}

async function main() {
	console.log(`Backfill contacts.last_contacted_at — apply=${APPLY}`);

	// 1) Pull every contact (email + current state)
	let allContacts: Contact[] = [];
	let page = 1;
	while (true) {
		const batch = await api<Contact[]>(
			`/items/contacts?fields=id,email,last_opened_at,last_clicked_at,last_contacted_at,last_contacted_channel&limit=500&page=${page}`,
		);
		if (!batch.length) break;
		allContacts = allContacts.concat(batch);
		if (batch.length < 500) break;
		page++;
	}
	console.log(`  Loaded ${allContacts.length} contacts`);

	// 2) Pull every video_meeting_attendees with non-null email + date
	let allAttendees: Attendee[] = [];
	page = 1;
	while (true) {
		const batch = await api<Attendee[]>(
			`/items/video_meeting_attendees?fields=id,guest_email,date_created,directus_user.email&limit=500&page=${page}`,
		);
		if (!batch.length) break;
		allAttendees = allAttendees.concat(batch);
		if (batch.length < 500) break;
		page++;
	}
	console.log(`  Loaded ${allAttendees.length} meeting-attendee rows`);

	// Build email → newest-attendee-date map
	const newestAttendeeByEmail = new Map<string, string>();
	for (const a of allAttendees) {
		const candidate = a.guest_email
			|| (typeof a.directus_user === 'object' ? (a.directus_user?.email || null) : null);
		const email = candidate?.toLowerCase().trim();
		if (!email || !a.date_created) continue;
		const prev = newestAttendeeByEmail.get(email);
		if (!prev || prev < a.date_created) newestAttendeeByEmail.set(email, a.date_created);
	}

	// 3) For each contact, pick the newest signal across email + meeting
	let willUpdate = 0;
	let skipped = 0;
	const ops: Array<{ id: string; ts: string; channel: string }> = [];

	for (const c of allContacts) {
		const email = c.email?.toLowerCase().trim() || null;
		const candidates: Array<{ ts: string; channel: string }> = [];
		if (c.last_opened_at) candidates.push({ ts: c.last_opened_at, channel: 'email' });
		if (c.last_clicked_at) candidates.push({ ts: c.last_clicked_at, channel: 'email' });
		const meetingTs = email ? newestAttendeeByEmail.get(email) : undefined;
		if (meetingTs) candidates.push({ ts: meetingTs, channel: 'meeting' });
		if (!candidates.length) { skipped++; continue; }
		candidates.sort((a, b) => b.ts.localeCompare(a.ts));
		const winner = candidates[0]!;

		// Skip if already at-or-after winner
		if (c.last_contacted_at && c.last_contacted_at >= winner.ts) { skipped++; continue; }

		ops.push({ id: c.id, ts: winner.ts, channel: winner.channel });
		willUpdate++;
	}

	console.log(`\nPlanned: ${willUpdate} updates, ${skipped} skipped (no signal or already up-to-date)`);
	console.log(`  email   : ${ops.filter((o) => o.channel === 'email').length}`);
	console.log(`  meeting : ${ops.filter((o) => o.channel === 'meeting').length}`);

	if (!APPLY) {
		console.log('\nDry-run. Re-run with --apply.');
		return;
	}

	let applied = 0;
	let failed = 0;
	for (const op of ops) {
		try {
			await api(`/items/contacts/${op.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ last_contacted_at: op.ts, last_contacted_channel: op.channel }),
			});
			applied++;
		} catch (err: any) {
			failed++;
			console.warn(`  ${op.id}: ${err.message.split('\n')[0]}`);
		}
	}
	console.log(`\nApplied ${applied}/${ops.length} (${failed} failed).`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
