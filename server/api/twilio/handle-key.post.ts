import { createDirectus, rest, readItems, createItem, staticToken } from '@directus/sdk';

const directus = createDirectus(process.env.DIRECTUS_URL!).with(rest()).with(staticToken(process.env.DIRECTUS_TOKEN!));

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);
		const digit = body.Digits;
		const callSid = body.CallSid;
		const fromNumber = body.From;
		const toNumber = body.To;

		// Get the matching route
		const routes = await directus.request(
			readItems('call_routes', {
				filter: {
					menu_key: { _eq: digit },
					active: { _eq: true },
					status: { _eq: 'published' },
				},
				limit: 1,
			}),
		);

		let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

		// Type guard: ensure routes is an array with at least one item and route exists
		if (Array.isArray(routes) && routes.length > 0) {
			const route = routes[0];

			// Additional check to ensure route is defined
			if (!route) {
				twiml += '  <Say>Invalid option.</Say>\n';
				twiml += '  <Redirect>/api/twilio/voice</Redirect>\n';
			} else {
				// Log the call
				try {
					await directus.request(
						createItem('call_logs', {
							call_id: callSid,
							from_number: fromNumber,
							to_number: toNumber,
							selected_option: digit,
							routed_to: route.phone_number,
						}),
					);
				} catch (logError) {
					console.error('Failed to log call:', logError);
				}

				// Ensure phone_number exists and format it correctly
				let phoneNumber = route.phone_number || '';
				if (!phoneNumber.startsWith('+')) {
					phoneNumber = '+' + phoneNumber;
				}

				// Forward the call
				twiml += `  <Say>Connecting you to ${route.department || 'the requested department'}.</Say>\n`;
				twiml += `  <Dial timeout="30" callerId="${toNumber}">${phoneNumber}</Dial>\n`;
				twiml += '  <Say>The call could not be completed. Goodbye.</Say>\n';
			}
		} else {
			// Invalid option
			twiml += '  <Say>Invalid option.</Say>\n';
			twiml += '  <Redirect>/api/twilio/voice</Redirect>\n';
		}

		twiml += '</Response>';

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return twiml;
	} catch (error) {
		console.error('Handle key error:', error);

		const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
</Response>`;

		setResponseHeader(event, 'Content-Type', 'text/xml');
		return fallback;
	}
});
