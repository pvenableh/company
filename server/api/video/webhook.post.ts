// server/api/video/webhook.post.ts
import { createDirectus, rest, readItems, updateItem, staticToken } from '@directus/sdk';

interface TwilioRoomEvent {
	RoomName: string;
	RoomSid: string;
	RoomStatus: 'in-progress' | 'completed' | 'failed';
	StatusCallbackEvent:
		| 'room-created'
		| 'room-ended'
		| 'participant-connected'
		| 'participant-disconnected'
		| 'recording-started'
		| 'recording-completed';
	ParticipantIdentity?: string;
	ParticipantSid?: string;
	Timestamp?: string;
	SequenceNumber?: string;
	RecordingSid?: string;
	RecordingUri?: string;
}

export default defineEventHandler(async (event) => {
	try {
		const config = useRuntimeConfig();

		// Parse the webhook body (Twilio sends form data)
		const body = await readBody<TwilioRoomEvent>(event);

		console.log('Twilio video webhook received:', body.StatusCallbackEvent, body.RoomName);

		// Create Directus client
		const directus = createDirectus(config.public.directusUrl)
			.with(rest())
			.with(staticToken(config.directusStaticToken || config.directusServerToken));

		// Find the video meeting by room_name
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: {
					room_name: { _eq: body.RoomName },
				},
				limit: 1,
			}),
		);

		if (!meetings || meetings.length === 0) {
			console.log('Video meeting not found for room:', body.RoomName);
			return { success: true, message: 'Meeting not found' };
		}

		const meeting = meetings[0];
		const now = new Date().toISOString();

		// Handle different webhook events
		switch (body.StatusCallbackEvent) {
			case 'room-created':
				// Room is ready
				await directus.request(
					updateItem('video_meetings', meeting?.id, {
						room_sid: body.RoomSid,
						status: 'scheduled',
					}),
				);
				break;

			case 'participant-connected':
				// First participant joined - meeting started
				const participantsLog = meeting?.participants_log || [];
				participantsLog.push({
					event: 'connected',
					identity: body.ParticipantIdentity,
					sid: body.ParticipantSid,
					timestamp: body.Timestamp || now,
				});

				const updateData: any = {
					participants_log: participantsLog,
					participant_count: Math.max((meeting?.participant_count || 0) + 1, 1),
				};

				// If this is the first participant, set actual_start
				if (!meeting?.actual_start) {
					updateData.actual_start = now;
					updateData.status = 'in_progress';
				}

				await directus.request(updateItem('video_meetings', meeting?.id, updateData));
				break;

			case 'participant-disconnected':
				// Participant left
				const log = meeting?.participants_log || [];
				log.push({
					event: 'disconnected',
					identity: body.ParticipantIdentity,
					sid: body.ParticipantSid,
					timestamp: body.Timestamp || now,
				});

				await directus.request(
					updateItem('video_meetings', meeting?.id, {
						participants_log: log,
					}),
				);
				break;

			case 'room-ended':
				// Meeting ended
				const endLog = meeting?.participants_log || [];
				endLog.push({
					event: 'room-ended',
					timestamp: body.Timestamp || now,
				});

				// Calculate actual duration
				let actualDuration = null;
				if (meeting?.actual_start) {
					const startTime = new Date(meeting.actual_start);
					const endTime = new Date(body.Timestamp || now);
					actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
				}

				await directus.request(
					updateItem('video_meetings', meeting?.id, {
						status: 'completed',
						actual_end: now,
						actual_duration_minutes: actualDuration,
						participants_log: endLog,
					}),
				);
				break;

			case 'recording-started':
				await directus.request(
					updateItem('video_meetings', meeting?.id, {
						recording_enabled: true,
					}),
				);
				break;

			case 'recording-completed':
				await directus.request(
					updateItem('video_meetings', meeting?.id, {
						recording_url: body.RecordingUri,
					}),
				);
				break;

			default:
				console.log('Unhandled webhook event:', body.StatusCallbackEvent);
		}

		// Return 200 OK to acknowledge receipt
		return { success: true };
	} catch (error) {
		console.error('Error processing video webhook:', error);
		// Still return 200 to prevent Twilio from retrying
		return { success: false, error: 'Internal error' };
	}
});
