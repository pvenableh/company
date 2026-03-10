/**
 * Clients API
 * GET /api/social/clients — List all clients
 * POST /api/social/clients — Create a new client
 */

import { z } from 'zod'

const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  logo_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  brand_color: z.string().max(20).optional(),
  notes: z.string().optional(),
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
    const error = await response.text()
    throw new Error(`Directus request failed: ${response.status} ${error}`)
  }

  const json = await response.json()
  return json.data as T
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event)

  // GET: List clients
  if (method === 'GET') {
    const clients = await directusFetch<any[]>('/items/social_clients', {
      params: { sort: 'name' },
    })

    // Get account counts per client
    const accounts = await directusFetch<any[]>('/items/social_accounts', {
      params: { 'fields': 'id,client_id' },
    })

    const accountCounts = accounts.reduce((acc, a) => {
      if (a.client_id) {
        acc[a.client_id] = (acc[a.client_id] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    const clientsWithCounts = clients.map((c) => ({
      ...c,
      account_count: accountCounts[c.id] || 0,
    }))

    return { data: clientsWithCounts }
  }

  // POST: Create client
  if (method === 'POST') {
    const body = await readBody(event)
    const parsed = createClientSchema.safeParse(body)

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Validation failed',
        data: parsed.error.flatten(),
      })
    }

    const client = await directusFetch<any>('/items/social_clients', {
      method: 'POST',
      body: parsed.data,
    })

    return { data: client }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
