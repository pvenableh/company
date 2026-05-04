/**
 * Mark Activity Read
 * POST /api/social/activity/:id/mark-read
 */

import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItem, updateItem } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Activity ID required' })

  const directus = getTypedDirectus()
  const row = (await directus.request(
    readItem('social_activity', id, { fields: ['id', 'organization'] }),
  )) as any
  if (!row) throw createError({ statusCode: 404, message: 'Activity not found' })
  const orgId = typeof row.organization === 'string' ? row.organization : row.organization?.id
  if (orgId !== organizationId) throw createError({ statusCode: 404, message: 'Activity not found' })

  await directus.request(updateItem('social_activity', id, { read: true }))
  return { ok: true }
})
