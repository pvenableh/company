// plugins/auth-restoration.client.js
// Simplified auth restoration - no localStorage token operations
// All tokens are server-side only

export default defineNuxtPlugin(async (nuxtApp) => {
	if (import.meta.server) return;

	const { loggedIn, fetch: fetchSession, clear: clearSession } = useUserSession();

	try {
		// If session exists, validate it via server
		if (loggedIn.value) {
			try {
				await $fetch('/api/auth/me');
			} catch (error) {
				if (error.status === 401 || error.statusCode === 401) {
					// Try server-side refresh
					try {
						await $fetch('/api/auth/refresh', { method: 'POST' });
						await fetchSession();
					} catch (refreshError) {
						await clearSession();
						navigateTo('/auth/signin');
						return;
					}
				}
			}
		}
	} catch (error) {
		console.error('[Auth Restoration] Fatal error:', error);
		try {
			await clearSession();
		} catch (e) {
			// Last resort - clear cookies
			document.cookie.split(';').forEach((c) => {
				document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
			});
		}
		window.location.href = '/auth/signin';
	}
});
