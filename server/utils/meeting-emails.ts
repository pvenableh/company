// server/utils/meeting-emails.ts
// Centralized SendGrid templates for meeting/event lifecycle emails fired at
// members (Directus users on the appointments_directus_users junction).
//
// Used for both video meetings and non-video calendar events. When meetingUrl
// is null/empty (non-video events), the "Join meeting" CTA is omitted and the
// copy refers to the entry as an "event" rather than a "meeting".
//
// External-guest invites still live inline in create-room.post.ts —
// `sendMeetingInvitedEmail` here is the same template, exported so the
// teammate-notification path can reuse it.

type MeetingKind = 'meeting' | 'event';

interface BaseParams {
	to: string;
	recipientName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string | null;
	scheduledStart: Date;
	durationMinutes: number;
	config: any;
	/** Defaults to 'meeting' for backward compat. */
	kind?: MeetingKind;
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

async function sendViaSendGrid(config: any, message: { to: string; subject: string; html: string }) {
	const sgMail = await import('@sendgrid/mail');
	sgMail.default.setApiKey(config.sendgridApiKey);
	await sgMail.default.send({
		to: message.to,
		from: {
			email: config.sendgridFromEmail,
			name: config.sendgridFromName || 'Hue Creative Agency',
		},
		subject: message.subject,
		html: message.html,
	});
}

function shell(body: string) {
	return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">${body}<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="color: #999; font-size: 12px;">This is an automated message from Hue Creative Agency.</p></div>`;
}

function detailsBlock(meetingTitle: string, date: string, time: string, durationMinutes: number) {
	return `<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
		<h3 style="margin-top: 0; color: #333;">${meetingTitle}</h3>
		<p><strong>Date:</strong> ${date}</p>
		<p><strong>Time:</strong> ${time}</p>
		<p><strong>Duration:</strong> ${durationMinutes} minutes</p>
	</div>`;
}

function joinButton(meetingUrl: string | null) {
	if (!meetingUrl) return '';
	return `<a href="${meetingUrl}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Join Meeting</a>
	<p style="margin-top: 20px; color: #666; font-size: 14px;">Or copy this link: <a href="${meetingUrl}">${meetingUrl}</a></p>`;
}

function kindLabel(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'event' : 'meeting';
}

function kindLabelCapitalized(kind: MeetingKind | undefined) {
	return kind === 'event' ? 'Event' : 'Meeting';
}

export async function sendMeetingInvitedEmail(params: BaseParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const labelCap = kindLabelCapitalized(params.kind);
	const html = shell(`
		<h2 style="color: #333;">You've been added to a ${label}</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> added you to a ${label}.</p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
		${joinButton(params.meetingUrl)}
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `${labelCap}: ${params.meetingTitle}`,
		html,
	});
}

export async function sendMeetingTimeChangedEmail(params: BaseParams & { previousStart: Date }) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const prev = formatDateTime(params.previousStart);
	const label = kindLabel(params.kind);
	const html = shell(`
		<h2 style="color: #333;">${kindLabelCapitalized(params.kind)} time changed</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> rescheduled <strong>${params.meetingTitle}</strong>.</p>
		<p style="color: #666;"><s>${prev.date} at ${prev.time}</s></p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
		${joinButton(params.meetingUrl)}
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Rescheduled: ${params.meetingTitle}`,
		html,
	});
}

interface MinimalParams {
	to: string;
	recipientName: string;
	hostName: string;
	meetingTitle: string;
	scheduledStart: Date;
	config: any;
	/** Defaults to 'meeting' for backward compat. */
	kind?: MeetingKind;
}

export async function sendMeetingRemovedEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const html = shell(`
		<h2 style="color: #333;">You were removed from a ${label}</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> removed you from <strong>${params.meetingTitle}</strong> (${date} at ${time}).</p>
		<p style="color: #666; font-size: 14px;">If this was a mistake, reach out to ${params.hostName} directly.</p>
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Removed: ${params.meetingTitle}`,
		html,
	});
}

export async function sendMeetingCancelledEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const label = kindLabel(params.kind);
	const html = shell(`
		<h2 style="color: #333;">${kindLabelCapitalized(params.kind)} cancelled</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> cancelled <strong>${params.meetingTitle}</strong> (${date} at ${time}).</p>
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Cancelled: ${params.meetingTitle}`,
		html,
	});
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
	const html = shell(`
		<h2 style="color: #333;">Your ${label} starts in ${lead}</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.meetingTitle}</strong> begins at ${time}.</p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
		${joinButton(params.meetingUrl)}
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Starting in ${lead}: ${params.meetingTitle}`,
		html,
	});
}
