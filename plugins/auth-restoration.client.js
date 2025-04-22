// plugins/auth-restoration.client.ts

export default defineNuxtPlugin(async (nuxtApp) => {
	// Only run on client-side
	if (import.meta.server) return;

	console.log('[Auth Restoration] Starting auth state check...');

	const { status, data: authData, signOut } = useAuth();
	const config = useRuntimeConfig();

	try {
		// Get all auth-related tokens
		const authToken = localStorage.getItem('auth_token');
		const refreshToken = localStorage.getItem('auth_refresh_token');
		const directusSessionToken = localStorage.getItem('directus_session_token');
		const nextAuthSessionToken = document.cookie
			.split('; ')
			.find((row) => row.startsWith('next-auth.session-token='))
			?.split('=')[1];

		console.log('[Auth Restoration] Current state:', {
			hasAuthToken: !!authToken,
			hasRefreshToken: !!refreshToken,
			hasDirectusSessionToken: !!directusSessionToken,
			hasNextAuthSessionToken: !!nextAuthSessionToken,
			authStatus: status.value,
		});

		// Handle various edge cases

		// Case 1: Has nextAuth cookie but no localStorage tokens
		if (nextAuthSessionToken && !authToken && status.value === 'authenticated') {
			console.log('[Auth Restoration] Case 1: Has nextAuth cookie but no localStorage tokens');

			// Try to get tokens from the session
			if (authData.value?.directusToken) {
				console.log('[Auth Restoration] Restoring tokens from session');
				localStorage.setItem('auth_token', authData.value.directusToken);
				localStorage.setItem('directus_session_token', authData.value.directusToken);

				if (authData.value?.refreshToken) {
					localStorage.setItem('auth_refresh_token', authData.value.refreshToken);
				}
			} else {
				// If no tokens in session, force logout
				console.log('[Auth Restoration] No tokens in session, forcing logout');
				await signOut({ callbackUrl: '/auth/signin' });
				return;
			}
		}

		// Case 2: Has auth_token but no directus_session_token
		if (authToken && !directusSessionToken) {
			console.log('[Auth Restoration] Case 2: Has auth_token but no directus_session_token');
			localStorage.setItem('directus_session_token', authToken);
		}

		// Case 3: Token validation after page reload
		if (status.value === 'authenticated' && authToken) {
			console.log('[Auth Restoration] Validating existing token...');

			try {
				// Try to use the token with Directus API
				const response = await $fetch(`${config.public.directusUrl}/users/me`, {
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				});

				console.log('[Auth Restoration] Token is valid');
			} catch (error) {
				console.error('[Auth Restoration] Token validation failed:', error);

				if (error.status === 401) {
					// Token is invalid or expired
					if (refreshToken) {
						console.log('[Auth Restoration] Attempting token refresh');
						const { refreshSession } = useEnhancedAuth();
						const result = await refreshSession();

						if (!result) {
							console.log('[Auth Restoration] Refresh failed, forcing logout');
							await signOut({ callbackUrl: '/auth/signin' });
						}
					} else {
						console.log('[Auth Restoration] No refresh token, forcing logout');
						await signOut({ callbackUrl: '/auth/signin' });
					}
				}
			}
		}

		// Case 4: Check for session errors
		if (authData.value?.error) {
			console.log('[Auth Restoration] Session has error:', authData.value.error);
			await signOut({ callbackUrl: '/auth/signin' });
		}

		// Case 5: Orphaned tokens (no nextAuth session but has localStorage tokens)
		if (!nextAuthSessionToken && (authToken || refreshToken) && status.value === 'unauthenticated') {
			console.log('[Auth Restoration] Orphaned tokens detected, cleaning up');

			// Clear all auth-related items
			const authKeys = ['auth_token', 'auth_refresh_token', 'directus_session_token'];

			authKeys.forEach((key) => {
				localStorage.removeItem(key);
			});
		}
	} catch (error) {
		console.error('[Auth Restoration] Fatal error:', error);
		// On fatal error, we should clean everything and force re-login
		try {
			await signOut({ callbackUrl: '/auth/signin' });
		} catch (e) {
			// If even signOut fails, manually clean up
			localStorage.clear();
			document.cookie.split(';').forEach((c) => {
				document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
			});
			window.location.href = '/auth/signin';
		}
	}

	console.log('[Auth Restoration] Auth state check completed');
});
