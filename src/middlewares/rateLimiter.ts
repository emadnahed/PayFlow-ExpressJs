/**
 * Rate Limiting Middleware
 *
 * Provides rate limiting for API endpoints using Redis store
 * to ensure distributed rate limiting across multiple instances.
 */

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request } from 'express';
import { getRedisClient } from '../config/redis';
import { config } from '../config';
import { ErrorCode } from '../types/errors';
import { logger } from '../observability';

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
 * Create a Redis store for rate limiting
 * Falls back to memory store in test environment
 */
const createStore = () => {
  if (config.isTest) {
    return undefined; // Use default memory store in tests
  }

  try {
    const client = getRedisClient();
    return new RedisStore({
      // @ts-expect-error - RedisStore expects a specific sendCommand signature
      sendCommand: (...args: string[]) => client.call(...args),
      prefix: 'rl:',
    });
  } catch {
    logger.warn('Failed to create Redis store for rate limiting, using memory store');
    return undefined;
  }
};

/**
 * Global rate limiter
 * Applied to all routes, 100 requests per 15 minutes
 */
export const globalLimiter: RateLimitRequestHandler = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  skip: (req) => {
    // Skip rate limiting for health checks and metrics
    return req.path === '/health' || req.path === '/health/live' || req.path === '/metrics';
  },
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 attempts per 15 minutes to prevent brute force attacks
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ErrorCode.TOO_MANY_LOGIN_ATTEMPTS,
      message: 'Too many login attempts, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  keyGenerator: (req) => {
    // Use IP + email for more precise tracking
    const email = req.body?.email || '';
    return `${req.ip}:${email}`;
  },
  validate: false,
});

/**
 * Transaction rate limiter
 * 10 transactions per minute per user to prevent abuse
 */
export const transactionLimiter: RateLimitRequestHandler = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 transactions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ErrorCode.TOO_MANY_TRANSACTIONS,
      message: 'Too many transactions, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  keyGenerator: (req: AuthenticatedRequest) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.ip || 'unknown';
  },
  validate: false,
});

/**
 * API rate limiter for general API calls
 * 30 requests per minute per user
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'API rate limit exceeded, please slow down',
      timestamp: new Date().toISOString(),
    },
  },
  keyGenerator: (req: AuthenticatedRequest) => {
    return req.user?.userId || req.ip || 'unknown';
  },
  validate: false,
});

/**
 * Webhook registration rate limiter
 * 10 webhook registrations per hour per user
 */
export const webhookLimiter: RateLimitRequestHandler = rateLimit({
  store: createStore(),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 registrations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many webhook registrations, please try again later',
      timestamp: new Date().toISOString(),
    },
  },
  keyGenerator: (req: AuthenticatedRequest) => {
    return `webhook:${req.user?.userId || req.ip || 'unknown'}`;
  },
  validate: false,
});
