/**
 * List Inbox Threads
 * GET /api/social/threads
 *
 * Query: ?platform=facebook|instagram|threads&archived=false&limit=50&cursor=...
 */

import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItems } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const { platform, archived, limit, cursor } = getQuery(event) as Record<string, string>

  const filter: Record<string, any> = { organization: { _eq: organizationId } }
  if (platform && platform !== 'all') filter.platform = { _eq: platform }
  if (archived === 'true') filter.archived = { _eq: true }
  else filter.archived = { _eq: false }

  const directus = getTypedDirectus()
  const rows = (await directus.request(
    readItems('social_threads', {
      filter,
      sort: ['-last_message_at'],
      limit: Math.min(Number(limit) || 50, 100),
      page: cursor ? Number(cursor) : 1,
      fields: [
        'id',
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
  )) as any[]

  return { data: rows }
})
