/**
 * Single Social Account API
 * GET /api/social/accounts/:id     — fetch (org-scoped)
 * PATCH /api/social/accounts/:id   — update (e.g. reassign client)
 * DELETE /api/social/accounts/:id  — disconnect
 */

import { z } from 'zod'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getSocialAccountById, logSocialActivity } from '~~/server/utils/social-directus'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItem, updateItem, deleteItem } from '@directus/sdk'

const updateAccountSchema = z.object({
  client: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const method = getMethod(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Account ID required' })

  const account = await getSocialAccountById(id, organizationId)
  if (!account) throw createError({ statusCode: 404, message: 'Account not found' })

  const directus = getTypedDirectus()

  if (method === 'GET') {
    let clientName: string | null = null
    const clientId = typeof account.client === 'string' ? account.client : (account.client as any)?.id || null
    if (clientId) {
      try {
        const c = (await directus.request(readItem('clients', clientId, { fields: ['name'] }))) as any
        clientName = c?.name ?? null
      } catch { /* ignore */ }
    }
    return {
      data: {
        id: account.id,
        platform: account.platform,
        platform_user_id: account.platform_user_id,
        account_name: account.account_name,
        account_handle: account.account_handle,
        profile_picture_url: account.profile_picture_url,
        status: account.account_status,
        token_expires_at: account.token_expires_at,
        organization: typeof account.organization === 'string' ? account.organization : (account.organization as any)?.id,
        client: clientId,
        client_name: clientName,
        date_created: account.date_created,
      },
    }
  }

  if (method === 'PATCH') {
    const body = await readBody(event)
    const parsed = updateAccountSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() })
    }
    // If client supplied, verify it's in the same org
    if (parsed.data.client) {
      const c = (await directus.request(readItem('clients', parsed.data.client, { fields: ['organization'] })).catch(() => null)) as any
      if (!c) throw createError({ statusCode: 404, message: 'Client not found' })
      const cOrg = typeof c.organization === 'string' ? c.organization : c.organization?.id
      if (cOrg !== organizationId) {
        throw createError({ statusCode: 403, message: 'Client belongs to a different organization' })
      }
    }
    const updated = (await directus.request(updateItem('social_accounts', id, parsed.data))) as any
    return { data: updated }
  }

  if (method === 'DELETE') {
    await directus.request(deleteItem('social_accounts', id))
    await logSocialActivity({
      action: 'account_disconnected',
      entity_type: 'account',
      entity_id: id,
      platform: account.platform as any,
      details: { account_name: account.account_name },
    })
    return { success: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
