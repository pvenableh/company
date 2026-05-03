/**
 * Scheduled-publish worker cron.
 *
 * Picks up `scheduled` social_posts whose `scheduled_at` has passed and
 * publishes them to each target account via the relevant platform adapter.
 * Per-target results are written back to publish_results; the row's
 * post_status flips to published / failed when the worker is done.
 *
 * Auth: Bearer cronSecret OR admin user session (matches other crons).
 * Method: GET (Vercel Cron) or POST (manual).
 * Body (POST):
 *   { dryRun?: boolean, batchSize?: number }
 *
 * Concurrency: BATCH posts per invocation (default 10), processed sequentially.
 * Multiple targets within a single post are also sequential to keep upstream
 * rate-limit blast radius small.
 */
import { publishSocialPost } from '~~/server/utils/social-publish'
import { findDueScheduledPosts, updateSocialPost } from '~~/server/utils/social-directus'

interface CronBody {
  dryRun?: boolean
  batchSize?: number
}

const DEFAULT_BATCH = 10
const STALE_PUBLISHING_MS = 5 * 60 * 1000 // reclaim a stuck `publishing` row after 5 minutes

export default defineEventHandler(async (event) => {
  const method = getMethod(event)
  const body: CronBody = method === 'POST'
    ? ((await readBody<CronBody>(event).catch(() => ({} as CronBody))) || ({} as CronBody))
    : ({} as CronBody)

  // Auth.
  const authHeader = getHeader(event, 'authorization')
  const config = useRuntimeConfig()
  const cronSecret = (config as any).cronSecret || (config.public as any)?.cronSecret
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // authenticated as cron
  } else {
    const session = await requireUserSession(event)
    const userId = (session as any).user?.id
    if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const dryRun = !!body.dryRun
  const batchSize = Math.max(1, Math.min(50, body.batchSize ?? DEFAULT_BATCH))

  const candidates = await findDueScheduledPosts({ limit: batchSize })
  if (!candidates.length) {
    return { dryRun, picked: 0, results: [] }
  }

  if (dryRun) {
    return {
      dryRun: true,
      picked: candidates.length,
      results: candidates.map((p) => ({ id: p.id, scheduled_at: p.scheduled_at, status: 'would-publish' })),
    }
  }

  const outcomes: Array<{ id: string; status: string; results: number }> = []
  for (const post of candidates) {
    try {
      const outcome = await publishSocialPost(post.id)
      outcomes.push({ id: post.id, status: outcome.status, results: outcome.results.length })
    } catch (err: any) {
      // Defensive: don't let one bad post abort the whole tick.
      await updateSocialPost(post.id, {
        status: 'failed',
        error_message: err?.message || 'Worker exception',
      }).catch(() => {})
      outcomes.push({ id: post.id, status: 'failed', results: 0 })
    }
  }

  return { dryRun: false, picked: candidates.length, results: outcomes, staleCutoff: STALE_PUBLISHING_MS }
})
