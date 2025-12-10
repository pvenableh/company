// server/api/twilio/handle-key.post.ts
// Reads voice setting from Directus phone_settings

import { createDirectus, rest, staticToken, readItems, createItem } from '@directus/sdk';

const DEFAULT_VOICE = 'Polly.Matthew-Neural';
const DEFAULT_LANGUAGE = 'en-US';

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

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		if (!directusUrl || !directusToken) {
			throw new Error('Missing Directus configuration');
		}

		const directus = createDirectus(directusUrl).with(rest()).with(staticToken(directusToken));

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

		// Get voice from settings or use default
		const voice = phoneConfig.voice || DEFAULT_VOICE;
		const language = DEFAULT_LANGUAGE;
		console.log(`Using voice: ${voice}`);

		const route = phoneConfig.call_routes?.find(
			(r: any) => r.menu_key === digit && r.active && r.status === 'published',
		);

		let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

		if (route) {
			console.log(`✅ Found route: ${route.department} -> ${route.phone_number}`);

			try {
				await directus.request(
					createItem('call_logs', {
						call_id: callSid,
						from_number: fromNumber,
						to_number: toNumber,
						selected_option: digit,
						routed_to: route.phone_number,
						event_type: route.phone_number === 'voicemail' ? 'voicemail' : 'incoming',
						timestamp: new Date().toISOString(),
						status: 'published',
					}),
				);
				console.log('✅ Call logged with route');
			} catch (logError) {
				console.error('⚠️ Failed to log call:', logError);
			}

			// Check if this is a voicemail route
			if (route.phone_number === 'voicemail' || route.department.toLowerCase() === 'voicemail') {
				console.log('📧 Voicemail route selected');

				twiml += `  <Say voice="${voice}" language="${language}">Please leave your message after the tone. Press the pound key when finished, or simply hang up.</Say>\n`;
				twiml += `  <Record \n`;
				twiml += `    maxLength="120" \n`;
				twiml += `    finishOnKey="#" \n`;
				twiml += `    transcribe="true" \n`;
				twiml += `    transcribeCallback="/api/twilio/transcription" \n`;
				twiml += `    action="/api/twilio/voicemail-complete?voice=${encodeURIComponent(voice)}" \n`;
				twiml += `    playBeep="true"\n`;
				twiml += `  />\n`;
				twiml += `  <Say voice="${voice}" language="${language}">We did not receive a recording. Goodbye.</Say>\n`;
			} else {
				// Regular phone routing
				let phoneNumber = route.phone_number;
				if (!phoneNumber.startsWith('+')) {
					phoneNumber = '+1' + phoneNumber.replace(/\D/g, '');
				}

				console.log(`Dialing: ${phoneNumber}`);

				twiml += `  <Say voice="${voice}" language="${language}">Connecting you to ${escapeXml(route.department)}. Please hold.</Say>\n`;
				twiml += `  <Dial timeout="30" callerId="${toNumber}">\n`;
				twiml += `    <Number>${phoneNumber}</Number>\n`;
				twiml += `  </Dial>\n`;
				twiml += `  <Say voice="${voice}" language="${language}">The call could not be completed. Please try again later. Goodbye.</Say>\n`;
			}
		} else {
			console.log(`❌ Invalid option: ${digit}`);

			twiml += `  <Say voice="${voice}" language="${language}">That is not a valid option.</Say>\n`;

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

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${DEFAULT_VOICE}" language="${DEFAULT_LANGUAGE}">We're experiencing technical difficulties. Please try again later.</Say>
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
