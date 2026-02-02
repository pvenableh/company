// plugins/auth-recovery.client.js
export default defineNuxtPlugin(async () => {
	const { loggedIn, session, clear: clearSession } = useUserSession();
	const router = useRouter();

	// Only run on client side
	if (import.meta.server) return;

	// Prevent multiple runs and reload loops
	const RECOVERY_SESSION_KEY = 'auth_recovery_running';
	const LAST_RECOVERY_KEY = 'auth_last_recovery';

	// Check if recovery already ran recently (within last 10 seconds)
	const lastRecovery = sessionStorage.getItem(LAST_RECOVERY_KEY);
	if (lastRecovery && Date.now() - parseInt(lastRecovery) < 10000) {
		console.log('[Auth Recovery] Recently ran, skipping to prevent loops');
		return;
	}

	// Check if recovery is already running
	if (sessionStorage.getItem(RECOVERY_SESSION_KEY)) {
		console.log('[Auth Recovery] Already running, skipping duplicate');
		return;
	}

	console.log('[Auth Recovery] Starting auth state validation...');

	// Mark recovery as running
	sessionStorage.setItem(RECOVERY_SESSION_KEY, 'true');
	sessionStorage.setItem(LAST_RECOVERY_KEY, Date.now().toString());

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
		const token = localStorage.getItem('auth_token') ?? session.value?.directusAccessToken ?? undefined;

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

	// Function to attempt token refresh via server endpoint
	const attemptTokenRefresh = async () => {
		try {
			console.log('[Auth Recovery] Attempting token refresh via server...');

			const response = await $fetch('/api/auth/refresh', {
				method: 'POST',
				timeout: 8000,
			});

			if (response.success) {
				console.log('[Auth Recovery] Token refresh successful');
				return true;
			}

			return false;
		} catch (error) {
			console.log('[Auth Recovery] Token refresh failed:', error.message);
			return false;
		}
	};

	// Cleanup function
	const cleanup = () => {
		sessionStorage.removeItem(RECOVERY_SESSION_KEY);
	};

	// Main recovery logic
	const performAuthRecovery = async () => {
		try {
			// Only proceed if we think we're authenticated
			if (!loggedIn.value) {
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
				console.log('[Auth Recovery] Token refresh successful - auth should work now');
				// DON'T reload the page - just let the components use the new token
				return;
			}

			// Step 3: If refresh failed, force logout
			console.log('[Auth Recovery] Token refresh failed, forcing logout...');

			// Clear all auth data first
			clearAllAuthData();

			// Then clear session
			await clearSession();

			// Force navigation to signin
			await router.push('/auth/signin');
		} catch (error) {
			console.error('[Auth Recovery] Recovery process failed:', error);
			// Emergency cleanup
			clearAllAuthData();
			window.location.href = '/auth/signin';
		} finally {
			cleanup();
		}
	};

	// Run recovery with delay to ensure all composables are ready
	setTimeout(async () => {
		await performAuthRecovery();
	}, 1000);

	// Set up a periodic check (but less frequent and with guards)
	setInterval(
		async () => {
			// Only run periodic check if:
			// 1. User is authenticated
			// 2. Recovery isn't already running
			// 3. Haven't run recently
			const lastRecovery = sessionStorage.getItem(LAST_RECOVERY_KEY);
			const recentlyRan = lastRecovery && Date.now() - parseInt(lastRecovery) < 30000; // 30 seconds

			if (loggedIn.value && !sessionStorage.getItem(RECOVERY_SESSION_KEY) && !recentlyRan) {
				const isValid = await validateCurrentToken();
				if (!isValid) {
					console.log('[Auth Recovery] Periodic check failed, triggering recovery...');
					sessionStorage.setItem(RECOVERY_SESSION_KEY, 'true');
					sessionStorage.setItem(LAST_RECOVERY_KEY, Date.now().toString());
					await performAuthRecovery();
				}
			}
		},
		2 * 60 * 1000,
	); // Check every 2 minutes (less frequent)
});
