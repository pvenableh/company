// server/utils/meeting-notifications.ts
// Fan-out helper: writes one directus_notifications row per recipient and, when
// the recipient hasn't opted out, sends a matching SendGrid email. Used by the
// video-meeting endpoints (create-room / [id].patch / [id].delete).
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
} from './meeting-emails';

export type MeetingNotificationKind =
	| { kind: 'invited' }
	| { kind: 'removed' }
	| { kind: 'cancelled' }
	| { kind: 'time_changed'; previousStart: Date };

interface MeetingRef {
	id: string;
	title: string;
	meeting_url: string | null;
	scheduled_start: string;
	duration_minutes: number | null;
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
}

function subjectAndMessage(event: MeetingNotificationKind, meeting: MeetingRef, hostName: string) {
	switch (event.kind) {
		case 'invited':
			return {
				subject: `Added to video meeting: ${meeting.title}`,
				message: `${hostName} added you to "${meeting.title}".`,
			};
		case 'removed':
			return {
				subject: `Removed from video meeting: ${meeting.title}`,
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
	}
}

export async function notifyMeetingChange(params: NotifyParams): Promise<void> {
	const { event, meeting, recipientIds, hostId, hostName } = params;

	const uniqueIds = Array.from(new Set(recipientIds)).filter((id) => id && id !== hostId);
	if (uniqueIds.length === 0) return;

	const directus = getServerDirectus();
	const config = useRuntimeConfig();

	let recipients: RecipientRow[] = [];
	try {
		recipients = (await directus.request(
			readUsers({
				filter: { id: { _in: uniqueIds } } as any,
				fields: ['id', 'email', 'first_name', 'last_name', 'email_notifications'] as any,
				limit: -1,
			}),
		)) as any;
	} catch (err) {
		console.error('[meeting-notifications] failed to load recipients:', err);
		return;
	}

	const { subject, message } = subjectAndMessage(event, meeting, hostName);
	const scheduledStart = new Date(meeting.scheduled_start);
	const durationMinutes = meeting.duration_minutes || 30;

	await Promise.allSettled(
		recipients.map(async (recipient) => {
			// In-app notification — always
			try {
				await directus.request(
					createNotification({
						recipient: recipient.id,
						sender: hostId,
						subject,
						message,
						collection: 'video_meetings',
						item: meeting.id,
						status: 'inbox',
					} as any),
				);
			} catch (err) {
				console.error('[meeting-notifications] in-app write failed for', recipient.id, err);
			}

			// Email — opt-out only (null/undefined = opt-in)
			if (recipient.email_notifications === false) return;
			if (!recipient.email) return;
			if (!config.sendgridApiKey || !config.sendgridFromEmail) return;

			const recipientName = recipient.first_name || recipient.email.split('@')[0] || 'there';
			const baseParams = {
				to: recipient.email,
				recipientName,
				hostName,
				meetingTitle: meeting.title,
				scheduledStart,
				config,
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
				}
			} catch (err) {
				console.error('[meeting-notifications] email send failed for', recipient.email, err);
			}
		}),
	);
}
