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
			};
		}

		const response = await $fetch<DirectusRefreshResponse>(`${directusUrl}/auth/refresh`, {
			method: 'POST',
			body: {
				refresh_token: refreshToken, // Use correct property name (refresh_token, not refreshToken)
				mode: 'json', // Explicitly specify json mode
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

		// Return the response data
		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		console.error('Server: Token refresh failed:', error);

		// Return a structured error response
		throw createError({
			statusCode: (error as { statusCode?: number }).statusCode || 401,
			message: (error as { message?: string }).message || 'Token refresh failed',
		});
	}
});
