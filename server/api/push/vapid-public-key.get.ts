// Returns the VAPID public key the browser uses when calling
// pushManager.subscribe({ applicationServerKey }). Public by design — VAPID
// public keys are safe to expose.

export default defineEventHandler(() => {
	const config = useRuntimeConfig()
	const key = config.public?.vapidPublicKey
	if (!key) {
		throw createError({ statusCode: 503, statusMessage: 'Push notifications not configured' })
	}
	return { key }
})
