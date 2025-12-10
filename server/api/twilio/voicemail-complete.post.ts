// server/api/twilio/voicemail-complete.post.ts
// Handles voicemail completion - UPDATES existing call_log instead of creating new one

import { createDirectus, rest, staticToken, readItems, updateItem, createItem } from '@directus/sdk';

const DEFAULT_VOICE = 'Polly.Matthew-Neural';
const DEFAULT_LANGUAGE = 'en-US';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📧 VOICEMAIL RECORDING COMPLETE');
	console.log('='.repeat(60));

	try {
		const query = getQuery(event);
		const body = await readBody(event);

		// Get voice from query param (passed from handle-key or voice endpoint)
		const voice = (query.voice as string) || DEFAULT_VOICE;
		const language = DEFAULT_LANGUAGE;

		console.log('Voicemail body:', JSON.stringify(body));
		console.log(`Using voice: ${voice}`);

		const {
			CallSid: callSid,
			From: fromNumber,
			To: toNumber,
			RecordingUrl: recordingUrl,
			RecordingDuration: duration,
			RecordingSid: recordingSid,
		} = body;

		console.log(`Call SID: ${callSid}`);
		console.log(`Recording from: ${fromNumber}`);
		console.log(`Recording URL: ${recordingUrl}`);
		console.log(`Duration: ${duration} seconds`);

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		if (directusUrl && directusToken) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				// Find existing call_log by call_id (created by handle-key.post.ts)
				const existingLogs = await directus.request(
					readItems('call_logs', {
						filter: {
							call_id: { _eq: callSid },
						},
						sort: ['-date_created'],
						limit: 1,
					}),
				);

				if (existingLogs.length > 0) {
					// UPDATE existing record with recording info
					const logEntry = existingLogs[0] as any;
					console.log(`Found existing call_log: ${logEntry.id}, updating with recording...`);

					await directus.request(
						updateItem('call_logs', logEntry.id, {
							call_duration: parseInt(duration) || 0,
							transcription: `Recording: ${recordingUrl}.mp3`,
						}),
					);
					console.log('✅ Existing call_log updated with recording');
				} else {
					// No existing log found - create new one (fallback)
					console.log('⚠️ No existing call_log found, creating new entry');
					await directus.request(
						createItem('call_logs', {
							call_id: callSid,
							from_number: fromNumber,
							to_number: toNumber,
							event_type: 'voicemail',
							call_duration: parseInt(duration) || 0,
							transcription: `Recording: ${recordingUrl}.mp3`,
							timestamp: new Date().toISOString(),
							status: 'published',
						}),
					);
					console.log('✅ New voicemail call_log created');
				}
			} catch (logError) {
				console.error('⚠️ Failed to log voicemail:', logError);
			}
		}

		const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${language}">Thank you for your message. We will get back to you as soon as possible. Goodbye.</Say>
  <Hangup/>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return twiml;
	} catch (error: any) {
		console.error('❌ VOICEMAIL COMPLETE ERROR:', error);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${DEFAULT_VOICE}" language="${DEFAULT_LANGUAGE}">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return fallback;
	}
});
