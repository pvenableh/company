#!/usr/bin/env npx tsx
/**
 * One-shot cleanup for accumulated test/smoke video_meetings rows hosted by
 * peter@huestudios.com.
 *
 * Match heuristic (any of):
 *   - title ILIKE %test%
 *   - title ILIKE Smoke%
 *   - meeting_type = 'general' AND duration_minutes <= 15  (one-off short demo)
 *
 * Cascade order matches server/api/video/meetings/[id].delete.ts:
 *   1. video_meeting_attendees (FK to parent)
 *   2. lead_activities.related_video_meeting → null (preserve activity rows)
 *   3. video_meetings (the rows themselves)
 *   4. appointments (only those linked via related_appointment)
 *
 * Daily room cleanup is intentionally skipped — the rooms expire on their own
 * via the `exp` we set at create time. Hammering Daily with hundreds of
 * deletes for stale rooms isn't worth the network round-trips.
 *
 * Usage:
 *   pnpm tsx scripts/purge-test-meetings.ts            # dry-run (default)
 *   pnpm tsx scripts/purge-test-meetings.ts --apply    # actually delete
 */

import 'dotenv/config';
import { assertDirectusToken, directusRequest } from './lib/demo-seed';

assertDirectusToken();

const HOST_EMAIL = 'peter@huestudios.com';
const APPLY = process.argv.includes('--apply');

async function main() {
	console.log(`\n=== purge-test-meetings (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
	console.log(`Host: ${HOST_EMAIL}`);

	const userQs = `filter=${encodeURIComponent(JSON.stringify({ email: { _eq: HOST_EMAIL } }))}&fields=id,email&limit=1`;
	const userRes = await directusRequest<any[]>(`/users?${userQs}`);
	if (!userRes.ok || !Array.isArray(userRes.data) || userRes.data.length === 0) {
		console.error(`Could not resolve user ${HOST_EMAIL}: ${userRes.error || 'not found'}`);
		process.exit(1);
	}
	const userId = userRes.data[0].id as string;
	console.log(`User id: ${userId}`);

	const meetingFilter = {
		host_user: { _eq: userId },
		_or: [
			{ title: { _icontains: 'test' } },
			{ title: { _starts_with: 'Smoke' } },
			{ _and: [{ meeting_type: { _eq: 'general' } }, { duration_minutes: { _lte: 15 } }] },
		],
	};
	const meetingsQs =
		`filter=${encodeURIComponent(JSON.stringify(meetingFilter))}` +
		`&fields=id,title,meeting_type,duration_minutes,scheduled_start,room_name,related_appointment` +
		`&sort=scheduled_start&limit=-1`;
	const meetingsRes = await directusRequest<any[]>(`/items/video_meetings?${meetingsQs}`);
	if (!meetingsRes.ok || !Array.isArray(meetingsRes.data)) {
		console.error(`Failed to load meetings: ${meetingsRes.error}`);
		process.exit(1);
	}
	const meetings = meetingsRes.data;
	console.log(`Matched ${meetings.length} meeting(s)\n`);

	if (meetings.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	for (const m of meetings) {
		const start = m.scheduled_start ? new Date(m.scheduled_start).toISOString() : '(no start)';
		console.log(
			`  ${m.id}  ${start}  ${m.duration_minutes ?? '?'}m  type=${m.meeting_type || '-'}  "${m.title || '(untitled)'}"`,
		);
	}

	if (!APPLY) {
		console.log(`\nDry-run only. Re-run with --apply to delete the ${meetings.length} meeting(s) above.`);
		return;
	}

	console.log('\n— Applying —');

	const meetingIds = meetings.map((m) => m.id).filter(Boolean);
	const appointmentIds = meetings.map((m) => m.related_appointment).filter(Boolean);

	const attRes = await directusRequest<any[]>(
		`/items/video_meeting_attendees?filter=${encodeURIComponent(JSON.stringify({ video_meeting: { _in: meetingIds } }))}&fields=id&limit=-1`,
	);
	const attendeeIds = (attRes.ok && Array.isArray(attRes.data) ? attRes.data : []).map((a: any) => a.id).filter(Boolean);
	if (attendeeIds.length > 0) {
		const del = await directusRequest('/items/video_meeting_attendees', 'DELETE', attendeeIds);
		console.log(`  [${del.ok ? 'ok' : 'fail'}] video_meeting_attendees: ${attendeeIds.length}${del.ok ? '' : ' — ' + del.error}`);
	} else {
		console.log('  [skip] video_meeting_attendees: 0');
	}

	const actRes = await directusRequest<any[]>(
		`/items/lead_activities?filter=${encodeURIComponent(JSON.stringify({ related_video_meeting: { _in: meetingIds } }))}&fields=id&limit=-1`,
	);
	const activityIds = (actRes.ok && Array.isArray(actRes.data) ? actRes.data : []).map((a: any) => a.id).filter(Boolean);
	let nulled = 0;
	for (const id of activityIds) {
		const upd = await directusRequest(`/items/lead_activities/${id}`, 'PATCH', { related_video_meeting: null });
		if (upd.ok) nulled++;
		else console.error(`    [fail] null lead_activity ${id}: ${upd.error}`);
	}
	console.log(`  [ok]   lead_activities (FK nulled): ${nulled}/${activityIds.length}`);

	const delMeetings = await directusRequest('/items/video_meetings', 'DELETE', meetingIds);
	console.log(`  [${delMeetings.ok ? 'ok' : 'fail'}] video_meetings: ${meetingIds.length}${delMeetings.ok ? '' : ' — ' + delMeetings.error}`);

	if (appointmentIds.length > 0) {
		const delApts = await directusRequest('/items/appointments', 'DELETE', appointmentIds);
		console.log(`  [${delApts.ok ? 'ok' : 'fail'}] appointments: ${appointmentIds.length}${delApts.ok ? '' : ' — ' + delApts.error}`);
	} else {
		console.log('  [skip] appointments: 0 linked');
	}

	console.log('\nDone.');
}

main().catch((err) => {
	console.error('Purge failed:', err);
	process.exit(1);
});
