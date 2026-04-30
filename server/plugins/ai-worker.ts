// server/plugins/ai-worker.ts
/**
 * Nitro server plugin that starts the BullMQ AI worker on server boot.
 *
 * The worker processes async AI jobs (summarization, batch analysis)
 * and creates Directus notifications on completion.
 *
 * Gracefully handles Redis connection failures — the worker is optional
 * and the app functions normally without it.
 */

import { startAIWorker } from '~~/server/utils/ai-worker';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  const redisUrl = config.redisQueueUrl;

  // Only start the worker if a Redis URL is configured. Treat 'disabled'
  // as a sentinel for explicit dev-time opt-out (compose hostname `queue`
  // doesn't resolve outside docker-compose and floods the log buffer).
  if (!redisUrl || redisUrl === 'disabled') {
    console.log('[ai-worker] REDIS_QUEUE_URL not configured — worker disabled');
    return;
  }

  try {
    startAIWorker();
    console.log('[ai-worker] BullMQ worker started');
  } catch (err: any) {
    // Non-fatal: the app works without the queue worker
    console.warn('[ai-worker] Failed to start worker:', err.message);
  }
});
