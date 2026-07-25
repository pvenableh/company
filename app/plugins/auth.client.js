// plugins/auth.client.js
/**
 * Client-side auth plugin – one-time startup validation.
 *
 * Periodic refresh and cross-tab sync are handled by useDirectusAuth().
 * This plugin only validates the session when the app first loads.
 *
 * Why this matters on a deploy reload: `loggedIn`/`user` come from the sealed
 * nuxt-auth-utils cookie, but the Directus tokens that actually authorize data
 * calls live alongside it and can be dead (refresh token expired/revoked) while
 * the sealed cookie is still valid. `/api/auth/me` reads only the sealed cookie,
 * so it can't detect that. If we trusted it alone, a fresh bundle would render a
 * confident "logged in" shell (avatar + name) over a dead session and every
 * Directus call would 401 — a zombie session. So when the access token is at or
 * near expiry we proactively refresh here, up front, before the data fetches
 * fire. refreshSession() self-heals on a fatal (401) result — it tears the
 * session down and redirects to sign-in — so a dead token logs the user out
 * cleanly instead of stranding them.
 */

export default defineNuxtPlugin(async () => {
	const { loggedIn, session } = useUserSession()
	const { refreshSession } = useDirectusAuth()

	if (!loggedIn.value) return

	// If the access token is expired or within the 2-minute proactive window,
	// refresh now so the first wave of data calls rides a fresh token (or the
	// user is cleanly logged out if the refresh token is dead).
	const expiresAt = session.value?.expiresAt
	if (expiresAt && Date.now() >= expiresAt - 120_000) {
		await refreshSession()
		return
	}

	// Token still looks valid — do a lightweight sanity check against the server
	// session and attempt a single refresh if it has gone missing.
	try {
		await $fetch('/api/auth/me')
	} catch (error) {
		if (error.status !== 401 && error.statusCode !== 401) return
		// Token expired between our check and now — refreshSession handles the
		// fatal case (clear + redirect) internally.
		await refreshSession()
	}
})
