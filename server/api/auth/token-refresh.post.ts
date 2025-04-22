// server/api/auth/token-refresh.post.ts

/**
 * Server-side proxy for token refresh
 * This avoids CORS issues by running on the same domain as the frontend
 */
export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);
		const { refreshToken } = body;

		if (!refreshToken) {
			throw createError({
				statusCode: 400,
				message: 'Refresh token is required',
			});
		}

		const config = useRuntimeConfig();
		const directusUrl = config.public.directusUrl;

		console.log('Server: Attempting token refresh via proxy');

		// Call Directus directly using the refresh token
		interface DirectusRefreshResponse {
			data: {
				access_token: string;
				refresh_token: string;
				expires?: number;
			};
		}

		const response = await $fetch<DirectusRefreshResponse>(`${directusUrl}/auth/refresh`, {
			method: 'POST',
			body: {
				refresh_token: refreshToken, // Using correct property name per Directus docs
				mode: 'json', // Explicitly specify json mode as per Directus docs
			},
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response?.data?.access_token) {
			throw createError({
				statusCode: 401,
				message: 'Invalid response from Directus',
			});
		}

		console.log('Server: Token refresh successful');

		// Return the response data with proper expiration
		return {
			success: true,
			data: {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				expires: response.data.expires || Math.floor(Date.now() / 1000) + 15 * 60, // Default to 15 minutes if not provided
			},
		};
	} catch (error) {
		console.error('Server: Token refresh failed:', error);

		// Check if it's a Directus-specific error
		if ((error as { response?: { status?: number } })?.response?.status === 401) {
			throw createError({
				statusCode: 401,
				message: 'Refresh token is invalid or expired',
			});
		}

		// Return a structured error response
		throw createError({
			statusCode: (error as { statusCode?: number }).statusCode || 401,
			message: (error as { message?: string }).message || 'Token refresh failed',
		});
	}
});
