/**
 * Single Client API
 * GET /api/social/clients/:id — Get client with accounts
 * PATCH /api/social/clients/:id — Update client
 * DELETE /api/social/clients/:id — Delete client
 */

import { z } from 'zod'

const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  logo_url: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  notes: z.string().optional().nullable(),
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
    throw createError({ statusCode: 400, message: 'Client ID required' })
  }

  // GET: Single client with accounts
  if (method === 'GET') {
    const client = await directusFetch<any>(`/items/social_clients/${id}`)

    if (!client) {
      throw createError({ statusCode: 404, message: 'Client not found' })
    }

    // Get accounts for this client
    const accounts = await directusFetch<any[]>('/items/social_accounts', {
      params: {
        'filter[client_id][_eq]': id,
        'fields': 'id,platform,account_name,account_handle,profile_picture_url,status,token_expires_at',
      },
    })

    return {
      data: {
        ...client,
        accounts: accounts || [],
      },
    }
  }

  // PATCH: Update client
  if (method === 'PATCH') {
    const body = await readBody(event)
    const parsed = updateClientSchema.safeParse(body)

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Validation failed',
        data: parsed.error.flatten(),
      })
    }

    const updated = await directusFetch<any>(`/items/social_clients/${id}`, {
      method: 'PATCH',
      body: parsed.data,
    })

    return { data: updated }
  }

  // DELETE: Remove client (unlinks accounts, doesn't delete them)
  if (method === 'DELETE') {
    // First, unlink all accounts from this client
    const accounts = await directusFetch<any[]>('/items/social_accounts', {
      params: { 'filter[client_id][_eq]': id, 'fields': 'id' },
    })

    for (const account of accounts || []) {
      await directusFetch(`/items/social_accounts/${account.id}`, {
        method: 'PATCH',
        body: { client_id: null },
      })
    }

    // Then delete the client
    await directusFetch(`/items/social_clients/${id}`, { method: 'DELETE' })

    return { success: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
