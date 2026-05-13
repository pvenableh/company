/**
 * Meeting reminder cron — fires "starts in 15 min" notifications.
 *
 * Runs every 5 minutes. Queries appointments where `start_time` falls in the
 * next [15m, 20m] window and `reminder_sent` is not yet true, then for each
 * appointment fans out one reminder via notifyMeetingChange to:
 *   - every linked teammate (appointments_directus_users junction)
 *   - the host (host_user on the video_meeting if present; else user_created
 *     on the appointment)
 *
 * The window is intentionally 5 minutes wide so a missed run (cron delayed,
 * Vercel cold start) still catches the meeting next time, without ever
 * double-firing — `reminder_sent` is stamped on the appointment after we send
 * and the filter excludes already-stamped rows.
 *
 * External-guest reminders (video_meeting_attendees with attendee_type='guest')
 * are intentionally NOT fired here. Calendar-style guest reminders are a
 * larger surface that needs sign-off on per-guest pref handling; deferring
 * to a follow-up issue.
 *
 * Auth: `cronSecret` Bearer header (Vercel Cron). Manual triggers from an
 * authenticated session also work for testing.
 */

import { readItems, updateItem } from '@directus/sdk';

interface AppointmentRow {
	id: string;
	title: string | null;
	start_time: string | null;
	end_time: string | null;
	is_video: boolean | null;
	reminder_sent: boolean | null;
	user_created: any;
	related_lead: any;
	video_meeting: any;
}

const REMINDER_LEAD_MIN = 15;
const WINDOW_WIDTH_MIN = 5;

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const cronSecret = (config as any).cronSecret;
	const authHeader = getHeader(event, 'authorization');

	if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
		// authenticated via cron secret
	} else {
		// Manual trigger fallback — must be a logged-in user.
		const session = await getUserSession(event);
		if (!(session as any)?.user?.id) {
			throw createError({ statusCode: 401, message: 'Authentication required' });
		}
	}

	const now = Date.now();
	const windowStart = new Date(now + REMINDER_LEAD_MIN * 60 * 1000);
	const windowEnd = new Date(windowStart.getTime() + WINDOW_WIDTH_MIN * 60 * 1000);

	const directus = getTypedDirectus();

	let appointments: AppointmentRow[] = [];
	try {
		appointments = (await directus.request(
			readItems('appointments', {
				filter: {
					_and: [
						{ start_time: { _gte: windowStart.toISOString() } },
						{ start_time: { _lt: windowEnd.toISOString() } },
						{
							_or: [
								{ reminder_sent: { _null: true } },
								{ reminder_sent: { _eq: false } },
							],
						},
					],
				} as any,
				fields: [
					'id',
					'title',
					'start_time',
					'end_time',
					'is_video',
					'reminder_sent',
					'user_created',
					'related_lead.organization',
					'video_meeting.id',
					'video_meeting.title',
					'video_meeting.meeting_url',
					'video_meeting.host_user',
					'video_meeting.host_identity',
					'video_meeting.duration_minutes',
					'video_meeting.scheduled_start',
					'video_meeting.related_organization',
					'attendees.directus_users_id',
				] as any,
				limit: -1,
			}),
		)) as any[];
	} catch (err) {
		console.error('[meeting-reminders] failed to load appointments:', err);
		throw createError({ statusCode: 500, message: 'Failed to query appointments' });
	}

	let sentCount = 0;
	let skippedCount = 0;
	const errors: string[] = [];

	for (const appt of appointments) {
		const startTime = appt.start_time ? new Date(appt.start_time) : null;
		if (!startTime || isNaN(startTime.getTime())) {
			skippedCount++;
			continue;
		}

		const videoMeeting = (appt.video_meeting && typeof appt.video_meeting === 'object')
			? appt.video_meeting
			: null;

		const isVideo = !!videoMeeting;
		const meetingId = isVideo ? videoMeeting.id : appt.id;
		const title = (isVideo && videoMeeting.title) || appt.title || (isVideo ? 'Meeting' : 'Event');
		const meetingUrl: string | null = isVideo ? (videoMeeting.meeting_url || null) : null;
		const durationMinutes: number = isVideo && videoMeeting.duration_minutes
			? videoMeeting.duration_minutes
			: (appt.start_time && appt.end_time
				? Math.max(15, Math.round((new Date(appt.end_time).getTime() - startTime.getTime()) / 60000))
				: 30);

		// Host: only honored for video meetings — those set `host_user` explicitly
		// during create-room. Non-video appointments have `user_created` set by
		// Directus's admin-token auto-fill (the "API Admin" placeholder user), so
		// we can't trust it as a real recipient. Reminders for non-video events
		// go to linked teammates only.
		const hostId = isVideo
			? (typeof videoMeeting.host_user === 'object' ? videoMeeting.host_user?.id : videoMeeting.host_user)
			: null;
		const hostName = isVideo && videoMeeting.host_identity
			? videoMeeting.host_identity
			: 'Your meeting';

		const memberIds: string[] = Array.isArray(appt.attendees)
			? appt.attendees
				.map((a: any) => (typeof a?.directus_users_id === 'object' ? a.directus_users_id?.id : a?.directus_users_id))
				.filter(Boolean)
			: [];

		const recipientIds = Array.from(new Set([...memberIds, hostId].filter(Boolean) as string[]));
		if (recipientIds.length === 0) {
			// Nobody to notify — still stamp reminder_sent so we don't re-check
			// this row on every subsequent cron tick.
			try {
				await directus.request(updateItem('appointments', appt.id, { reminder_sent: true } as any));
			} catch (err) {
				console.warn('[meeting-reminders] stamp-only failed for', appt.id, err);
			}
			skippedCount++;
			continue;
		}

		const orgId: string | null = isVideo
			? (typeof videoMeeting?.related_organization === 'object' ? videoMeeting.related_organization?.id : videoMeeting?.related_organization) || null
			: (typeof (appt as any).related_lead === 'object'
				? ((appt as any).related_lead?.organization?.id || (appt as any).related_lead?.organization)
				: null);

		try {
			await notifyMeetingChange({
				event: { kind: 'reminder' },
				meeting: {
					id: meetingId,
					title,
					meeting_url: meetingUrl,
					scheduled_start: startTime.toISOString(),
					duration_minutes: durationMinutes,
					collection: isVideo ? 'video_meetings' : 'appointments',
					orgId: orgId || null,
				},
				recipientIds,
				hostId: hostId || '',
				hostName,
			});
			sentCount++;
		} catch (err) {
			console.error('[meeting-reminders] notify failed for', appt.id, err);
			errors.push(`${appt.id}: ${(err as Error).message}`);
			continue;
		}

		// Stamp reminder_sent so the next cron tick skips this row.
		try {
			await directus.request(updateItem('appointments', appt.id, { reminder_sent: true } as any));
		} catch (err) {
			console.error('[meeting-reminders] failed to stamp reminder_sent for', appt.id, err);
			errors.push(`${appt.id} (stamp): ${(err as Error).message}`);
		}
	}

	return {
		success: true,
		windowStart: windowStart.toISOString(),
		windowEnd: windowEnd.toISOString(),
		examined: appointments.length,
		sent: sentCount,
		skipped: skippedCount,
		errors,
	};
});
