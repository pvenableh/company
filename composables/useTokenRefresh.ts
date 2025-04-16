// composables/useTokenRefresh.ts

// Define our custom session type
interface DirectusSession {
	directusToken?: string;
	refreshToken?: string;
	user?: {
		id: string;
		email: string;
		first_name?: string;
		last_name?: string;
		avatar?: string;
		role?: string;
		organizationIds?: any[];
		[key: string]: any;
	};
	expires?: string;
	[key: string]: any;
}

export function useTokenRefresh() {
	const { client } = useDirectusClient();
	const config = useRuntimeConfig();
	const { data: authData } = useAuth();

	const refreshToken = async (): Promise<string | null> => {
		try {
			const session = authData.value as DirectusSession | null | undefined;

			if (!session?.refreshToken) {
				console.error('No refresh token available');
				return null;
			}

			// Define the response type
			interface RefreshResponse {
				data: {
					access_token: string;
					refresh_token: string;
					expires: number;
				};
			}

			// Use Fetch to refresh the token
			const response = await $fetch<RefreshResponse>(`${config.public.directusUrl}/auth/refresh`, {
				method: 'POST',
				body: {
					refresh_token: session.refreshToken,
					mode: 'json',
				},
			});

			if (response?.data?.access_token) {
				// Update the client with the new token
				if (client.value) {
					client.value.setToken(response.data.access_token);
				}

				// Store the new token in localStorage for persistence
				if (import.meta.client) {
					try {
						// Manually store in localStorage since we can't safely use the composable
						localStorage.setItem('directus_auth_token', response.data.access_token);
						localStorage.setItem('directus_refresh_token', response.data.refresh_token);
					} catch (err) {
						console.error('Error saving refreshed token to localStorage:', err);
					}
				}

				return response.data.access_token;
			}

			return null;
		} catch (error) {
			console.error('Token refresh failed:', error);
			return null;
		}
	};

	return {
		refreshToken,
	};
}
