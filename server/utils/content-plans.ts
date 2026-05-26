/**
 * Content Plans server util.
 *
 * One first-class "content deliverable" per (project, month) — or per
 * (project, project_event) for campaign/launch plans. Bundles a strategy
 * + a batch of social_posts so the client can review the whole month in
 * one round-trip.
 *
 * Plan-level approve cascades to child posts (in_review → approved) and
 * triggers the existing per-post auto-promote on `updateSocialPost`
 * (publisher bridge — see server/utils/social-directus.ts:325).
 */

import type {
  ContentPlanRecord,
  ContentPlanState,
  ContentPlanType,
} from '~~/shared/social'
import type { SocialPost as DirectusSocialPost } from '~~/shared/directus'
import { randomUUID } from 'node:crypto'
import { updateSocialPost } from './social-directus'

function getDirectusConfig() {
  const config = useRuntimeConfig()
  return {
    url: config.directus?.url || process.env.DIRECTUS_URL || 'http://localhost:8055',
    token: config.directus?.serverToken || process.env.DIRECTUS_SERVER_TOKEN || '',
  }
}

async function directusFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const { url, token } = getDirectusConfig()
  const { method = 'GET', body, params } = options

  const queryString = params ? `?${new URLSearchParams(params).toString()}` : ''
  const response = await fetch(`${url}${path}${queryString}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Directus request failed: ${response.status} ${error}`)
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }
  const json = await response.json()
  return json.data as T
}

// ── Read ────────────────────────────────────────────────────────────

export interface ContentPlanListFilters {
  organization: string // required — tenant scope
  project?: string
  target_client?: string
  state?: ContentPlanState
  plan_type?: ContentPlanType
  target_month?: string // YYYY-MM-DD (first of month)
}

export async function listContentPlans(filters: ContentPlanListFilters): Promise<ContentPlanRecord[]> {
  if (!filters.organization) throw new Error('listContentPlans: organization is required')
  const params: Record<string, string> = {
    sort: '-target_month,-date_created',
    limit: '200',
    'filter[organization][_eq]': filters.organization,
  }
  if (filters.project) params['filter[project][_eq]'] = filters.project
  if (filters.target_client) params['filter[target_client][_eq]'] = filters.target_client
  if (filters.state) params['filter[state][_eq]'] = filters.state
  if (filters.plan_type) params['filter[plan_type][_eq]'] = filters.plan_type
  if (filters.target_month) params['filter[target_month][_eq]'] = filters.target_month

  const rows = await directusFetch<any[]>('/items/content_plans', { params })
  return rows.map(toRecord)
}

/**
 * Fetch a plan by id. If `organization` is provided, returns null when the
 * plan belongs to a different org (callers should treat as 404 to avoid
 * leaking existence across tenants).
 */
export async function getContentPlanById(
  id: number | string,
  opts: { organization?: string } = {},
): Promise<ContentPlanRecord | null> {
  try {
    const raw = await directusFetch<any>(`/items/content_plans/${id}`)
    if (!raw) return null
    const record = toRecord(raw)
    if (opts.organization && record.organization && record.organization !== opts.organization) {
      return null
    }
    return record
  } catch {
    return null
  }
}

export async function getContentPlanByToken(token: string): Promise<ContentPlanRecord | null> {
  if (!token || token.length < 16) return null
  const rows = await directusFetch<any[]>('/items/content_plans', {
    params: {
      'filter[approval_token][_eq]': token,
      limit: '1',
    },
  })
  const row = rows?.[0]
  return row ? toRecord(row) : null
}

export async function getContentPlanPosts(planId: number | string): Promise<DirectusSocialPost[]> {
  const rows = await directusFetch<DirectusSocialPost[]>('/items/social_posts', {
    params: {
      'filter[content_plan][_eq]': String(planId),
      sort: 'scheduled_at,date_created',
      limit: '500',
    },
  })
  return rows ?? []
}

// ── Write ───────────────────────────────────────────────────────────

export interface CreateContentPlanInput {
  organization: string
  title?: string | null
  project?: string | null
  target_client?: string | null
  plan_type?: ContentPlanType
  target_month?: string | null
  project_event?: string | null
  objective?: string | null
  themes?: string[] | null
  strategy?: string | null
  cover_image_url?: string | null
  user_created?: string | null
}

