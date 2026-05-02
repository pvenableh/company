/**
 * GET /api/social/accounts — list connected accounts for the active org.
 */

import type { SocialAccountPublic, SocialPlatform } from '~~/shared/social'
import { differenceInHours } from 'date-fns'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { getSocialAccounts } from '~~/server/utils/social-directus'
import { getTypedDirectus } from '~~/server/utils/directus'
import { readItems } from '@directus/sdk'

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const query = getQuery(event)
  const platform = query.platform as SocialPlatform | undefined
  const status = query.status as 'active' | 'expired' | 'revoked' | undefined
  const clientFilter = query.client as string | undefined

  const accounts = await getSocialAccounts(organizationId, {
    platform,
    status,
    client: clientFilter === 'null' ? null : clientFilter,
  })

  // Resolve client names for display
  const clientIds = Array.from(new Set(accounts.map((a) => (typeof a.client === 'string' ? a.client : a.client?.id)).filter(Boolean))) as string[]
  const clientNameById = new Map<string, string>()
  if (clientIds.length) {
    try {
      const directus = getTypedDirectus()
      const clients = (await directus.request(
        readItems('clients', { filter: { id: { _in: clientIds } }, fields: ['id', 'name'], limit: -1 }),
      )) as Array<{ id: string; name: string }>
      for (const c of clients) clientNameById.set(c.id, c.name)
    } catch {
      // best-effort
    }
  }

  const publicAccounts: SocialAccountPublic[] = accounts.map((a) => {
    const clientId = typeof a.client === 'string' ? a.client : a.client?.id || null
    return {
      id: a.id,
      platform: a.platform as SocialPlatform,
      account_name: a.account_name,
      account_handle: a.account_handle,
      profile_picture_url: a.profile_picture_url ?? null,
      status: (a.account_status as any) || 'active',
      token_expires_at: a.token_expires_at,
      is_token_expiring_soon: a.token_expires_at
        ? differenceInHours(new Date(a.token_expires_at), new Date()) < 24 * 7
        : false,
      organization: typeof a.organization === 'string' ? a.organization : (a.organization as any)?.id,
      client: clientId,
      client_name: clientId ? clientNameById.get(clientId) || null : null,
    }
  })

  return { data: publicAccounts }
})
