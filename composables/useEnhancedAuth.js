// composables/useEnhancedAuth.js

/**
 * An enhanced authentication composable that manages token refresh
 * and provides a consistent API for authentication state
 */
export const useEnhancedAuth = () => {
	const { status, data, signIn, signOut, getSession } = useAuth();
	const config = useRuntimeConfig();

	// Store the token refresh timer
	const refreshTimer = ref(null);
	const isRefreshing = ref(false);
	const lastRefreshAttempt = ref(null);

	// Get the user object from auth data
	const user = computed(() => {
		return status.value === 'authenticated' ? data.value?.user ?? null : null;
	});

	// Get the current access token
	const accessToken = computed(() => {
		return data.value?.directusToken || null;
	});

	// Get the refresh token
	const refreshToken = computed(() => {
		return data.value?.refreshToken || null;
	});

	// Get expiration time (if available)
	const tokenExpires = computed(() => {
		if (data.value?.expires) {
			return new Date(data.value.expires).getTime();
		}
		return null;
	});

	// Check if token is expired or will expire soon
	const isTokenExpiringSoon = computed(() => {
		if (!tokenExpires.value) return false;

		// Consider token as "expiring soon" if it expires in less than 5 minutes
		const expiresInMs = tokenExpires.value - Date.now();
		return expiresInMs < 5 * 60 * 1000; // 5 minutes in milliseconds
	});

	// Method to manually refresh the token
	const refreshSession = async () => {
		if (isRefreshing.value) return;

		isRefreshing.value = true;
		lastRefreshAttempt.value = Date.now();

		try {
			console.log('Manually refreshing session...');
			const result = await getSession();

			// If we successfully refreshed, store any new tokens in localStorage as a backup
			if (import.meta.client && result) {
				try {
					if (result.directusToken) {
						localStorage.setItem('auth_token', result.directusToken);
					}
					if (result.refreshToken) {
						localStorage.setItem('auth_refresh_token', result.refreshToken);
					}
				} catch (storageError) {
					console.warn('Error storing tokens in localStorage:', storageError);
				}
			}

			console.log('Session refresh completed');
			return result;
		} catch (error) {
			console.error('Error refreshing session:', error);
			return null;
		} finally {
			isRefreshing.value = false;
		}
	};

	// Setup token refresh intervals - CLIENT SIDE ONLY
	const setupRefreshInterval = () => {
		// Only run on client side
		if (!import.meta.client) return;

		// Clear any existing timer
		if (refreshTimer.value) {
			clearInterval(refreshTimer.value);
			refreshTimer.value = null;
		}

		// Only set up refresh timer if authenticated
		if (status.value !== 'authenticated') return;

		// Set refresh interval for every hour
		// This is a fallback, the JWT callback will normally handle token refreshes
		refreshTimer.value = setInterval(
			async () => {
				// Only refresh if authenticated and not already refreshing
				if (status.value === 'authenticated' && !isRefreshing.value) {
					await refreshSession();
				}
			},
			60 * 60 * 1000,
		); // 1 hour
	};

	// Enhanced login method that ensures proper storage of tokens
	const enhancedSignIn = async (providerOrCredentials, credentials) => {
		try {
			// Handle both usage patterns:
			// signIn(credentials) - single object with credentials
			// signIn('credentials', credentials) - provider name + credentials object
			let provider = 'credentials';
			let credentialsObj = providerOrCredentials;

			if (typeof providerOrCredentials === 'string') {
				provider = providerOrCredentials;
				credentialsObj = credentials || {};
			}

			// Make sure redirect is set to false by default
			if (credentialsObj && !('redirect' in credentialsObj)) {
				credentialsObj.redirect = false;
			}

			// Call the original signIn
			const result = await signIn(provider, credentialsObj);

			// After login, refresh the session to ensure we have the latest tokens
			if (result?.ok) {
				await refreshSession();
			}

			return result;
		} catch (error) {
			console.error('Sign in failed:', error);
			throw error;
		}
	};

	// Enhanced logout method that cleans up localStorage
	const enhancedSignOut = async (options = {}) => {
		// Clean up localStorage - client side only
		if (import.meta.client) {
			try {
				localStorage.removeItem('auth_token');
				localStorage.removeItem('auth_refresh_token');
			} catch (error) {
				console.warn('Error cleaning up localStorage:', error);
			}
		}

		// Clear the refresh timer - client side only
		if (import.meta.client && refreshTimer.value) {
			clearInterval(refreshTimer.value);
			refreshTimer.value = null;
		}

		// Call the original signOut
		return await signOut(options);
	};

	// Set up watchers - but only on client
	if (import.meta.client) {
		watch(
			() => status.value,
			(newStatus) => {
				if (newStatus === 'authenticated') {
					setupRefreshInterval();
				} else {
					// Clean up timer if not authenticated
					if (refreshTimer.value) {
						clearInterval(refreshTimer.value);
						refreshTimer.value = null;
					}
				}
			},
			{ immediate: true },
		);
	}

	// Clean up on component unmount - client side only
	if (import.meta.client) {
		onUnmounted(() => {
			if (refreshTimer.value) {
				clearInterval(refreshTimer.value);
				refreshTimer.value = null;
			}
		});
	}

	// Initialize when in client-side
	if (import.meta.client) {
		onMounted(() => {
			if (status.value === 'authenticated') {
				setupRefreshInterval();
			}
		});
	}

	// Return the enhanced composable
	return {
		// Original auth properties and methods
		status,
		data,

		// Enhanced properties
		user,
		accessToken,
		refreshToken,
		tokenExpires,
		isTokenExpiringSoon,
		isRefreshing: readonly(isRefreshing),
		lastRefreshAttempt: readonly(lastRefreshAttempt),

		// Enhanced methods
		signIn: enhancedSignIn,
		signOut: enhancedSignOut,
		refreshSession,
	};
};
