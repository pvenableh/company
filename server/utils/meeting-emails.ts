// server/utils/meeting-emails.ts
// Meeting/event lifecycle emails (video + non-video appointments), rendered
// from the local MJML templates under server/emails/meeting-*.mjml via
// `renderBrandedTemplate`. Each helper accepts an optional org brand — when
// present the email gets org logo + brand_color + reply-to chrome; otherwise
// it falls back to Earnest branding.
//
// External-guest invites for fresh video rooms still live inline in
// create-room.post.ts and call sendMeetingInvitedEmail when reused for
// teammate notifications.

import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';
import type { OrgBrandRef } from './email-shell';

type MeetingKind = 'meeting' | 'event';

interface BaseParams {
	to: string;
	recipientName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string | null;
	scheduledStart: Date;
	durationMinutes: number;
	/** Retained for back-compat with old callers; ignored. */
	config?: any;
	/** Defaults to 'meeting' for backward compat. */
	kind?: MeetingKind;
	/** Org context — drives logo, brand_color, reply-to. Null → Earnest shell. */
	org?: OrgBrandRef | null;
	/** Video meeting id — surfaces as `send_id` on SendGrid webhook events. */
	meetingId?: string | number | null;
}

function formatDateTime(scheduledStart: Date) {
	const date = scheduledStart.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	const time = scheduledStart.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZoneName: 'short',
	});
	return { date, time };
}

function kindLabel(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'event' : 'meeting';
}

function kindLabelCapitalized(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'Event' : 'Meeting';
}

/** Plain-text details block mirroring the MJML card. */
function detailsText(meetingTitle: string, date: string, time: string, durationMinutes: number) {
	return `${meetingTitle}\nDate: ${date}\nTime: ${time}\nDuration: ${durationMinutes} minutes`;
}

export async function sendMeetingInvitedEmail(params: BaseParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const subject = `${kindLabelCapitalized(params.kind)}: ${params.meetingTitle}`;
	const heading = `You've been added to a ${label}`;
	const ctaUrl = params.meetingUrl || '';
	const { html, text } = await renderBrandedTemplate('meeting-invited', {
		subject,
		preheader: `${params.hostName} added you to a ${label}.`,
		heading,
		recipientName: params.recipientName,
		hostName: params.hostName,
		kindLabel: label,
		meetingTitle: params.meetingTitle,
		date,
		time,
		duration: params.durationMinutes,
		ctaUrl,
		text: `Hi ${params.recipientName},\n\n${params.hostName} added you to a ${label}.\n\n${detailsText(params.meetingTitle, date, time, params.durationMinutes)}${ctaUrl ? `\n\nJoin meeting: ${ctaUrl}` : ''}`,
	}, { org: params.org });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-invited'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

export async function sendMeetingTimeChangedEmail(params: BaseParams & { previousStart: Date }) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const prev = formatDateTime(params.previousStart);
	const subject = `Rescheduled: ${params.meetingTitle}`;
	const heading = `${kindLabelCapitalized(params.kind)} time changed`;
	const ctaUrl = params.meetingUrl || '';
	const { html, text } = await renderBrandedTemplate('meeting-time-changed', {
		subject,
		preheader: `${params.hostName} rescheduled ${params.meetingTitle}.`,
		heading,
		recipientName: params.recipientName,
		hostName: params.hostName,
		meetingTitle: params.meetingTitle,
		prevDate: prev.date,
		prevTime: prev.time,
		date,
		time,
		duration: params.durationMinutes,
		ctaUrl,
		text: `Hi ${params.recipientName},\n\n${params.hostName} rescheduled ${params.meetingTitle}.\nWas: ${prev.date} at ${prev.time}\n\n${detailsText(params.meetingTitle, date, time, params.durationMinutes)}${ctaUrl ? `\n\nJoin meeting: ${ctaUrl}` : ''}`,
	}, { org: params.org });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-time-changed'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

interface MinimalParams {
	to: string;
	recipientName: string;
	hostName: string;
	meetingTitle: string;
	scheduledStart: Date;
	config?: any;
	kind?: MeetingKind;
	org?: OrgBrandRef | null;
	meetingId?: string | number | null;
}

export async function sendMeetingRemovedEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const subject = `Removed: ${params.meetingTitle}`;
	const heading = `You were removed from a ${label}`;
	const { html, text } = await renderBrandedTemplate('meeting-removed', {
		subject,
		preheader: `${params.hostName} removed you from ${params.meetingTitle}.`,
		heading,
		recipientName: params.recipientName,
		hostName: params.hostName,
		meetingTitle: params.meetingTitle,
		date,
		time,
		text: `Hi ${params.recipientName},\n\n${params.hostName} removed you from ${params.meetingTitle} (${date} at ${time}).\n\nIf this was a mistake, reach out to ${params.hostName} directly.`,
	}, { org: params.org });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-removed'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

export async function sendMeetingCancelledEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const subject = `Cancelled: ${params.meetingTitle}`;
	const heading = `${kindLabelCapitalized(params.kind)} cancelled`;
	const { html, text } = await renderBrandedTemplate('meeting-cancelled', {
		subject,
		preheader: `${params.hostName} cancelled ${params.meetingTitle}.`,
		heading,
		recipientName: params.recipientName,
		hostName: params.hostName,
		meetingTitle: params.meetingTitle,
		date,
		time,
		text: `Hi ${params.recipientName},\n\n${params.hostName} cancelled ${params.meetingTitle} (${date} at ${time}).`,
	}, { org: params.org });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-cancelled'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

interface ReminderParams extends BaseParams {
	minutesUntilStart: number;
}

export async function sendMeetingReminderEmail(params: ReminderParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const lead = params.minutesUntilStart === 1 ? '1 minute' : `${params.minutesUntilStart} minutes`;
	const subject = `Starting in ${lead}: ${params.meetingTitle}`;
	const heading = `Your ${label} starts in ${lead}`;
	const ctaUrl = params.meetingUrl || '';
	const { html, text } = await renderBrandedTemplate('meeting-reminder', {
		subject,
		preheader: `${params.meetingTitle} begins at ${time}.`,
		heading,
		recipientName: params.recipientName,
		meetingTitle: params.meetingTitle,
		date,
		time,
		duration: params.durationMinutes,
		ctaUrl,
		text: `Hi ${params.recipientName},\n\n${params.meetingTitle} begins at ${time}.\n\n${detailsText(params.meetingTitle, date, time, params.durationMinutes)}${ctaUrl ? `\n\nJoin meeting: ${ctaUrl}` : ''}`,
	}, { org: params.org });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-reminder'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}
