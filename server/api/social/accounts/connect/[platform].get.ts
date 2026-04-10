/**
 * OAuth Connect Endpoints
 * GET /api/social/accounts/connect/:platform — Redirect to platform OAuth
 */

import { getInstagramAuthUrl } from '~~/server/adapters/instagram'
import { getTikTokAuthUrl } from '~~/server/adapters/tiktok'
import { getLinkedInAuthUrl } from '~~/server/adapters/linkedin'
import { getFacebookAuthUrl } from '~~/server/adapters/facebook'
import { getThreadsAuthUrl } from '~~/server/adapters/threads'
import { randomUUID } from 'node:crypto'

const authUrlGenerators: Record<string, (state: string) => string> = {
  instagram: getInstagramAuthUrl,
  tiktok: getTikTokAuthUrl,
  linkedin: getLinkedInAuthUrl,
  facebook: getFacebookAuthUrl,
  threads: getThreadsAuthUrl,
}

export default defineEventHandler(async (event) => {
  const platform = getRouterParam(event, 'platform')
  const state = randomUUID() // In production, store this in session for CSRF protection

  const getAuthUrl = platform ? authUrlGenerators[platform] : undefined

  if (getAuthUrl) {
    return sendRedirect(event, getAuthUrl(state))
  }

  throw createError({ statusCode: 400, message: 'Invalid platform' })
})
