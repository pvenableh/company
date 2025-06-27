// plugins/auth-recovery.client.js
export default defineNuxtPlugin(async () => {
	const { status, data, signOut } = useAuth();
	const router = useRouter();

	// Only run on client side
	if (import.meta.server) return;

	console.log('[Auth Recovery] Starting auth state validation...');

	// Function to clear all auth-related storage
	const clearAllAuthData = () => {
		console.log('[Auth Recovery] Clearing all auth data');

		// Clear localStorage
		const authKeys = [
			'auth_token',
			'auth_refresh_token',
			'directus_session_token',
			'selectedOrganization',
			'selectedTeam',
			'selectedTeamId',
		];

		authKeys.forEach((key) => {
			try {
				localStorage.removeItem(key);
			} catch (e) {
				console.warn(`Failed to remove ${key}:`, e);
			}
		});

		// Clear cookies
		const cookies = document.cookie.split(';');
		cookies.forEach((cookie) => {
			const eqPos = cookie.indexOf('=');
			const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
			if (name.includes('auth') || name.includes('session') || name.includes('Organization') || name.includes('Team')) {
				document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
			}
		});
	};

	// Function to validate token by making a test request
	const validateCurrentToken = async () => {
		const token = localStorage.getItem('auth_token') ?? data.value?.directusToken ?? undefined;

		if (!token) {
			console.log('[Auth Recovery] No token found');
			return false;
		}

		try {
			console.log('[Auth Recovery] Validating token...');

			const response = await $fetch('/api/auth/validate-token', {
				method: 'POST',
				body: { token },
				timeout: 5000,
			});

			return response.valid === true;
		} catch (error) {
			console.log('[Auth Recovery] Token validation failed:', error.message);
			return false;
		}
	};

	// Function to attempt token refresh
	const attemptTokenRefresh = async () => {
		const refreshToken = localStorage.getItem('auth_refresh_token') ?? data.value?.refreshToken ?? undefined;

		if (!refreshToken) {
			console.log('[Auth Recovery] No refresh token available');
			return false;
		}

		try {
			console.log('[Auth Recovery] Attempting token refresh...');

			const response = await $fetch('/api/auth/token-refresh', {
				method: 'POST',
				body: { refreshToken },
				timeout: 8000,
			});

			if (response.success && response.data?.access_token) {
				console.log('[Auth Recovery] Token refresh successful');

				// Update localStorage with new tokens
				localStorage.setItem('auth_token', response.data.access_token);
				if (response.data.refresh_token) {
					localStorage.setItem('auth_refresh_token', response.data.refresh_token);
				}

				return true;
			}

			return false;
		} catch (error) {
			console.log('[Auth Recovery] Token refresh failed:', error.message);
			return false;
		}
	};

	// Main recovery logic
	const performAuthRecovery = async () => {
		// Only proceed if we think we're authenticated
		if (status.value !== 'authenticated') {
			console.log('[Auth Recovery] Not authenticated, skipping recovery');
			return;
		}

		console.log('[Auth Recovery] Current auth status: authenticated, validating...');

		// Step 1: Validate current token
		const isTokenValid = await validateCurrentToken();

		if (isTokenValid) {
			console.log('[Auth Recovery] Token is valid, no recovery needed');
			return;
		}

		console.log('[Auth Recovery] Token invalid, attempting refresh...');

		// Step 2: Try to refresh the token
		const refreshSuccessful = await attemptTokenRefresh();

		if (refreshSuccessful) {
			console.log('[Auth Recovery] Token refresh successful, reloading page...');
			// Reload to ensure clean state with new tokens
			window.location.reload();
			return;
		}

		// Step 3: If refresh failed, force logout
		console.log('[Auth Recovery] Token refresh failed, forcing logout...');

		try {
			// Clear all auth data first
			clearAllAuthData();

			// Then call signOut
			await signOut({
				callbackUrl: '/auth/signin',
				redirect: false,
			});

			// Force navigation to signin
			await router.push('/auth/signin');
		} catch (error) {
			console.error('[Auth Recovery] Error during forced logout:', error);
			// As last resort, clear everything and redirect
			clearAllAuthData();
			window.location.href = '/auth/signin';
		}
	};

	// Run recovery with delay to ensure all composables are ready
	setTimeout(async () => {
		try {
			await performAuthRecovery();
		} catch (error) {
			console.error('[Auth Recovery] Recovery process failed:', error);
			// Emergency cleanup
			clearAllAuthData();
			window.location.href = '/auth/signin';
		}
	}, 1000);

	// Also set up a periodic check
	setInterval(
		async () => {
			if (status.value === 'authenticated') {
				const isValid = await validateCurrentToken();
				if (!isValid) {
					console.log('[Auth Recovery] Periodic check failed, triggering recovery...');
					await performAuthRecovery();
				}
			}
		},
		5 * 60 * 1000,
	); // Check every 5 minutes
});
