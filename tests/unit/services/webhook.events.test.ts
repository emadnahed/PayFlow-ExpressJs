/**
 * Webhook Event Handlers Unit Tests
 *
 * Tests the webhook event handlers for transaction events.
 */

import { EventType } from '../../../src/types/events';

// Mock eventBus
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/events/eventBus', () => ({
  eventBus: {
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  },
}));

// Mock webhookService
const mockTriggerWebhooks = jest.fn().mockResolvedValue(2);

jest.mock('../../../src/services/webhook/webhook.service', () => ({
  webhookService: {
    triggerWebhooks: mockTriggerWebhooks,
  },
}));

// Mock Transaction model
const mockFindOne = jest.fn().mockResolvedValue({
  transactionId: 'txn_123',
  amount: 100,
  currency: 'INR',
  senderId: 'user_1',
  receiverId: 'user_2',
});

jest.mock('../../../src/models/Transaction', () => ({
  Transaction: {
    findOne: mockFindOne,
  },
}));

describe('Webhook Event Handlers', () => {
  let registerWebhookEventHandlers: typeof import('../../../src/services/webhook/webhook.events').registerWebhookEventHandlers;
  let unregisterWebhookEventHandlers: typeof import('../../../src/services/webhook/webhook.events').unregisterWebhookEventHandlers;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/services/webhook/webhook.events');
    registerWebhookEventHandlers = module.registerWebhookEventHandlers;
    unregisterWebhookEventHandlers = module.unregisterWebhookEventHandlers;
  });

  describe('registerWebhookEventHandlers', () => {
    it('should subscribe to all required event types', async () => {
      await registerWebhookEventHandlers();

      expect(mockSubscribe).toHaveBeenCalledTimes(2);
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.TRANSACTION_COMPLETED,
        expect.any(Function)
      );
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.TRANSACTION_FAILED,
        expect.any(Function)
      );
    });

    it('should throw error if subscription fails', async () => {
      mockSubscribe.mockRejectedValueOnce(new Error('Subscription failed'));

      await expect(registerWebhookEventHandlers()).rejects.toThrow('Subscription failed');
    });
  });

  describe('unregisterWebhookEventHandlers', () => {
    it('should unsubscribe from all event types', async () => {
      await unregisterWebhookEventHandlers();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_COMPLETED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_FAILED);
    });

    it('should not throw if unsubscribe fails', async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error('Unsubscribe failed'));

      // Should not throw
      await unregisterWebhookEventHandlers();
    });
  });

  describe('handleTransactionCompleted', () => {
    it('should trigger webhooks with correct payload', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await registerWebhookEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_COMPLETED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_COMPLETED,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: {
          senderId: 'user_1',
          receiverId: 'user_2',
          amount: 100,
          currency: 'INR',
        },
      };

      await handler(event);

      expect(mockTriggerWebhooks).toHaveBeenCalledWith(
        EventType.TRANSACTION_COMPLETED,
        'txn_123',
        expect.objectContaining({
          event: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_123',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          senderId: 'user_1',
          receiverId: 'user_2',
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Triggered 2 webhooks for TRANSACTION_COMPLETED')
      );

      consoleSpy.mockRestore();
    });

    it('should handle webhook trigger errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockTriggerWebhooks.mockRejectedValueOnce(new Error('Webhook error'));

      await registerWebhookEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_COMPLETED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_COMPLETED,
        transactionId: 'txn_456',
        timestamp: new Date(),
        payload: {
          senderId: 'user_1',
          receiverId: 'user_2',
          amount: 100,
          currency: 'INR',
        },
      };

      // Should not throw
      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error triggering webhooks for TRANSACTION_COMPLETED'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('handleTransactionFailed', () => {
    it('should trigger webhooks with correct payload including transaction data', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await registerWebhookEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_FAILED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_FAILED,
        transactionId: 'txn_789',
        timestamp: new Date(),
        payload: {
          reason: 'Insufficient funds',
          refunded: true,
        },
      };

      await handler(event);

      expect(mockFindOne).toHaveBeenCalledWith({ transactionId: 'txn_789' });
      expect(mockTriggerWebhooks).toHaveBeenCalledWith(
        EventType.TRANSACTION_FAILED,
        'txn_789',
        expect.objectContaining({
          event: EventType.TRANSACTION_FAILED,
          transactionId: 'txn_789',
          status: 'FAILED',
          reason: 'Insufficient funds',
          refunded: true,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should use default values when transaction not found', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockFindOne.mockResolvedValueOnce(null);

      await registerWebhookEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_FAILED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_FAILED,
        transactionId: 'txn_unknown',
        timestamp: new Date(),
        payload: {
          reason: 'Unknown error',
          refunded: false,
        },
      };

      await handler(event);

      expect(mockTriggerWebhooks).toHaveBeenCalledWith(
        EventType.TRANSACTION_FAILED,
        'txn_unknown',
        expect.objectContaining({
          amount: 0,
          currency: 'INR',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle webhook trigger errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockTriggerWebhooks.mockRejectedValueOnce(new Error('Webhook error'));

      await registerWebhookEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_FAILED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_FAILED,
        transactionId: 'txn_abc',
        timestamp: new Date(),
        payload: {
          reason: 'Error',
          refunded: false,
        },
      };

      // Should not throw
      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error triggering webhooks for TRANSACTION_FAILED'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
