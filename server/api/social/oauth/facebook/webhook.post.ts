/**
 * Facebook / Messenger Webhook Receiver
 * POST /api/social/oauth/facebook/webhook
 *
 * Receives event notifications subscribed in the Meta app dashboard for the
 * Messenger and Pages products (messages, messaging_postbacks, feed, mention,
 * etc.). Must always 200 OK quickly — Meta retries on non-2xx and disables the
 * webhook after repeated failures.
 *
 * Payload shape: https://developers.facebook.com/docs/graph-api/webhooks/reference/page
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // TODO: route by `entry[].messaging` (Messenger DMs) and
  // `entry[].changes[].field` (feed, mentions, etc.) and persist to a
  // `social_inbox` collection. For now, log + ack.
  console.log('[social:facebook:webhook] Received event:', JSON.stringify(body))

  return { ok: true }
})
