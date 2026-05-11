// server/utils/meeting-emails.ts
// Centralized SendGrid templates for video-meeting lifecycle emails fired at
// members (Directus users on the appointments_directus_users junction).
//
// External-guest invites still live inline in create-room.post.ts —
// `sendMeetingInvitedEmail` here is the same template, exported so the
// teammate-notification path can reuse it.

interface BaseParams {
	to: string;
	recipientName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string;
	scheduledStart: Date;
	durationMinutes: number;
	config: any;
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

function joinButton(meetingUrl: string) {
	return `<a href="${meetingUrl}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Join Meeting</a>
	<p style="margin-top: 20px; color: #666; font-size: 14px;">Or copy this link: <a href="${meetingUrl}">${meetingUrl}</a></p>`;
}

export async function sendMeetingInvitedEmail(params: BaseParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const html = shell(`
		<h2 style="color: #333;">You've been added to a video meeting</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> added you to a video meeting.</p>
		${detailsBlock(params.meetingTitle, date, time, params.durationMinutes)}
		${joinButton(params.meetingUrl)}
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Video Meeting: ${params.meetingTitle}`,
		html,
	});
}

export async function sendMeetingTimeChangedEmail(params: BaseParams & { previousStart: Date }) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const prev = formatDateTime(params.previousStart);
	const html = shell(`
		<h2 style="color: #333;">Meeting time changed</h2>
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
}

export async function sendMeetingRemovedEmail(params: MinimalParams) {
	const { date, time } = formatDateTime(params.scheduledStart);
	const html = shell(`
		<h2 style="color: #333;">You were removed from a meeting</h2>
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
	const html = shell(`
		<h2 style="color: #333;">Meeting cancelled</h2>
		<p>Hi ${params.recipientName},</p>
		<p><strong>${params.hostName}</strong> cancelled <strong>${params.meetingTitle}</strong> (${date} at ${time}).</p>
	`);
	await sendViaSendGrid(params.config, {
		to: params.to,
		subject: `Cancelled: ${params.meetingTitle}`,
		html,
	});
}
