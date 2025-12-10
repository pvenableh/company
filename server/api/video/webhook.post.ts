// server/api/video/webhook.post.ts
// Handles Twilio Video room status callbacks

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📡 VIDEO WEBHOOK RECEIVED');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		console.log('Webhook body:', JSON.stringify(body, null, 2));

		const {
			RoomName: roomName,
			RoomSid: roomSid,
			RoomStatus: roomStatus,
			StatusCallbackEvent: eventType,
			ParticipantIdentity: participantIdentity,
			ParticipantStatus: participantStatus,
			Timestamp: timestamp,
			RoomDuration: roomDuration,
		} = body;

		console.log(`Room: ${roomName}`);
		console.log(`Event: ${eventType}`);
		console.log(`Status: ${roomStatus}`);

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		if (!directusUrl || !directusToken) {
			console.log('⚠️ Directus not configured, skipping update');
			return { success: true };
		}

		const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

		// Find the meeting
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: { room_name: { _eq: roomName } },
				limit: 1,
			}),
		);

		if (meetings.length === 0) {
			console.log('⚠️ Meeting not found in Directus');
			return { success: true };
		}

		const meeting = meetings[0] as any;
		console.log(`Found meeting: ${meeting.id}`);

		// Handle different events
		const updateData: any = {};

		switch (eventType) {
			case 'room-created':
				updateData.status = 'scheduled';
				updateData.room_sid = roomSid;
				console.log('Room created');
				break;

			case 'room-ended':
				updateData.status = 'completed';
				updateData.actual_end = new Date().toISOString();
				if (roomDuration) {
					// roomDuration is in seconds
					console.log(`Room duration: ${roomDuration} seconds`);
				}
				console.log('Room ended');
				break;

			case 'participant-connected':
				// Update participant list and count
				const currentParticipants = meeting.participants || [];
				const participantEntry = {
					identity: participantIdentity,
					joinedAt: timestamp || new Date().toISOString(),
					status: 'connected',
				};

				// Check if participant already in list (reconnection)
				const existingIndex = currentParticipants.findIndex((p: any) => p.identity === participantIdentity);
				if (existingIndex >= 0) {
					currentParticipants[existingIndex] = participantEntry;
				} else {
					currentParticipants.push(participantEntry);
				}

				updateData.participants = currentParticipants;
				updateData.participant_count = Math.max(meeting.participant_count || 0, currentParticipants.length);

				// If first participant and meeting not started, mark as in progress
				if (meeting.status === 'scheduled') {
					updateData.status = 'in_progress';
					updateData.actual_start = new Date().toISOString();
				}

				console.log(`Participant connected: ${participantIdentity}`);
				break;

			case 'participant-disconnected':
				// Update participant status
				const participants = meeting.participants || [];
				const pIndex = participants.findIndex((p: any) => p.identity === participantIdentity);
				if (pIndex >= 0) {
					participants[pIndex].status = 'disconnected';
					participants[pIndex].leftAt = timestamp || new Date().toISOString();
					updateData.participants = participants;
				}
				console.log(`Participant disconnected: ${participantIdentity}`);
				break;

			case 'recording-started':
				updateData.recording_enabled = true;
				console.log('Recording started');
				break;

			case 'recording-completed':
				// Recording URL would be in a separate composition webhook
				console.log('Recording completed');
				break;

			default:
				console.log(`Unhandled event: ${eventType}`);
		}

		// Update the meeting record
		if (Object.keys(updateData).length > 0) {
			await directus.request(updateItem('video_meetings', meeting.id, updateData));
			console.log('✅ Meeting updated');
		}

		return { success: true };
	} catch (error: any) {
		console.error('❌ VIDEO WEBHOOK ERROR:', error);
		return { success: false, error: error.message };
	}
});
