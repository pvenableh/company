// composables/useEnhancedAuth.js

/**
 * An enhanced authentication composable built on nuxt-auth-utils.
 * Uses useUserSession() and server API endpoints for Directus authentication.
 */
export const useEnhancedAuth = () => {
	const { user, loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession();

	// Store the token refresh timer
	const refreshTimer = ref(null);
	const isRefreshing = ref(false);
	const lastRefreshAttempt = ref(null);

	// Computed status for backwards compatibility
	const status = computed(() => {
		return loggedIn.value ? 'authenticated' : 'unauthenticated';
	});

	// Get the current access token from session
	const accessToken = computed(() => {
		return session.value?.directusAccessToken || null;
	});

	// Get expiration time (if available)
	const tokenExpires = computed(() => {
		if (session.value?.expiresAt) {
			return session.value.expiresAt;
		}
		return null;
	});

	// Check if token is expired or will expire soon
	const isTokenExpiringSoon = computed(() => {
		if (!tokenExpires.value) return false;
		const expiresInMs = tokenExpires.value - Date.now();
		return expiresInMs < 5 * 60 * 1000; // 5 minutes
	});

	// Method to refresh the session tokens via server endpoint
	const refreshSession = async () => {
		if (isRefreshing.value) return;

		isRefreshing.value = true;
		lastRefreshAttempt.value = Date.now();

		try {
			await $fetch('/api/auth/refresh', { method: 'POST' });
			await fetchSession();

			// Sync token to localStorage as backup
			if (import.meta.client && session.value?.directusAccessToken) {
				try {
					localStorage.setItem('auth_token', session.value.directusAccessToken);
					localStorage.setItem('directus_session_token', session.value.directusAccessToken);
				} catch (storageError) {
					console.warn('Error storing token in localStorage:', storageError);
				}
			}

			return session.value;
		} catch (error) {
			console.error('Error refreshing session:', error);
			return null;
		} finally {
			isRefreshing.value = false;
		}
	};

	// Setup token refresh intervals - CLIENT SIDE ONLY
	const setupRefreshInterval = () => {
		if (!import.meta.client) return;

		if (refreshTimer.value) {
			clearInterval(refreshTimer.value);
			refreshTimer.value = null;
		}

		if (!loggedIn.value) return;

		// Refresh every hour as a fallback
		refreshTimer.value = setInterval(
			async () => {
				if (loggedIn.value && !isRefreshing.value) {
					await refreshSession();
				}
			},
			60 * 60 * 1000,
		);
	};

	// Login with email and password
	const signIn = async (credentials) => {
		try {
			const result = await $fetch('/api/auth/login', {
				method: 'POST',
				body: credentials,
			});

			// Fetch the updated session
			await fetchSession();

			// Store token in localStorage as backup
			if (import.meta.client && session.value?.directusAccessToken) {
				try {
					localStorage.setItem('auth_token', session.value.directusAccessToken);
					localStorage.setItem('directus_session_token', session.value.directusAccessToken);
				} catch (storageError) {
					console.warn('Error storing tokens in localStorage:', storageError);
				}
			}

			return result;
		} catch (error) {
			console.error('Sign in failed:', error);
			throw error;
		}
	};

	// Logout and clean up
	const signOut = async (options = {}) => {
		// Clean up localStorage
		if (import.meta.client) {
			try {
				localStorage.removeItem('auth_token');
				localStorage.removeItem('auth_refresh_token');
				localStorage.removeItem('directus_session_token');
			} catch (error) {
				console.warn('Error cleaning up localStorage:', error);
			}
		}

		// Clear the refresh timer
		if (import.meta.client && refreshTimer.value) {
			clearInterval(refreshTimer.value);
			refreshTimer.value = null;
		}

		try {
			await $fetch('/api/auth/logout', { method: 'POST' });
		} catch (error) {
			console.warn('Server logout error:', error);
		}

		await clearSession();

		// Handle redirect if specified
		if (options.callbackUrl && import.meta.client) {
			navigateTo(options.callbackUrl);
		}
	};

	// Set up watchers - client only
	if (import.meta.client) {
		watch(
			loggedIn,
			(isLoggedIn) => {
				if (isLoggedIn) {
					setupRefreshInterval();
				} else if (refreshTimer.value) {
					clearInterval(refreshTimer.value);
					refreshTimer.value = null;
				}
			},
			{ immediate: true },
		);
	}

	// Clean up on component unmount
	if (import.meta.client) {
		onUnmounted(() => {
			if (refreshTimer.value) {
				clearInterval(refreshTimer.value);
				refreshTimer.value = null;
			}
		});
	}

	// Initialize refresh interval on mount
	if (import.meta.client) {
		onMounted(() => {
			if (loggedIn.value) {
				setupRefreshInterval();
			}
		});
	}

	return {
		// Session state
		status,
		data: session,
		user,
		loggedIn,
		session,
		accessToken,
		tokenExpires,
		isTokenExpiringSoon,
		isRefreshing: readonly(isRefreshing),
		lastRefreshAttempt: readonly(lastRefreshAttempt),

		// Methods
		signIn,
		signOut,
		refreshSession,
		fetchSession,
	};
};
