// server/api/twilio/voice.post.ts
// Reads voice setting from Directus phone_settings

import { createDirectus, rest, staticToken, readItems, createItem } from '@directus/sdk';

// Default voice if none configured
const DEFAULT_VOICE = 'Polly.Matthew-Neural';
const DEFAULT_LANGUAGE = 'en-US';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	console.log('='.repeat(60));
	console.log('📞 TWILIO VOICE WEBHOOK RECEIVED');
	console.log('='.repeat(60));

	try {
		const query = getQuery(event);
		const body = await readBody(event);

		console.log('Query params:', JSON.stringify(query));
		console.log('Body:', JSON.stringify(body));

		const toNumber = body.To;
		const fromNumber = body.From;
		const callSid = body.CallSid;
		const lineId = query.line as string;

		console.log(`Call from: ${fromNumber} to: ${toNumber}, line: ${lineId || 'auto-detect'}`);

		const directusUrl = config.public.directusUrl;
		const directusToken = config.directusServerToken as string;

		console.log(`Connecting to Directus: ${directusUrl}`);
		console.log(`Token available: ${directusToken ? 'Yes' : 'No'}`);

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

		console.log('Fetching phone settings with filter:', JSON.stringify(filter));

		const settings = await directus.request(
			readItems('phone_settings', {
				filter,
				limit: 1,
				fields: ['*', 'call_routes.*', 'business_hours.*'],
			}),
		);

		console.log(`Found ${settings.length} phone settings`);

		if (settings.length === 0) {
			throw new Error('No active phone line configuration found');
		}

		const phoneConfig = settings[0] as any;
		console.log(`Using phone config: ${phoneConfig.line_name} (${phoneConfig.line_identifier})`);

		// Get voice from settings or use default
		const voice = phoneConfig.voice || DEFAULT_VOICE;
		const language = DEFAULT_LANGUAGE;
		console.log(`Using voice: ${voice}`);

		// Check business hours if enabled
		let isOpen = true;
		if (phoneConfig.business_hours_enabled && phoneConfig.business_hours?.length > 0) {
			isOpen = checkBusinessHours(phoneConfig.business_hours, phoneConfig.timezone || 'America/New_York');
			console.log(`Business hours check: ${isOpen ? 'OPEN' : 'CLOSED'}`);
		}

		// Log the call
		try {
			await directus.request(
				createItem('call_logs', {
					call_id: callSid,
					from_number: fromNumber,
					to_number: toNumber,
					event_type: 'incoming',
					timestamp: new Date().toISOString(),
					status: 'published',
				}),
			);
			console.log('✅ Call logged');
		} catch (logError) {
			console.error('⚠️ Failed to log call (non-fatal):', logError);
		}

		// Build TwiML response
		let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

		if (!isOpen) {
			// After hours response
			const afterHoursMessage =
				phoneConfig.after_hours_message ||
				`Thank you for calling ${phoneConfig.company_name}. We are currently closed. Please call back during business hours.`;

			if (phoneConfig.after_hours_audio) {
				const audioUrl = `${directusUrl}/assets/${phoneConfig.after_hours_audio}`;
				twiml += `  <Play>${audioUrl}</Play>\n`;
			} else {
				twiml += `  <Say voice="${voice}" language="${language}">${escapeXml(afterHoursMessage)}</Say>\n`;
			}

			twiml += `  <Say voice="${voice}" language="${language}">Please leave a message after the tone.</Say>\n`;
			twiml += `  <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio/transcription" action="/api/twilio/voicemail-complete?voice=${encodeURIComponent(voice)}" playBeep="true" />\n`;
		} else {
			// Business hours - play greeting and gather input
			const greeting = phoneConfig.greeting_text || `Thank you for calling ${phoneConfig.company_name}.`;

			// Check for greeting audio first
			if (phoneConfig.greeting_audio) {
				const audioUrl = `${directusUrl}/assets/${phoneConfig.greeting_audio}`;
				console.log(`Playing greeting audio: ${audioUrl}`);
				twiml += `  <Play>${audioUrl}</Play>\n`;
			} else {
				twiml += `  <Say voice="${voice}" language="${language}">${escapeXml(greeting)}</Say>\n`;
			}

			const activeRoutes = phoneConfig.call_routes?.filter((r: any) => r.active && r.status === 'published') || [];

			if (activeRoutes.length > 0) {
				const actionUrl = lineId ? `/api/twilio/handle-key?line=${lineId}` : '/api/twilio/handle-key';

				twiml += `  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="10">\n`;
				twiml += `    <Say voice="${voice}" language="${language}">Please make your selection now.</Say>\n`;
				twiml += `  </Gather>\n`;

				const redirectUrl = lineId ? `/api/twilio/voice?line=${lineId}` : '/api/twilio/voice';
				twiml += `  <Say voice="${voice}" language="${language}">We didn't receive any input.</Say>\n`;
				twiml += `  <Redirect>${redirectUrl}</Redirect>\n`;
			} else {
				twiml += `  <Say voice="${voice}" language="${language}">Please hold while we connect your call.</Say>\n`;
				twiml += `  <Hangup/>\n`;
			}
		}

		twiml += '</Response>';

		console.log('✅ Returning TwiML response');
		console.log(twiml);

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return twiml;
	} catch (error: any) {
		console.error('❌ TWILIO VOICE ERROR:', error);
		console.error('Error message:', error.message);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${DEFAULT_VOICE}" language="${DEFAULT_LANGUAGE}">We're experiencing technical difficulties. Please try again later.</Say>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return fallback;
	}
});

function checkBusinessHours(businessHours: any[], timezone: string = 'America/New_York'): boolean {
	try {
		const now = new Date();
		const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
		const dayOfWeek = localTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
		const currentTime = localTime.toTimeString().slice(0, 5);

		const todayHours = businessHours.find(
			(h: any) => h.day_of_week === dayOfWeek && h.is_open && h.status === 'published',
		);

		if (!todayHours) return false;

		const { open_time, close_time } = todayHours;
		const openTime = open_time?.slice(0, 5) || '00:00';
		const closeTime = close_time?.slice(0, 5) || '23:59';

		return currentTime >= openTime && currentTime < closeTime;
	} catch (error) {
		console.error('Error checking business hours:', error);
		return true;
	}
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
