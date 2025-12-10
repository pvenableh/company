import { createDirectus, rest, readItems, staticToken } from '@directus/sdk';

const directus = createDirectus(process.env.DIRECTUS_URL!).with(rest()).with(staticToken(process.env.DIRECTUS_TOKEN!));

export default defineEventHandler(async (event) => {
	try {
		// Get phone settings - FILTER BY STATUS
		const settings = await directus.request(
			readItems('phone_settings', {
				filter: {
					active: { _eq: true },
					status: { _eq: 'published' }, // ✅ Added status filter
				},
				limit: 1,
				fields: ['*', 'greeting_audio.*', 'business_hours.*', 'call_routes.*'],
			}),
		);

		// Type guard
		if (!Array.isArray(settings) || settings.length === 0) {
			const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No active phone line configuration found. Please contact support.</Say>
</Response>`;
			setResponseHeader(event, 'Content-Type', 'text/xml');
			return fallback;
		}

		const config = settings[0];

		// Check business hours if enabled
		if (config?.business_hours_enabled) {
			const isOpen = await checkBusinessHours(config?.timezone, config.business_hours);

			if (!isOpen) {
				// Outside business hours - go to voicemail/after hours message
				const afterHoursMsg =
					config.after_hours_message ||
					'Thank you for calling. Our office is currently closed. Please call back during business hours.';

				const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(afterHoursMsg)}</Say>
  <Redirect>/api/twilio/voicemail</Redirect>
</Response>`;

				setResponseHeader(event, 'Content-Type', 'text/xml');
				return twiml;
			}
		}

		// Get active call routes - filter by status
		const routes = (config?.call_routes || []).filter((route: any) => route.active && route.status === 'published');

		// Build greeting
		let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
		twiml += '  <Gather numDigits="1" action="/api/twilio/handle-key" timeout="5">\n';

		// Priority: 1) Custom audio, 2) Custom text, 3) Auto-generated from routes
		if (config?.greeting_audio) {
			// Use uploaded audio file
			const audioUrl = `${process.env.DIRECTUS_URL}/assets/${config?.greeting_audio}`;
			twiml += `    <Play>${audioUrl}</Play>\n`;
		} else if (config?.greeting_text) {
			// Use custom text greeting
			twiml += `    <Say voice="Polly.Joanna">${escapeXml(config.greeting_text)}</Say>\n`;
		} else {
			// Auto-generate from company name and routes
			let autoGreeting = `Welcome to ${config?.company_name || 'our company'}. `;
			routes.forEach((route: any) => {
				autoGreeting += `Press ${route.menu_key} for ${route.department}. `;
			});
			twiml += `    <Say voice="Polly.Joanna">${escapeXml(autoGreeting)}</Say>\n`;
		}

		twiml += '  </Gather>\n';
		twiml += "  <Say>We didn't receive a selection.</Say>\n";
		twiml += '  <Redirect>/api/twilio/voice</Redirect>\n';
		twiml += '</Response>';

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return twiml;
	} catch (error) {
		console.error('Twilio voice error:', error);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return fallback;
	}
});

// Helper function to check if current time is within business hours
async function checkBusinessHours(timezone: string = 'America/New_York', businessHours?: any[]): Promise<boolean> {
	const now = new Date();

	// Convert to the business timezone
	const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
	const dayOfWeek = localTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
	const currentTime = localTime.toTimeString().slice(0, 5); // HH:MM format

	// If business hours are already loaded (from the fields parameter), use them
	if (businessHours && Array.isArray(businessHours)) {
		const todayHours = businessHours.find(
			(h: any) => h.day_of_week === dayOfWeek && h.is_open && h.status === 'published',
		);

		if (!todayHours || !todayHours.open_time || !todayHours.close_time) {
			return false;
		}

		const openTime = todayHours.open_time.slice(0, 5); // Get HH:MM from HH:MM:SS
		const closeTime = todayHours.close_time.slice(0, 5);

		return currentTime >= openTime && currentTime < closeTime;
	}

	return false;
}

// Helper to escape XML special characters
function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
