// usePushSubscription — handles the Web Push registration dance.
//
// Capabilities:
//   - feature-detect Service Worker + PushManager + Notification
//   - register /sw.js (idempotent — browsers dedupe by scope)
//   - subscribe with the VAPID public key from /api/push/vapid-public-key
//   - POST the subscription to /api/push/subscribe (server upserts by endpoint)
//   - mirror server state in a ref so the UI knows whether push is on
//   - DELETE on unsubscribe
//
// iOS gotcha: push is iOS 16.4+ ONLY and only works when the app is added
// to the Home Screen (display-mode: standalone). We detect & gracefully
// no-op below that — `canSubscribe` returns false and `subscribe()` is a
// no-op so the UI can hide the toggle.

import { computed, onMounted, ref } from 'vue'

function base64UrlToUint8Array(b64url: string): Uint8Array {
	const padding = '='.repeat((4 - (b64url.length % 4)) % 4)
	const base64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/')
	const raw = atob(base64)
	const arr = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
	return arr
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
	if (!buf) return ''
	const bytes = new Uint8Array(buf)
	let bin = ''
	for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]!)
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
	if (typeof window === 'undefined') return null
	if (!('serviceWorker' in navigator)) return null
	if (registrationPromise) return registrationPromise
	registrationPromise = navigator.serviceWorker
		.register('/sw.js', { scope: '/' })
		.then(async (reg) => {
			// Wait for the SW to be ready so subscribe() doesn't race.
			await navigator.serviceWorker.ready
			return reg
		})
		.catch((err) => {
			console.error('[push] SW registration failed:', err)
			return null
		})
	return registrationPromise
}

export interface PushSupport {
	serviceWorker: boolean
	pushManager: boolean
	notification: boolean
	/** True if the platform can deliver push to this browser instance (iOS standalone check). */
	canSubscribe: boolean
}

function detectSupport(): PushSupport {
	if (typeof window === 'undefined') {
		return { serviceWorker: false, pushManager: false, notification: false, canSubscribe: false }
	}
	const swSupport = 'serviceWorker' in navigator
	const pushSupport = 'PushManager' in window
	const notifSupport = 'Notification' in window
	if (!swSupport || !pushSupport || !notifSupport) {
		return { serviceWorker: swSupport, pushManager: pushSupport, notification: notifSupport, canSubscribe: false }
	}
	// iOS: push only works when added to Home Screen. Safari on iOS exposes
	// PushManager from 16.4+ in standalone PWA contexts only. We detect
	// standalone via display-mode + the legacy navigator.standalone for
	// older iOS variants.
	const isStandalone =
		window.matchMedia?.('(display-mode: standalone)').matches ||
		(navigator as any).standalone === true
	const ua = navigator.userAgent
	const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
	const canSubscribe = !isIOS || isStandalone
	return { serviceWorker: swSupport, pushManager: pushSupport, notification: notifSupport, canSubscribe }
}

export function usePushSubscription() {
	const support = ref<PushSupport>(detectSupport())
	const permission = ref<NotificationPermission | 'unknown'>('unknown')
	const subscription = ref<PushSubscription | null>(null)
	const loading = ref(false)
	const error = ref<string | null>(null)

	const isSubscribed = computed(() => !!subscription.value)

	async function refreshState() {
		support.value = detectSupport()
		if (typeof window !== 'undefined' && 'Notification' in window) {
			permission.value = Notification.permission
		}
		if (!support.value.canSubscribe) return
		const reg = await getRegistration()
		if (!reg) return
		try {
			subscription.value = await reg.pushManager.getSubscription()
		} catch (err) {
			console.error('[push] getSubscription failed:', err)
		}
	}

	async function subscribe() {
		error.value = null
		if (!support.value.canSubscribe) {
			error.value = 'This device does not support web push (iOS requires installing to Home Screen).'
			return null
		}
		loading.value = true
		try {
			const reg = await getRegistration()
			if (!reg) throw new Error('Service worker registration failed')

			// Request notification permission. This MUST happen during a user
			// gesture (click) on most browsers — callers should invoke this
			// from a click handler.
			const perm = await Notification.requestPermission()
			permission.value = perm
			if (perm !== 'granted') {
				error.value = perm === 'denied' ? 'Permission denied' : 'Permission not granted'
				return null
			}

			// Fetch the VAPID public key. Cached in the route — cheap.
			const { key } = await $fetch<{ key: string }>('/api/push/vapid-public-key')
			if (!key) throw new Error('No VAPID key configured')

			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: base64UrlToUint8Array(key),
			})

			const payload = {
				endpoint: sub.endpoint,
				keys: {
					p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
					auth: arrayBufferToBase64Url(sub.getKey('auth')),
				},
				user_agent: navigator.userAgent,
			}
			await $fetch('/api/push/subscribe', { method: 'POST', body: payload })

			subscription.value = sub
			return sub
		} catch (err: any) {
			console.error('[push] subscribe failed:', err)
			error.value = err?.message || 'Could not enable push notifications'
			return null
		} finally {
			loading.value = false
		}
	}

	async function unsubscribe() {
		error.value = null
		loading.value = true
		try {
			const sub = subscription.value || (await (await getRegistration())?.pushManager.getSubscription())
			if (!sub) return true
			const endpoint = sub.endpoint
			try {
				await sub.unsubscribe()
			} catch (err) {
				console.error('[push] browser unsubscribe failed (continuing to server delete):', err)
			}
			try {
				await $fetch('/api/push/subscribe', { method: 'DELETE', body: { endpoint } })
			} catch (err) {
				console.error('[push] server unsubscribe failed:', err)
			}
			subscription.value = null
			return true
		} finally {
			loading.value = false
		}
	}

	onMounted(() => {
		refreshState()

		// SW can post `push-navigate` when the user clicks a notification that
		// landed while an open tab existed — route the SPA without a reload.
		if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', (event) => {
				const data = event.data
				if (data?.type === 'push-navigate' && typeof data.url === 'string') {
					try {
						const router = useRouter()
						router.push(data.url)
					} catch {
						window.location.href = data.url
					}
				}
			})
		}
	})

	return {
		support,
		permission,
		subscription,
		isSubscribed,
		loading,
		error,
		subscribe,
		unsubscribe,
		refreshState,
	}
}
