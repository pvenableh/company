// composables/useDirectusClient.ts
import { createDirectus, rest, authentication, realtime, readMe } from '@directus/sdk';

export function useDirectusClient() {
	const { user, loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession();

	const config = useRuntimeConfig();
	const isInitializing = ref(true);
	const refreshInProgress = ref(false);
	const lastRefreshTime = ref<number | null>(null);
	const forceLogoutTriggered = ref(false);

	// Create Directus client with auth token from session
	const client = computed(() => {
		const directusUrl = config.public.directusUrl;
		const directusClient = createDirectus<any>(directusUrl).with(authentication('json')).with(rest()).with(realtime());

		// Get token from session or localStorage
		let token = session.value?.directusAccessToken;

		if (!token && import.meta.client) {
			try {
				token = localStorage.getItem('auth_token') ?? localStorage.getItem('directus_session_token') ?? undefined;
			} catch (error) {
				console.warn('Could not retrieve token from localStorage:', error);
			}
		}

		if (token) {
			directusClient.setToken(token);

			// Sync to localStorage
			if (import.meta.client) {
				try {
					localStorage.setItem('auth_token', token);
					localStorage.setItem('directus_session_token', token);
				} catch (e) {
					console.warn('Failed to store token in localStorage:', e);
				}
			}
		}

		return directusClient;
	});

	// Helper to check if client is authenticated and ready
	const isAuthenticated = computed(() => {
		return (
			!!session.value?.directusAccessToken || (import.meta.client && !!(localStorage.getItem('auth_token') ?? undefined))
		);
	});

	// Force logout - clears everything and redirects
	const forceLogout = async (reason = 'Authentication failed') => {
		if (forceLogoutTriggered.value) {
			console.log('Force logout already triggered, skipping');
			return;
		}

		forceLogoutTriggered.value = true;
		console.log(`Force logout triggered: ${reason}`);

		// Clear localStorage
		if (import.meta.client) {
			try {
				const authKeys = ['auth_token', 'auth_refresh_token', 'directus_session_token'];
				authKeys.forEach((key) => localStorage.removeItem(key));
			} catch (error) {
				console.warn('Error cleaning up localStorage:', error);
			}
		}

		try {
			await $fetch('/api/auth/logout', { method: 'POST' });
		} catch (error) {
			console.warn('Error during server logout:', error);
		}

		try {
			await clearSession();
		} catch (error) {
			console.warn('Error clearing session:', error);
		}

		// Force navigation
		if (import.meta.client) {
			window.location.href = '/auth/signin';
		}
	};

	// Enhanced session refresh with better error handling
	const refreshSession = async () => {
		// Prevent concurrent refreshes
		if (refreshInProgress.value) {
			console.log('Refresh already in progress, skipping duplicate request');
			return null;
		}

		// Prevent refresh loops - don't refresh more than once per minute
		if (lastRefreshTime.value && Date.now() - lastRefreshTime.value < 60000) {
			console.log('Recent refresh attempt, skipping to prevent loops');
			return null;
		}

		refreshInProgress.value = true;
		lastRefreshTime.value = Date.now();

		try {
			console.log('Refreshing session...');

			await $fetch('/api/auth/refresh', { method: 'POST' });
			await fetchSession();

			if (session.value?.directusAccessToken) {
				console.log('Session refresh successful');

				// Update localStorage
				if (import.meta.client) {
					try {
						localStorage.setItem('auth_token', session.value.directusAccessToken);
						localStorage.setItem('directus_session_token', session.value.directusAccessToken);
					} catch (error) {
						console.warn('Could not update token in localStorage:', error);
					}
				}

				// Ensure the client gets the new token
				client.value.setToken(session.value.directusAccessToken);
				return session.value;
			} else {
				console.log('Session refresh returned no token');
				return null;
			}
		} catch (error) {
			console.error('Session refresh failed:', error);

			// Check if it's an auth-related error
			const err = error as any;
			if (err.status === 401 || err.message?.includes('invalid') || err.message?.includes('expired')) {
				console.log('Refresh failed due to invalid credentials, forcing logout');
				await forceLogout('Token refresh failed');
			}

			return null;
		} finally {
			refreshInProgress.value = false;
		}
	};

	// Enhanced auth request method with circuit breaker pattern
	const authRequest = async (requestFn: (client: ReturnType<typeof createDirectus>) => Promise<any>): Promise<any> => {
		// If force logout was triggered, don't attempt requests
		if (forceLogoutTriggered.value) {
			throw new Error('Authentication session terminated');
		}

		let attempt = 0;
		const maxAttempts = 2;

		while (attempt < maxAttempts) {
			attempt++;

			try {
				console.log(`Auth request attempt ${attempt}/${maxAttempts}`);
				return await requestFn(client.value);
			} catch (error: unknown) {
				const authError = error as any;

				// Log the error for debugging
				console.log('Auth request failed:', {
					attempt,
					status: authError.status,
					message: authError.message,
					errors: authError.errors,
				});

				// Check for 401 or auth-related errors
				const isAuthError =
					authError.status === 401 ||
					(authError.errors &&
						authError.errors.some(
							(e: any) => e.extensions?.code === 'INVALID_CREDENTIALS' || e.extensions?.code === 'FORBIDDEN',
						)) ||
					authError.message?.includes('invalid token') ||
					authError.message?.includes('unauthorized');

				if (isAuthError) {
					console.log(`Auth error detected on attempt ${attempt}`);

					// On first attempt, try to refresh
					if (attempt === 1) {
						console.log('Attempting token refresh before retry...');

						const refreshed = await refreshSession();

						if (refreshed?.directusAccessToken) {
							console.log('Token refreshed, retrying request');
							continue; // Retry the request
						} else {
							console.log('Token refresh failed, forcing logout');
							await forceLogout('Failed to refresh expired token');
							throw new Error('Authentication failed - please log in again');
						}
					} else {
						// Second attempt also failed, force logout
						console.log('Second auth attempt failed, forcing logout');
						await forceLogout('Multiple authentication failures');
						throw new Error('Authentication failed - please log in again');
					}
				} else {
					// Non-auth error, don't retry
					throw authError;
				}
			}
		}

		// Should never reach here, but just in case
		throw new Error('Authentication request failed after all attempts');
	};

	// Initialize client and validate token
	const initializeClient = async () => {
		if (loggedIn.value && session.value?.directusAccessToken) {
			try {
				// Quick validation - try to read current user
				await authRequest(async (client) => {
					return (client as any).request(readMe({ fields: ['id'] }));
				});

				console.log('Token validation successful');
			} catch (error) {
				console.error('Token validation failed during initialization:', error);
			}
		}

		isInitializing.value = false;
	};

	// Watch for auth status changes
	watch(
		loggedIn,
		async (isLoggedIn) => {
			if (isLoggedIn && !isInitializing.value) {
				await initializeClient();
			} else if (!isLoggedIn) {
				// Reset force logout flag when user is properly unauthenticated
				forceLogoutTriggered.value = false;
			}
		},
		{ immediate: true },
	);

	// Client-side initialization
	if (import.meta.client) {
		if (getCurrentInstance()) {
			onMounted(async () => {
				await initializeClient();
			});
		} else {
			nextTick(async () => {
				await initializeClient();
			});
		}

		// Safety timeout to prevent infinite loading
		setTimeout(() => {
			isInitializing.value = false;
		}, 3000);
	}

	return {
		client,
		isAuthenticated,
		isInitializing,
		refreshInProgress: readonly(refreshInProgress),
		lastRefreshTime: readonly(lastRefreshTime),
		refreshSession,
		authRequest,
		forceLogout,
	};
}
