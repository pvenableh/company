/**
 * Threads Webhook Receiver
 * POST /api/social/oauth/threads/webhook
 *
 * Verifies the X-Hub-Signature-256 against the Threads app secret, then routes
 * the payload through the shared inbox router. Must always 200 OK quickly —
 * Meta retries on non-2xx and disables the webhook after repeated failures.
 *
 * Payload shape: https://developers.facebook.com/docs/threads/webhooks
 */

import { verifyMetaWebhookSignature } from '~~/server/utils/meta-webhook-signature'
import { routeWebhookEvent } from '~~/server/utils/social-inbox-router'

export default defineEventHandler(async (event) => {
  const { social } = useRuntimeConfig()
  const appSecret = social?.threads?.appSecret || social?.instagram?.appSecret || ''

  const rawBody = (await readRawBody(event)) || ''
  const signature = getHeader(event, 'x-hub-signature-256')

  if (!verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
    console.warn('[social:threads:webhook] Signature mismatch — rejecting')
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  let payload: any
  try {
    payload = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  routeWebhookEvent(payload).catch((err) => {
    console.error('[social:threads:webhook] Router error:', err)
  })

  return { ok: true }
})
