// server/api/video/send-email-invite.post.ts
// Send video meeting invite via SendGrid email

import sgMail from '@sendgrid/mail';
import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📧 SEND EMAIL INVITE REQUEST');
	console.log('='.repeat(60));

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
			throw createError({
				statusCode: 400,
				message: 'Email address is required',
			});
		}

		// Get SendGrid API key
		const sendgridApiKey = config.sendgridApiKey as string;
		if (!sendgridApiKey) {
			throw createError({
				statusCode: 500,
				message: 'Email service not configured',
			});
		}

		sgMail.setApiKey(sendgridApiKey);

		// Get meeting details from Directus if meetingId provided
		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;
		let meeting: any = null;
		let meetingUrl = `${config.public.siteUrl}/meeting/${roomName}`;
		let meetingTitle = 'Video Meeting';

		if (directusUrl && directusToken && meetingId) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				const meetings = await directus.request(
					readItems('video_meetings', {
						filter: { id: { _eq: meetingId } },
						limit: 1,
					}),
				);

				if (meetings.length > 0) {
					meeting = meetings[0];
					meetingTitle = meeting.title || meetingTitle;
					meetingUrl = meeting.meeting_url || meetingUrl;
				}
			} catch (dbError) {
				console.error('⚠️ Could not fetch meeting details:', dbError);
			}
		}

		console.log(`Sending invite to: ${toEmail}`);
		console.log(`Meeting: ${meetingTitle}`);
		console.log(`URL: ${meetingUrl}`);

		// Format date/time for display
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

		// Build email content
		const fromEmail = config.sendgridFromEmail || 'hello@huestudios.company';
		const fromName = config.sendgridFromName || 'Hue Creative Agency';
		const meetingHost = hostName || meeting?.host_identity || 'Hue Creative Agency';

		const emailSubject = subject || `Video Meeting Invitation: ${meetingTitle}`;

		// HTML email template
		const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meetingTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); border-radius: 12px 12px 0 0; padding: 32px; text-align: center;">
      <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px;">🎥</span>
      </div>
      <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Video Meeting Invitation</h1>
    </div>
    
    <!-- Content -->
    <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
        Hi${toName ? ` ${toName}` : ''},
      </p>
      
      <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
        ${customMessage || `You're invited to a video meeting with ${meetingHost}.`}
      </p>
      
      <!-- Meeting Details Card -->
      <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">${meetingTitle}</h2>
        
        <div style="margin-bottom: 12px;">
          <span style="color: #6b7280; font-size: 14px;">📅 When:</span>
          <span style="color: #374151; font-size: 14px; margin-left: 8px;">${startTimeFormatted}</span>
        </div>
        
        ${endTimeFormatted ? `
        <div style="margin-bottom: 12px;">
          <span style="color: #6b7280; font-size: 14px;">⏱️ Until:</span>
          <span style="color: #374151; font-size: 14px; margin-left: 8px;">${endTimeFormatted}</span>
        </div>
        ` : ''}
        
        <div>
          <span style="color: #6b7280; font-size: 14px;">👤 Host:</span>
          <span style="color: #374151; font-size: 14px; margin-left: 8px;">${meetingHost}</span>
        </div>
      </div>
      
      <!-- Join Button -->
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${meetingUrl}" style="display: inline-block; background: #3B82F6; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Join Video Meeting
        </a>
      </div>
      
      <!-- Meeting Link -->
      <div style="background: #f3f4f6; border-radius: 6px; padding: 12px; margin-bottom: 24px;">
        <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Or copy this link:</p>
        <p style="margin: 0; color: #3B82F6; font-size: 14px; word-break: break-all;">${meetingUrl}</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      
      <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
        This meeting link is unique to you. Don't share it with others unless you want them to join.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; padding: 24px;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px;">
        Sent by ${fromName}
      </p>
    </div>
  </div>
</body>
</html>`;

		// Plain text version
		const textContent = `
Video Meeting Invitation: ${meetingTitle}

Hi${toName ? ` ${toName}` : ''},

${customMessage || `You're invited to a video meeting with ${meetingHost}.`}

MEETING DETAILS
---------------
Title: ${meetingTitle}
When: ${startTimeFormatted}
${endTimeFormatted ? `Until: ${endTimeFormatted}` : ''}
Host: ${meetingHost}

JOIN THE MEETING
----------------
${meetingUrl}

---
Sent by ${fromName}
`;

		// Send email
		const msg = {
			to: toEmail,
			from: {
				email: fromEmail,
				name: fromName,
			},
			subject: emailSubject,
			text: textContent,
			html: htmlContent,
		};

		await sgMail.send(msg);
		console.log('✅ Email sent successfully');

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
				console.log('✅ Meeting record updated');
			} catch (updateError) {
				console.error('⚠️ Could not update meeting record:', updateError);
			}
		}

		return {
			success: true,
			to: toEmail,
			subject: emailSubject,
		};
	} catch (error: any) {
		console.error('❌ SEND EMAIL INVITE ERROR:', error);

		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to send email invite',
		});
	}
});
