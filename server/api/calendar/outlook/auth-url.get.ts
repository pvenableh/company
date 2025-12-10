// server/api/calendar/outlook/auth-url.get.ts
export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	const clientId = config.azureClientId;

	if (!clientId) {
		throw createError({
			statusCode: 500,
			message: 'Azure/Outlook OAuth not configured',
		});
	}

	try {
		const redirectUri = `${config.public.siteUrl}/api/calendar/outlook/callback`;
		const scopes = [
			'openid',
			'profile',
			'offline_access',
			'Calendars.ReadWrite',
		];

		const params = new URLSearchParams({
			client_id: clientId,
			response_type: 'code',
			redirect_uri: redirectUri,
			scope: scopes.join(' '),
			response_mode: 'query',
			prompt: 'consent',
		});

		const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

		return { url };
	} catch (error: any) {
		console.error('Error generating Outlook auth URL:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to generate auth URL',
		});
	}
});
