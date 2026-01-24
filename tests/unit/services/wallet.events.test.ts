/**
 * Wallet Event Handlers Unit Tests
 *
 * Tests the wallet event handlers for debit and refund operations.
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

// Mock walletService
const mockDebit = jest.fn().mockResolvedValue({ newBalance: 900 });
const mockRefund = jest.fn().mockResolvedValue({ newBalance: 1000 });

jest.mock('../../../src/services/wallet/wallet.service', () => ({
  walletService: {
    debit: mockDebit,
    refund: mockRefund,
  },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/observability', () => ({
  logger: mockLogger,
}));

describe('Wallet Event Handlers', () => {
  let registerWalletEventHandlers: typeof import('../../../src/services/wallet/wallet.events').registerWalletEventHandlers;
  let unregisterWalletEventHandlers: typeof import('../../../src/services/wallet/wallet.events').unregisterWalletEventHandlers;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/services/wallet/wallet.events');
    registerWalletEventHandlers = module.registerWalletEventHandlers;
    unregisterWalletEventHandlers = module.unregisterWalletEventHandlers;
  });

  describe('registerWalletEventHandlers', () => {
    it('should subscribe to all required event types', async () => {
      await registerWalletEventHandlers();

      expect(mockSubscribe).toHaveBeenCalledTimes(3);
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.TRANSACTION_INITIATED,
        expect.any(Function)
      );
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.REFUND_REQUESTED,
        expect.any(Function)
      );
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.DEBIT_SUCCESS,
        expect.any(Function)
      );
    });

    it('should throw error if subscription fails', async () => {
      mockSubscribe.mockRejectedValueOnce(new Error('Subscription failed'));

      await expect(registerWalletEventHandlers()).rejects.toThrow('Subscription failed');
    });
  });

  describe('unregisterWalletEventHandlers', () => {
    it('should unsubscribe from all event types', async () => {
      await unregisterWalletEventHandlers();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_INITIATED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.REFUND_REQUESTED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.DEBIT_SUCCESS);
    });

    it('should not throw if unsubscribe fails', async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error('Unsubscribe failed'));

      // Should not throw
      await unregisterWalletEventHandlers();
    });
  });

  describe('handleTransactionInitiated', () => {
    it('should call walletService.debit with correct parameters', async () => {
      await registerWalletEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_INITIATED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_INITIATED,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: { senderId: 'user_1', receiverId: 'user_2', amount: 100, currency: 'INR' },
      };

      await handler(event);

      expect(mockDebit).toHaveBeenCalledWith('user_1', 100, 'txn_123');
    });

    it('should handle debit failure gracefully', async () => {
      mockLogger.error.mockClear();
      mockDebit.mockRejectedValueOnce(new Error('Insufficient balance'));

      await registerWalletEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.TRANSACTION_INITIATED
      )?.[1];

      const event = {
        eventType: EventType.TRANSACTION_INITIATED,
        transactionId: 'txn_456',
        timestamp: new Date(),
        payload: { senderId: 'user_1', receiverId: 'user_2', amount: 100, currency: 'INR' },
      };

      // Should not throw
      await handler(event);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'txn_456', err: expect.any(Error) }),
        'Debit failed'
      );
    });
  });

  describe('handleRefundRequested', () => {
    it('should call walletService.refund with correct parameters', async () => {
      await registerWalletEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.REFUND_REQUESTED
      )?.[1];

      const event = {
        eventType: EventType.REFUND_REQUESTED,
        transactionId: 'txn_789',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await handler(event);

      expect(mockRefund).toHaveBeenCalledWith('user_1', 100, 'txn_789');
    });

    it('should handle refund failure gracefully', async () => {
      mockLogger.error.mockClear();
      mockRefund.mockRejectedValueOnce(new Error('Refund failed'));

      await registerWalletEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.REFUND_REQUESTED
      )?.[1];

      const event = {
        eventType: EventType.REFUND_REQUESTED,
        transactionId: 'txn_abc',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      // Should not throw
      await handler(event);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'txn_abc', err: expect.any(Error) }),
        'Refund failed'
      );
    });
  });

  describe('handleDebitSuccess', () => {
    it('should log debit success event', async () => {
      mockLogger.debug.mockClear();

      await registerWalletEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_def',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await handler(event);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: 'txn_def' }),
        'DEBIT_SUCCESS received'
      );
    });
  });
});
