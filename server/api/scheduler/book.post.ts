// server/api/scheduler/book.post.ts
import { createDirectus, rest, createItem, readItems, readUser, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);
	
	const {
		hostUserId,
		title,
		meetingType,
		scheduledStart,
		scheduledEnd,
		durationMinutes,
		inviteeName,
		inviteeEmail,
		inviteePhone,
		bookingNotes,
	} = body;

	if (!hostUserId || !scheduledStart || !inviteeEmail) {
		throw createError({
			statusCode: 400,
			message: 'Missing required fields: hostUserId, scheduledStart, inviteeEmail',
		});
	}

	const client = createDirectus(config.public.directusUrl).with(rest());
	const staticToken = config.directusServerToken;
	if (staticToken) client.setToken(staticToken);

	try {
		// Get host user info
		const hostUser = await client.request(
			readUser(hostUserId, { fields: ['id', 'first_name', 'last_name', 'email'] })
		);

		// Get host settings
		const settings = await client.request(
			readItems('scheduler_settings', {
				fields: ['*'],
				filter: { user_id: { _eq: hostUserId } },
				limit: 1,
			})
		);
		const hostSettings = settings[0];

		// Generate room name
		const timestamp = Date.now().toString(36);
		const randomStr = Math.random().toString(36).substring(2, 8);
		const roomName = `hue-${timestamp}-${randomStr}`;

		// Calculate times
		const startTime = new Date(scheduledStart);
		const endTime = scheduledEnd 
			? new Date(scheduledEnd) 
			: new Date(startTime.getTime() + (durationMinutes || 30) * 60000);

		// Create video meeting
		const meeting = await client.request(
			createItem('video_meetings', {
				room_name: roomName,
				title: title || `Meeting with ${inviteeName}`,
				description: bookingNotes,
				meeting_type: meetingType || 'consultation',
				status: 'scheduled',
				scheduled_start: startTime.toISOString(),
				scheduled_end: endTime.toISOString(),
				duration_minutes: durationMinutes || 30,
				host_user: hostUserId,
				host_identity: `${hostUser.first_name} ${hostUser.last_name}`,
				invitee_name: inviteeName,
				invitee_email: inviteeEmail,
				invitee_phone: inviteePhone || null,
				invite_method: 'email',
				booked_via: 'public',
				booking_notes: bookingNotes,
				meeting_url: `${config.public.siteUrl}/meeting/${roomName}`,
				reminder_minutes_before: hostSettings?.reminder_time || 60,
			})
		);

		// Create linked appointment
		const appointment = await client.request(
			createItem('appointments', {
				title: title || `Meeting with ${inviteeName}`,
				description: bookingNotes,
				start_time: startTime.toISOString(),
				end_time: endTime.toISOString(),
				status: 'confirmed',
				is_video: true,
				video_meeting: meeting.id,
			})
		);

		// Update meeting with appointment link
		await client.request(
			updateItem('video_meetings', meeting.id, { related_appointment: appointment.id })
		);

		// Send confirmation emails
		if (hostSettings?.send_confirmations !== false) {
			try {
				await $fetch('/api/video/send-email-invite', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						roomName,
						toEmail: inviteeEmail,
						toName: inviteeName,
						scheduledStart: startTime.toISOString(),
						hostName: `${hostUser.first_name} ${hostUser.last_name}`,
						isConfirmation: true,
					},
				});
			} catch (e) {
				console.error('Failed to send invitee confirmation:', e);
			}

			try {
				await $fetch('/api/video/send-email-invite', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						roomName,
						toEmail: hostUser.email,
						toName: `${hostUser.first_name}`,
						scheduledStart: startTime.toISOString(),
						hostName: inviteeName,
						isHostNotification: true,
					},
				});
			} catch (e) {
				console.error('Failed to send host notification:', e);
			}
		}

		// Sync to calendars if enabled
		if (hostSettings?.google_calendar_enabled && hostSettings?.google_refresh_token) {
			try {
				await $fetch('/api/calendar/google/create-event', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						userId: hostUserId,
						title: title || `Meeting with ${inviteeName}`,
						description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${bookingNotes || ''}`,
						startTime: startTime.toISOString(),
						endTime: endTime.toISOString(),
						attendeeEmail: inviteeEmail,
					},
				});
			} catch (e) {
				console.error('Failed to sync to Google Calendar:', e);
			}
		}

		if (hostSettings?.outlook_calendar_enabled && hostSettings?.outlook_refresh_token) {
			try {
				await $fetch('/api/calendar/outlook/create-event', {
					method: 'POST',
					body: {
						meetingId: meeting.id,
						userId: hostUserId,
						title: title || `Meeting with ${inviteeName}`,
						description: `Video meeting: ${config.public.siteUrl}/meeting/${roomName}\n\n${bookingNotes || ''}`,
						startTime: startTime.toISOString(),
						endTime: endTime.toISOString(),
						attendeeEmail: inviteeEmail,
					},
				});
			} catch (e) {
				console.error('Failed to sync to Outlook Calendar:', e);
			}
		}

		return {
			success: true,
			meeting: {
				id: meeting.id,
				roomName,
				title: meeting.title,
				scheduledStart: meeting.scheduled_start,
				meetingUrl: meeting.meeting_url,
			},
		};
	} catch (error: any) {
		console.error('Error creating booking:', error);
		throw createError({
			statusCode: error.status || 500,
			message: error.message || 'Failed to create booking',
		});
	}
});
