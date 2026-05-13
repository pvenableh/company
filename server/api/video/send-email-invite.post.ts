// server/api/video/send-email-invite.post.ts
// Send a one-off video meeting invite via SendGrid. Used by the "Send invite"
// action on an existing meeting (not the initial create-room flow). Pulls
// the meeting row to render org-branded chrome from related_organization.

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';
import { renderOrgEmail, escapeHtml } from '~~/server/utils/email-shell';
import { sendBrandedEmail, fetchOrgBrand } from '~~/server/utils/email-send';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	try {
		const body = await readBody(event);

		const {
			roomName,
			meetingId,
			toEmail,
			toName,
			subject,
			customMessage,
			scheduledStart,
			scheduledEnd,
			hostName,
		} = body;

		if (!toEmail) {
			throw createError({ statusCode: 400, message: 'Email address is required' });
		}

		// Get meeting details from Directus if meetingId provided
		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;
		let meeting: any = null;
		let meetingUrl = `${config.public.siteUrl}/meeting/${roomName}`;
		let meetingTitle = 'Video Meeting';
		let orgId: string | null = null;

		if (directusUrl && directusToken && meetingId) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				const meetings = await directus.request(
					readItems('video_meetings', {
						filter: { id: { _eq: meetingId } },
						fields: ['id', 'title', 'meeting_url', 'host_identity', 'scheduled_start', 'scheduled_end', 'related_organization'] as any,
						limit: 1,
					}),
				);

				if (meetings.length > 0) {
					meeting = meetings[0];
					meetingTitle = meeting.title || meetingTitle;
					meetingUrl = meeting.meeting_url || meetingUrl;
					orgId = typeof meeting.related_organization === 'object'
						? meeting.related_organization?.id
						: meeting.related_organization;
				}
			} catch (dbError) {
				console.error('Could not fetch meeting details:', dbError);
			}
		}

		const formatDateTime = (dateStr: string) => {
			if (!dateStr) return 'TBD';
			const date = new Date(dateStr);
			return date.toLocaleString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZoneName: 'short',
			});
		};

		const startTimeFormatted = formatDateTime(scheduledStart || meeting?.scheduled_start);
		const endTimeFormatted = scheduledEnd || meeting?.scheduled_end
			? formatDateTime(scheduledEnd || meeting?.scheduled_end)
			: null;

		const meetingHost = hostName || meeting?.host_identity || 'Earnest';
		const emailSubject = subject || `Video Meeting Invitation: ${meetingTitle}`;

		const org = orgId ? await fetchOrgBrand(orgId) : null;

		const heading = 'Video meeting invitation';
		const greeting = toName ? `Hi ${escapeHtml(toName)},` : 'Hi there,';
		const bodyMessage = customMessage
			? escapeHtml(customMessage)
			: `You're invited to a video meeting with <strong>${escapeHtml(meetingHost)}</strong>.`;
		const bodyHtml = `
			<p style="margin:0 0 12px;">${greeting}</p>
			<p style="margin:0 0 12px;">${bodyMessage}</p>
			<div style="background:#f7f5f2;padding:16px 20px;border-radius:8px;margin:16px 0;">
				<p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#141210;">${escapeHtml(meetingTitle)}</p>
				<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>When:</strong> ${escapeHtml(startTimeFormatted)}</p>
				${endTimeFormatted ? `<p style="margin:0 0 4px;font-size:14px;color:#444;"><strong>Until:</strong> ${escapeHtml(endTimeFormatted)}</p>` : ''}
				<p style="margin:0;font-size:14px;color:#444;"><strong>Host:</strong> ${escapeHtml(meetingHost)}</p>
			</div>
			<p style="margin:16px 0 0;font-size:12px;color:#888;">This meeting link is unique to you. Don't share it with others unless you want them to join.</p>
		`;

		const { html, text } = renderOrgEmail({
			org,
			subject: emailSubject,
			heading,
			bodyHtml,
			cta: { label: 'Join video meeting', url: meetingUrl },
		});

		const result = await sendBrandedEmail({
			to: toEmail,
			subject: emailSubject,
			html,
			text,
			org,
			categories: ['transactional', 'video-invite'],
		});

		if (!result.sent) {
			throw createError({ statusCode: 500, message: result.reason || 'Failed to send email invite' });
		}

		// Update meeting record if we have one
		if (directusUrl && directusToken && meetingId) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));
			try {
				await directus.request(
					updateItem('video_meetings', meetingId, {
						invite_sent: true,
						invitee_email: toEmail,
						invitee_name: toName || null,
					}),
				);
			} catch (updateError) {
				console.error('Could not update meeting record:', updateError);
			}
		}

		return { success: true, to: toEmail, subject: emailSubject };
	} catch (error: any) {
		console.error('SEND EMAIL INVITE ERROR:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to send email invite',
		});
	}
});
