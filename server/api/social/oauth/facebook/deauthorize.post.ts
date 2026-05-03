/**
 * Meta Deauthorize Callback
 * POST /api/social/oauth/facebook/deauthorize
 *
 * Fired when a user removes the Earnest app from their Facebook account
 * (Settings → Apps and Websites → Remove). Meta sends a signed_request
 * containing the FB `user_id`. We mark every social_accounts row tied to
 * that fb_user_id as revoked so we stop trying to use their tokens.
 *
 * The same handler URL can be reused for the Instagram product callback —
 * both flow through the same Meta app and produce the same payload shape.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow#deauthorize-callback
 */

import { parseSignedRequest } from '~~/server/utils/meta-signed-request'

export default defineEventHandler(async (event) => {
  const { social } = useRuntimeConfig()
  const appSecret = social?.facebook?.appSecret || social?.instagram?.appSecret

  if (!appSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Meta app secret not configured' })
  }

  const body = await readBody<{ signed_request?: string } | string>(event)
  const signedRequest =
    typeof body === 'string'
      ? new URLSearchParams(body).get('signed_request')
      : body?.signed_request

  if (!signedRequest) {
    throw createError({ statusCode: 400, statusMessage: 'Missing signed_request' })
  }

  let userId: string
  try {
    const payload = parseSignedRequest(signedRequest, appSecret)
    userId = payload.user_id
  } catch (err: any) {
    console.error('[social:meta:deauthorize] Invalid signed_request:', err.message)
    throw createError({ statusCode: 400, statusMessage: 'Invalid signed_request' })
  }

  const directusUrl = process.env.DIRECTUS_URL || 'http://localhost:8055'
  const directusToken = process.env.DIRECTUS_SERVER_TOKEN || ''

  // Find every account whose metadata.fb_user_id matches the deauthorizing user.
  // Stored on Facebook page rows in [server/api/social/oauth/facebook/callback.get.ts].
  const search = await fetch(
    `${directusUrl}/items/social_accounts?filter[metadata][fb_user_id][_eq]=${encodeURIComponent(userId)}&fields=id,platform`,
    { headers: { Authorization: `Bearer ${directusToken}` } },
  )
  const { data: accounts = [] } = (await search.json()) as { data: Array<{ id: string; platform: string }> }

  for (const acct of accounts) {
    await fetch(`${directusUrl}/items/social_accounts/${acct.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${directusToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_status: 'revoked', access_token: '', refresh_token: null }),
    })
  }

  console.log(`[social:meta:deauthorize] fb_user_id=${userId} revoked ${accounts.length} account(s)`)
  return { ok: true, revoked: accounts.length }
})
