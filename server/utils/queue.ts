// server/utils/queue.ts
/**
 * BullMQ queue connection singleton.
 *
 * Provides a shared Redis connection and a named queue for async AI jobs.
 * The queue Redis container is on the Docker network at redis://queue:6379
 * with noeviction policy (required for BullMQ).
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let _connection: IORedis | null = null;
let _aiQueue: Queue | null = null;

export function getRedisConnection(): IORedis {
  if (_connection) return _connection;

  const config = useRuntimeConfig();
  const url = config.redisQueueUrl || 'redis://queue:6379';

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

export function getAIQueue(): Queue {
  if (_aiQueue) return _aiQueue;

  _aiQueue = new Queue('ai-jobs', {
    connection: getRedisConnection(),
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