export async function createContentPlan(input: CreateContentPlanInput): Promise<ContentPlanRecord> {
  if (!input.organization) throw new Error('createContentPlan: organization is required')
  const body: Record<string, unknown> = {
    organization: input.organization,
    plan_type: input.plan_type ?? 'monthly_cadence',
    state: 'draft',
  }
  if (input.project) body.project = input.project
  if (input.title) body.title = input.title
  if (input.target_client) body.target_client = input.target_client
  if (input.target_month) body.target_month = input.target_month
  if (input.project_event) body.project_event = input.project_event
  if (input.objective) body.objective = input.objective
  if (input.themes) body.themes = input.themes
  if (input.strategy) body.strategy = input.strategy
  if (input.cover_image_url) body.cover_image_url = input.cover_image_url
  if (input.user_created) body.user_created = input.user_created

  const raw = await directusFetch<any>('/items/content_plans', { method: 'POST', body })
  return toRecord(raw)
}

/**
 * Find-or-create an Inbox plan for (organization, target_month). Used by
 * `POST /api/social/posts` (which the in-canvas Composer ultimately hits)
 * so every loose post lands in the right bucket without forcing the user
 * to think about plans.
 *
 * Match criteria mirror the backfill script so re-runs cluster cleanly:
 *   organization + plan_type=monthly_cadence + state=draft + project null
 *   + target_client null + target_month equal.
 */
