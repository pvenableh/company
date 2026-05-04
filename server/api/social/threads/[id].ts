/**
 * Single Inbox Thread
 * GET /api/social/threads/:id    — fetch thread + recent messages
 * PATCH /api/social/threads/:id  — update (archive, assigned_to, mark read by zeroing unread_count)
 */

import { z } from 'zod'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItem, readItems, updateItem } from '@directus/sdk'

const patchSchema = z.object({
  archived: z.boolean().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  unread_count: z.number().int().min(0).optional(),
})

async function loadThread(id: string, organizationId: string) {
  const directus = getTypedDirectus()
  const thread = (await directus.request(
    readItem('social_threads', id, {
      fields: [
        'id',
        'organization',
        'platform',
        'thread_id',
        'participant_id',
        'participant_name',
        'participant_avatar',
        'last_message_at',
        'last_message_preview',
        'unread_count',
        'archived',
        'assigned_to',
        { account: ['id', 'platform', 'account_name', 'account_handle', 'profile_picture_url', 'platform_user_id'] },
      ],
    }),
  )) as any
  if (!thread) return null
  const orgId = typeof thread.organization === 'string' ? thread.organization : thread.organization?.id
  if (orgId !== organizationId) return null
  return thread
}

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Thread ID required' })
  const method = getMethod(event)

  const thread = await loadThread(id, organizationId)
  if (!thread) throw createError({ statusCode: 404, message: 'Thread not found' })

  const directus = getTypedDirectus()

  if (method === 'GET') {
    const messages = (await directus.request(
      readItems('social_messages', {
        filter: { thread: { _eq: id } },
        sort: ['created_at'],
        limit: 100,
        fields: ['id', 'platform_message_id', 'from_id', 'is_outgoing', 'text', 'attachments', 'reactions', 'created_at'],
      }),
    )) as any[]
    return { data: { ...thread, messages } }
  }

  if (method === 'PATCH') {
    const body = await readBody(event)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
    }
    const updated = (await directus.request(updateItem('social_threads', id, parsed.data))) as any
    return { data: updated }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
