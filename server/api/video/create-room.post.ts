// server/api/video/create-room.post.ts
// Creates a new Twilio Video room and stores it in Directus

import { createDirectus, rest, staticToken, createItem, updateItem } from '@directus/sdk';
import twilio from 'twilio';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('🎥 CREATE VIDEO ROOM REQUEST');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		const {
			title,
			description,
			meetingType = 'general',
			hostName,
			hostUserId,
			scheduledStart,
			scheduledEnd,
			durationMinutes = 30,
			maxParticipants = 10,
			recordingEnabled = false,
			password,
			relatedContact,
			relatedOrganization,
			relatedAppointment,
			inviteeEmail,
			inviteePhone,
			inviteeName,
			inviteMethod = 'email',
			createAppointment = false,
		} = body;

		// Generate unique room name
		const roomName = `hue-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

		console.log(`Creating room: ${roomName}`);
		console.log(`Title: ${title}`);
		console.log(`Host: ${hostName}`);
		console.log(`Type: ${meetingType}`);

		// Initialize Twilio client
		const twilioAccountSid = config.twilioAccountSid as string;
		const twilioApiKey = config.twilioApiKey as string;
		const twilioApiSecret = config.twilioApiSecret as string;

		let roomSid = null;

		// Only create Twilio room if API keys are configured
		if (twilioAccountSid && twilioApiKey && twilioApiSecret) {
			try {
				const twilioClient = twilio(twilioApiKey, twilioApiSecret, { accountSid: twilioAccountSid });

				// Create Twilio Video room
				const room = await twilioClient.video.v1.rooms.create({
					uniqueName: roomName,
					type: maxParticipants <= 4 ? 'peer-to-peer' : 'group',
					maxParticipants: maxParticipants,
					recordParticipantsOnConnect: recordingEnabled,
					statusCallback: `${config.public.siteUrl}/api/video/webhook`,
					statusCallbackMethod: 'POST',
				});

				roomSid = room.sid;
				console.log(`✅ Twilio room created: ${roomSid}`);
			} catch (twilioError: any) {
				console.error('⚠️ Twilio room creation failed:', twilioError.message);
				// Continue without Twilio room - meeting URL will still work
			}
		} else {
			console.log('ℹ️ Twilio Video not configured, creating meeting without Twilio room');
		}

		// Generate meeting URL
		const meetingUrl = `${config.public.siteUrl}/meeting/${roomName}`;

		// Store in Directus
		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		let meetingRecord: any = null;
		let appointmentRecord: any = null;

		if (directusUrl && directusToken) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				// Create video meeting record
				meetingRecord = await directus.request(
					createItem('video_meetings', {
						room_name: roomName,
						room_sid: roomSid,
						title: title || 'Video Meeting',
						description,
						meeting_type: meetingType,
						host_identity: hostName,
						host_user: hostUserId || null,
						scheduled_start: scheduledStart || null,
						scheduled_end: scheduledEnd || null,
						duration_minutes: durationMinutes,
						max_participants: maxParticipants,
						recording_enabled: recordingEnabled,
						meeting_url: meetingUrl,
						password: password || null,
						related_contact: relatedContact || null,
						related_organization: relatedOrganization || null,
						related_appointment: relatedAppointment || null,
						invitee_email: inviteeEmail || null,
						invitee_phone: inviteePhone || null,
						invitee_name: inviteeName || null,
						invite_method: inviteMethod,
						invite_sent: false,
						status: 'scheduled',
					}),
				);
				console.log('✅ Video meeting saved to Directus');

				// Optionally create linked appointment
				if (createAppointment && scheduledStart) {
					const endTime = scheduledEnd || new Date(new Date(scheduledStart).getTime() + durationMinutes * 60000).toISOString();
					
					appointmentRecord = await directus.request(
						createItem('appointments', {
							title: title || 'Video Meeting',
							description,
							start_time: scheduledStart,
							end_time: endTime,
							status: 'pending',
							is_video: true,
							video_meeting: meetingRecord.id,
						}),
					);

					// Link appointment back to meeting
					await directus.request(
						updateItem('video_meetings', meetingRecord.id, {
							related_appointment: appointmentRecord.id,
						}),
					);

					console.log('✅ Linked appointment created');
				}
			} catch (dbError) {
				console.error('⚠️ Failed to save to Directus:', dbError);
			}
		}

		return {
			success: true,
			room: {
				name: roomName,
				sid: roomSid,
				url: meetingUrl,
				title: title || 'Video Meeting',
				meetingType,
				maxParticipants,
				recordingEnabled,
				hasPassword: !!password,
			},
			meeting: meetingRecord,
			appointment: appointmentRecord,
		};
	} catch (error: any) {
		console.error('❌ CREATE ROOM ERROR:', error);

		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to create video room',
		});
	}
});
