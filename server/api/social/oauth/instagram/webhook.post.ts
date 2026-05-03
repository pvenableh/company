/**
 * Instagram Webhook Receiver
 * POST /api/social/oauth/instagram/webhook
 *
 * Receives event notifications (comments, mentions, message replies, etc.)
 * subscribed in the Meta app dashboard. Must always 200 OK quickly — Meta
 * retries on non-2xx and disables the webhook after repeated failures.
 *
 * Payload shape: https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // TODO: route by `entry[].changes[].field` (comments | mentions | messages)
  // and persist to a `social_inbox` collection. For now, log + ack.
  console.log('[social:instagram:webhook] Received event:', JSON.stringify(body))

  return { ok: true }
})
