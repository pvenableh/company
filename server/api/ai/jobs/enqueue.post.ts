// server/api/ai/jobs/enqueue.post.ts
/**
 * Enqueue an async AI job for background processing.
 *
 * Body:
 *   type: string (required) — Job type: 'summarize-session' | 'batch-analysis'
 *   organizationId: string (required)
 *   ...additional data depending on type
 *
 * Returns: { jobId: string }
 */

import { getAIQueue } from '~~/server/utils/queue';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { type, organizationId, ...data } = body;

  if (!type) {
    throw createError({ statusCode: 400, message: 'type is required' });
  }

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const allowedTypes = ['summarize-session', 'batch-analysis', 'notice-check'];
  if (!allowedTypes.includes(type)) {
    throw createError({ statusCode: 400, message: `Invalid job type. Allowed: ${allowedTypes.join(', ')}` });
  }

  try {
    const queue = getAIQueue();
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
