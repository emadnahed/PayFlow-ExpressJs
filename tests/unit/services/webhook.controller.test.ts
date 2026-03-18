/**
 * Unit Tests: WebhookController
 *
 * Tests HTTP handlers with webhookService fully mocked.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../src/auth/auth.types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreateWebhook = jest.fn();
const mockGetWebhook = jest.fn();
const mockListWebhooks = jest.fn();
const mockUpdateWebhook = jest.fn();
const mockDeleteWebhook = jest.fn();
const mockGetDeliveryLogs = jest.fn();

jest.mock('../../../src/services/webhook/webhook.service', () => ({
  webhookService: {
    createWebhook: (...a: unknown[]) => mockCreateWebhook(...a),
    getWebhook: (...a: unknown[]) => mockGetWebhook(...a),
    listWebhooks: (...a: unknown[]) => mockListWebhooks(...a),
    updateWebhook: (...a: unknown[]) => mockUpdateWebhook(...a),
    deleteWebhook: (...a: unknown[]) => mockDeleteWebhook(...a),
    getDeliveryLogs: (...a: unknown[]) => mockGetDeliveryLogs(...a),
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { webhookController } from '../../../src/services/webhook/webhook.controller';
import { EventType } from '../../../src/types/events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWebhook(overrides: Record<string, unknown> = {}) {
  return {
    webhookId: 'wh_1',
    userId: 'u1',
    url: 'https://example.com/hook',
    events: [EventType.TRANSACTION_COMPLETED],
    isActive: true,
    failureCount: 0,
    secret: 'secret_abc',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildReq(
  overrides: Partial<{
    user: Record<string, unknown>;
    body: Record<string, unknown>;
    params: Record<string, string>;
    query: Record<string, string>;
  }> = {}
): AuthRequest {
  return {
    user: 'user' in overrides ? overrides.user : { userId: 'u1' },
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    query: overrides.query ?? {},
  } as unknown as AuthRequest;
}

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookController (unit)', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should respond 201 with webhook including secret', async () => {
      const wh = makeWebhook();
      mockCreateWebhook.mockResolvedValue(wh);
      const req = buildReq({
        body: { url: 'https://example.com/hook', events: [EventType.TRANSACTION_COMPLETED] },
      });
      const res = buildRes();

      await webhookController.create(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.webhook.webhookId).toBe('wh_1');
      expect(body.data.webhook.secret).toBe('secret_abc');
    });

    it('should throw 401 when no user', async () => {
      const req = buildReq({ user: undefined as never });
      const res = buildRes();

      await webhookController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should forward service errors to next', async () => {
      mockCreateWebhook.mockRejectedValue(new Error('Webhook with this URL already exists'));
      const req = buildReq({ body: { url: 'https://example.com/hook', events: [] } });
      const res = buildRes();

      await webhookController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should respond 200 with webhook (no secret)', async () => {
      const wh = makeWebhook();
      mockGetWebhook.mockResolvedValue(wh);
      const req = buildReq({ params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.getById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      // secret should NOT be in the DTO
      expect(body.data.webhook.secret).toBeUndefined();
      expect(body.data.webhook.webhookId).toBe('wh_1');
    });

    it('should forward 404 to next', async () => {
      mockGetWebhook.mockRejectedValue(
        Object.assign(new Error('Webhook not found'), { statusCode: 404 })
      );
      const req = buildReq({ params: { id: 'wh_missing' } });
      const res = buildRes();

      await webhookController.getById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should respond 200 with webhooks and total', async () => {
      const webhooks = [makeWebhook()];
      mockListWebhooks.mockResolvedValue({ webhooks, total: 1 });
      const req = buildReq({ query: { limit: '10', offset: '0' } });
      const res = buildRes();

      await webhookController.list(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.total).toBe(1);
      expect(body.data.webhooks).toHaveLength(1);
    });

    it('should parse isActive filter from query', async () => {
      mockListWebhooks.mockResolvedValue({ webhooks: [], total: 0 });
      const req = buildReq({ query: { isActive: 'true' } });
      const res = buildRes();

      await webhookController.list(req, res, next);

      expect(mockListWebhooks).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ isActive: true })
      );
    });

    it('should throw 401 when no user', async () => {
      const req = buildReq({ user: undefined as never });
      const res = buildRes();

      await webhookController.list(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should respond 200 with updated webhook', async () => {
      const wh = makeWebhook({ url: 'https://new.example.com/hook' });
      mockUpdateWebhook.mockResolvedValue(wh);
      const req = buildReq({
        params: { id: 'wh_1' },
        body: { url: 'https://new.example.com/hook' },
      });
      const res = buildRes();

      await webhookController.update(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.webhook.url).toBe('https://new.example.com/hook');
    });

    it('should throw 401 when no user', async () => {
      const req = buildReq({ user: undefined as never, params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should respond 200 with success message', async () => {
      mockDeleteWebhook.mockResolvedValue(undefined);
      const req = buildReq({ params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.delete(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
    });

    it('should throw 401 when no user', async () => {
      const req = buildReq({ user: undefined as never, params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.delete(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
  });

  // ── getLogs ───────────────────────────────────────────────────────────────

  describe('getLogs', () => {
    it('should respond 200 with delivery logs', async () => {
      const deliveries = [
        {
          deliveryId: 'd1',
          transactionId: 'txn_1',
          eventType: EventType.TRANSACTION_COMPLETED,
          status: 'SUCCESS',
          attemptCount: 1,
          responseCode: 200,
          error: null,
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ];
      mockGetDeliveryLogs.mockResolvedValue({ deliveries, total: 1 });
      const req = buildReq({ params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.getLogs(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.total).toBe(1);
      expect(body.data.deliveries).toHaveLength(1);
    });

    it('should throw 401 when no user', async () => {
      const req = buildReq({ user: undefined as never, params: { id: 'wh_1' } });
      const res = buildRes();

      await webhookController.getLogs(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
  });
});
