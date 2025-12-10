// server/api/twilio/handle-key.post.ts
// Fixed version with proper Directus authentication

import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📞 TWILIO HANDLE-KEY WEBHOOK RECEIVED');
	console.log('='.repeat(60));

	try {
		const query = getQuery(event);
		const body = await readBody(event);

		const digit = body.Digits;
		const callSid = body.CallSid;
		const fromNumber = body.From;
		const toNumber = body.To;
		const lineId = query.line as string;

		console.log(`Digit pressed: ${digit}, Call SID: ${callSid}`);
		console.log(`From: ${fromNumber}, To: ${toNumber}, Line: ${lineId || 'auto-detect'}`);

		// Create Directus client with static token
		const directusUrl = config.public.directusUrl;
		const directusToken = config.public.staticToken;

		if (!directusUrl || !directusToken) {
			throw new Error('Missing Directus configuration');
		}

		const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

		// Build filter for phone settings
		let filter: any = {
			active: { _eq: true },
			status: { _eq: 'published' },
		};

		if (lineId) {
			filter.line_identifier = { _eq: lineId };
		} else if (toNumber) {
			filter.twilio_phone_number = { _eq: toNumber };
		}

		const settings = await directus.request(
			readItems('phone_settings', {
				filter,
				limit: 1,
				fields: ['*', 'call_routes.*'],
			}),
		);

		if (settings.length === 0) {
			throw new Error('No active phone line configuration found');
		}

		const phoneConfig = settings[0] as any;
		console.log(`Using config: ${phoneConfig.line_name}`);

		// Find the matching route
		const route = phoneConfig.call_routes?.find(
			(r: any) => r.menu_key === digit && r.active && r.status === 'published',
		);

		let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

		if (route) {
			console.log(`✅ Found route: ${route.department} -> ${route.phone_number}`);

			// Log the call with selected option
			try {
				await directus.request(
					createItem('call_logs', {
						call_id: callSid,
						from_number: fromNumber,
						to_number: toNumber,
						selected_option: digit,
						routed_to: route.phone_number,
						event_type: 'incoming',
						timestamp: new Date().toISOString(),
						status: 'published',
					}),
				);
				console.log('✅ Call logged with route');
			} catch (logError) {
				console.error('⚠️ Failed to log call:', logError);
			}

			// Format phone number (ensure it has +)
			let phoneNumber = route.phone_number;
			if (!phoneNumber.startsWith('+')) {
				phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
			}

			console.log(`Dialing: ${phoneNumber}`);

			twiml += `  <Say voice="alice">Connecting you to ${escapeXml(route.department)}. Please hold.</Say>\n`;
			twiml += `  <Dial timeout="30" callerId="${toNumber}">\n`;
			twiml += `    <Number>${phoneNumber}</Number>\n`;
			twiml += `  </Dial>\n`;
			twiml += `  <Say voice="alice">The call could not be completed. Please try again later. Goodbye.</Say>\n`;
		} else {
			console.log(`❌ Invalid option: ${digit}`);

			twiml += `  <Say voice="alice">That is not a valid option.</Say>\n`;

			// Redirect back to main menu
			const redirectUrl = lineId ? `/api/twilio/voice?line=${lineId}` : '/api/twilio/voice';
			twiml += `  <Redirect>${redirectUrl}</Redirect>\n`;
		}

		twiml += '</Response>';

		console.log('✅ Returning TwiML:');
		console.log(twiml);

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return twiml;
	} catch (error: any) {
		console.error('❌ HANDLE-KEY ERROR:', error);
		console.error('Stack:', error.stack);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return fallback;
	}
});

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
