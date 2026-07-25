// composables/useDirectusAuth.js

/**
 * Core authentication composable for Directus integration.
 * Built on nuxt-auth-utils with server-side token management.
 *
 * Features:
 * - Proactive token refresh scheduled from session expiresAt
 * - Cross-tab session sync via BroadcastChannel
 * - Automatic re-validation when a hidden tab regains focus
 * - Module-level lock to prevent concurrent refresh attempts
 */

// ─── Module-level singletons (shared across all composable instances) ──────
let _refreshTimer = null
let _isRefreshing = false
let _channel = null
let _initialized = false
// Whether the most recent refresh failure was a definitive auth rejection
// (refresh token truly dead) vs. a transient/network failure we should not
// log the user out for.
let _lastRefreshFatal = false
// Guards handleFatalAuthFailure so concurrent 401s (e.g. a burst of data
// calls + the proactive timer all 401ing at once) only tear down once.
let _handlingFatal = false

/**
 * Clears the cross-user `selectedOrganization` cookie + localStorage.
 *
 * Why: useOrganization persists the active org to a 30-day cookie at path `/`.
 * Without an explicit clear, signing out and signing in as a different user
 * (or registering a brand-new user in the same browser) leaves the previous
 * user's org id in the cookie. Until tryRestoreSelectedOrg notices the
 * mismatch, the dashboard renders queries scoped to the wrong tenant.
 * Called on signIn, signOut, and register.
 */
function clearOrgSelection() {
	if (import.meta.client) {
		document.cookie = 'selectedOrganization=; path=/; max-age=0; samesite=lax'
		try { localStorage.removeItem('selectedOrganization') } catch {}
	}
}

