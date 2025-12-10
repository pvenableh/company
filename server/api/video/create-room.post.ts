// server/api/video/create-room.post.ts
// Creates a Twilio video room, appointment, and supports multiple attendees

import twilio from 'twilio';
import { createDirectus, rest, createItem, updateItem, staticToken } from '@directus/sdk';
import { getServerSession } from '#auth';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	console.log('📹 Creating video room with multiple attendees...');

	try {
		// Get user session using sidebase/nuxt-auth
		const session = await getServerSession(event);

		if (!session?.user?.id) {
			throw createError({ statusCode: 401, message: 'Unauthorized' });
		}

		const userId = session.user.id;
		const userName = session.user.name || session.user.email?.split('@')[0] || 'Host';
		const accessToken = session.accessToken || session.user.accessToken;

		// Validate required fields
		const {
			title,
			scheduled_start,
			scheduled_end,
			duration = 30,
			meeting_type = 'general',
			description = '',
			custom_message = '',
			is_instant = false,
			waiting_room_enabled = true,
			// Support both single invitee (backwards compat) and multiple attendees
			invitee_name,
			invitee_email,
			invitee_phone,
			invite_method = 'none',
			// New: array of attendees
			attendees = [],
		} = body;

		if (!title) {
			throw createError({ statusCode: 400, message: 'Title is required' });
		}

		// Generate unique room name
		const roomName = `hue-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

		// Create Twilio room
		const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

		let twilioRoom;
		try {
			twilioRoom = await twilioClient.video.v1.rooms.create({
				uniqueName: roomName,
				type: 'group',
				maxParticipants: 50,
				statusCallback: `${config.public.siteUrl}/api/video/webhook`,
				statusCallbackMethod: 'POST',
			});
			console.log('✅ Twilio room created:', twilioRoom.sid);
		} catch (twilioError: any) {
			console.error('Twilio error:', twilioError.message);
			// Continue without Twilio room - we'll create on connect
		}

		// Setup Directus client - use static token for reliable server-side operations
		const directus = createDirectus(config.public.directusUrl)
			.with(rest())
			.with(staticToken(config.directusStaticToken));

		// Calculate times
		const startTime = scheduled_start ? new Date(scheduled_start) : new Date();
		const endTime = scheduled_end ? new Date(scheduled_end) : new Date(startTime.getTime() + duration * 60 * 1000);

		// Meeting link
		const meetingLink = `${config.public.siteUrl}/meeting/${roomName}`;

		// 1. Create the appointment
		let appointment;
		try {
			const appointmentData = {
				title,
				description: description || `Video meeting: ${title}`,
				start_time: startTime.toISOString(),
				end_time: endTime.toISOString(),
				status: 'confirmed',
				is_video: true,
				meeting_link: meetingLink,
				room_name: roomName,
				user_created: userId,
			};

			console.log('Creating appointment...');
			appointment = await directus.request(createItem('appointments', appointmentData));
			console.log('✅ Appointment created:', appointment.id);
		} catch (appointmentError: any) {
			console.warn('Could not create appointment:', appointmentError.message);
			// Continue without appointment
		}

		// 2. Create the video meeting record
		const videoMeetingData: any = {
			title,
			description,
			room_name: roomName,
			room_sid: twilioRoom?.sid || null,
			meeting_link: meetingLink,
			host_user: userId,
			status: 'scheduled',
			scheduled_start: startTime.toISOString(),
			scheduled_end: endTime.toISOString(),
			duration,
			meeting_type,
			waiting_room_enabled,
			is_instant,
			custom_message: custom_message || null,
		};

		if (appointment?.id) {
			videoMeetingData.related_appointment = appointment.id;
		}

		console.log('Creating video meeting...');
		const videoMeeting = await directus.request(createItem('video_meetings', videoMeetingData));
		console.log('✅ Video meeting created:', videoMeeting.id);

		// 3. Link appointment back to video meeting
		if (appointment?.id) {
			try {
				await directus.request(
					updateItem('appointments', appointment.id, {
						video_meeting: videoMeeting.id,
					}),
				);
			} catch (e) {
				console.warn('Could not link appointment:', e);
			}
		}

		// 4. Create host as an attendee
		try {
			await directus.request(
				createItem('video_meeting_attendees', {
					video_meeting: videoMeeting.id,
					attendee_type: 'user',
					directus_user: userId,
					guest_name: userName,
					status: 'admitted', // Host is always admitted
				}),
			);
		} catch (e) {
			console.warn('Could not create host attendee record:', e);
		}

		// 5. Merge single invitee with attendees array for backwards compatibility
		const allAttendees = [...attendees];
		if (invitee_email || invitee_name) {
			allAttendees.push({
				name: invitee_name,
				email: invitee_email,
				phone: invitee_phone,
				invite_method: invite_method,
			});
		}

		// 6. Create attendee records and send invites
		const createdAttendees = [];
		for (const attendee of allAttendees) {
			if (!attendee.email && !attendee.name) continue;

			try {
				const attendeeRecord = await directus.request(
					createItem('video_meeting_attendees', {
						video_meeting: videoMeeting.id,
						attendee_type: 'guest',
						guest_name: attendee.name || null,
						guest_email: attendee.email || null,
						guest_phone: attendee.phone || null,
						status: 'invited',
						invite_method: attendee.invite_method || invite_method,
					}),
				);

				createdAttendees.push(attendeeRecord);

				// Send invites
				const method = attendee.invite_method || invite_method;
				if (method !== 'none') {
					try {
						if ((method === 'email' || method === 'both') && attendee.email) {
							await $fetch('/api/video/send-email-invite', {
								method: 'POST',
								body: {
									meetingId: videoMeeting.id,
									email: attendee.email,
									recipientName: attendee.name,
									meetingTitle: title,
									meetingLink,
									scheduledStart: startTime.toISOString(),
									hostName: userName,
									customMessage: custom_message,
								},
							});

							// Update invite sent
							await directus.request(
								updateItem('video_meeting_attendees', attendeeRecord.id, {
									invite_sent_at: new Date().toISOString(),
								}),
							);

							console.log(`✅ Email invite sent to ${attendee.email}`);
						}

						if ((method === 'sms' || method === 'both') && attendee.phone) {
							await $fetch('/api/video/send-invite', {
								method: 'POST',
								body: {
									meetingId: videoMeeting.id,
									phone: attendee.phone,
									recipientName: attendee.name,
									meetingTitle: title,
									meetingLink,
									scheduledStart: startTime.toISOString(),
									customMessage: custom_message,
								},
							});

							await directus.request(
								updateItem('video_meeting_attendees', attendeeRecord.id, {
									invite_sent_at: new Date().toISOString(),
								}),
							);

							console.log(`✅ SMS invite sent to ${attendee.phone}`);
						}
					} catch (inviteError) {
						console.error(`Failed to send invite to ${attendee.email || attendee.phone}:`, inviteError);
					}
				}
			} catch (attendeeError) {
				console.error(`Failed to create attendee ${attendee.email}:`, attendeeError);
			}
		}

		return {
			success: true,
			data: {
				videoMeeting,
				appointment,
				roomName,
				meetingLink,
				roomSid: twilioRoom?.sid,
				attendees: createdAttendees,
			},
		};
	} catch (error: any) {
		console.error('❌ Create room error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create video meeting',
		});
	}
});
