/**
 * OAuth Connect Endpoints
 * GET /api/social/accounts/connect/instagram — Redirect to Instagram OAuth
 * GET /api/social/accounts/connect/tiktok — Redirect to TikTok OAuth
 */

import { getInstagramAuthUrl } from '~/server/adapters/instagram'
import { getTikTokAuthUrl } from '~/server/adapters/tiktok'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform')
  const state = randomUUID() // In production, store this in session for CSRF protection

  if (platform === 'instagram') {
    const authUrl = getInstagramAuthUrl(state)
    return sendRedirect(event, authUrl)
  }

  if (platform === 'tiktok') {
    const authUrl = getTikTokAuthUrl(state)
    return sendRedirect(event, authUrl)
  }

  throw createError({ statusCode: 400, message: 'Invalid platform' })
})
