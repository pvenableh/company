import { createDirectus, rest, readItems, updateItem, staticToken } from '@directus/sdk';

const directus = createDirectus(process.env.DIRECTUS_URL!).with(rest()).with(staticToken(process.env.DIRECTUS_TOKEN!));

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);

		// Only update when call is completed
		if (body.CallStatus === 'completed') {
			const callLogs = await directus.request(
				readItems('call_logs', {
					filter: { call_id: { _eq: body.CallSid } },
					limit: 1,
				}),
			);

			if (Array.isArray(callLogs) && callLogs.length > 0) {
				const log = callLogs[0];

				if (log) {
					await directus.request(
						updateItem('call_logs', log.id, {
							call_duration: parseInt(body.CallDuration) || 0,
						}),
					);
				}
			}
		}

		return { success: true };
	} catch (error) {
		console.error('Status callback error:', error);
		return { success: false };
	}
});
