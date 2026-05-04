/**
 * Mark Thread Read
 * POST /api/social/threads/:id/mark-read
 *
 * Calls the platform's markRead (best-effort) and zeros unread_count locally.
 */

import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItem, updateItem } from '@directus/sdk'
import { getDecryptedAccessToken } from '~~/server/utils/social-directus'
import { facebookAdapter } from '~~/server/adapters/facebook'
import { instagramAdapter } from '~~/server/adapters/instagram'
import { threadsAdapter } from '~~/server/adapters/threads'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Thread ID required' })

  const directus = getTypedDirectus()
  const thread = (await directus.request(
    readItem('social_threads', id, {
      fields: ['id', 'organization', 'platform', 'participant_id', { account: ['id', 'platform_user_id'] }],
    }),
  )) as any
  if (!thread) throw createError({ statusCode: 404, message: 'Thread not found' })
  const orgId = typeof thread.organization === 'string' ? thread.organization : thread.organization?.id
  if (orgId !== organizationId) throw createError({ statusCode: 404, message: 'Thread not found' })

  const platform = thread.platform as 'facebook' | 'instagram' | 'threads'
  const adapter =
    platform === 'facebook' ? facebookAdapter : platform === 'instagram' ? instagramAdapter : threadsAdapter

  if (adapter.markRead) {
    try {
      const accountId = thread.account?.id || thread.account
      const token = await getDecryptedAccessToken(accountId)
      if (token) await adapter.markRead(thread.participant_id, token)
    } catch (err) {
      console.warn('[social:mark-read] adapter call failed (non-fatal):', err)
    }
  }

  await directus.request(updateItem('social_threads', id, { unread_count: 0 }))

  return { ok: true }
})
