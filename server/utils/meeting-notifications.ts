// server/utils/meeting-notifications.ts
// Fan-out helper: writes one directus_notifications row per recipient and, when
// the recipient hasn't opted out, sends a matching SendGrid email. Used by the
// video-meeting endpoints (create-room / [id].patch / [id].delete) AND the
// non-video appointment endpoints (/api/appointments POST/PATCH/DELETE).
//
// The host is always skipped — they don't need to notify themselves of their
// own action. Recipients missing an email get the in-app notification only.
// `directus_users.email_notifications` is treated as opt-IN when null/undefined.

import { createNotification, readUsers } from '@directus/sdk';
import {
	sendMeetingInvitedEmail,
	sendMeetingRemovedEmail,
	sendMeetingCancelledEmail,
	sendMeetingTimeChangedEmail,
	sendMeetingReminderEmail,
} from './meeting-emails';
import { fetchOrgBrand } from './email-send';

export type MeetingNotificationKind =
	| { kind: 'invited' }
	| { kind: 'removed' }
	| { kind: 'cancelled' }
	| { kind: 'time_changed'; previousStart: Date }
	| { kind: 'reminder' };

const PREFERENCE_KEY: Record<MeetingNotificationKind['kind'], string> = {
	invited: 'meeting_invited',
	removed: 'meeting_removed',
	cancelled: 'meeting_cancelled',
	time_changed: 'meeting_time_changed',
	reminder: 'meeting_reminder',
};

type MeetingCollection = 'video_meetings' | 'appointments';

interface MeetingRef {
	id: string;
	title: string;
	meeting_url: string | null;
	scheduled_start: string;
	duration_minutes: number | null;
	/** Defaults to 'video_meetings' for backward compat with existing callers. */
	collection?: MeetingCollection;
	/** Org scope — drives logo, brand_color, reply-to on the outbound email. */
	orgId?: string | null;
}

interface NotifyParams {
	event: MeetingNotificationKind;
	meeting: MeetingRef;
	recipientIds: string[];
	hostId: string;
	hostName: string;
}

interface RecipientRow {
	id: string;
	email: string | null;
	first_name: string | null;
	last_name: string | null;
	email_notifications: boolean | null;
	notification_preferences: Record<string, boolean> | null;
}

function subjectAndMessage(event: MeetingNotificationKind, meeting: MeetingRef, hostName: string) {
	const noun = meeting.collection === 'appointments' ? 'event' : 'meeting';
	switch (event.kind) {
		case 'invited':
			return {
				subject: `Added to ${noun}: ${meeting.title}`,
				message: `${hostName} added you to "${meeting.title}".`,
			};
		case 'removed':
			return {
				subject: `Removed from ${noun}: ${meeting.title}`,
				message: `${hostName} removed you from "${meeting.title}".`,
			};
		case 'cancelled':
			return {
				subject: `Cancelled: ${meeting.title}`,
				message: `${hostName} cancelled "${meeting.title}".`,
			};
		case 'time_changed':
			return {
				subject: `Rescheduled: ${meeting.title}`,
				message: `${hostName} rescheduled "${meeting.title}".`,
			};
		case 'reminder':
			return {
				subject: `Starting soon: ${meeting.title}`,
				message: `"${meeting.title}" starts in 15 minutes.`,
			};
	}
}

export async function notifyMeetingChange(params: NotifyParams): Promise<void> {
	const { event, meeting, recipientIds, hostId, hostName } = params;

	// Reminders are the one kind the host *does* want for themselves — Calendar
	// reminders fire at everyone on the invite, host included. For every other
	// kind we skip the host because they triggered the change.
	const skipHost = event.kind !== 'reminder';
	const uniqueIds = Array.from(new Set(recipientIds)).filter((id) => id && (!skipHost || id !== hostId));
	if (uniqueIds.length === 0) return;

	const directus = getServerDirectus();
	const config = useRuntimeConfig();

	let recipients: RecipientRow[] = [];
	try {
		recipients = (await directus.request(
			readUsers({
				filter: { id: { _in: uniqueIds } } as any,
				fields: ['id', 'email', 'first_name', 'last_name', 'email_notifications', 'notification_preferences'] as any,
				limit: -1,
			}),
		)) as any;
	} catch (err) {
		console.error('[meeting-notifications] failed to load recipients:', err);
		return;
	}

	const prefKey = PREFERENCE_KEY[event.kind];

	const { subject, message } = subjectAndMessage(event, meeting, hostName);
	const scheduledStart = new Date(meeting.scheduled_start);
	const durationMinutes = meeting.duration_minutes || 30;

	// Resolve org brand once for the whole fan-out.
	const orgBrand = meeting.orgId ? await fetchOrgBrand(meeting.orgId) : null;

	await Promise.allSettled(
		recipients.map(async (recipient) => {
			// In-app notification — always. (Bell rows on the
			// `video_meetings`/`appointments` collections category-resolve to
			// "meetings" via the heuristic in useUnreadByCategory — no
			// metadata column required.)
			try {
				await directus.request(
					createNotification({
						recipient: recipient.id,
						sender: hostId,
						subject,
						message,
						collection: meeting.collection || 'video_meetings',
						item: meeting.id,
						status: 'inbox',
					} as any),
				);
			} catch (err) {
				console.error('[meeting-notifications] in-app write failed for', recipient.id, err);
			}

			// Email — opt-out only (null/undefined = opt-in).
			// Master kill-switch: email_notifications === false suppresses all kinds.
			// Per-type opt-out: notification_preferences[prefKey] === false.
			// Category-level opt-out: notification_preferences.meetings === false.
			// _all === false (in prefs) also kills everything.
			if (recipient.email_notifications === false) return;
			const prefs = recipient.notification_preferences || {};
			if (prefs._all === false) return;
			if (prefs.meetings === false) return;
			if (prefs[prefKey] === false) return;
			if (!recipient.email) return;
			if (!config.sendgridApiKey || !config.sendgridFromEmail) return;

			const recipientName = recipient.first_name || recipient.email.split('@')[0] || 'there';
			const emailKind = meeting.collection === 'appointments' ? 'event' : 'meeting';
			const baseParams = {
				to: recipient.email,
				recipientName,
				hostName,
				meetingTitle: meeting.title,
				scheduledStart,
				config,
				kind: emailKind as 'meeting' | 'event',
				org: orgBrand,
			};

			try {
				if (event.kind === 'invited') {
					await sendMeetingInvitedEmail({
						...baseParams,
						meetingUrl: meeting.meeting_url || '',
						durationMinutes,
					});
				} else if (event.kind === 'time_changed') {
					await sendMeetingTimeChangedEmail({
						...baseParams,
						meetingUrl: meeting.meeting_url || '',
						durationMinutes,
						previousStart: event.previousStart,
					});
				} else if (event.kind === 'removed') {
					await sendMeetingRemovedEmail(baseParams);
				} else if (event.kind === 'cancelled') {
					await sendMeetingCancelledEmail(baseParams);
				} else if (event.kind === 'reminder') {
					const minutesUntilStart = Math.max(
						0,
						Math.round((scheduledStart.getTime() - Date.now()) / 60000),
					);
					await sendMeetingReminderEmail({
						...baseParams,
						meetingUrl: meeting.meeting_url || '',
						durationMinutes,
						minutesUntilStart,
					});
				}
			} catch (err) {
				console.error('[meeting-notifications] email send failed for', recipient.email, err);
			}
		}),
	);
}
