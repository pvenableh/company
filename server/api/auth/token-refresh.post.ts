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

		// Add more robust fetch options with timeout and retry logic
		const response = await $fetch<DirectusRefreshResponse>(`${directusUrl}/auth/refresh`, {
			method: 'POST',
			body: {
				refresh_token: refreshToken,
				mode: 'json',
			},
			headers: {
				'Content-Type': 'application/json',
			},
			// Add timeout to prevent long-hanging requests
			timeout: 10000, // 10 seconds
			// Add retry logic for network issues
			retry: 2,
		});

		if (!response?.data?.access_token) {
			throw createError({
				statusCode: 401,
				message: 'Invalid response from Directus',
			});
		}

		console.log('Server: Token refresh successful');

		// Return the response data with proper expiration
		// Use the expires from Directus response or calculate based on your Directus config
		return {
			success: true,
			data: {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				// Default to 7 days (matching your Directus ACCESS_TOKEN_TTL) if expires not provided
				expires: response.data.expires || Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
			},
		};
	} catch (error) {
		console.error('Server: Token refresh failed:', error);

		// Enhance error handling for different scenarios
		const err = error as any;

		// Check for specific Directus error messages in the response
		const directusError = err.response?.data?.errors?.[0] || {};
		const directusErrorMessage = directusError.message || '';

		// Handle different error types
		if (
			err.response?.status === 401 ||
			directusErrorMessage.includes('expired') ||
			directusErrorMessage.includes('invalid')
		) {
			throw createError({
				statusCode: 401,
				message: 'Refresh token is invalid or expired',
				cause: error,
			});
		}

		// Network-related errors
		if (err.name === 'FetchError' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
			throw createError({
				statusCode: 503,
				message: 'Cannot connect to authentication server',
				cause: error,
			});
		}

		// Generic error fallback
		throw createError({
			statusCode: err.statusCode || err.response?.status || 500,
			message: directusErrorMessage || err.message || 'Token refresh failed',
			cause: error,
		});
	}
});
