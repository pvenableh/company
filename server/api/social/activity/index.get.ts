/**
 * Activity Feed
 * GET /api/social/activity
 *
 * Query: ?type=comment|mention|reaction&read=false&limit=50&page=1
 */

import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItems } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const { type, read, limit, page } = getQuery(event) as Record<string, string>

  const filter: Record<string, any> = { organization: { _eq: organizationId } }
  if (type) filter.type = { _eq: type }
  if (read === 'false') filter.read = { _eq: false }
  if (read === 'true') filter.read = { _eq: true }

  const directus = getTypedDirectus()
  const rows = (await directus.request(
    readItems('social_activity', {
      filter,
      sort: ['-created_at'],
      limit: Math.min(Number(limit) || 50, 100),
      page: Number(page) || 1,
      fields: [
        'id',
        'platform',
        'type',
        'ref_id',
        'post_id',
        'actor_id',
        'actor_name',
        'preview',
        'read',
        'created_at',
        { account: ['id', 'account_name', 'account_handle', 'profile_picture_url'] },
      ],
    }),
  )) as any[]

  return { data: rows }
})
