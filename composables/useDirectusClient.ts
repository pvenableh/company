// composables/useDirectusClient.ts
// NOTE: This composable is intentionally minimal. All Directus operations should go
// through server API routes. No tokens are exposed to the client.

export function useDirectusClient() {
	const { loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession();
	const refreshInProgress = ref(false);
	const forceLogoutTriggered = ref(false);

	// Check if user is authenticated (based on session, not tokens)
	const isAuthenticated = computed(() => loggedIn.value);

	// Force logout - clears session and redirects
	const forceLogout = async (reason = 'Authentication failed') => {
		if (forceLogoutTriggered.value) return;
		forceLogoutTriggered.value = true;

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

		if (import.meta.client) {
			window.location.href = '/auth/signin';
		}
	};

	// Refresh session tokens via server
	const refreshSession = async () => {
		if (refreshInProgress.value) return null;
		refreshInProgress.value = true;

		try {
			await $fetch('/api/auth/refresh', { method: 'POST' });
			await fetchSession();
			return session.value;
		} catch (error) {
			console.error('Session refresh failed:', error);
			const err = error as any;
			if (err.status === 401 || err.statusCode === 401) {
				await forceLogout('Token refresh failed');
			}
			return null;
		} finally {
			refreshInProgress.value = false;
		}
	};

	// Watch for auth status changes
	watch(
		loggedIn,
		(isLoggedIn) => {
			if (!isLoggedIn) {
				forceLogoutTriggered.value = false;
			}
		},
	);

	return {
		isAuthenticated,
		refreshInProgress: readonly(refreshInProgress),
		refreshSession,
		forceLogout,
	};
}
