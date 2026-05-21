// server/utils/meeting-emails.ts
// SendGrid templates for meeting/event lifecycle emails (video + non-video
// appointments). Each helper accepts an optional org brand — when present
// the email gets org logo + brand_color + reply-to chrome; otherwise it
// falls back to Earnest branding.
//
// External-guest invites for fresh video rooms still live inline in
// create-room.post.ts and call sendMeetingInvitedEmail when reused for
// teammate notifications.

import { renderEarnestEmail, renderOrgEmail, escapeHtml, type OrgBrandRef } from './email-shell';
import { sendBrandedEmail } from './email-send';

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

function detailsBlock(meetingTitle: string, date: string, time: string, durationMinutes: number) {
	return `
		<div style="background:#f7f5f2;padding:16px 20px;border-radius:8px;margin:16px 0;">
			<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#141210;">${escapeHtml(meetingTitle)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Date:</strong> ${escapeHtml(date)}</p>
			<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Time:</strong> ${escapeHtml(time)}</p>
			<p style="margin:0;font-size:14px;color:#444;"><strong>Duration:</strong> ${durationMinutes} minutes</p>
		</div>
	`;
}

function kindLabel(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'event' : 'meeting';
}

function kindLabelCapitalized(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'Event' : 'Meeting';
}

function render(args: {
	org?: OrgBrandRef | null;
	subject: string;
	heading: string;
	bodyHtml: string;
	cta?: { label: string; url: string } | null;
}) {
	return args.org
		? renderOrgEmail({ org: args.org, subject: args.subject, heading: args.heading, bodyHtml: args.bodyHtml, cta: args.cta })
		: renderEarnestEmail({ subject: args.subject, heading: args.heading, bodyHtml: args.bodyHtml, cta: args.cta });
}

export async function sendMeetingInvitedEmail(params: BaseParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const labelCap = kindLabelCapitalized(params.kind);
	const subject = `${labelCap}: ${params.meetingTitle}`;
	const heading = `You've been added to a ${label}`;
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(params.recipientName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(params.hostName)}</strong> added you to a ${label}.</p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
	`;
	const cta = params.meetingUrl ? { label: 'Join meeting', url: params.meetingUrl } : null;
	const { html, text } = render({ org: params.org, subject, heading, bodyHtml, cta });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-invited'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

export async function sendMeetingTimeChangedEmail(params: BaseParams & { previousStart: Date }) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const prev = formatDateTime(params.previousStart);
	const labelCap = kindLabelCapitalized(params.kind);
	const subject = `Rescheduled: ${params.meetingTitle}`;
	const heading = `${labelCap} time changed`;
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(params.recipientName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(params.hostName)}</strong> rescheduled <strong>${escapeHtml(params.meetingTitle)}</strong>.</p>
		<p style="margin:0 0 12px;color:#888;"><s>${escapeHtml(prev.date)} at ${escapeHtml(prev.time)}</s></p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
	`;
	const cta = params.meetingUrl ? { label: 'Join meeting', url: params.meetingUrl } : null;
	const { html, text } = render({ org: params.org, subject, heading, bodyHtml, cta });
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
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(params.recipientName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(params.hostName)}</strong> removed you from <strong>${escapeHtml(params.meetingTitle)}</strong> (${escapeHtml(date)} at ${escapeHtml(time)}).</p>
		<p style="margin:0;font-size:13px;color:#888;">If this was a mistake, reach out to ${escapeHtml(params.hostName)} directly.</p>
	`;
	const { html, text } = render({ org: params.org, subject, heading, bodyHtml });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-removed'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

export async function sendMeetingCancelledEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const labelCap = kindLabelCapitalized(params.kind);
	const subject = `Cancelled: ${params.meetingTitle}`;
	const heading = `${labelCap} cancelled`;
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(params.recipientName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(params.hostName)}</strong> cancelled <strong>${escapeHtml(params.meetingTitle)}</strong> (${escapeHtml(date)} at ${escapeHtml(time)}).</p>
	`;
	const { html, text } = render({ org: params.org, subject, heading, bodyHtml });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-cancelled'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}

interface ReminderParams extends BaseParams {
	minutesUntilStart: number;
}

export async function sendMeetingReminderEmail(params: ReminderParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const lead = params.minutesUntilStart === 1
		? '1 minute'
		: `${params.minutesUntilStart} minutes`;
	const subject = `Starting in ${lead}: ${params.meetingTitle}`;
	const heading = `Your ${label} starts in ${lead}`;
	const bodyHtml = `
		<p style="margin:0 0 12px;">Hi ${escapeHtml(params.recipientName)},</p>
		<p style="margin:0 0 12px;"><strong>${escapeHtml(params.meetingTitle)}</strong> begins at ${escapeHtml(time)}.</p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
	`;
	const cta = params.meetingUrl ? { label: 'Join meeting', url: params.meetingUrl } : null;
	const { html, text } = render({ org: params.org, subject, heading, bodyHtml, cta });
	await sendBrandedEmail({ to: params.to, subject, html, text, org: params.org, categories: ['transactional', 'meeting-reminder'], sendCollection: 'video_meetings', sendId: params.meetingId ?? null });
}
