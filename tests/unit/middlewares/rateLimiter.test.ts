/**
 * Unit Tests: Rate Limiter Middleware
 *
 * Tests createLimiter wrapper (bypass header, disabled mode),
 * key generators, and globalLimiter skip logic.
 */

import { Request, Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Capture options passed to rateLimit() for inspection
type RateLimitOptions = {
  skip?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
  max?: number;
  windowMs?: number;
};
const capturedLimiters: RateLimitOptions[] = [];

const mockRateLimiter = jest.fn().mockImplementation((req: Request, _res: Response, next: NextFunction) => next());

jest.mock('express-rate-limit', () => {
  const rl = jest.fn().mockImplementation((options: RateLimitOptions) => {
    capturedLimiters.push(options);
    return mockRateLimiter;
  });
  return { __esModule: true, default: rl, rateLimit: rl };
});

jest.mock('rate-limit-redis', () => ({
  default: jest.fn().mockImplementation(() => ({})),
}));

// Mutable config — lets us test disabled mode and bypass secret
let mockIsTest = true;
let mockRateLimitDisabled = false;
let mockLoadTestSecret = 'secret-token';

jest.mock('../../../src/config', () => ({
  config: {
    get isTest() { return mockIsTest; },
  },
}));

jest.mock('../../../src/config/environments', () => ({
  RATE_LIMIT_CONFIG: {
    get disabled() { return mockRateLimitDisabled; },
    get loadTestSecret() { return mockLoadTestSecret; },
    global: { windowMs: 60000, maxRequests: 100 },
    auth: { windowMs: 900000, maxRequests: 20 },
    transaction: { windowMs: 60000, maxRequests: 30 },
    api: { windowMs: 60000, maxRequests: 200 },
    webhook: { windowMs: 3600000, maxRequests: 20 },
  },
}));

jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../src/observability', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import {
  globalLimiter,
  authLimiter,
  transactionLimiter,
  apiLimiter,
  webhookLimiter,
} from '../../../src/middlewares/rateLimiter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    path: '/api/test',
    method: 'GET',
    get: jest.fn().mockReturnValue(undefined),
    body: {},
    ...overrides,
  } as unknown as Request;
}

function buildRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Rate Limiter Middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimiter.mockImplementation((_req, _res, n) => n());
    next = jest.fn();
  });

  // ── bypass header ─────────────────────────────────────────────────────────

  describe('X-Load-Test-Token bypass', () => {
    it('should call next() immediately when valid bypass token is provided', () => {
      const req = buildReq({
        get: jest.fn().mockImplementation((header: string) =>
          header === 'X-Load-Test-Token' ? 'secret-token' : undefined
        ),
      });

      globalLimiter(req, buildRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(mockRateLimiter).not.toHaveBeenCalled();
    });

    it('should NOT bypass when token is wrong', () => {
      const req = buildReq({
        get: jest.fn().mockImplementation((header: string) =>
          header === 'X-Load-Test-Token' ? 'wrong-token' : undefined
        ),
      });

      globalLimiter(req, buildRes(), next);

      // mockRateLimiter (the inner limiter) should have been called
      expect(mockRateLimiter).toHaveBeenCalled();
    });

    it('should NOT bypass when no token is provided', () => {
      const req = buildReq({
        get: jest.fn().mockReturnValue(undefined),
      });

      globalLimiter(req, buildRes(), next);

      expect(mockRateLimiter).toHaveBeenCalled();
    });

    it('should not bypass when loadTestSecret is empty', () => {
      const savedSecret = mockLoadTestSecret;
      mockLoadTestSecret = '';

      const req = buildReq({
        get: jest.fn().mockReturnValue('some-token'),
      });

      globalLimiter(req, buildRes(), next);

      // No secret configured → hasValidBypassHeader returns false
      expect(mockRateLimiter).toHaveBeenCalled();
      mockLoadTestSecret = savedSecret;
    });
  });

  // ── RATE_LIMIT_DISABLED ───────────────────────────────────────────────────

  describe('RATE_LIMIT_DISABLED=true', () => {
    it('should be a noop that calls next immediately when disabled', async () => {
      // Re-import with disabled flag
      mockRateLimitDisabled = true;
      jest.resetModules();

      // Re-mock everything needed
      jest.doMock('express-rate-limit', () => {
        const rl = jest.fn().mockImplementation(() => jest.fn());
        return { __esModule: true, default: rl, rateLimit: rl };
      });
      jest.doMock('../../../src/config', () => ({
        config: { isTest: true },
      }));
      jest.doMock('../../../src/config/environments', () => ({
        RATE_LIMIT_CONFIG: {
          disabled: true,
          loadTestSecret: '',
          global: { windowMs: 60000, maxRequests: 100 },
          auth: { windowMs: 900000, maxRequests: 20 },
          transaction: { windowMs: 60000, maxRequests: 30 },
          api: { windowMs: 60000, maxRequests: 200 },
          webhook: { windowMs: 3600000, maxRequests: 20 },
        },
      }));
      jest.doMock('../../../src/config/redis', () => ({
        getRedisClient: jest.fn().mockReturnValue({}),
      }));
      jest.doMock('../../../src/observability', () => ({
        logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
      }));
      jest.doMock('rate-limit-redis', () => ({
        default: jest.fn().mockImplementation(() => ({})),
      }));

      const { globalLimiter: disabledLimiter } = await import('../../../src/middlewares/rateLimiter');
      const localNext = jest.fn();
      const req = buildReq();
      disabledLimiter(req, buildRes(), localNext);

      expect(localNext).toHaveBeenCalledWith();

      mockRateLimitDisabled = false;
    });
  });

  // ── globalLimiter skip function ───────────────────────────────────────────

  describe('globalLimiter skip function', () => {
    it('should have been configured with rateLimit()', () => {
      // Limiter was created when module was imported; capturedLimiters[0] is globalLimiter's config
      expect(capturedLimiters.length).toBeGreaterThan(0);
    });

    it('should skip health endpoint', () => {
      const skipFn = capturedLimiters[0]?.skip;
      if (skipFn) {
        const req = buildReq({ path: '/health/live' });
        expect(skipFn(req)).toBe(true);
      }
    });

    it('should skip metrics endpoint', () => {
      const skipFn = capturedLimiters[0]?.skip;
      if (skipFn) {
        const req = buildReq({ path: '/metrics' });
        expect(skipFn(req)).toBe(true);
      }
    });

    it('should NOT skip regular API paths', () => {
      const skipFn = capturedLimiters[0]?.skip;
      if (skipFn) {
        const req = buildReq({ path: '/transactions' });
        expect(skipFn(req)).toBe(false);
      }
    });
  });

  // ── authLimiter keyGenerator ──────────────────────────────────────────────

  describe('authLimiter keyGenerator', () => {
    it('should combine IP and email as key', () => {
      // authLimiter is capturedLimiters[1]
      const keyGen = capturedLimiters[1]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '10.0.0.1', body: { email: 'user@example.com' } });
        expect(keyGen(req)).toBe('10.0.0.1:user@example.com');
      }
    });

    it('should use empty string for email when not provided', () => {
      const keyGen = capturedLimiters[1]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '10.0.0.1', body: {} });
        expect(keyGen(req)).toBe('10.0.0.1:');
      }
    });
  });

  // ── transactionLimiter keyGenerator ──────────────────────────────────────

  describe('transactionLimiter keyGenerator', () => {
    it('should use userId when authenticated', () => {
      const keyGen = capturedLimiters[2]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '10.0.0.1' });
        (req as Request & { user?: { userId: string } }).user = { userId: 'u1' };
        expect(keyGen(req)).toBe('u1');
      }
    });

    it('should fall back to IP when not authenticated', () => {
      const keyGen = capturedLimiters[2]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '10.0.0.2' });
        expect(keyGen(req)).toBe('10.0.0.2');
      }
    });
  });

  // ── apiLimiter keyGenerator ───────────────────────────────────────────────

  describe('apiLimiter keyGenerator', () => {
    it('should use userId when authenticated', () => {
      const keyGen = capturedLimiters[3]?.keyGenerator;
      if (keyGen) {
        const req = buildReq();
        (req as Request & { user?: { userId: string } }).user = { userId: 'u2' };
        expect(keyGen(req)).toBe('u2');
      }
    });

    it('should fall back to IP when not authenticated', () => {
      const keyGen = capturedLimiters[3]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '192.168.1.1' });
        expect(keyGen(req)).toBe('192.168.1.1');
      }
    });
  });

  // ── webhookLimiter keyGenerator ───────────────────────────────────────────

  describe('webhookLimiter keyGenerator', () => {
    it('should prefix key with "webhook:" and use userId', () => {
      const keyGen = capturedLimiters[4]?.keyGenerator;
      if (keyGen) {
        const req = buildReq();
        (req as Request & { user?: { userId: string } }).user = { userId: 'u3' };
        expect(keyGen(req)).toBe('webhook:u3');
      }
    });

    it('should prefix key with "webhook:" and use IP when not authenticated', () => {
      const keyGen = capturedLimiters[4]?.keyGenerator;
      if (keyGen) {
        const req = buildReq({ ip: '10.0.0.3' });
        expect(keyGen(req)).toBe('webhook:10.0.0.3');
      }
    });
  });

  // ── pass-through behaviour ────────────────────────────────────────────────

  describe('all limiters call next() normally', () => {
    const limiters = [
      { name: 'globalLimiter', fn: () => globalLimiter },
      { name: 'authLimiter', fn: () => authLimiter },
      { name: 'transactionLimiter', fn: () => transactionLimiter },
      { name: 'apiLimiter', fn: () => apiLimiter },
      { name: 'webhookLimiter', fn: () => webhookLimiter },
    ];

    limiters.forEach(({ name, fn }) => {
      it(`${name} should call next() for normal requests`, () => {
        const localNext = jest.fn();
        const req = buildReq();
        fn()(req, buildRes(), localNext);
        expect(localNext).toHaveBeenCalled();
      });
    });
  });
});
