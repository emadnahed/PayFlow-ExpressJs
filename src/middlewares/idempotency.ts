/**
 * Idempotency Middleware
 *
 * Prevents duplicate processing of requests by caching responses
 * based on idempotency keys provided in the X-Idempotency-Key header.
 */

import { Request, Response, NextFunction } from 'express';

import { config } from '../config';
import { getRedisClient, isRedisConnected } from '../config/redis';
import { logger } from '../observability';
import { ErrorCode } from '../types/errors';

import { ApiError } from './errorHandler';

/**
 * Interface for authenticated request
 */
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Cached response structure
 */
interface CachedResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  cachedAt: string;
}

/**
 * Idempotency key TTL (24 hours)
 */
const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Idempotency middleware
 *
 * Usage:
 * - Client sends X-Idempotency-Key header with a unique key
 * - First request: processed normally, response cached
 * - Subsequent requests with same key: cached response returned
 *
 * Keys are scoped per user to prevent cross-user conflicts.
 */
export const idempotencyMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

  // Idempotency is optional - if no key, proceed normally
  if (!idempotencyKey) {
    next();
    return;
  }

  // Skip in test environment or if Redis is not connected
  if (config.isTest || !isRedisConnected()) {
    next();
    return;
  }

  // Create cache key scoped to user (or IP if not authenticated)
  const userId = req.user?.userId || req.ip || 'anonymous';
  const cacheKey = `idempotency:${userId}:${idempotencyKey}`;

  try {
    const redis = getRedisClient();

    // Check if we have a cached response
    const cached = await redis.get(cacheKey);

    if (cached) {
      const cachedResponse: CachedResponse = JSON.parse(cached);

      logger.info(
        {
          idempotencyKey,
          userId,
          cachedAt: cachedResponse.cachedAt,
        },
        'Returning cached idempotent response'
      );

      // Set any cached headers
      Object.entries(cachedResponse.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Add header indicating this is a cached response
      res.setHeader('X-Idempotent-Replayed', 'true');

      res.status(cachedResponse.statusCode).json(cachedResponse.body);
      return;
    }

    // No cached response - intercept the response to cache it
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Cache the response asynchronously (don't block)
      const responseToCache: CachedResponse = {
        statusCode: res.statusCode,
        body,
        headers: {
          'content-type': (res.getHeader('content-type') as string) || 'application/json',
        },
        cachedAt: new Date().toISOString(),
      };

      redis
        .setex(cacheKey, IDEMPOTENCY_TTL, JSON.stringify(responseToCache))
        .then(() => {
          logger.debug(
            {
              idempotencyKey,
              userId,
              statusCode: res.statusCode,
            },
            'Cached idempotent response'
          );
        })
        .catch((err) => {
          logger.error({ err, idempotencyKey }, 'Failed to cache idempotent response');
        });

      return originalJson(body);
    };

    next();
  } catch (error) {
    // Log error but don't fail the request
    logger.error({ error, idempotencyKey }, 'Idempotency middleware error');
    next();
  }
};

/**
 * Idempotency middleware for specific methods only (POST, PUT, PATCH)
 * GET and DELETE are naturally idempotent
 */
export const idempotencyForMutations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const mutationMethods = ['POST', 'PUT', 'PATCH'];

  if (!mutationMethods.includes(req.method)) {
    next();
    return;
  }

  return idempotencyMiddleware(req, res, next);
};

/**
 * Validate idempotency key format
 * Keys should be alphanumeric with dashes/underscores, max 64 chars
 */
export const validateIdempotencyKey = (req: Request, res: Response, next: NextFunction): void => {
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

  if (!idempotencyKey) {
    next();
    return;
  }

  // Validate key format
  const keyPattern = /^[a-zA-Z0-9_-]{1,64}$/;

  if (!keyPattern.test(idempotencyKey)) {
    next(
      new ApiError(
        ErrorCode.INVALID_INPUT,
        'Invalid X-Idempotency-Key format. Must be alphanumeric with dashes/underscores, max 64 characters.'
      )
    );
    return;
  }

  next();
};
