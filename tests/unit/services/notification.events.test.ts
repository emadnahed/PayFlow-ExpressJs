/**
 * Unit Tests: Notification Event Handlers
 *
 * Tests registerNotificationEventHandlers, unregisterNotificationEventHandlers,
 * and all 4 handlers via captured subscribe callbacks.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

type EventCallback = (event: unknown) => Promise<void>;
const subscribeCallbacks = new Map<string, EventCallback>();

const mockSubscribe = jest.fn().mockImplementation((eventType: string, cb: EventCallback) => {
  subscribeCallbacks.set(eventType, cb);
  return Promise.resolve();
});
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/events/eventBus', () => ({
  eventBus: {
    subscribe: (...a: unknown[]) => mockSubscribe(...a),
    unsubscribe: (...a: unknown[]) => mockUnsubscribe(...a),
  },
}));

const mockNotifyInitiated = jest.fn().mockResolvedValue(undefined);
const mockNotifyCompleted = jest.fn().mockResolvedValue(undefined);
const mockNotifyFailed = jest.fn().mockResolvedValue(undefined);
const mockNotifyCreditReceived = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/services/notification/notification.service', () => ({
  notificationService: {
    notifyTransactionInitiated: (...a: unknown[]) => mockNotifyInitiated(...a),
    notifyTransactionCompleted: (...a: unknown[]) => mockNotifyCompleted(...a),
    notifyTransactionFailed: (...a: unknown[]) => mockNotifyFailed(...a),
    notifyCreditReceived: (...a: unknown[]) => mockNotifyCreditReceived(...a),
  },
}));

const mockUserFindOne = jest.fn();
jest.mock('../../../src/models/User', () => ({
  User: { findOne: (...a: unknown[]) => mockUserFindOne(...a) },
}));

const mockTransactionFindOne = jest.fn();
jest.mock('../../../src/models/Transaction', () => ({
  Transaction: { findOne: (...a: unknown[]) => mockTransactionFindOne(...a) },
}));

jest.mock('../../../src/observability', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import {
  registerNotificationEventHandlers,
  unregisterNotificationEventHandlers,
} from '../../../src/services/notification/notification.events';
import { EventType } from '../../../src/types/events';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Notification Event Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subscribeCallbacks.clear();
    mockSubscribe.mockImplementation((eventType: string, cb: EventCallback) => {
      subscribeCallbacks.set(eventType, cb);
      return Promise.resolve();
    });
    mockUnsubscribe.mockResolvedValue(undefined);
  });

  // ── registerNotificationEventHandlers ─────────────────────────────────────

  describe('registerNotificationEventHandlers', () => {
    it('should subscribe to all 4 event types', async () => {
      await registerNotificationEventHandlers();

      expect(mockSubscribe).toHaveBeenCalledTimes(4);
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_INITIATED, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_COMPLETED, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_FAILED, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.CREDIT_SUCCESS, expect.any(Function));
    });

    it('should throw when eventBus.subscribe fails', async () => {
      mockSubscribe.mockRejectedValueOnce(new Error('Redis down'));

      await expect(registerNotificationEventHandlers()).rejects.toThrow('Redis down');
    });
  });

  // ── unregisterNotificationEventHandlers ──────────────────────────────────

  describe('unregisterNotificationEventHandlers', () => {
    it('should unsubscribe from all 4 event types', async () => {
      await unregisterNotificationEventHandlers();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(4);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_INITIATED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_COMPLETED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_FAILED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.CREDIT_SUCCESS);
    });

    it('should not throw when unsubscribe fails', async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error('Redis error'));

      await expect(unregisterNotificationEventHandlers()).resolves.not.toThrow();
    });
  });

  // ── handleTransactionInitiated ────────────────────────────────────────────

  describe('handleTransactionInitiated', () => {
    it('should call notifyTransactionInitiated with correct args', async () => {
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_INITIATED)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.TRANSACTION_INITIATED,
        payload: { senderId: 'u1', amount: 100, currency: 'INR' },
      });

      expect(mockNotifyInitiated).toHaveBeenCalledWith('u1', 100, 'INR', 'txn_1');
    });

    it('should not throw if notifyTransactionInitiated rejects', async () => {
      mockNotifyInitiated.mockRejectedValueOnce(new Error('Queue failure'));
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_INITIATED)!;

      await expect(
        handler({
          transactionId: 'txn_1',
          eventType: EventType.TRANSACTION_INITIATED,
          payload: { senderId: 'u1', amount: 100, currency: 'INR' },
        })
      ).resolves.not.toThrow();
    });
  });

  // ── handleTransactionCompleted ────────────────────────────────────────────

  describe('handleTransactionCompleted', () => {
    it('should look up receiver name and call notifyTransactionCompleted', async () => {
      mockUserFindOne.mockResolvedValue({ name: 'Alice' });
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_COMPLETED)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: { senderId: 'u1', receiverId: 'u2', amount: 200, currency: 'INR' },
      });

      expect(mockUserFindOne).toHaveBeenCalledWith({ userId: 'u2' });
      expect(mockNotifyCompleted).toHaveBeenCalledWith('u1', 'Alice', 200, 'INR', 'txn_1');
    });

    it('should fall back to "PayFlow User" when user not found', async () => {
      mockUserFindOne.mockResolvedValue(null);
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_COMPLETED)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: { senderId: 'u1', receiverId: 'u2', amount: 200, currency: 'INR' },
      });

      expect(mockNotifyCompleted).toHaveBeenCalledWith('u1', 'PayFlow User', 200, 'INR', 'txn_1');
    });

    it('should not throw if getUserName rejects', async () => {
      mockUserFindOne.mockRejectedValueOnce(new Error('DB error'));
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_COMPLETED)!;

      await expect(
        handler({
          transactionId: 'txn_1',
          eventType: EventType.TRANSACTION_COMPLETED,
          payload: { senderId: 'u1', receiverId: 'u2', amount: 200, currency: 'INR' },
        })
      ).resolves.not.toThrow();
    });
  });

  // ── handleTransactionFailed ───────────────────────────────────────────────

  describe('handleTransactionFailed', () => {
    it('should find transaction and call notifyTransactionFailed', async () => {
      mockTransactionFindOne.mockResolvedValue({
        senderId: 'u1',
        amount: 150,
        currency: 'INR',
      });
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_FAILED)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.TRANSACTION_FAILED,
        payload: {},
      });

      expect(mockTransactionFindOne).toHaveBeenCalledWith({ transactionId: 'txn_1' });
      expect(mockNotifyFailed).toHaveBeenCalledWith('u1', 150, 'INR', 'txn_1');
    });

    it('should not notify when transaction is not found', async () => {
      mockTransactionFindOne.mockResolvedValue(null);
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_FAILED)!;

      await handler({
        transactionId: 'txn_missing',
        eventType: EventType.TRANSACTION_FAILED,
        payload: {},
      });

      expect(mockNotifyFailed).not.toHaveBeenCalled();
    });

    it('should not throw if Transaction.findOne rejects', async () => {
      mockTransactionFindOne.mockRejectedValueOnce(new Error('DB error'));
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.TRANSACTION_FAILED)!;

      await expect(
        handler({
          transactionId: 'txn_1',
          eventType: EventType.TRANSACTION_FAILED,
          payload: {},
        })
      ).resolves.not.toThrow();
    });
  });

  // ── handleCreditSuccess ───────────────────────────────────────────────────

  describe('handleCreditSuccess', () => {
    it('should look up sender name and call notifyCreditReceived', async () => {
      mockTransactionFindOne.mockResolvedValue({ senderId: 'u1', currency: 'INR' });
      mockUserFindOne.mockResolvedValue({ name: 'Bob' });
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.CREDIT_SUCCESS)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.CREDIT_SUCCESS,
        payload: { receiverId: 'u2', amount: 300 },
      });

      expect(mockTransactionFindOne).toHaveBeenCalledWith({ transactionId: 'txn_1' });
      expect(mockUserFindOne).toHaveBeenCalledWith({ userId: 'u1' });
      expect(mockNotifyCreditReceived).toHaveBeenCalledWith('u2', 'Bob', 300, 'INR', 'txn_1');
    });

    it('should fall back to "PayFlow User" when sender not found', async () => {
      mockTransactionFindOne.mockResolvedValue({ senderId: 'u1', currency: 'INR' });
      mockUserFindOne.mockResolvedValue(null);
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.CREDIT_SUCCESS)!;

      await handler({
        transactionId: 'txn_1',
        eventType: EventType.CREDIT_SUCCESS,
        payload: { receiverId: 'u2', amount: 300 },
      });

      expect(mockNotifyCreditReceived).toHaveBeenCalledWith('u2', 'PayFlow User', 300, 'INR', 'txn_1');
    });

    it('should not notify when transaction is not found', async () => {
      mockTransactionFindOne.mockResolvedValue(null);
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.CREDIT_SUCCESS)!;

      await handler({
        transactionId: 'txn_missing',
        eventType: EventType.CREDIT_SUCCESS,
        payload: { receiverId: 'u2', amount: 300 },
      });

      expect(mockNotifyCreditReceived).not.toHaveBeenCalled();
    });

    it('should not throw if Transaction.findOne rejects', async () => {
      mockTransactionFindOne.mockRejectedValueOnce(new Error('DB error'));
      await registerNotificationEventHandlers();
      const handler = subscribeCallbacks.get(EventType.CREDIT_SUCCESS)!;

      await expect(
        handler({
          transactionId: 'txn_1',
          eventType: EventType.CREDIT_SUCCESS,
          payload: { receiverId: 'u2', amount: 300 },
        })
      ).resolves.not.toThrow();
    });
  });
});
