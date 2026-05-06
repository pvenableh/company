// server/utils/queue.ts
/**
 * BullMQ queue connection singleton.
 *
 * Returns null when REDIS_QUEUE_URL is unset — async AI is scaffolding only,
 * so callers must handle the disabled case rather than dial a non-existent
 * host and flood the log buffer with ENOTFOUND.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let _connection: IORedis | null = null;
let _aiQueue: Queue | null = null;

export function getRedisConnection(): IORedis | null {
  if (_connection) return _connection;

  const url = useRuntimeConfig().redisQueueUrl;
  if (!url || url === 'disabled') return null;

  _connection = new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 500, 5000);
    },
  });

  _connection.on('error', (err) => {
    console.warn('[queue] Redis connection error:', err.message);
  });

  return _connection;
}

export function getAIQueue(): Queue | null {
  if (_aiQueue) return _aiQueue;

  const connection = getRedisConnection();
  if (!connection) return null;

  _aiQueue = new Queue('ai-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
      removeOnFail: { count: 50 },      // Keep last 50 failed jobs
    },
  });

  return _aiQueue;
}
