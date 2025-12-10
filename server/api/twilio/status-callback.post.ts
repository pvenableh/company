// server/api/twilio/status-callback.post.ts
// Handles call status updates from Twilio (captures duration for routed calls)

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📊 TWILIO STATUS CALLBACK RECEIVED');
	console.log('='.repeat(60));

	try {
		const body = await readBody(event);

		console.log('Status callback body:', JSON.stringify(body));

		const {
			CallSid: callSid,
			CallStatus: callStatus,
			CallDuration: callDuration,
			From: fromNumber,
			To: toNumber,
		} = body;

		console.log(`Call SID: ${callSid}`);
		console.log(`Status: ${callStatus}`);
		console.log(`Duration: ${callDuration} seconds`);

		// Only update when call is completed
		if (callStatus === 'completed') {
			const directusUrl = config.public.directusUrl;
			const directusToken = config.directusServerToken as string;

			if (!directusUrl || !directusToken) {
				console.error('❌ Missing Directus configuration');
				return { success: false, error: 'Missing Directus configuration' };
			}

			const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

			try {
				// Find existing call_log by call_id
				const callLogs = await directus.request(
					readItems('call_logs', {
						filter: { call_id: { _eq: callSid } },
						sort: ['-date_created'],
						limit: 1,
					}),
				);

				if (Array.isArray(callLogs) && callLogs.length > 0) {
					const log = callLogs[0] as any;
					console.log(`Found call_log: ${log.id}, updating duration...`);

					await directus.request(
						updateItem('call_logs', log.id, {
							call_duration: parseInt(callDuration) || 0,
						}),
					);
					console.log('✅ Call duration updated');
				} else {
					console.log('⚠️ No call_log found for this CallSid');
				}
			} catch (dbError) {
				console.error('❌ Database error:', dbError);
				return { success: false, error: 'Database error' };
			}
		} else {
			console.log(`ℹ️ Ignoring status: ${callStatus} (only processing "completed")`);
		}

		return { success: true };
	} catch (error: any) {
		console.error('❌ Status callback error:', error);
		return { success: false, error: error.message };
	}
});
