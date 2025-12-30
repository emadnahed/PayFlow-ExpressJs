/**
 * Redis Client Configuration
 *
 * Provides a shared Redis client for rate limiting, idempotency,
 * and other caching needs.
 */

import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../observability';

let redisClient: Redis | null = null;

/**
 * Get or create Redis client singleton
 */
export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });
  }

  return redisClient;
};

/**
 * Connect Redis client
 */
export const connectRedis = async (): Promise<void> => {
  const client = getRedisClient();
  if (client.status === 'ready') {
    return;
  }
  await client.connect();
};

/**
 * Disconnect Redis client
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

/**
 * Check if Redis is connected
 */
export const isRedisConnected = (): boolean => {
  return redisClient?.status === 'ready';
};
