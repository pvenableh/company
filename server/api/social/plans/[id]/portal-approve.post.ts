/**
 * Plan-level portal approve — token-authenticated.
 *
 * Anonymous-friendly (matches the per-post portal-approve pattern). Validates
 * the plan's approval_token, cascades approval to every in_review/requested_changes
 * child post, and lets `updateSocialPost`'s existing auto-promote bridge flip
 * any post with a future scheduled_at + platform.account_id to status='scheduled'.
 *
 * Body: { token: string, note?: string }
 */
import { z } from 'zod'
import { approvePlan, getContentPlanById } from '~~/server/utils/content-plans'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  note: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Plan ID required' })

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Validation failed',
      data: parsed.error.flatten(),
    })
  }

  const plan = await getContentPlanById(id)
  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })
  if (!plan.approval_token || plan.approval_token !== parsed.data.token) {
    throw createError({ statusCode: 403, message: 'Invalid approval token' })
  }
  if (plan.state !== 'in_review') {
    throw createError({
      statusCode: 400,
      message: `Cannot approve a plan in state: ${plan.state}`,
    })
  }

  let approverId: string | null = null
  try {
    const session = await getUserSession(event)
    const sessionUserId = (session as any)?.user?.id as string | undefined
    if (sessionUserId) approverId = sessionUserId
  } catch {
    approverId = null
  }

  const result = await approvePlan(id, { approverId })
  return { data: result }
})
