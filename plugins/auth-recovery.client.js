// plugins/auth-recovery.client.js
// Simplified auth recovery - no localStorage token operations
// All tokens are server-side only

export default defineNuxtPlugin(async () => {
	const { loggedIn, clear: clearSession } = useUserSession();
	const router = useRouter();

	if (import.meta.server) return;

	// Prevent multiple runs and reload loops
	const RECOVERY_SESSION_KEY = 'auth_recovery_running';
	const LAST_RECOVERY_KEY = 'auth_last_recovery';

	// Check if recovery already ran recently (within last 10 seconds)
	const lastRecovery = sessionStorage.getItem(LAST_RECOVERY_KEY);
	if (lastRecovery && Date.now() - parseInt(lastRecovery) < 10000) {
		return;
	}

	// Check if recovery is already running
	if (sessionStorage.getItem(RECOVERY_SESSION_KEY)) {
		return;
	}

	// Mark recovery as running
	sessionStorage.setItem(RECOVERY_SESSION_KEY, 'true');
	sessionStorage.setItem(LAST_RECOVERY_KEY, Date.now().toString());

	// Cleanup function
	const cleanup = () => {
		sessionStorage.removeItem(RECOVERY_SESSION_KEY);
	};

	// Main recovery logic
	const performAuthRecovery = async () => {
		try {
			// Only proceed if we think we're authenticated
			if (!loggedIn.value) {
				return;
			}

			// Validate session via server
			try {
				await $fetch('/api/auth/me');
				return; // Session is valid
			} catch (error) {
				if (error.status !== 401 && error.statusCode !== 401) {
					return; // Non-auth error, skip
				}
			}

			// Try to refresh the token via server
			try {
				const response = await $fetch('/api/auth/refresh', {
					method: 'POST',
					timeout: 8000,
				});

				if (response.success) {
					return; // Refresh successful
				}
			} catch (error) {
				// Refresh failed
			}

			// If refresh failed, force logout
			await clearSession();
			await router.push('/auth/signin');
		} catch (error) {
			console.error('[Auth Recovery] Recovery process failed:', error);
			window.location.href = '/auth/signin';
		} finally {
			cleanup();
		}
	};

	// Run recovery with delay to ensure all composables are ready
	setTimeout(async () => {
		await performAuthRecovery();
	}, 1000);

	// Set up a periodic check (less frequent)
	setInterval(
		async () => {
			const lastRecovery = sessionStorage.getItem(LAST_RECOVERY_KEY);
			const recentlyRan = lastRecovery && Date.now() - parseInt(lastRecovery) < 30000;

			if (loggedIn.value && !sessionStorage.getItem(RECOVERY_SESSION_KEY) && !recentlyRan) {
				try {
					await $fetch('/api/auth/me');
				} catch (error) {
					if (error.status === 401 || error.statusCode === 401) {
						sessionStorage.setItem(RECOVERY_SESSION_KEY, 'true');
						sessionStorage.setItem(LAST_RECOVERY_KEY, Date.now().toString());
						await performAuthRecovery();
					}
				}
			}
		},
		2 * 60 * 1000,
	);
});
