/**
 * Unit Tests: correlationMiddleware
 *
 * Tests correlation ID extraction, generation, and request logging.
 * Uses jest.spyOn on the real logger (pino in silent mode during tests).
 */

import { Request, Response, NextFunction } from 'express';

// ── Import ────────────────────────────────────────────────────────────────────

import { correlationMiddleware } from '../../../src/observability/correlation';
import { logger } from '../../../src/observability/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

type FinishListener = () => void;

function buildReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
    method: 'GET',
    path: '/api/test',
    query: {},
  } as unknown as Request;
}

function buildRes(statusCode = 200): Response & { triggerFinish: () => void } {
  const listeners: FinishListener[] = [];
  return {
    statusCode,
    setHeader: jest.fn(),
    on(event: string, cb: FinishListener) {
      if (event === 'finish') listeners.push(cb);
    },
    triggerFinish() {
      listeners.forEach((fn) => fn());
    },
  } as unknown as Response & { triggerFinish: () => void };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('correlationMiddleware', () => {
  let next: NextFunction;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    next = jest.fn();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  // ── correlation ID extraction ──────────────────────────────────────────────

  it('should use x-correlation-id header when present', () => {
    const req = buildReq({ 'x-correlation-id': 'client-corr-id' });
    const res = buildRes();

    correlationMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'client-corr-id');
  });

  it('should use x-request-id header as fallback', () => {
    const req = buildReq({ 'x-request-id': 'request-id-456' });
    const res = buildRes();

    correlationMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'request-id-456');
  });

  it('should generate a UUID when no correlation header is present', () => {
    const req = buildReq({});
    const res = buildRes();

    correlationMiddleware(req, res, next);

    const setHeaderCall = (res.setHeader as jest.Mock).mock.calls[0];
    expect(setHeaderCall[0]).toBe('x-correlation-id');
    // Should be a valid UUID format
    expect(setHeaderCall[1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should prefer x-correlation-id over x-request-id', () => {
    const req = buildReq({
      'x-correlation-id': 'corr-id',
      'x-request-id': 'req-id',
    });
    const res = buildRes();

    correlationMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr-id');
  });

  // ── next() ────────────────────────────────────────────────────────────────

  it('should call next()', () => {
    correlationMiddleware(buildReq(), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  // ── request logging ───────────────────────────────────────────────────────

  it('should log request start with method and path', () => {
    const req = {
      headers: { 'x-correlation-id': 'test-corr', 'user-agent': 'test-agent' },
      method: 'POST',
      path: '/transactions',
      query: { page: '1' },
    } as unknown as Request;
    const res = buildRes();

    correlationMiddleware(req, res, next);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'test-corr',
        method: 'POST',
        path: '/transactions',
        query: { page: '1' },
        userAgent: 'test-agent',
      }),
      'Request started'
    );
  });

  it('should log using the extracted correlation ID', () => {
    const req = buildReq({ 'x-correlation-id': 'unique-id' });
    const res = buildRes();

    correlationMiddleware(req, res, next);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'unique-id' }),
      'Request started'
    );
  });

  // ── response finish logging ───────────────────────────────────────────────

  it('should log request completion on response finish', () => {
    const req = buildReq({ 'x-correlation-id': 'test-corr' });
    const res = buildRes(201);

    correlationMiddleware(req, res, next);
    res.triggerFinish();

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'test-corr',
        statusCode: 201,
      }),
      'Request completed'
    );
  });

  it('should log completion with correct status code on finish', () => {
    const req = buildReq({ 'x-correlation-id': 'test-corr-2' });
    const res = buildRes(404);

    correlationMiddleware(req, res, next);
    res.triggerFinish();

    const completedCall = infoSpy.mock.calls.find(
      (c: unknown[]) => c[1] === 'Request completed'
    );
    expect(completedCall).toBeDefined();
    expect(completedCall?.[0]).toMatchObject({ statusCode: 404 });
  });

  it('should not log completion if finish never fires', () => {
    correlationMiddleware(buildReq(), buildRes(), next);
    // Only 'Request started' was logged, not 'Request completed'
    const completedCalls = infoSpy.mock.calls.filter(
      (c: unknown[]) => c[1] === 'Request completed'
    );
    expect(completedCalls).toHaveLength(0);
  });

  it('should call next() from within async context', () => {
    const calls: string[] = [];
    const trackingNext = jest.fn(() => calls.push('next'));
    infoSpy.mockImplementation((_data: unknown, msg: string) => {
      calls.push(msg as string);
      return undefined as never;
    });

    correlationMiddleware(buildReq({ 'x-correlation-id': 'ctx-corr' }), buildRes(), trackingNext);

    expect(calls).toContain('Request started');
    expect(calls).toContain('next');
    // Request started should come before next()
    expect(calls.indexOf('Request started')).toBeLessThan(calls.indexOf('next'));
  });
});
