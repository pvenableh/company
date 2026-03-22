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

export const useDirectusAuth = () => {
	const { user, loggedIn, session, fetch: fetchSession, clear: clearSession } = useUserSession()

	const status = computed(() => (loggedIn.value ? 'authenticated' : 'unauthenticated'))

	// ─── Token Refresh ─────────────────────────────────────────────────────────

	const refreshSession = async () => {
		if (_isRefreshing) return null
		_isRefreshing = true

		try {
			await $fetch('/api/auth/refresh', { method: 'POST' })
			await fetchSession()
			scheduleRefresh()
			broadcastAuth('refresh')
			return session.value
		} catch (error) {
			console.error('[Auth] Token refresh failed:', error)
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
					await fetchSession()
					scheduleRefresh()
				}
			}
			window.addEventListener('storage', storageHandler)
		}
	}

	// ─── Sign In / Sign Out ────────────────────────────────────────────────────

	const signIn = async (credentials) => {
		try {
			const result = await $fetch('/api/auth/login', {
				method: 'POST',
				body: credentials,
			})

			await fetchSession()
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

		// Re-check token when tab becomes visible again
		document.addEventListener('visibilitychange', async () => {
			if (document.visibilityState !== 'visible' || !loggedIn.value) return

			const expiresAt = session.value?.expiresAt
			if (expiresAt && Date.now() >= expiresAt - 120_000) {
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
