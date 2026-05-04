/**
 * Facebook / Messenger Webhook Verification
 * GET /api/social/oauth/facebook/webhook
 *
 * Meta sends a verification request when you save the webhook URL in the app
 * dashboard (Messenger product → Webhooks). We must echo back `hub.challenge`
 * if the verify token matches.
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */

export default defineEventHandler((event) => {
  const query = getQuery(event) as Record<string, string>
  const mode = query['hub.mode']
  const token = query['hub.verify_token']
  const challenge = query['hub.challenge']

  const expected = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN

  if (!expected) {
    throw createError({ statusCode: 500, statusMessage: 'FACEBOOK_WEBHOOK_VERIFY_TOKEN not configured' })
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    setResponseHeader(event, 'Content-Type', 'text/plain')
    return challenge
  }

  throw createError({ statusCode: 403, statusMessage: 'Verification failed' })
})
