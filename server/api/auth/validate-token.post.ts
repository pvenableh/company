// server/api/auth/validate-token.post.ts

// Define the expected response type from Directus /users/me endpoint
interface DirectusUserMeResponse {
	id: string;
	email?: string;
	first_name?: string;
	last_name?: string;
	[key: string]: any;
}

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);
		const { token } = body;

		if (!token) {
			return {
				valid: false,
				error: 'No token provided',
			};
		}

		const config = useRuntimeConfig();
		const directusUrl = config.public.directusUrl;

		// Test the token by making a simple request to Directus
		try {
			console.log('Server: Validating token...');

			const response = await $fetch<DirectusUserMeResponse>(`${directusUrl}/users/me`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				query: {
					fields: 'id,email,first_name,last_name',
				},
				timeout: 5000,
				// Don't retry on 401s
				retry: 0,
			});

			// Directus /users/me returns the user object directly, not wrapped in a data property
			if (response && response.id) {
				console.log('Server: Token validation successful');
				return {
					valid: true,
					user: {
						id: response.id,
						email: response.email || 'unknown@example.com',
					},
				};
			}

			return {
				valid: false,
				error: 'Invalid response from Directus',
			};
		} catch (directusError) {
			console.log('Server: Token validation failed:', directusError);

			const err = directusError as any;

			// Check if it's a 401 (token invalid/expired)
			if (err.status === 401 || err.response?.status === 401) {
				return {
					valid: false,
					error: 'Token expired or invalid',
				};
			}

			// Check for network errors
			if (err.name === 'FetchError' || err.code === 'ECONNREFUSED') {
				return {
					valid: false,
					error: 'Cannot connect to authentication server',
				};
			}

			// Other errors - assume token is invalid to be safe
			return {
				valid: false,
				error: 'Token validation failed',
			};
		}
	} catch (error) {
		console.error('Server: Token validation error:', error);

		return {
			valid: false,
			error: 'Server error during validation',
		};
	}
});
