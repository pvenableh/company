// plugins/auth.client.js
/**
 * Client-side auth plugin – one-time startup validation.
 *
 * Periodic refresh and cross-tab sync are handled by useDirectusAuth().
 * This plugin only validates the session when the app first loads.
 */

export default defineNuxtPlugin(async () => {
	const { loggedIn, fetch: fetchSession, clear: clearSession } = useUserSession()

	if (!loggedIn.value) return

	try {
		// Validate session is still good with the server
		await $fetch('/api/auth/me')
	} catch (error) {
		if (error.status !== 401 && error.statusCode !== 401) return

		// Token expired – attempt a server-side refresh
		try {
			await $fetch('/api/auth/refresh', { method: 'POST' })
			await fetchSession()
		} catch {
			// Refresh failed – session is gone
			await clearSession()
			navigateTo('/auth/signin')
		}
	}
})
