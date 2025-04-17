// composables/useDirectusClient.ts
import { createDirectus, rest, authentication, realtime } from '@directus/sdk';

export function useDirectusClient() {
	const { data: session, status, getSession } = useAuth();
	const config = useRuntimeConfig();
	const isInitializing = ref(true);
	const refreshInProgress = ref(false);
	const lastRefreshTime = ref<number | null>(null);

	// Create Directus client with auth token from session
	const client = computed(() => {
		const directusUrl = config.public.directusUrl;
		// Use json mode explicitly for authentication
		const directusClient = createDirectus(directusUrl).with(authentication('json')).with(rest()).with(realtime());

		// If we have a session with token, set it in the client
		if (session.value?.directusToken) {
			// Set the token for authentication
			directusClient.setToken(session.value.directusToken);

			// Also store in localStorage for cross-tab consistency
			if (import.meta.client) {
				try {
					localStorage.setItem('auth_token', session.value.directusToken);
				} catch (error) {
					console.warn('Could not store token in localStorage:', error);
				}
			}
		} else if (import.meta.client) {
			// Try to get token from localStorage as fallback
			try {
				const storedToken = localStorage.getItem('auth_token');
				if (storedToken) {
					directusClient.setToken(storedToken);
				}
			} catch (error) {
				console.warn('Could not retrieve token from localStorage:', error);
			}
		}

		return directusClient;
	});

	// Helper to check if client is authenticated and ready
	const isAuthenticated = computed(() => {
		return !!session.value?.directusToken || (import.meta.client && !!localStorage.getItem('auth_token'));
	});

	// Refresh the session
	const refreshSession = async () => {
		// Prevent concurrent refreshes
		if (refreshInProgress.value) {
			console.log('Refresh already in progress, skipping duplicate request');
			return null;
		}

		refreshInProgress.value = true;

		try {
			console.log('Refreshing session...');
			const result = await getSession();
			lastRefreshTime.value = Date.now();

			if (result?.directusToken) {
				// Update the token in localStorage
				if (import.meta.client) {
					try {
						localStorage.setItem('auth_token', result.directusToken);
					} catch (error) {
						console.warn('Could not update token in localStorage:', error);
					}
				}
			}

			return result;
		} catch (error) {
			console.error('Failed to refresh session:', error);
			return null;
		} finally {
			refreshInProgress.value = false;
		}
	};

	// Method to make authenticated requests with automatic refresh on 401
	interface AuthRequestFn {
		(client: ReturnType<typeof createDirectus>): Promise<any>;
	}

	interface AuthRequestError extends Error {
		status?: number;
		errors?: { extensions?: { code?: string } }[];
		message: string;
	}

	const authRequest = async (requestFn: AuthRequestFn): Promise<any> => {
		try {
			// First attempt with current token
			return await requestFn(client.value);
		} catch (error: unknown) {
			const authError = error as AuthRequestError;

			// If unauthorized (401), try to refresh the token and retry
			if (
				authError.status === 401 ||
				(authError.errors && authError.errors.some((e) => e.extensions?.code === 'INVALID_CREDENTIALS')) ||
				authError.message?.includes('invalid token')
			) {
				console.log('Got 401 error, attempting to refresh token...');

				// Try to refresh the session
				const refreshed = await refreshSession();

				if (refreshed) {
					console.log('Token refreshed, retrying request');
					// Retry with the new token
					return await requestFn(client.value);
				} else {
					console.error('Token refresh failed, request cannot be completed');
					throw authError;
				}
			}

			// For other errors, just pass them through
			throw authError;
		}
	};

	// Explicitly trigger SDK client refresh
	const refreshToken = async () => {
		try {
			if (!client.value) {
				console.warn('Client not initialized, cannot refresh token');
				return false;
			}

			console.log('Manually refreshing token via SDK...');
			await client.value.refresh();

			// After successful refresh, update tokens
			const token = client.value.getToken();
			if (token && import.meta.client) {
				try {
					const resolvedToken = await token;
					if (resolvedToken) {
						localStorage.setItem('auth_token', resolvedToken);
					}
				} catch (error) {
					console.warn('Could not store refreshed token in localStorage:', error);
				}
			}

			console.log('SDK token refresh successful');
			return true;
		} catch (error) {
			console.error('SDK token refresh failed:', error);

			// If SDK refresh fails, try our session refresh as fallback
			try {
				const result = await refreshSession();
				return !!result;
			} catch (fallbackError) {
				console.error('Fallback refresh also failed:', fallbackError);
				return false;
			}
		}
	};

	// Use watch instead of onMounted for lifecycle management
	watch(
		status,
		(newStatus) => {
			if (newStatus === 'authenticated' || newStatus === 'unauthenticated') {
				isInitializing.value = false;
			}
		},
		{ immediate: true },
	);

	// Safety timeout to prevent infinite loading
	if (import.meta.client) {
		setTimeout(() => {
			isInitializing.value = false;
		}, 2000);
	}

	return {
		client,
		isAuthenticated,
		isInitializing,
		refreshInProgress: readonly(refreshInProgress),
		lastRefreshTime: readonly(lastRefreshTime),
		refreshSession,
		refreshToken,
		authRequest,
	};
}
