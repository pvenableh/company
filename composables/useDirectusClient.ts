// composables/useDirectusClient.ts
import { createDirectus, rest, authentication, realtime, readMe } from '@directus/sdk';

export function useDirectusClient() {
	interface ExtendedSession {
		directusToken?: string;
		error?: string;
	}

	const {
		data: session,
		status,
		getSession,
	} = useAuth() as {
		data: Ref<ExtendedSession | null>;
		status: Ref<string>;
		getSession: () => Promise<ExtendedSession | null>;
	};
	const config = useRuntimeConfig();
	const isInitializing = ref(true);
	const refreshInProgress = ref(false);
	const lastRefreshTime = ref<number | null>(null);

	// Create Directus client with auth token from session
	const client = computed(() => {
		const directusUrl = config.public.directusUrl;
		// Use json mode explicitly for authentication
		const directusClient = createDirectus<any>(directusUrl).with(authentication('json')).with(rest()).with(realtime());

		// First check session token, then localStorage as fallback
		if (session.value?.directusToken) {
			directusClient.setToken(session.value.directusToken);

			// Also ensure it's in localStorage for realtime
			if (import.meta.client) {
				try {
					localStorage.setItem('auth_token', session.value.directusToken);
					localStorage.setItem('directus_session_token', session.value.directusToken);
				} catch (e) {
					console.warn('Failed to store token in localStorage:', e);
				}
			}
		} else if (import.meta.client) {
			// Try to get token from localStorage as fallback
			try {
				const storedToken = localStorage.getItem('auth_token') || localStorage.getItem('directus_session_token');
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

				// Ensure the client gets the new token
				client.value.setToken(result.directusToken);
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

				// Check if there's an error in the session (this will be set by the auth handler)
				if (session.value?.error) {
					console.log('Session has error:', session.value.error);
					// Force sign out
					const { signOut } = useAuth();
					await signOut({ callbackUrl: '/auth/signin' });
					return;
				}

				// Try to refresh the session
				const refreshed = await refreshSession();

				if (refreshed) {
					console.log('Token refreshed, retrying request');
					// Retry with the new token
					return await requestFn(client.value);
				} else {
					console.error('Token refresh failed, request cannot be completed');
					// Force sign out
					const { signOut } = useAuth();
					await signOut({ callbackUrl: '/auth/signin' });
					throw authError;
				}
			}

			// For other errors, just pass them through
			throw authError;
		}
	};

	// Explicitly trigger SDK client refresh
	const refreshToken = async () => {
		return refreshSession();
	};

	// Initialize and check token validity
	const initializeClient = async () => {
		if (status.value === 'authenticated' && session.value?.directusToken) {
			// Check if the token is still valid by making a simple request
			try {
				await authRequest(async (client) => {
					// Type assertion to handle the TypeScript error
					return (client as any).request(readMe());
				});
			} catch (error) {
				console.error('Token validation failed:', error);
				// Token is invalid, force refresh
				await refreshSession();
			}
		}
		isInitializing.value = false;
	};

	// Watch for auth status changes
	watch(
		status,
		async (newStatus) => {
			if (newStatus === 'authenticated' && !isInitializing.value) {
				await initializeClient();
			}
		},
		{ immediate: true },
	);

	if (import.meta.client) {
		// For component context, use lifecycle hook
		if (getCurrentInstance()) {
			onMounted(async () => {
				await initializeClient();
			});
		} else {
			// For non-component context (plugins, etc), just run initialization directly
			nextTick(async () => {
				await initializeClient();
			});
		}

		// Keep the safety timeout to prevent infinite loading
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
