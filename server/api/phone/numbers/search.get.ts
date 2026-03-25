// server/api/phone/numbers/search.get.ts
// Search available phone numbers by area code for an organization.

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const query = getQuery(event);
	const orgId = query.orgId as string;
	const areaCode = query.areaCode as string;

	if (!orgId) {
		throw createError({ statusCode: 400, message: 'orgId is required' });
	}
	if (!areaCode || areaCode.length !== 3) {
		throw createError({ statusCode: 400, message: 'areaCode must be a 3-digit area code' });
	}

	try {
		const numbers = await searchPhoneNumbers(orgId, '', areaCode);

		return {
			success: true,
			data: numbers.map((n) => ({
				phoneNumber: n.phoneNumber,
				friendlyName: n.friendlyName,
				locality: n.locality,
				region: n.region,
				capabilities: {
					voice: n.capabilities?.voice,
					sms: n.capabilities?.sms,
					mms: n.capabilities?.mms,
				},
			})),
		};
	} catch (error: any) {
		console.error('[phone/numbers/search] Error:', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to search phone numbers',
		});
	}
});