export const useDirectusAuth = () => {
	const { user, loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession()

	const status = computed(() => (loggedIn.value ? 'authenticated' : 'unauthenticated'))

	// ─── Fatal-session teardown ────────────────────────────────────────────────

	/**
	 * The Directus refresh token is definitively dead (a refresh returned 401).
	 * No refresh can recover it, so tear the client session down cleanly and
	 * send the user to sign-in. This MUST run for every fatal refresh path — the
	 * proactive timer, a data-call-triggered refresh, and the tab-visibility
	 * check all funnel here. Previously only the visibilitychange handler acted
	 * on a fatal result, so a refresh that died on the timer (or right after a
	 * deploy reload) left the sealed session in place: `loggedIn` stayed true,
	 * the avatar rendered, and every Directus call 401'd — a zombie session.
	 *
	 * Idempotent: `_handlingFatal` collapses the burst of simultaneous 401s that
	 * a broken session produces into a single teardown + redirect.
	 */
	const handleFatalAuthFailure = async () => {
		if (_handlingFatal) return
		if (!import.meta.client || !loggedIn.value) return
		_handlingFatal = true

		clearRefreshTimer()

		try {
			const { toast } = await import('vue-sonner')
			toast.error('Your session has expired. Please sign in again.')
		} catch {}

		// clearSession drops the sealed cookie so `loggedIn` flips false and the
		// zombie UI stops rendering; broadcast so sibling tabs tear down too.
		await clearSession()
		clearOrgSelection()
		broadcastAuth('logout')

		// Don't bounce a user who's already on the sign-in screen.
		const onSignin = import.meta.client && window.location.pathname.startsWith('/auth/signin')
		if (!onSignin) {
			// Brief delay so the toast is visible before navigating.
			setTimeout(() => navigateTo('/auth/signin'), 1500)
		}
	}

	// ─── Token Refresh ─────────────────────────────────────────────────────────

	const refreshSession = async () => {
		if (_isRefreshing) return null
		_isRefreshing = true

		// Snapshot expiry before we try. If our POST loses the single-use
		// refresh-token rotation race to a sibling request (another tab, a data
		// call, the socket re-auth), that sibling has already written fresh
		// tokens to the shared cookie — so a 401 here doesn't mean the session
		// is dead, it means someone else refreshed it first.
		const prevExpiresAt = session.value?.expiresAt ?? 0

		try {
			// Bound the refresh so a hung request can't wedge `_isRefreshing` and
			// stall every future refresh (the access token would then quietly
			// expire and the app would 401 with no recovery).
			await $fetch('/api/auth/refresh', { method: 'POST', timeout: 15_000 })
			await fetchSession()
			scheduleRefresh()
			broadcastAuth('refresh')
			_lastRefreshFatal = false
			_handlingFatal = false
			return session.value
		} catch (error) {
			// 401 = refresh token rejected by Directus (truly expired/revoked).
			// Anything else (503, network) is transient — keep the session.
			const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status
			if (statusCode === 401) {
				// Tolerate-the-race: re-read the sealed cookie. If a sibling
				// rotated it, expiresAt has advanced into the future — ride that
				// instead of logging the user out over a race we lost.
				try { await fetchSession() } catch {}
				const newExpiresAt = session.value?.expiresAt ?? 0
				if (loggedIn.value && newExpiresAt > prevExpiresAt && newExpiresAt > Date.now()) {
					scheduleRefresh()
					broadcastAuth('refresh')
					_lastRefreshFatal = false
					_handlingFatal = false
					return session.value
				}
			}
			console.error('[Auth] Token refresh failed:', error)
			_lastRefreshFatal = statusCode === 401
			// A genuinely fatal failure means the session is unrecoverable — tear
			// it down here so every caller (timer, visibility, startup) reacts,
			// not just the visibilitychange handler.
			if (_lastRefreshFatal) await handleFatalAuthFailure()
			return null
		} finally {
			_isRefreshing = false
		}
	}

	// ─── Proactive Refresh Scheduling ──────────────────────────────────────────

	const clearRefreshTimer = () => {
		if (_refreshTimer) {
			clearTimeout(_refreshTimer)
			_refreshTimer = null
		}
	}

	const scheduleRefresh = () => {
		if (!import.meta.client) return
		clearRefreshTimer()
		if (!loggedIn.value) return

		const expiresAt = session.value?.expiresAt
		if (!expiresAt) return

		// Refresh 2 minutes before token expiry, minimum 10 s from now
		const refreshIn = Math.max(expiresAt - Date.now() - 120_000, 10_000)

		_refreshTimer = setTimeout(async () => {
			if (loggedIn.value && !_isRefreshing) {
				await refreshSession()
			}
		}, refreshIn)
	}

	// ─── Cross-Tab Synchronization ─────────────────────────────────────────────

	const broadcastAuth = (type) => {
		if (!import.meta.client) return
		try {
			if (_channel) {
				_channel.postMessage({ type })
			} else {
				// Fallback: localStorage fires "storage" events in other tabs
				localStorage.setItem(`auth-${type}`, Date.now().toString())
				localStorage.removeItem(`auth-${type}`)
			}
		} catch {
			// Ignore – best-effort broadcast
		}
	}

	const initCrossTabSync = () => {
		if (!import.meta.client || _channel) return

		try {
			_channel = new BroadcastChannel('directus-auth')
			_channel.onmessage = async ({ data }) => {
				if (data.type === 'logout') {
					clearRefreshTimer()
					await clearSession()
					navigateTo('/auth/signin')
				} else if (data.type === 'login' || data.type === 'refresh') {
					// A sibling re-authenticated (or refreshed): the shared cookie is
					// valid again, so release any stuck fatal latch in this tab.
					_handlingFatal = false
					_lastRefreshFatal = false
					await fetchSession()
					scheduleRefresh()
				}
			}
		} catch {
			// BroadcastChannel unsupported – fall back to storage events.
			// Store the handler so it can be referenced (module-level singleton
			// means this only runs once, matching the _initialized guard).
			const storageHandler = async (e) => {
				if (e.key === 'auth-logout') {
					clearRefreshTimer()
					await clearSession()
					navigateTo('/auth/signin')
				} else if (e.key === 'auth-login' || e.key === 'auth-refresh') {
					_handlingFatal = false
					_lastRefreshFatal = false
					await fetchSession()
					scheduleRefresh()
				}
			}
			window.addEventListener('storage', storageHandler)
		}
	}

	// ─── Sign In / Sign Out ────────────────────────────────────────────────────

	const signIn = async (credentials) => {
		clearOrgSelection()
		try {
			const result = await $fetch('/api/auth/login', {
				method: 'POST',
				body: credentials,
			})

			await fetchSession()
			// Clear the fatal-teardown latch: these module-level singletons persist
			// across client-side navigation, so after a session expired and the user
			// signs back in WITHOUT a full reload, a stale `_handlingFatal` would
			// otherwise suppress teardown on the next genuine expiry.
			_handlingFatal = false
			_lastRefreshFatal = false
			scheduleRefresh()
			broadcastAuth('login')
			return result
		} catch (error) {
			console.error('[Auth] Sign in failed:', error)
			throw error
		}
	}

	const signOut = async (options = {}) => {
		clearRefreshTimer()

		try {
			await $fetch('/api/auth/logout', { method: 'POST' })
		} catch (error) {
			console.warn('[Auth] Server logout error:', error)
		}

		await clearSession()
		clearOrgSelection()
		broadcastAuth('logout')

		if (options.callbackUrl && import.meta.client) {
			navigateTo(options.callbackUrl)
		}
	}

	// ─── Convenience Wrappers (merged from useAuthActions) ────────────────────

	const login = async (email, password, options = { redirect: true }) => {
		try {
			const result = await signIn({ email, password })
			if (options.redirect) {
				navigateTo('/')
			}
			return result
		} catch (error) {
			console.error('[Auth] Login error:', error)
			throw error
		}
	}

	const logout = async (options = { redirect: true, callbackUrl: '/' }) => {
		return signOut({
			callbackUrl: options.redirect ? (options.callbackUrl || '/') : undefined,
		})
	}

	// ─── Registration ─────────────────────────────────────────────────────────

	const register = async (userData) => {
		clearOrgSelection()
		return await $fetch('/api/auth/register', {
			method: 'POST',
			body: userData,
		})
	}

	// ─── Password & Invitation Actions (merged from useAuthActions) ───────────

	const passwordRequest = async (email) => {
		return await $fetch('/api/directus/users/password-reset-request', {
			method: 'POST',
			body: { email },
		})
	}

	const passwordReset = async (token, password) => {
		return await $fetch('/api/directus/users/password-reset', {
			method: 'POST',
			body: { token, password },
		})
	}

	const inviteUser = async (email, role, inviteUrl) => {
		return await $fetch('/api/directus/users/invite', {
			method: 'POST',
			body: { email, role, invite_url: inviteUrl },
		})
	}

	const acceptUserInvite = async (token, password) => {
		return await $fetch('/api/directus/users/accept-invite', {
			method: 'POST',
			body: { token, password },
		})
	}

	// ─── Client-Side Lifecycle (runs once globally) ────────────────────────────

	if (import.meta.client && !_initialized) {
		_initialized = true

		// Track when tab was hidden to detect long sleeps
		let _hiddenAt = 0
		document.addEventListener('visibilitychange', async () => {
			if (document.visibilityState === 'hidden') {
				_hiddenAt = Date.now()
				return
			}

			// Tab became visible again
			if (!loggedIn.value) return

			const hiddenDuration = _hiddenAt ? Date.now() - _hiddenAt : 0
			const expiresAt = session.value?.expiresAt

			// Always refresh if hidden for >5 minutes (covers laptop sleep scenarios)
			// or if token is within 2 minutes of expiry
			if (hiddenDuration > 300_000 || (expiresAt && Date.now() >= expiresAt - 120_000)) {
				// refreshSession self-heals on a fatal (401) result — it runs
				// handleFatalAuthFailure (toast + clear + redirect) internally — so
				// a dead token on wake logs the user out cleanly, while a transient
				// network blip leaves the session intact.
				await refreshSession()
			} else {
				scheduleRefresh()
			}
		})

		initCrossTabSync()

		// Single global watcher to start/stop refresh scheduling on auth changes
		watch(
			loggedIn,
			(isLoggedIn) => {
				if (isLoggedIn) {
					scheduleRefresh()
				} else {
					clearRefreshTimer()
				}
			},
			{ immediate: true },
		)
	}

	return {
		// State
		status,
		data: session,
		user,
		loggedIn,
		session,

		// Core methods
		signIn,
		signOut,
		refreshSession,
		fetchSession,

		// Convenience wrappers
		login,
		logout,
		register,

		// Password & invitation actions
		passwordRequest,
		passwordReset,
		inviteUser,
		acceptUserInvite,
	}
}
