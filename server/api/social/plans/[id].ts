/**
 * Content Plan detail + edit.
 *
 *   GET    /api/social/plans/:id      — plan + posts (deep)
 *   PATCH  /api/social/plans/:id      — edit strategy/title/themes/etc.
 *   DELETE /api/social/plans/:id      — drop the plan (posts stay; FK nulled)
 */
import { z } from 'zod'
import { requireSocialOrg } from '~~/server/utils/social-tenancy'
import {
  deleteContentPlan,
  getContentPlanById,
  getContentPlanPosts,
  updateContentPlan,
} from '~~/server/utils/content-plans'

const updatePlanSchema = z.object({
  title: z.string().min(1).max(200).nullable().optional(),
  project: z.string().uuid().nullable().optional(),
  target_client: z.string().uuid().nullable().optional(),
  plan_type: z.enum(['monthly_cadence', 'campaign', 'launch', 'custom']).optional(),
  target_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  project_event: z.string().uuid().nullable().optional(),
  state: z.enum(['draft', 'in_review', 'approved', 'archived']).optional(),
  objective: z.string().max(500).nullable().optional(),
  themes: z.array(z.string().max(80)).max(20).nullable().optional(),
  strategy: z.string().max(20000).nullable().optional(),
  cover_image_url: z.string().url().max(500).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const { organizationId } = await requireSocialOrg(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing id' })

  const method = getMethod(event)

  // Gate every method via an org-scoped fetch so PATCH/DELETE can't
  // cross-tenant by guessing IDs (they're integer-autoincrement).
  const plan = await getContentPlanById(id, { organization: organizationId })
  if (!plan) throw createError({ statusCode: 404, message: 'Plan not found' })

  if (method === 'GET') {
    const posts = await getContentPlanPosts(id)
    return { data: { plan, posts } }
  }

  if (method === 'PATCH') {
    const body = await readBody(event)
    const parsed = updatePlanSchema.safeParse(body)
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        message: 'Validation failed',
        data: parsed.error.flatten(),
      })
    }
    const updated = await updateContentPlan(id, parsed.data)
    return { data: updated }
  }

  if (method === 'DELETE') {
    await deleteContentPlan(id)
    return { data: { id } }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
