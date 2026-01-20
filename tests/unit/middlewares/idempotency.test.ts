/**
 * Idempotency Middleware Unit Tests
 *
 * Tests idempotency key validation and caching behavior.
 */

import { Request, Response, NextFunction } from 'express';

// Mock redis client
const mockGet = jest.fn().mockResolvedValue(null);
const mockSetex = jest.fn().mockResolvedValue('OK');

jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({
    get: mockGet,
    setex: mockSetex,
  }),
  isRedisConnected: jest.fn().mockReturnValue(true),
}));

// Mock config
let mockIsTest = false;

jest.mock('../../../src/config', () => ({
  config: {
    get isTest() {
      return mockIsTest;
    },
  },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/observability', () => ({
  logger: mockLogger,
}));

// Mock ApiError
jest.mock('../../../src/middlewares/errorHandler', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// Mock error codes
jest.mock('../../../src/types/errors', () => ({
  ErrorCode: {
    INVALID_INPUT: 'INVALID_INPUT',
  },
}));

describe('Idempotency Middleware', () => {
  let idempotencyMiddleware: typeof import('../../../src/middlewares/idempotency').idempotencyMiddleware;
  let idempotencyForMutations: typeof import('../../../src/middlewares/idempotency').idempotencyForMutations;
  let validateIdempotencyKey: typeof import('../../../src/middlewares/idempotency').validateIdempotencyKey;

  let mockReq: Request & { user?: { userId: string; email: string } };
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    mockIsTest = false;

    const module = await import('../../../src/middlewares/idempotency');
    idempotencyMiddleware = module.idempotencyMiddleware;
    idempotencyForMutations = module.idempotencyForMutations;
    validateIdempotencyKey = module.validateIdempotencyKey;

    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      user: { userId: 'user_123', email: 'test@example.com' },
    } as Request & { user?: { userId: string; email: string } };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue('application/json'),
      statusCode: 200,
    };

    mockNext = jest.fn();
  });

  describe('idempotencyMiddleware', () => {
    it('should call next if no idempotency key provided', async () => {
      await idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should call next in test environment', async () => {
      mockIsTest = true;
      jest.resetModules();
      const module = await import('../../../src/middlewares/idempotency');

      mockReq.headers = { 'x-idempotency-key': 'test-key-123' };

      await module.idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return cached response if exists', async () => {
      const cachedResponse = {
        statusCode: 201,
        body: { success: true, data: { id: 'test' } },
        headers: { 'content-type': 'application/json' },
        cachedAt: new Date().toISOString(),
      };
      mockGet.mockResolvedValueOnce(JSON.stringify(cachedResponse));

      mockReq.headers = { 'x-idempotency-key': 'cached-key' };

      await idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(cachedResponse.body);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should cache response on first request', async () => {
      mockReq.headers = { 'x-idempotency-key': 'new-key' };

      await idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();

      // Simulate calling json() to trigger caching
      const originalJson = mockRes.json as jest.Mock;
      const responseBody = { success: true };

      // The middleware wraps res.json, so we need to call it
      await (mockRes as Response).json(responseBody);

      // Wait for async caching
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSetex).toHaveBeenCalled();
    });

    it('should use user ID for cache key when authenticated', async () => {
      mockReq.headers = { 'x-idempotency-key': 'user-key' };
      (mockReq as { user?: { userId: string; email: string } }).user = { userId: 'user_456', email: 'test@example.com' };

      await idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalledWith('idempotency:user_456:user-key');
    });

    it('should use IP for cache key when not authenticated', async () => {
      const anonReq = {
        headers: { 'x-idempotency-key': 'anon-key' },
        ip: '192.168.1.1',
        method: 'POST',
      } as unknown as Request;

      await idempotencyMiddleware(anonReq, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalledWith('idempotency:192.168.1.1:anon-key');
    });

    it('should handle Redis errors gracefully', async () => {
      mockGet.mockRejectedValueOnce(new Error('Redis error'));

      mockReq.headers = { 'x-idempotency-key': 'error-key' };

      await idempotencyMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('idempotencyForMutations', () => {
    it('should skip for GET requests', async () => {
      mockReq.method = 'GET';
      mockReq.headers = { 'x-idempotency-key': 'get-key' };

      await idempotencyForMutations(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should skip for DELETE requests', async () => {
      mockReq.method = 'DELETE';
      mockReq.headers = { 'x-idempotency-key': 'delete-key' };

      await idempotencyForMutations(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should apply for POST requests', async () => {
      mockReq.method = 'POST';
      mockReq.headers = { 'x-idempotency-key': 'post-key' };

      await idempotencyForMutations(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalled();
    });

    it('should apply for PUT requests', async () => {
      mockReq.method = 'PUT';
      mockReq.headers = { 'x-idempotency-key': 'put-key' };

      await idempotencyForMutations(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalled();
    });

    it('should apply for PATCH requests', async () => {
      mockReq.method = 'PATCH';
      mockReq.headers = { 'x-idempotency-key': 'patch-key' };

      await idempotencyForMutations(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalled();
    });
  });

  describe('validateIdempotencyKey', () => {
    it('should call next if no key provided', () => {
      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should accept valid alphanumeric key', () => {
      mockReq.headers = { 'x-idempotency-key': 'valid-key_123' };

      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject key with invalid characters', () => {
      mockReq.headers = { 'x-idempotency-key': 'invalid@key!' };

      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject key longer than 64 characters', () => {
      mockReq.headers = { 'x-idempotency-key': 'a'.repeat(65) };

      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should accept key exactly 64 characters', () => {
      mockReq.headers = { 'x-idempotency-key': 'a'.repeat(64) };

      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should treat empty key as no key provided', () => {
      mockReq.headers = { 'x-idempotency-key': '' };

      validateIdempotencyKey(mockReq as Request, mockRes as Response, mockNext);

      // Empty string is falsy, so treated as no key provided
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
