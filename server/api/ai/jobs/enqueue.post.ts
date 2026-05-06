// server/api/ai/jobs/enqueue.post.ts
/**
 * Enqueue an async AI job for the standalone earnest-worker container.
 *
 * Body:
 *   type: 'recap-meeting' | 'digest-project' (required)
 *   organizationId: string (required)
 *   ...job-specific data (e.g. meetingId, projectId, recipientUserId, digestDate)
 *
 * Returns: { jobId: string }
 *
 * Returns 503 cleanly when REDIS_QUEUE_URL is unset (no worker provisioned).
 */

import { getAIQueue } from '~~/server/utils/queue';

const ALLOWED_TYPES = ['recap-meeting', 'digest-project'];

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { type, organizationId, ...data } = body || {};

  if (!type) {
    throw createError({ statusCode: 400, message: 'type is required' });
  }

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  if (!ALLOWED_TYPES.includes(type)) {
    throw createError({ statusCode: 400, message: `Invalid job type. Allowed: ${ALLOWED_TYPES.join(', ')}` });
  }

  const queue = getAIQueue();
  if (!queue) {
    throw createError({
      statusCode: 503,
      message: 'Async AI jobs are not configured on this environment',
    });
  }

  try {
    const job = await queue.add(type, {
      type,
      organizationId,
      userId,
      ...data,
    });

    return { jobId: job.id };
  } catch (err: any) {
    console.error('[ai/jobs/enqueue] Error:', err);
    throw createError({
      statusCode: 503,
      message: 'Queue unavailable. Redis may not be connected.',
    });
  }
});
