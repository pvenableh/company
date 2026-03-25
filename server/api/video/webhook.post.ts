// server/api/video/webhook.post.ts
// Daily.co webhook handler for room/participant events.
// Configure in Daily.co dashboard: https://dashboard.daily.co/developers
// Webhook URL: https://yourdomain.com/api/video/webhook

import { readItems, updateItem } from '@directus/sdk';

interface DailyWebhookEvent {
	type: string;
	event: string;
	payload: {
		room_name?: string;
		participant_id?: string;
		user_name?: string;
		user_id?: string;
		session_id?: string;
		joined_at?: string;
		duration?: number;
		recording_id?: string;
		[key: string]: any;
	};
	event_ts: number;
}

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody<DailyWebhookEvent>(event);

		const roomName = body.payload?.room_name;
		if (!roomName) {
			return { success: true, message: 'No room name in event' };
		}

		const directus = getTypedDirectus();

		// Find the video meeting by room_name
		const meetings = await directus.request(
			readItems('video_meetings', {
				filter: { room_name: { _eq: roomName } },
				fields: ['id', 'actual_start', 'participant_count', 'participants_log'],
				limit: 1,
			}),
		);

		if (!meetings || meetings.length === 0) {
			return { success: true, message: 'Meeting not found' };
		}

		const meeting = meetings[0] as any;
		const now = new Date().toISOString();

		// Handle Daily.co webhook events
		// Docs: https://docs.daily.co/reference/rest-api/webhooks/events
		switch (body.event) {
			case 'meeting.started': {
				await directus.request(
					updateItem('video_meetings', meeting.id, {
						status: 'in_progress',
						actual_start: now,
					}),
				);
				break;
			}

			case 'meeting.ended': {
				let actualDuration = null;
				if (meeting.actual_start) {
					const startTime = new Date(meeting.actual_start);
					actualDuration = Math.round((Date.now() - startTime.getTime()) / 60000);
				}

				await directus.request(
					updateItem('video_meetings', meeting.id, {
						status: 'completed',
						actual_end: now,
						actual_duration_minutes: actualDuration,
					}),
				);
				break;
			}

			case 'meeting.participant-joined': {
				const log = meeting.participants_log || [];
				log.push({
					event: 'connected',
					identity: body.payload.user_name || body.payload.participant_id,
					userId: body.payload.user_id,
					timestamp: new Date(body.event_ts * 1000).toISOString(),
				});

				const updateData: Record<string, any> = {
					participants_log: log,
					participant_count: Math.max((meeting.participant_count || 0) + 1, 1),
				};

				// If first participant, mark meeting as in-progress
				if (!meeting.actual_start) {
					updateData.actual_start = now;
					updateData.status = 'in_progress';
				}

				await directus.request(updateItem('video_meetings', meeting.id, updateData));
				break;
			}

			case 'meeting.participant-left': {
				const log = meeting.participants_log || [];
				log.push({
					event: 'disconnected',
					identity: body.payload.user_name || body.payload.participant_id,
					userId: body.payload.user_id,
					timestamp: new Date(body.event_ts * 1000).toISOString(),
					duration: body.payload.duration,
				});

				await directus.request(
					updateItem('video_meetings', meeting.id, {
						participants_log: log,
					}),
				);
				break;
			}

			case 'recording.ready-to-download': {
				await directus.request(
					updateItem('video_meetings', meeting.id, {
						recording_url: body.payload.recording_id,
					}),
				);
				break;
			}

			default:
				// Unhandled event — acknowledge silently
				break;
		}

		return { success: true };
	} catch (error) {
		console.error('Error processing Daily.co webhook:', error);
		// Return 200 to prevent Daily.co from retrying
		return { success: false, error: 'Internal error' };
	}
});
