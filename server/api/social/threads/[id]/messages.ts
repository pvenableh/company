/**
 * Thread Messages
 * GET  /api/social/threads/:id/messages          — list (paginated)
 * POST /api/social/threads/:id/messages          — send a reply
 *
 * Body for POST: { text?: string, mediaUrl?: string, mediaType?: 'image'|'video'|'audio'|'file' }
 */

import { z } from 'zod'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItem, readItems, createItem, updateItem } from '@directus/sdk'
import { getDecryptedAccessToken } from '~~/server/utils/social-directus'
import { facebookAdapter } from '~~/server/adapters/facebook'
import { instagramAdapter } from '~~/server/adapters/instagram'
import { threadsAdapter } from '~~/server/adapters/threads'

const sendSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio', 'file']).optional(),
}).refine((v) => !!v.text || !!v.mediaUrl, { message: 'text or mediaUrl required' })

export default defineEventHandler(async (event) => {
  const { organizationId, userId } = await requireSocialOrg(event)
  const threadId = getRouterParam(event, 'id')
  if (!threadId) throw createError({ statusCode: 400, message: 'Thread ID required' })
  const method = getMethod(event)

  const directus = getTypedDirectus()

  // Load and tenant-check the thread (and its account)
  const thread = (await directus.request(
    readItem('social_threads', threadId, {
      fields: [
        'id',
        'organization',
        'platform',
        'thread_id',
        'participant_id',
        { account: ['id', 'platform', 'platform_user_id', 'organization'] },
      ],
    }),
  )) as any
  if (!thread) throw createError({ statusCode: 404, message: 'Thread not found' })
  const orgId = typeof thread.organization === 'string' ? thread.organization : thread.organization?.id
  if (orgId !== organizationId) throw createError({ statusCode: 404, message: 'Thread not found' })

  if (method === 'GET') {
    const { limit, before } = getQuery(event) as Record<string, string>
    const filter: Record<string, any> = { thread: { _eq: threadId } }
    if (before) filter.created_at = { _lt: before }
    const rows = (await directus.request(
      readItems('social_messages', {
        filter,
        sort: ['-created_at'],
        limit: Math.min(Number(limit) || 50, 100),
        fields: ['id', 'platform_message_id', 'from_id', 'is_outgoing', 'text', 'attachments', 'reactions', 'created_at'],
      }),
    )) as any[]
    return { data: rows.reverse() }
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const parsed = sendSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
    }

    const accountId = thread.account?.id || thread.account
    const accessToken = await getDecryptedAccessToken(accountId)
    if (!accessToken) throw createError({ statusCode: 400, message: 'No access token on account' })

    const platform = thread.platform as 'facebook' | 'instagram' | 'threads'
    const adapter =
      platform === 'facebook' ? facebookAdapter : platform === 'instagram' ? instagramAdapter : threadsAdapter
    if (!adapter.sendMessage) {
      throw createError({ statusCode: 501, message: `${platform} does not support messaging` })
    }

    // Threads: recipient = "userId::parentPostId". Other platforms: participant id.
    const recipientId =
      platform === 'threads'
        ? `${thread.account.platform_user_id}::${thread.thread_id}`
        : thread.participant_id

    const sendResult = await adapter.sendMessage(recipientId, accessToken, {
      text: parsed.data.text,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType,
    })

    const createdAt = new Date().toISOString()
    const inserted = (await directus.request(
      createItem('social_messages', {
        thread: threadId,
        organization: organizationId,
        platform_message_id: sendResult.messageId,
        from_id: thread.account.platform_user_id,
        is_outgoing: true,
        text: parsed.data.text || null,
        attachments: parsed.data.mediaUrl
          ? [{ type: parsed.data.mediaType || 'image', url: parsed.data.mediaUrl }]
          : null,
        created_at: createdAt,
      }),
    )) as any

    await directus.request(
      updateItem('social_threads', threadId, {
        last_message_at: createdAt,
        last_message_preview: parsed.data.text?.slice(0, 200) || `[${parsed.data.mediaType || 'media'}]`,
      }),
    )

    return { data: inserted }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
