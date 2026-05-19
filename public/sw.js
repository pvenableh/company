// public/sw.js — minimal service worker for Web Push.
//
// Earnest doesn't install as a full PWA today, so there's no precache /
// offline / Workbox here. The SW exists solely to satisfy the Web Push
// requirement that notifications be displayed from a SW context.
//
// Handles:
//   push              — show the notification (with a no-payload fallback).
//   notificationclick — focus an existing window with the right URL, or
//                       open a new one.

self.addEventListener('install', (event) => {
	// New SW versions take over immediately rather than waiting for every
	// open tab to close. This is safe — we don't cache app shell.
	event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
	let payload = {}
	try {
		payload = event.data ? event.data.json() : {}
	} catch {
		payload = { title: 'Earnest', body: event.data ? event.data.text() : '' }
	}

	const title = payload.title || 'Earnest'
	const body = payload.body || ''
	const url = payload.url || '/'
	const tag = payload.tag || 'earnest-notification'
	const icon = payload.icon || '/icon-192x192.png'
	const badge = payload.badge || '/icon-72x72.png'

	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			tag,
			icon,
			badge,
			data: { url, ...(payload.data || {}) },
			renotify: false,
		}),
	)
})

self.addEventListener('notificationclick', (event) => {
	event.notification.close()
	const targetUrl = (event.notification.data && event.notification.data.url) || '/'

	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
			// If a window is already open on the same origin, focus it and
			// route it to the target URL. Otherwise, open a fresh window.
			for (const client of allClients) {
				try {
					const url = new URL(client.url)
					if (url.origin === self.location.origin) {
						await client.focus()
						if ('navigate' in client) {
							try {
								await client.navigate(targetUrl)
							} catch {
								// some browsers reject navigate on focused tabs — fall back to postMessage
								client.postMessage({ type: 'push-navigate', url: targetUrl })
							}
						} else {
							client.postMessage({ type: 'push-navigate', url: targetUrl })
						}
						return
					}
				} catch {
					// invalid URL — skip
				}
			}
			if (self.clients.openWindow) {
				await self.clients.openWindow(targetUrl)
			}
		})(),
	)
})
