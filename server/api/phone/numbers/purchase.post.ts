// server/api/phone/numbers/purchase.post.ts
// Purchase a phone number for an organization and create a phone_settings record.

import { createItem } from '@directus/sdk';

interface PurchaseBody {
	orgId: string;
	phoneNumber: string;
	lineName: string;
	lineIdentifier?: string;
	companyName?: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<PurchaseBody>(event);

	if (!body.orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}
	if (!body.phoneNumber) {
		throw createError({ statusCode: 400, message: 'phoneNumber is required' });
	}
	if (!body.lineName) {
		throw createError({ statusCode: 400, message: 'lineName is required' });
	}

	try {
		const directus = await getUserDirectus(event);

		// Generate a slug from the line name
		const lineIdentifier = body.lineIdentifier
			|| body.lineName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		// Create phone_settings record first so we have an ID for webhook routing
		const phoneSettings = await directus.request(
			createItem('phone_settings', {
				line_name: body.lineName,
				line_identifier: lineIdentifier,
				twilio_phone_number: body.phoneNumber,
				company_name: body.companyName || body.lineName,
				organization: body.orgId,
				active: true,
				status: 'published',
			}),
		) as any;

		// Purchase the number on Twilio and configure webhooks
		const twilioSid = await purchasePhoneNumber(
			body.orgId,
			body.companyName || body.lineName,
			body.phoneNumber,
			phoneSettings.id,
		);

		return {
			success: true,
			data: {
				phoneSettingsId: phoneSettings.id,
				phoneNumber: body.phoneNumber,
				twilioSid,
				lineName: body.lineName,
			},
		};
	} catch (error: any) {
		console.error('[phone/numbers/purchase] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to purchase phone number',
		});
	}
});
