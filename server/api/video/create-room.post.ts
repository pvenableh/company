// server/api/video/create-room.post.ts
import { createItem, updateItem } from '@directus/sdk';
import twilio from 'twilio';

interface AttendeeInput {
	name?: string;
	email?: string;
	phone?: string;
	invite_method?: 'none' | 'email' | 'sms' | 'both';
}

interface CreateRoomBody {
	title: string;
	description?: string;
	scheduled_start: string;
	duration?: number;
	invitee_name?: string;
	invitee_email?: string;
	invitee_phone?: string;
	invite_method?: 'none' | 'email' | 'sms' | 'both';
	meeting_type?: string;
	waiting_room_enabled?: boolean;
	recording_enabled?: boolean;
	attendees?: AttendeeInput[];
	custom_message?: string;
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();

		// Get session from nuxt-auth-utils
		const session = await getUserSession(event);

		if (!session?.user?.id) {
			throw createError({
				statusCode: 401,
				message: 'Unauthorized - Please sign in',
			});
		}

		const userId = session.user.id;
		const userName = `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim() || 'Host';

		// Get request body
		const body = await readBody<CreateRoomBody>(event);

		if (!body.title) {
			throw createError({
				statusCode: 400,
				message: 'Meeting title is required',
			});
		}

		// Validate Twilio credentials
		if (!config.twilioAccountSid || !config.twilioApiKey || !config.twilioApiSecret) {
			throw createError({
				statusCode: 500,
				message: 'Video service is not configured. Please contact support.',
			});
		}

		// Generate unique room name
		const roomName = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

		// Calculate scheduled end time with validation
		const scheduledStart = new Date(body.scheduled_start);

		// Validate the date is valid
		if (isNaN(scheduledStart.getTime())) {
			throw createError({
				statusCode: 400,
				message: 'Invalid scheduled start time. Please select a valid date and time.',
			});
		}

		const durationMinutes = Number(body.duration) || 30;
		const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

		// Initialize Twilio client
		const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

		// Create Twilio video room
		let twilioRoom;
		try {
			twilioRoom = await twilioClient.video.v1.rooms.create({
				uniqueName: roomName,
				type: 'group',
				maxParticipants: 10,
				statusCallback: `${config.public.siteUrl || 'https://huestudios.company'}/api/video/webhook`,
				statusCallbackMethod: 'POST',
				emptyRoomTimeout: 60,
				unusedRoomTimeout: 60,
			});
		} catch (twilioError: any) {
			console.error('Twilio room creation error:', twilioError);
			throw createError({
				statusCode: 500,
				message: `Failed to create video room: ${twilioError.message}`,
			});
		}

		// Get Directus client with user's session token
		const directus = await getUserDirectus(event);

		// Generate meeting URL
		const meetingUrl = `${config.public.siteUrl || 'https://huestudios.company'}/meeting/${roomName}`;

		// Create video meeting record in Directus
		const videoMeeting = await directus.request(
			createItem('video_meetings', {
				room_name: roomName,
				room_sid: twilioRoom.sid,
				title: body.title,
				description: body.description || null,
				meeting_type: body.meeting_type || 'general',
				duration_minutes: durationMinutes,
				scheduled_start: scheduledStart.toISOString(),
				scheduled_end: scheduledEnd.toISOString(),
				status: 'scheduled',
				host_identity: userName,
				host_user: userId,
				meeting_url: meetingUrl,
				invitee_name: body.invitee_name || null,
				invitee_email: body.invitee_email || null,
				invitee_phone: body.invitee_phone || null,
				invite_method: body.invite_method || 'none',
				invite_sent: false,
				waiting_room_enabled: body.waiting_room_enabled ?? false,
				recording_enabled: body.recording_enabled ?? false,
				booked_via: 'direct',
			}),
		);

		// Create corresponding appointment record
		const appointment = await directus.request(
			createItem('appointments', {
				title: body.title,
				description: body.description || null,
				start_time: scheduledStart.toISOString(),
				end_time: scheduledEnd.toISOString(),
				status: 'confirmed',
				is_video: true,
				video_meeting: videoMeeting.id,
				meeting_link: meetingUrl,
				room_name: roomName,
			}),
		);

		// Link video meeting back to the appointment via related_appointment
		try {
			await directus.request(
				updateItem('video_meetings', videoMeeting.id, {
					related_appointment: appointment.id,
				}),
			);
		} catch (linkError) {
			console.error('Failed to link video meeting to appointment:', linkError);
		}

		// Create attendee records and send invitations
		let inviteSent = false;

		// Handle attendees array from the modal
		const attendeesList = body.attendees?.filter((a) => a.name || a.email) || [];

		// If no attendees array but legacy single invitee fields exist, convert them
		if (attendeesList.length === 0 && (body.invitee_name || body.invitee_email)) {
			attendeesList.push({
				name: body.invitee_name,
				email: body.invitee_email,
				phone: body.invitee_phone,
				invite_method: body.invite_method || 'none',
			});
		}

		for (const attendeeInput of attendeesList) {
			try {
				// Create attendee record in Directus
				await directus.request(
					createItem('video_meeting_attendees', {
						video_meeting: videoMeeting.id,
						attendee_type: 'guest',
						guest_name: attendeeInput.name || null,
						guest_email: attendeeInput.email || null,
						guest_phone: attendeeInput.phone || null,
						status: 'invited',
						invite_method: attendeeInput.invite_method || 'none',
					}),
				);

				const method = attendeeInput.invite_method || 'none';
				if (method === 'none') continue;

				// Send email invitation
				if ((method === 'email' || method === 'both') && attendeeInput.email) {
					await sendEmailInvitation({
						to: attendeeInput.email,
						guestName: attendeeInput.name || 'Guest',
						hostName: userName,
						meetingTitle: body.title,
						meetingUrl,
						scheduledStart,
						durationMinutes,
						config,
					});
					inviteSent = true;
				}

				// Send SMS invitation
				if ((method === 'sms' || method === 'both') && attendeeInput.phone) {
					await sendSmsInvitation({
						to: attendeeInput.phone,
						guestName: attendeeInput.name || 'Guest',
						hostName: userName,
						meetingTitle: body.title,
						meetingUrl,
						scheduledStart,
						twilioClient,
						fromNumber: config.twilioPhoneNumber,
					});
					inviteSent = true;
				}
			} catch (attendeeError) {
				console.error('Failed to process attendee:', attendeeInput.email, attendeeError);
			}
		}

		// Update video meeting with invite_sent status
		if (inviteSent) {
			try {
				await directus.request(
					updateItem('video_meetings', videoMeeting.id, {
						invite_sent: true,
						invite_sent_at: new Date().toISOString(),
					}),
				);
			} catch (updateError) {
				console.error('Failed to update invite_sent status:', updateError);
			}
		}

		return {
			success: true,
			data: {
				meetingId: videoMeeting.id,
				appointmentId: appointment.id,
				roomName,
				roomSid: twilioRoom.sid,
				meetingLink: meetingUrl,
				scheduledStart: scheduledStart.toISOString(),
				scheduledEnd: scheduledEnd.toISOString(),
				inviteSent,
			},
		};
	} catch (error) {
		const err = error as any;
		console.error('Error creating video room:', err);

		throw createError({
			statusCode: err.statusCode || 500,
			message: err.message || 'Failed to create video room',
		});
	}
});

// Helper function to send email invitation
async function sendEmailInvitation(params: {
	to: string;
	guestName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string;
	scheduledStart: Date;
	durationMinutes: number;
	config: any;
}) {
	const { to, guestName, hostName, meetingTitle, meetingUrl, scheduledStart, durationMinutes, config } = params;

	const sgMail = await import('@sendgrid/mail');
	sgMail.default.setApiKey(config.sendgridApiKey);

	const formattedDate = scheduledStart.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});

	const formattedTime = scheduledStart.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZoneName: 'short',
	});

	const message = {
		to,
		from: {
			email: config.sendgridFromEmail,
			name: config.sendgridFromName || 'Hue Creative Agency',
		},
		subject: `Video Meeting Invitation: ${meetingTitle}`,
		html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You're Invited to a Video Meeting</h2>
        <p>Hi ${guestName},</p>
        <p><strong>${hostName}</strong> has invited you to a video meeting.</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">${meetingTitle}</h3>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Time:</strong> ${formattedTime}</p>
          <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
        </div>
        
        <a href="${meetingUrl}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Join Meeting
        </a>
        
        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          Or copy this link: <a href="${meetingUrl}">${meetingUrl}</a>
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">This is an automated message from Hue Creative Agency.</p>
      </div>
    `,
	};

	await sgMail.default.send(message);
}

// Helper function to send SMS invitation
async function sendSmsInvitation(params: {
	to: string;
	guestName: string;
	hostName: string;
	meetingTitle: string;
	meetingUrl: string;
	scheduledStart: Date;
	twilioClient: any;
	fromNumber: string;
}) {
	const { to, guestName, hostName, meetingTitle, meetingUrl, scheduledStart, twilioClient, fromNumber } = params;

	const formattedDateTime = scheduledStart.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});

	const message = `Hi ${guestName}! ${hostName} invited you to "${meetingTitle}" on ${formattedDateTime}. Join here: ${meetingUrl}`;

	await twilioClient.messages.create({
		body: message,
		to,
		from: fromNumber,
	});
}
