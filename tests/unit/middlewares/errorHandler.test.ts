/**
 * Unit Tests: errorHandler middleware, notFoundHandler, ApiError
 *
 * All external observability dependencies are mocked.
 */

import { Request, Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCaptureSentryException = jest.fn();
const mockGetCorrelationId = jest.fn().mockReturnValue('corr_123');

jest.mock('../../../src/observability', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  getCorrelationId: () => mockGetCorrelationId(),
  captureSentryException: (...a: unknown[]) => mockCaptureSentryException(...a),
}));

jest.mock('../../../src/config', () => ({
  config: { isDevelopment: false, isProduction: false, isTest: true },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
} from '../../../src/middlewares/errorHandler';
import { ErrorCode } from '../../../src/types/errors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function buildReq(path = '/test', method = 'GET'): Request {
  return { path, method } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('should create with old-style HTTP status code', () => {
    const err = new ApiError(400, 'Bad request');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Bad request');
    expect(err.isOperational).toBe(true);
  });

  it('should create with new-style ErrorCode', () => {
    const err = new ApiError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should be an instance of Error', () => {
    expect(new ApiError(404, 'Not found')).toBeInstanceOf(Error);
  });

  describe('factory methods', () => {
    it('unauthorized() should return 401 error', () => {
      const err = ApiError.unauthorized();
      expect(err.statusCode).toBe(401);
    });

    it('forbidden() should return 403 error', () => {
      const err = ApiError.forbidden();
      expect(err.statusCode).toBe(403);
    });

    it('invalidToken() should return 401 error', () => {
      const err = ApiError.invalidToken();
      expect(err.statusCode).toBe(401);
    });

    it('tokenExpired() should return 401 error', () => {
      const err = ApiError.tokenExpired();
      expect(err.statusCode).toBe(401);
    });

    it('insufficientBalance() should return 400 error', () => {
      const err = ApiError.insufficientBalance();
      expect(err.statusCode).toBe(400);
    });

    it('notFound("user") should return 404 error', () => {
      const err = ApiError.notFound('user');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('user not found');
    });

    it('notFound("wallet") should return 404 error', () => {
      const err = ApiError.notFound('wallet');
      expect(err.statusCode).toBe(404);
    });

    it('internal() should be non-operational', () => {
      const err = ApiError.internal();
      expect(err.isOperational).toBe(false);
      expect(err.statusCode).toBe(500);
    });

    it('validationError() should include validationErrors', () => {
      const err = ApiError.validationError('Invalid', { email: ['required'] });
      expect(err.statusCode).toBe(400);
      expect(err.validationErrors).toEqual({ email: ['required'] });
    });

    it('rateLimitExceeded() should return 429 error', () => {
      const err = ApiError.rateLimitExceeded();
      expect(err.statusCode).toBe(429);
    });

    it('alreadyExists("user") should return 409 error', () => {
      const err = ApiError.alreadyExists('user');
      expect(err.statusCode).toBe(409);
      expect(err.message).toBe('user already exists');
    });

    it('alreadyExists("wallet") should return 409 error', () => {
      const err = ApiError.alreadyExists('wallet');
      expect(err.statusCode).toBe(409);
    });

    it('alreadyExists with unknown resource falls back to 400', () => {
      const err = ApiError.alreadyExists('transaction');
      expect(err.statusCode).toBe(400);
    });

    it('database() should return 503 error', () => {
      const err = ApiError.database();
      expect(err.statusCode).toBe(503);
    });

    it('database() should use custom message', () => {
      const err = ApiError.database('Connection pool exhausted');
      expect(err.message).toBe('Connection pool exhausted');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('should respond with the error statusCode and message', () => {
    const err = new ApiError(400, 'Bad input');
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Bad input');
    expect(body.error.correlationId).toBe('corr_123');
  });

  it('should default to 500 when statusCode is missing', () => {
    const err = new Error('Something broke') as ApiError;
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should capture error in Sentry for non-operational errors', () => {
    const err = ApiError.internal('Server crash');
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    expect(mockCaptureSentryException).toHaveBeenCalledWith(err, { correlationId: 'corr_123' });
  });

  it('should capture 5xx operational errors in Sentry', () => {
    const err = new ApiError(500, 'DB down');
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    expect(mockCaptureSentryException).toHaveBeenCalled();
  });

  it('should NOT capture 4xx operational errors in Sentry', () => {
    const err = new ApiError(404, 'Not found');
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    expect(mockCaptureSentryException).not.toHaveBeenCalled();
  });

  it('should include validationErrors in response when present', () => {
    const err = ApiError.validationError('Invalid input', { email: ['required'] });
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, next);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.details).toEqual({ email: ['required'] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('asyncHandler', () => {
  it('should call next(error) when async fn rejects', async () => {
    const err = new Error('async failure');
    const fn = jest.fn().mockRejectedValue(err);
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    const wrapped = asyncHandler(fn as never);
    wrapped(req, res, next);

    // Wait for microtask queue to flush
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(err);
  });

  it('should not call next when async fn resolves', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    const wrapped = asyncHandler(fn as never);
    wrapped(req, res, next);

    await Promise.resolve();

    expect(next).not.toHaveBeenCalled();
  });

  it('should forward req, res, next to the wrapped function', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    asyncHandler(fn as never)(req, res, next);

    await Promise.resolve();

    expect(fn).toHaveBeenCalledWith(req, res, next);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
  it('should respond 404 with route info', () => {
    const req = buildReq('/unknown', 'GET');
    const res = buildRes();
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('/unknown');
  });
});
