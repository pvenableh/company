import { createDirectus, rest, readItems, updateItem, staticToken } from '@directus/sdk';

const directus = createDirectus(process.env.DIRECTUS_URL!).with(rest()).with(staticToken(process.env.DIRECTUS_TOKEN!));

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);

		// Find the call log by call_id and add transcription
		const callLogs = await directus.request(
			readItems('call_logs', {
				filter: { call_id: { _eq: body.CallSid } },
				limit: 1,
			}),
		);

		if (Array.isArray(callLogs) && callLogs.length > 0 && callLogs[0]) {
			await directus.request(
				updateItem('call_logs', callLogs[0].id, {
					transcription: body.TranscriptionText,
					call_duration: parseInt(body.RecordingDuration) || 0,
				}),
			);
		}

		return { success: true };
	} catch (error) {
		console.error('Transcription callback error:', error);
		return { success: false };
	}
});
