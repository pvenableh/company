// server/api/calendar/google/auth-url.get.ts
export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();

	const clientId = config.googleClientId;
	const clientSecret = config.googleClientSecret;

	if (!clientId || !clientSecret) {
		throw createError({
			statusCode: 500,
			message: 'Google OAuth not configured',
		});
	}

	try {
		const { google } = await import('googleapis');

		const oauth2Client = new google.auth.OAuth2(
			clientId,
			clientSecret,
			`${config.public.siteUrl}/api/calendar/google/callback`
		);

		const scopes = [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events',
		];

		const url = oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			prompt: 'consent',
		});

		return { url };
	} catch (error: any) {
		console.error('Error generating Google auth URL:', error);
		throw createError({
			statusCode: 500,
			message: error.message || 'Failed to generate auth URL',
		});
	}
});
