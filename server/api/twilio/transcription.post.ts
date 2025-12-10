// server/api/twilio/transcription.post.ts
// Handles transcription callbacks from Twilio

import { createDirectus, rest, staticToken, readItems, updateItem, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📝 TWILIO TRANSCRIPTION RECEIVED');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		console.log('Transcription body:', JSON.stringify(body));

		const {
			CallSid: callSid,
			TranscriptionText: transcriptionText,
			TranscriptionStatus: status,
			RecordingUrl: recordingUrl,
			From: fromNumber,
		} = body;

		console.log(`Call SID: ${callSid}`);
		console.log(`Status: ${status}`);
		console.log(`Transcription: ${transcriptionText}`);

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		if (directusUrl && directusToken && transcriptionText) {
			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				// Find the call log by call_id
				const logs = await directus.request(
					readItems('call_logs', {
						filter: {
							call_id: { _eq: callSid },
						},
						limit: 1,
					}),
				);

				if (logs.length > 0) {
					const logEntry = logs[0] as any;

					// Update with transcription
					await directus.request(
						updateItem('call_logs', logEntry.id, {
							transcription: recordingUrl
								? `${transcriptionText}\n\nRecording: ${recordingUrl}.mp3`
								: transcriptionText,
						}),
					);
					console.log('✅ Call log updated with transcription');
				} else {
					// No existing log found, create a new one
					console.log('⚠️ No existing call log found, creating new entry');
					await directus.request(
						createItem('call_logs', {
							call_id: callSid,
							from_number: fromNumber,
							event_type: 'voicemail',
							transcription: transcriptionText,
							timestamp: new Date().toISOString(),
							status: 'published',
						}),
					);
				}
			} catch (logError) {
				console.error('⚠️ Failed to update transcription:', logError);
			}
		}

		// Return 200 OK (Twilio doesn't expect TwiML for transcription callbacks)
		return { success: true, message: 'Transcription received' };
	} catch (error: any) {
		console.error('❌ TRANSCRIPTION ERROR:', error);

		// Still return 200 to acknowledge receipt
		return { success: false, error: error.message };
	}
});
