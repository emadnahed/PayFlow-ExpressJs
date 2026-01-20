/**
 * BullMQ Queue Configuration
 *
 * Provides connection settings and default job options for all queues.
 */

import { ConnectionOptions, DefaultJobOptions } from 'bullmq';

import { config } from '../config';

/**
 * Redis connection configuration for BullMQ
 */
export const queueConnection: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null, // Required for BullMQ workers
};

/**
 * Default job options for webhook delivery
 */
export const webhookJobOptions: DefaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s, 2s, 4s, 8s, 16s
  },
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    count: 1000, // Keep last 1000 failed jobs
  },
};

/**
 * Default job options for notifications
 */
export const notificationJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 500,
  },
  removeOnComplete: {
    count: 50,
  },
  removeOnFail: {
    count: 500,
  },
};

/**
 * Queue names
 * Note: BullMQ doesn't allow colons in queue names as they are used as Redis key separators
 */
export const QUEUE_NAMES = {
  WEBHOOKS: 'payflow-webhooks',
  NOTIFICATIONS: 'payflow-notifications',
} as const;

/**
 * Worker concurrency settings
 */
export const WORKER_CONCURRENCY = {
  WEBHOOKS: 5,
  NOTIFICATIONS: 10,
} as const;
