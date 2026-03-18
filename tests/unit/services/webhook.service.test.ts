/**
 * Unit Tests: WebhookService
 *
 * Tests all webhook operations with models and enqueueWebhookDelivery mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWebhookFindOne = jest.fn();
const mockWebhookFind = jest.fn();
const mockWebhookCreate = jest.fn();
const mockWebhookCountDocuments = jest.fn();
const mockWebhookDeleteOne = jest.fn();

jest.mock('../../../src/models/WebhookSubscription', () => ({
  WebhookSubscription: {
    findOne: (...a: unknown[]) => mockWebhookFindOne(...a),
    find: (...a: unknown[]) => mockWebhookFind(...a),
    create: (...a: unknown[]) => mockWebhookCreate(...a),
    countDocuments: (...a: unknown[]) => mockWebhookCountDocuments(...a),
    deleteOne: (...a: unknown[]) => mockWebhookDeleteOne(...a),
  },
}));

const mockDeliveryFind = jest.fn();
const mockDeliveryCreate = jest.fn();
const mockDeliveryCountDocuments = jest.fn();

jest.mock('../../../src/models/WebhookDelivery', () => ({
  WebhookDelivery: {
    find: (...a: unknown[]) => mockDeliveryFind(...a),
    create: (...a: unknown[]) => mockDeliveryCreate(...a),
    countDocuments: (...a: unknown[]) => mockDeliveryCountDocuments(...a),
  },
}));

const mockEnqueueWebhookDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/queues', () => ({
  enqueueWebhookDelivery: (...a: unknown[]) => mockEnqueueWebhookDelivery(...a),
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { WebhookService } from '../../../src/services/webhook/webhook.service';
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
    secret: 'abc123',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildFindQuery(items: unknown[]) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(items),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookService (unit)', () => {
  let service: WebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookService();
  });

  // ── createWebhook ─────────────────────────────────────────────────────────

  describe('createWebhook', () => {
    it('should create and return a webhook', async () => {
      mockWebhookFindOne.mockResolvedValue(null); // no duplicate
      const wh = makeWebhook();
      mockWebhookCreate.mockResolvedValue(wh);

      const result = await service.createWebhook('u1', {
        url: 'https://example.com/hook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      expect(mockWebhookCreate).toHaveBeenCalled();
      expect(result.webhookId).toBe('wh_1');
    });

    it('should throw 400 for invalid URL', async () => {
      await expect(
        service.createWebhook('u1', { url: 'not-a-url', events: [EventType.TRANSACTION_COMPLETED] })
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should throw 400 when no events provided', async () => {
      await expect(
        service.createWebhook('u1', { url: 'https://example.com', events: [] })
      ).rejects.toThrow('At least one event type is required');
    });

    it('should throw 409 when webhook URL already exists for user', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());

      await expect(
        service.createWebhook('u1', {
          url: 'https://example.com/hook',
          events: [EventType.TRANSACTION_COMPLETED],
        })
      ).rejects.toThrow('already exists');
    });

    it('should throw 400 for invalid event types', async () => {
      await expect(
        service.createWebhook('u1', {
          url: 'https://example.com/hook',
          events: ['INVALID_EVENT_TYPE' as never],
        })
      ).rejects.toThrow('Invalid event types');
    });
  });

  // ── getWebhook ────────────────────────────────────────────────────────────

  describe('getWebhook', () => {
    it('should return webhook when found and user matches', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());

      const result = await service.getWebhook('wh_1', 'u1');
      expect(result.webhookId).toBe('wh_1');
    });

    it('should throw 404 when webhook not found', async () => {
      mockWebhookFindOne.mockResolvedValue(null);
      await expect(service.getWebhook('wh_missing', 'u1')).rejects.toThrow('Webhook not found');
    });

    it('should throw 403 when user does not own the webhook', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook({ userId: 'other_user' }));
      await expect(service.getWebhook('wh_1', 'u1')).rejects.toThrow('Not authorized');
    });
  });

  // ── listWebhooks ──────────────────────────────────────────────────────────

  describe('listWebhooks', () => {
    it('should return webhooks and total', async () => {
      const webhooks = [makeWebhook()];
      mockWebhookFind.mockReturnValue(buildFindQuery(webhooks));
      mockWebhookCountDocuments.mockResolvedValue(1);

      const result = await service.listWebhooks('u1');

      expect(result.webhooks).toBe(webhooks);
      expect(result.total).toBe(1);
    });
  });

  // ── updateWebhook ─────────────────────────────────────────────────────────

  describe('updateWebhook', () => {
    it('should update and return webhook', async () => {
      const wh = makeWebhook();
      mockWebhookFindOne.mockResolvedValue(wh);

      const result = await service.updateWebhook('wh_1', 'u1', {
        url: 'https://new.example.com/hook',
      });

      expect(wh.save).toHaveBeenCalled();
      expect(result.url).toBe('https://new.example.com/hook');
    });

    it('should throw 400 for invalid URL on update', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());

      await expect(
        service.updateWebhook('wh_1', 'u1', { url: 'not-a-url' })
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should reset failureCount when re-enabling webhook', async () => {
      const wh = makeWebhook({ failureCount: 5, isActive: false });
      mockWebhookFindOne.mockResolvedValue(wh);

      await service.updateWebhook('wh_1', 'u1', { isActive: true });

      expect(wh.failureCount).toBe(0);
    });
  });

  // ── deleteWebhook ─────────────────────────────────────────────────────────

  describe('deleteWebhook', () => {
    it('should delete the webhook', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());
      mockWebhookDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.deleteWebhook('wh_1', 'u1');

      expect(mockWebhookDeleteOne).toHaveBeenCalledWith({ webhookId: 'wh_1' });
    });
  });

  // ── getDeliveryLogs ───────────────────────────────────────────────────────

  describe('getDeliveryLogs', () => {
    it('should return delivery logs after verifying ownership', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());
      const deliveries = [{ deliveryId: 'd1', status: 'SUCCESS' }];
      mockDeliveryFind.mockReturnValue(buildFindQuery(deliveries));
      mockDeliveryCountDocuments.mockResolvedValue(1);

      const result = await service.getDeliveryLogs('wh_1', 'u1');

      expect(result.deliveries).toBe(deliveries);
      expect(result.total).toBe(1);
    });

    it('should filter by status when provided', async () => {
      mockWebhookFindOne.mockResolvedValue(makeWebhook());
      const failedDeliveries = [{ deliveryId: 'd2', status: 'FAILED' }];
      mockDeliveryFind.mockReturnValue(buildFindQuery(failedDeliveries));
      mockDeliveryCountDocuments.mockResolvedValue(1);

      const result = await service.getDeliveryLogs('wh_1', 'u1', { status: 'FAILED' as never });

      expect(result.deliveries).toBe(failedDeliveries);
    });
  });

  // ── triggerWebhooks ───────────────────────────────────────────────────────

  describe('triggerWebhooks', () => {
    it('should enqueue deliveries and return count', async () => {
      const webhooks = [makeWebhook(), makeWebhook({ webhookId: 'wh_2' })];
      mockWebhookFind.mockResolvedValue(webhooks);
      mockDeliveryCreate.mockResolvedValue({ deliveryId: 'd1' });

      const count = await service.triggerWebhooks(
        EventType.TRANSACTION_COMPLETED,
        'txn_1',
        { transactionId: 'txn_1', amount: 100 } as never
      );

      expect(count).toBe(2);
      expect(mockEnqueueWebhookDelivery).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no webhooks subscribed', async () => {
      mockWebhookFind.mockResolvedValue([]);

      const count = await service.triggerWebhooks(
        EventType.TRANSACTION_COMPLETED,
        'txn_1',
        {} as never
      );

      expect(count).toBe(0);
      expect(mockEnqueueWebhookDelivery).not.toHaveBeenCalled();
    });
  });
});
