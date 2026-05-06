// server/api/video/webhook.post.ts
// Daily.co webhook handler for room/participant events.
// Configure in Daily.co dashboard: https://dashboard.daily.co/developers
// Webhook URL: https://yourdomain.com/api/video/webhook

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readItems, updateItem } from '@directus/sdk';
import {
	getDailyTranscript,
	fetchDailyTranscriptBody,
	vttToPlainText,
} from '~~/server/utils/daily';
import { generateAndSaveMeetingSummary } from '~~/server/utils/meeting-summary';

// Daily signs each webhook with HMAC-SHA256 over `${timestamp}.${rawBody}` and
// returns the digest base64-encoded in `X-Webhook-Signature`. The shared
// secret was returned by the webhook-create call. Without verification anyone
// can forge meeting.ended / transcript.ready-to-download events and corrupt
// our video_meetings rows.
function verifyDailySignature(
	rawBody: string,
	timestamp: string | undefined,
	signature: string | undefined,
	secret: string,
): boolean {
	if (!timestamp || !signature) return false;
	const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64');
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	try { return timingSafeEqual(a, b); } catch { return false; }
}

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
		transcript_id?: string;
		transcriptId?: string;
		[key: string]: any;
	};
	event_ts: number;
}

export default defineEventHandler(async (event) => {
	try {
		// Read raw body FIRST so we can verify the HMAC against the exact bytes
		// Daily signed. Passing the parsed object to HMAC would re-serialize and
		// produce a different digest.
		const rawBody = (await readRawBody(event)) || '';
		const secret = useRuntimeConfig().dailyWebhookHmac;
		const isProd = process.env.NODE_ENV === 'production';

		if (isProd && secret) {
			const sig = getHeader(event, 'x-webhook-signature');
			const ts = getHeader(event, 'x-webhook-timestamp');
			if (!verifyDailySignature(rawBody, ts, sig, secret)) {
				throw createError({ statusCode: 401, statusMessage: 'Invalid webhook signature' });
			}
		} else if (isProd && !secret) {
			console.warn('[video/webhook] DAILY_WEBHOOK_HMAC unset in production — webhook is unauthenticated');
		}

		let body: DailyWebhookEvent;
		try {
			body = (rawBody ? JSON.parse(rawBody) : {}) as DailyWebhookEvent;
		} catch {
			return { success: false, error: 'Invalid JSON' };
		}

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

			case 'participant.joined':
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

			case 'participant.left':
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
				// Daily provides a download URL for the recording. The payload field
				// names vary by webhook version; we accept either `download_link`
				// or fall back to the recording ID for later REST lookup.
				const url = body.payload?.download_link || body.payload?.recording_url || body.payload?.recording_id || null;
				if (url) {
					await directus.request(
						updateItem('video_meetings', meeting.id, { recording_url: String(url) }),
					);
				}
				break;
			}

			case 'transcript.ready-to-download': {
				const transcriptId = body.payload?.transcript_id || body.payload?.transcriptId;
				if (!transcriptId) {
					console.warn('[video/webhook] transcript event without transcript_id', body.payload);
					break;
				}

				try {
					const meta = await getDailyTranscript(transcriptId);
					const downloadUrl = meta.download_link || meta.out_file_url;
					if (!downloadUrl) {
						throw new Error('Transcript metadata missing download_link');
					}

					const vtt = await fetchDailyTranscriptBody(downloadUrl);
					const plain = vttToPlainText(vtt);

					await directus.request(
						updateItem('video_meetings', meeting.id, {
							transcript_id: transcriptId,
							transcript_url: meta.out_file_url || downloadUrl,
							transcript_text: plain,
							summary_status: 'pending',
						}),
					);

					// Fire-and-forget summary generation. We don't block the webhook
					// on Claude latency — the meeting page polls summary_status.
					generateAndSaveMeetingSummary(meeting.id).catch((err: any) => {
						console.error('[video/webhook] summary generation failed', err.message);
					});
				} catch (err: any) {
					console.error('[video/webhook] transcript ingest failed:', err.message);
					await directus.request(
						updateItem('video_meetings', meeting.id, {
							summary_status: 'failed',
							summary_error: `Transcript ingest failed: ${err.message}`,
						}),
					).catch(() => {});
				}
				break;
			}

			default:
				// Unhandled event — acknowledge silently
				break;
		}

		return { success: true };
	} catch (error: any) {
		// Auth failures must propagate so Daily sees a 401 — otherwise a
		// rotated/missing secret silently accepts forged events.
		if (error?.statusCode === 401) throw error;
		console.error('Error processing Daily.co webhook:', error);
		// Return 200 for non-auth errors to prevent Daily.co from retrying.
		return { success: false, error: 'Internal error' };
	}
});
