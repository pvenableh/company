/**
 * Unread Activity + Thread Count (powers the header bell)
 * GET /api/social/activity/unread-count
 */

import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { aggregate } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const directus = getTypedDirectus()

  const [activityAgg, threadAgg] = await Promise.all([
    directus.request(
      aggregate('social_activity', {
        aggregate: { count: '*' },
        query: { filter: { organization: { _eq: organizationId }, read: { _eq: false } } },
      }),
    ),
    directus.request(
      aggregate('social_threads', {
        aggregate: { sum: ['unread_count'] },
        query: { filter: { organization: { _eq: organizationId }, archived: { _eq: false } } },
      }),
    ),
  ])

  const activityCount = Number((activityAgg as any[])[0]?.count || 0)
  const threadUnread = Number((threadAgg as any[])[0]?.sum?.unread_count || 0)

  return {
    data: {
      activity: activityCount,
      messages: threadUnread,
      total: activityCount + threadUnread,
    },
  }
})
