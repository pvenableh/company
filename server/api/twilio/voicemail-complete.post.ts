// server/api/twilio/voicemail-complete.post.ts
// Handles voicemail completion, reads voice from query param

import { createDirectus, rest, staticToken, createItem } from '@directus/sdk';

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

		console.log(`Recording from: ${fromNumber}`);
		console.log(`Recording URL: ${recordingUrl}`);
		console.log(`Duration: ${duration} seconds`);

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		if (directusUrl && directusToken) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
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
				console.log('✅ Voicemail logged to Directus');
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
