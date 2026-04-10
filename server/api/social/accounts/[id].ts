/**
 * Single Account API
 * GET /api/social/accounts/:id — Get account details
 * PATCH /api/social/accounts/:id — Update account (assign to client)
 * DELETE /api/social/accounts/:id — Disconnect account
 */

import { z } from 'zod'
import { logSocialActivity } from '~~/server/utils/social-directus'

const updateAccountSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
})

async function directusFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const config = useRuntimeConfig()
  const { method = 'GET', body, params } = options
  const queryString = params ? `?${new URLSearchParams(params).toString()}` : ''

  const response = await fetch(`${config.directus.url}${path}${queryString}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.directus.serverToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    if (response.status === 404) return null as T
    const error = await response.text()
    throw new Error(`Directus request failed: ${response.status} ${error}`)
  }

  const json = await response.json()
  return json.data as T
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: 'Account ID required' })
  }

  // GET: Account details
  if (method === 'GET') {
    const account = await directusFetch<any>(`/items/social_accounts/${id}`, {
      params: {
        fields: 'id,platform,platform_user_id,account_name,account_handle,profile_picture_url,status,token_expires_at,client_id,date_created',
      },
    })

    if (!account) {
      throw createError({ statusCode: 404, message: 'Account not found' })
    }

    // Get client name if assigned
    if (account.client_id) {
      const client = await directusFetch<any>(`/items/social_clients/${account.client_id}`)
      account.client_name = client?.name
    }

    return { data: account }
  }

  // PATCH: Update account (mainly for assigning to client)
  if (method === 'PATCH') {
    const body = await readBody(event)
    const parsed = updateAccountSchema.safeParse(body)

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Validation failed',
        data: parsed.error.flatten(),
      })
    }

    const updated = await directusFetch<any>(`/items/social_accounts/${id}`, {
      method: 'PATCH',
      body: parsed.data,
    })

    return { data: updated }
  }

  // DELETE: Disconnect account
  if (method === 'DELETE') {
    const account = await directusFetch<any>(`/items/social_accounts/${id}`)

    if (!account) {
      throw createError({ statusCode: 404, message: 'Account not found' })
    }

    await directusFetch(`/items/social_accounts/${id}`, { method: 'DELETE' })

    await logSocialActivity({
      action: 'account_disconnected',
      entity_type: 'account',
      entity_id: id,
      platform: account.platform,
      details: { account_name: account.account_name },
    })

    return { success: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
