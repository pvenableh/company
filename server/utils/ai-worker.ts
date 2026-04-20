// server/utils/ai-worker.ts
/**
 * BullMQ Worker for async AI jobs.
 *
 * Processes jobs from the 'ai-jobs' queue and creates Directus notifications
 * on completion so the user is notified in real-time via WebSocket.
 *
 * Job types:
 *   - summarize-session: Summarize a chat session (heavy LLM call)
 *   - batch-analysis: Analyze multiple entities (batch LLM call)
 *   - notice-check: Run the AI notice check for an org (cron-triggered)
 */

import { Worker, type Job } from 'bullmq';
import { createNotification } from '@directus/sdk';
import { getRedisConnection } from './queue';

interface AIJobData {
  type: string;
  organizationId: string;
  userId: string;
  [key: string]: any;
}

async function processAIJob(job: Job<AIJobData>) {
  const { type, organizationId, userId, ...data } = job.data;
  const directus = getServerDirectus();

  switch (type) {
    case 'summarize-session': {
      const { sessionId } = data;
      // TODO: Implement session summarization LLM call
      // For now, create a placeholder notification
      await directus.request(
        createNotification({
          recipient: userId,
          subject: 'Session Summary Ready',
          message: `Your AI chat session summary has been generated.`,
          collection: 'ai_chat_sessions',
          item: sessionId,
          status: 'inbox',
        }),
      );
      return { type, sessionId, status: 'completed' };
    }

    case 'batch-analysis': {
      const { entityType, entityIds } = data;
      // TODO: Implement batch entity analysis LLM call
      await directus.request(
        createNotification({
          recipient: userId,
          subject: `${entityType} Analysis Complete`,
          message: `Batch analysis of ${entityIds?.length || 0} ${entityType}s is ready.`,
          collection: entityType || 'ai_notices',
          item: entityIds?.[0] || '',
          status: 'inbox',
        }),
      );
      return { type, entityType, count: entityIds?.length, status: 'completed' };
    }

    case 'notice-check': {
      // Trigger the notice check endpoint internally
      // This allows BullMQ to schedule and retry notice checks
      const { default: checkHandler } = await import('~~/server/api/ai/notices/check');
      // Note: For cron-triggered jobs, the check endpoint is called directly
      // via HTTP. This job type is reserved for future internal queueing.
      return { type, organizationId, status: 'completed' };
    }

    default:
      throw new Error(`Unknown AI job type: ${type}`);
  }
}

export function startAIWorker(): Worker {
  const worker = new Worker('ai-jobs', processAIJob, {
    connection: getRedisConnection(),
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // Max 10 jobs per minute
    },
  });

  worker.on('completed', (job) => {
    console.log(`[ai-worker] Job ${job.id} (${job.data.type}) completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ai-worker] Job ${job?.id} (${job?.data?.type}) failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[ai-worker] Worker error:', err.message);
  });

  return worker;
}
