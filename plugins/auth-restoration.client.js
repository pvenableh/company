// plugins/auth-restoration.client.js

export default defineNuxtPlugin(async (nuxtApp) => {
	// Only run on client-side
	if (import.meta.server) return;

	console.log('[Auth Restoration] Starting auth state check...');

	const { loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession();
	const config = useRuntimeConfig();

	try {
		// Get auth-related tokens from localStorage
		const authToken = localStorage.getItem('auth_token');
		const directusSessionToken = localStorage.getItem('directus_session_token');

		console.log('[Auth Restoration] Current state:', {
			hasAuthToken: !!authToken,
			hasDirectusSessionToken: !!directusSessionToken,
			isLoggedIn: loggedIn.value,
		});

		// Case 1: Has session but no localStorage tokens - restore them
		if (loggedIn.value && session.value?.directusAccessToken && !authToken) {
			console.log('[Auth Restoration] Restoring tokens from session to localStorage');
			localStorage.setItem('auth_token', session.value.directusAccessToken);
			localStorage.setItem('directus_session_token', session.value.directusAccessToken);
		}

		// Case 2: Has auth_token but no directus_session_token
		if (authToken && !directusSessionToken) {
			console.log('[Auth Restoration] Syncing auth_token to directus_session_token');
			localStorage.setItem('directus_session_token', authToken);
		}

		// Case 3: Token validation after page reload
		if (loggedIn.value && authToken) {
			console.log('[Auth Restoration] Validating existing token...');

			try {
				await $fetch(`${config.public.directusUrl}/users/me`, {
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				});

				console.log('[Auth Restoration] Token is valid');
			} catch (error) {
				console.error('[Auth Restoration] Token validation failed:', error);

				if (error.status === 401) {
					// Token is invalid or expired, try server-side refresh
					console.log('[Auth Restoration] Attempting token refresh via server');
					try {
						await $fetch('/api/auth/refresh', { method: 'POST' });
						await fetchSession();

						if (session.value?.directusAccessToken) {
							localStorage.setItem('auth_token', session.value.directusAccessToken);
							localStorage.setItem('directus_session_token', session.value.directusAccessToken);
							console.log('[Auth Restoration] Token refresh successful');
						} else {
							console.log('[Auth Restoration] Refresh returned no token, clearing session');
							await clearSession();
							navigateTo('/auth/signin');
							return;
						}
					} catch (refreshError) {
						console.log('[Auth Restoration] Refresh failed, forcing logout');
						await clearSession();
						navigateTo('/auth/signin');
						return;
					}
				}
			}
		}

		// Case 4: Orphaned tokens (no session but has localStorage tokens)
		if (!loggedIn.value && (authToken || directusSessionToken)) {
			console.log('[Auth Restoration] Orphaned tokens detected, cleaning up');

			const authKeys = ['auth_token', 'auth_refresh_token', 'directus_session_token'];
			authKeys.forEach((key) => {
				localStorage.removeItem(key);
			});
		}
	} catch (error) {
		console.error('[Auth Restoration] Fatal error:', error);
		try {
			await clearSession();
		} catch (e) {
			// If even session clear fails, manually clean up
			localStorage.clear();
			document.cookie.split(';').forEach((c) => {
				document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
			});
		}
		window.location.href = '/auth/signin';
	}

	console.log('[Auth Restoration] Auth state check completed');
});