export async function findOrCreateInboxPlan(
  organization: string,
  target_month: string | null,
  userCreated?: string | null,
): Promise<ContentPlanRecord> {
  if (!organization) throw new Error('findOrCreateInboxPlan: organization is required')
  const params: Record<string, string> = {
    'filter[organization][_eq]': organization,
    'filter[plan_type][_eq]': 'monthly_cadence',
    'filter[state][_eq]': 'draft',
    'filter[project][_null]': 'true',
    'filter[target_client][_null]': 'true',
    limit: '1',
  }
  if (target_month) params['filter[target_month][_eq]'] = target_month
  else params['filter[target_month][_null]'] = 'true'

  const existing = await directusFetch<any[]>('/items/content_plans', { params })
  if (existing && existing[0]) return toRecord(existing[0])

  const title = target_month
    ? `Inbox — ${new Date(target_month).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : 'Inbox'

  return createContentPlan({
    organization,
    title,
    plan_type: 'monthly_cadence',
    target_month,
    user_created: userCreated ?? null,
  })
}

export type UpdateContentPlanInput = Partial<
  Omit<ContentPlanRecord, 'id' | 'date_created' | 'date_updated' | 'user_created' | 'approval_token' | 'approved_by' | 'approved_at' | 'sent_for_review_at'>
>

export async function updateContentPlan(
  id: number | string,
  patch: UpdateContentPlanInput,
): Promise<ContentPlanRecord> {
  const raw = await directusFetch<any>(`/items/content_plans/${id}`, {
    method: 'PATCH',
    body: patch,
  })
  return toRecord(raw)
}

export async function deleteContentPlan(id: number | string): Promise<void> {
  await directusFetch(`/items/content_plans/${id}`, { method: 'DELETE' })
}

// ── Actions ─────────────────────────────────────────────────────────

/**
 * Move the plan and every child draft/requested_changes post into review.
 * Mints an approval_token on first send so the client gets a single link
 * to /portal/plans/[token]. Returns the updated plan + cascaded post count.
 */
export async function sendPlanForReview(
  planId: number | string,
  opts: { organization?: string } = {},
): Promise<{
  plan: ContentPlanRecord
  postsTransitioned: number
}> {
  const plan = await getContentPlanById(planId, { organization: opts.organization })
  if (!plan) throw new Error('Plan not found')

  const patch: Record<string, unknown> = {
    state: 'in_review',
    sent_for_review_at: plan.sent_for_review_at ?? new Date().toISOString(),
  }
  if (!plan.approval_token) patch.approval_token = mintToken()

  const updated = toRecord(await directusFetch<any>(`/items/content_plans/${planId}`, {
    method: 'PATCH',
    body: patch,
  }))

  // Cascade to child posts that are still drafts / requested_changes.
  const posts = await getContentPlanPosts(planId)
  let transitioned = 0
  for (const post of posts) {
    const state = (post as any).approval_state
    if (state === 'draft' || state === 'requested_changes') {
      try {
        await updateSocialPost(String(post.id), { approval_state: 'in_review' as any })
        transitioned += 1
      } catch (err) {
        console.error('[content-plans] failed to transition post', post.id, err)
      }
    }
  }

  return { plan: updated, postsTransitioned: transitioned }
}

/**
 * Plan-level approve. Cascades to every in_review/requested_changes child
 * post — `updateSocialPost` then runs its existing auto-promote bridge so
 * any post with a future scheduled_at + platform.account_id flips to
 * `status='scheduled'` (cron worker picks it up from there).
 *
 * Works with or without a portal user session. If approverId is passed,
 * it's stamped on the plan; otherwise we leave approved_by null.
 */
export async function approvePlan(
  planId: number | string,
  opts: { approverId?: string | null; organization?: string } = {},
): Promise<{ plan: ContentPlanRecord; postsApproved: number; postsPromoted: number }> {
  const plan = await getContentPlanById(planId, { organization: opts.organization })
  if (!plan) throw new Error('Plan not found')
  if (plan.state !== 'in_review') {
    throw new Error(`Plan is not in_review (current: ${plan.state})`)
  }

  const updated = toRecord(await directusFetch<any>(`/items/content_plans/${planId}`, {
    method: 'PATCH',
    body: {
      state: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: opts.approverId ?? null,
    },
  }))

  const posts = await getContentPlanPosts(planId)
  let approved = 0
  let promoted = 0
  for (const post of posts) {
    const state = (post as any).approval_state
    if (state === 'in_review' || state === 'requested_changes') {
      try {
        const out = await updateSocialPost(String(post.id), {
          approval_state: 'approved' as any,
          approved_at: new Date().toISOString(),
          approved_by: opts.approverId ?? null,
        })
        approved += 1
        if (out?.status === 'scheduled') promoted += 1
      } catch (err) {
        console.error('[content-plans] approve cascade failed for post', post.id, err)
      }
    }
  }

  return { plan: updated, postsApproved: approved, postsPromoted: promoted }
}

// ── Helpers ─────────────────────────────────────────────────────────

function toRecord(raw: any): ContentPlanRecord {
  if (!raw) throw new Error('Empty content_plans row')
  return {
    id: raw.id,
    organization:
      typeof raw.organization === 'object' && raw.organization ? raw.organization.id : raw.organization ?? null,
    title: raw.title ?? null,
    project: typeof raw.project === 'object' && raw.project ? raw.project.id : raw.project ?? null,
    target_client:
      typeof raw.target_client === 'object' && raw.target_client ? raw.target_client.id : raw.target_client ?? null,
    plan_type: raw.plan_type ?? 'monthly_cadence',
    target_month: raw.target_month ?? null,
    project_event:
      typeof raw.project_event === 'object' && raw.project_event ? raw.project_event.id : raw.project_event ?? null,
    state: raw.state ?? 'draft',
    objective: raw.objective ?? null,
    themes: Array.isArray(raw.themes) ? raw.themes : null,
    strategy: raw.strategy ?? null,
    cover_image_url: raw.cover_image_url ?? null,
    approval_token: raw.approval_token ?? null,
    approved_by: typeof raw.approved_by === 'object' && raw.approved_by ? raw.approved_by.id : raw.approved_by ?? null,
    approved_at: raw.approved_at ?? null,
    sent_for_review_at: raw.sent_for_review_at ?? null,
    date_created: raw.date_created ?? null,
    date_updated: raw.date_updated ?? null,
    user_created: typeof raw.user_created === 'object' && raw.user_created ? raw.user_created.id : raw.user_created ?? null,
  }
}

function mintToken(): string {
  // 32-char URL-safe-ish token. Stored in approval_token (max 64).
  return randomUUID().replace(/-/g, '') + randomUUID().slice(0, 8)
}
