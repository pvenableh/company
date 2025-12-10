// server/api/twilio/voice.post.ts
// Fixed version with proper Directus authentication

import { createDirectus, rest, staticToken, readItems, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	// Log incoming request for debugging
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

		// Create Directus client with static token (NOT login!)
		const directusUrl = config.public.directusUrl;
		const directusToken = config.public.staticToken;

		console.log(`Connecting to Directus: ${directusUrl}`);

		if (!directusUrl || !directusToken) {
			console.error('❌ Missing Directus configuration');
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
			console.error('❌ No active phone line configuration found');
			throw new Error('No active phone line configuration found');
		}

		const phoneConfig = settings[0] as any;
		console.log(`Using phone config: ${phoneConfig.line_name} (${phoneConfig.line_identifier})`);

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
				twiml += `  <Say voice="alice">${escapeXml(afterHoursMessage)}</Say>\n`;
			}

			// Offer voicemail
			twiml += `  <Say voice="alice">Please leave a message after the tone.</Say>\n`;
			twiml += `  <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio/transcription" />\n`;
		} else {
			// Business hours - play greeting and gather input
			const greeting = phoneConfig.greeting_text || `Thank you for calling ${phoneConfig.company_name}.`;

			if (phoneConfig.greeting_audio) {
				const audioUrl = `${directusUrl}/assets/${phoneConfig.greeting_audio}`;
				twiml += `  <Play>${audioUrl}</Play>\n`;
			} else {
				twiml += `  <Say voice="alice">${escapeXml(greeting)}</Say>\n`;
			}

			// Only add Gather if there are active routes
			const activeRoutes = phoneConfig.call_routes?.filter((r: any) => r.active && r.status === 'published') || [];

			if (activeRoutes.length > 0) {
				const actionUrl = lineId ? `/api/twilio/handle-key?line=${lineId}` : '/api/twilio/handle-key';

				twiml += `  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="10">\n`;
				twiml += `    <Say voice="alice">Please make your selection now.</Say>\n`;
				twiml += `  </Gather>\n`;

				// If no input, repeat
				const redirectUrl = lineId ? `/api/twilio/voice?line=${lineId}` : '/api/twilio/voice';
				twiml += `  <Say voice="alice">We didn't receive any input.</Say>\n`;
				twiml += `  <Redirect>${redirectUrl}</Redirect>\n`;
			} else {
				// No routes configured - just play message and hang up
				twiml += `  <Say voice="alice">Please hold while we connect your call.</Say>\n`;
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
		console.error('Error stack:', error.stack);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're experiencing technical difficulties. Please try again later.</Say>
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
		const currentTime = localTime.toTimeString().slice(0, 5); // HH:MM format

		console.log(`Business hours check: ${dayOfWeek} ${currentTime} (${timezone})`);

		const todayHours = businessHours.find(
			(h: any) => h.day_of_week === dayOfWeek && h.is_open && h.status === 'published',
		);

		if (!todayHours) {
			console.log('No business hours found for today or closed');
			return false;
		}

		const { open_time, close_time } = todayHours;

		// Handle time comparison (strip seconds if present)
		const openTime = open_time?.slice(0, 5) || '00:00';
		const closeTime = close_time?.slice(0, 5) || '23:59';

		const isWithinHours = currentTime >= openTime && currentTime < closeTime;
		console.log(`Hours: ${openTime} - ${closeTime}, Current: ${currentTime}, Open: ${isWithinHours}`);

		return isWithinHours;
	} catch (error) {
		console.error('Error checking business hours:', error);
		return true; // Default to open if error
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
