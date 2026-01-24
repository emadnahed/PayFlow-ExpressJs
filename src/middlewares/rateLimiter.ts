/**
 * Rate Limiting Middleware
 *
 * Provides rate limiting for API endpoints using Redis store
 * to ensure distributed rate limiting across multiple instances.
 *
 * Environment-based configuration:
 * - Production: Strict limits to prevent abuse
 * - Development: Relaxed limits for easier testing
 * - Test: Very lenient limits for automated tests
 *
 * Load testing:
 * - Set RATE_LIMIT_DISABLED=true to disable all rate limiting
 * - Or configure individual limits via environment variables
 */

import { NextFunction, Request, Response } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { config } from '../config';
import { RATE_LIMIT_CONFIG } from '../config/environments';
import { getRedisClient } from '../config/redis';
import { logger } from '../observability';
import { ErrorCode } from '../types/errors';

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
 * No-op middleware that passes through (used when rate limiting is disabled)
 */
const noopLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

/**
 * Check if request has valid load test bypass header
 */
const hasValidBypassHeader = (req: Request): boolean => {
  if (!RATE_LIMIT_CONFIG.loadTestSecret) return false;
  const token = req.get('X-Load-Test-Token');
  return token === RATE_LIMIT_CONFIG.loadTestSecret;
};

/**
 * Wrap rate limiter to support:
 * - Global disable flag (RATE_LIMIT_DISABLED=true)
 * - Load test bypass header (X-Load-Test-Token)
 */
const createLimiter = (limiter: RateLimitRequestHandler): RateLimitRequestHandler => {
  if (RATE_LIMIT_CONFIG.disabled) {
    logger.warn('Rate limiting is DISABLED via RATE_LIMIT_DISABLED=true');
    return noopLimiter as unknown as RateLimitRequestHandler;
  }

  // Return a wrapper that checks for bypass header
  return ((req: Request, res: Response, next: NextFunction) => {
    if (hasValidBypassHeader(req)) {
      return next();
    }
    return limiter(req, res, next);
  }) as unknown as RateLimitRequestHandler;
};

/**
 * Global rate limiter
 * Applied to all routes
 * Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS
 */
export const globalLimiter: RateLimitRequestHandler = createLimiter(rateLimit({
  store: createStore(),
  windowMs: RATE_LIMIT_CONFIG.global.windowMs,
  max: RATE_LIMIT_CONFIG.global.maxRequests,
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
}));

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks in production
 * Configurable via AUTH_RATE_LIMIT_WINDOW_MS and AUTH_RATE_LIMIT_MAX
 */
export const authLimiter: RateLimitRequestHandler = createLimiter(rateLimit({
  store: createStore(),
  windowMs: RATE_LIMIT_CONFIG.auth.windowMs,
  max: RATE_LIMIT_CONFIG.auth.maxRequests,
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
}));

/**
 * Transaction rate limiter
 * Prevents transaction abuse
 * Configurable via TX_RATE_LIMIT_WINDOW_MS and TX_RATE_LIMIT_MAX
 */
export const transactionLimiter: RateLimitRequestHandler = createLimiter(rateLimit({
  store: createStore(),
  windowMs: RATE_LIMIT_CONFIG.transaction.windowMs,
  max: RATE_LIMIT_CONFIG.transaction.maxRequests,
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
}));

/**
 * API rate limiter for general API calls
 * Configurable via API_RATE_LIMIT_WINDOW_MS and API_RATE_LIMIT_MAX
 */
export const apiLimiter: RateLimitRequestHandler = createLimiter(rateLimit({
  store: createStore(),
  windowMs: RATE_LIMIT_CONFIG.api.windowMs,
  max: RATE_LIMIT_CONFIG.api.maxRequests,
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
}));

/**
 * Webhook registration rate limiter
 * Configurable via WEBHOOK_RATE_LIMIT_WINDOW_MS and WEBHOOK_RATE_LIMIT_MAX
 */
export const webhookLimiter: RateLimitRequestHandler = createLimiter(rateLimit({
  store: createStore(),
  windowMs: RATE_LIMIT_CONFIG.webhook.windowMs,
  max: RATE_LIMIT_CONFIG.webhook.maxRequests,
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
}));
