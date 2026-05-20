/**
 * Content Plans API — list + create.
 *
 *   GET  /api/social/plans?project=…&state=…&target_month=…
 *   POST /api/social/plans
 */
import { z } from 'zod'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import { createContentPlan, listContentPlans } from '~~/server/utils/content-plans'

const PLAN_TYPES = ['monthly_cadence', 'campaign', 'launch', 'custom'] as const
const PLAN_STATES = ['draft', 'in_review', 'approved', 'archived'] as const

const createPlanSchema = z.object({
  title: z.string().min(1).max(200).nullable().optional(),
  project: z.string().uuid().nullable().optional(),
  target_client: z.string().uuid().nullable().optional(),
  plan_type: z.enum(PLAN_TYPES).default('monthly_cadence'),
  target_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  project_event: z.string().uuid().nullable().optional(),
  objective: z.string().max(500).nullable().optional(),
  themes: z.array(z.string().max(80)).max(20).nullable().optional(),
  strategy: z.string().max(20000).nullable().optional(),
  cover_image_url: z.string().url().max(500).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { userId, organizationId } = await requireSocialOrg(event)
  const method = getMethod(event)

  if (method === 'GET') {
    const q = getQuery(event)
    const plans = await listContentPlans({
      organization: organizationId,
      project: typeof q.project === 'string' ? q.project : undefined,
      target_client: typeof q.target_client === 'string' ? q.target_client : undefined,
      state: typeof q.state === 'string' ? (q.state as any) : undefined,
      plan_type: typeof q.plan_type === 'string' ? (q.plan_type as any) : undefined,
      target_month: typeof q.target_month === 'string' ? q.target_month : undefined,
    })
    return { data: plans }
  }

  if (method === 'POST') {
    const body = await readBody(event)
    const parsed = createPlanSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Validation failed',
        data: parsed.error.flatten(),
      })
    }
    const plan = await createContentPlan({
      ...parsed.data,
      organization: organizationId,
      user_created: userId,
    })
    return { data: plan }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
