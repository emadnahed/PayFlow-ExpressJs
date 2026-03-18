/**
 * Unit Tests: metricsMiddleware
 *
 * Tests path normalization and metrics recording via res.on('finish').
 * Uses resetModules + doMock pattern to guarantee fresh module context.
 */

import { Request, Response, NextFunction } from 'express';

// ── Types ─────────────────────────────────────────────────────────────────────

type FinishListener = () => void;
type MetricsMiddlewareFn = (req: Request, res: Response, next: NextFunction) => void;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(overrides: Partial<{
  path: string;
  method: string;
  baseUrl: string;
  route: { path: string };
}> = {}): Request {
  return {
    path: '/api/test',
    method: 'GET',
    baseUrl: '',
    ...overrides,
  } as unknown as Request;
}

// Plain object so Jest's clearMocks cannot interfere with the listener queue
function buildRes(statusCode = 200): Response & { triggerFinish: () => void } {
  const listeners: FinishListener[] = [];
  return {
    statusCode,
    on(event: string, cb: FinishListener) {
      if (event === 'finish') listeners.push(cb);
    },
    triggerFinish() {
      listeners.forEach(fn => fn());
    },
  } as unknown as Response & { triggerFinish: () => void };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('metricsMiddleware', () => {
  let metricsMiddleware: MetricsMiddlewareFn;
  let mockInc: jest.Mock;
  let mockObserve: jest.Mock;
  let next: NextFunction;

  beforeEach(async () => {
    // Fresh module context for each test so doMock takes effect
    jest.resetModules();

    mockInc = jest.fn();
    mockObserve = jest.fn();
    next = jest.fn();

    jest.doMock('../../../src/observability/metrics', () => ({
      httpRequestsTotal: { inc: mockInc },
      httpRequestDuration: { observe: mockObserve },
    }));

    const mod = await import('../../../src/observability/metrics.middleware');
    metricsMiddleware = mod.metricsMiddleware;
  });

  afterEach(() => {
    jest.dontMock('../../../src/observability/metrics');
  });

  // ── /metrics skip ─────────────────────────────────────────────────────────

  it('should skip recording for /metrics path and still call next()', () => {
    const req = buildReq({ path: '/metrics' });
    const res = buildRes();

    metricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    res.triggerFinish();
    expect(mockInc).not.toHaveBeenCalled();
    expect(mockObserve).not.toHaveBeenCalled();
  });

  // ── normal request ────────────────────────────────────────────────────────

  it('should call next() for non-metrics paths', () => {
    metricsMiddleware(buildReq({ path: '/transactions' }), buildRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('should record httpRequestsTotal and httpRequestDuration on finish', () => {
    const req = buildReq({ path: '/transactions', method: 'POST' });
    const res = buildRes(201);

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', status: '201' })
    );
    expect(mockObserve).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', status: '201' }),
      expect.any(Number)
    );
  });

  it('should record a non-negative duration', () => {
    const req = buildReq({ path: '/health' });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    const duration = mockObserve.mock.calls[0][1] as number;
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  // ── path normalization ────────────────────────────────────────────────────

  it('should normalize UUID in path to :id', () => {
    const req = buildReq({ path: '/wallets/550e8400-e29b-41d4-a716-446655440000' });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/wallets/:id' })
    );
  });

  it('should normalize MongoDB ObjectId in path to :id', () => {
    const req = buildReq({ path: '/transactions/507f1f77bcf86cd799439011' });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/transactions/:id' })
    );
  });

  it('should normalize numeric path segment to /:id', () => {
    const req = buildReq({ path: '/users/42/profile' });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/users/:id/profile' })
    );
  });

  // ── route pattern from req.route ──────────────────────────────────────────

  it('should use matched route pattern (baseUrl + route.path) when req.route is set', () => {
    const req = buildReq({
      path: '/wallets/abc123',
      baseUrl: '/api/v1',
      route: { path: '/wallets/:id' },
    });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/v1/wallets/:id' })
    );
  });

  it('should fall back to normalized path when req.route is absent', () => {
    const req = buildReq({ path: '/webhooks/507f1f77bcf86cd799439011', baseUrl: '' });
    const res = buildRes();

    metricsMiddleware(req, res, next);
    res.triggerFinish();

    expect(mockInc).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/webhooks/:id' })
    );
  });
});
