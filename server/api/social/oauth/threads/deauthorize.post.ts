/**
 * Threads Deauthorize Callback
 * POST /api/social/oauth/threads/deauthorize
 *
 * Fired when a user removes the Earnest app from their Threads account
 * (Threads → Settings → Account → Apps and websites). Meta posts a
 * `signed_request` containing the Threads `user_id`, which we stored on
 * `social_accounts.platform_user_id` at connect time. Mark every matching
 * row as revoked so we stop using their tokens.
 *
 * Docs: https://developers.facebook.com/docs/threads/overview
 */

import { parseSignedRequest } from '~~/server/utils/meta-signed-request'

export default defineEventHandler(async (event) => {
  const { social } = useRuntimeConfig()
  const appSecret = social?.threads?.appSecret

  if (!appSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Threads app secret not configured' })
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
    console.error('[social:threads:deauthorize] Invalid signed_request:', err.message)
    throw createError({ statusCode: 400, statusMessage: 'Invalid signed_request' })
  }

  const directusUrl = process.env.DIRECTUS_URL || 'http://localhost:8055'
  const directusToken = process.env.DIRECTUS_SERVER_TOKEN || ''

  const search = await fetch(
    `${directusUrl}/items/social_accounts?filter[platform][_eq]=threads&filter[platform_user_id][_eq]=${encodeURIComponent(userId)}&fields=id`,
    { headers: { Authorization: `Bearer ${directusToken}` } },
  )
  const { data: accounts = [] } = (await search.json()) as { data: Array<{ id: string }> }

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

  console.log(`[social:threads:deauthorize] threads user_id=${userId} revoked ${accounts.length} account(s)`)
  return { ok: true, revoked: accounts.length }
})
