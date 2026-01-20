/**
 * Transaction Event Handlers Unit Tests
 *
 * Tests the transaction saga event handlers.
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

// Mock transactionService
const mockOnDebitSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnDebitFailed = jest.fn().mockResolvedValue(undefined);
const mockOnCreditSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnCreditFailed = jest.fn().mockResolvedValue(undefined);
const mockOnRefundCompleted = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/services/transaction/transaction.service', () => ({
  transactionService: {
    onDebitSuccess: mockOnDebitSuccess,
    onDebitFailed: mockOnDebitFailed,
    onCreditSuccess: mockOnCreditSuccess,
    onCreditFailed: mockOnCreditFailed,
    onRefundCompleted: mockOnRefundCompleted,
  },
}));

describe('Transaction Event Handlers', () => {
  let registerTransactionEventHandlers: typeof import('../../../src/services/transaction/transaction.events').registerTransactionEventHandlers;
  let unregisterTransactionEventHandlers: typeof import('../../../src/services/transaction/transaction.events').unregisterTransactionEventHandlers;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/services/transaction/transaction.events');
    registerTransactionEventHandlers = module.registerTransactionEventHandlers;
    unregisterTransactionEventHandlers = module.unregisterTransactionEventHandlers;
  });

  describe('registerTransactionEventHandlers', () => {
    it('should subscribe to all required event types', async () => {
      await registerTransactionEventHandlers();

      expect(mockSubscribe).toHaveBeenCalledTimes(5);
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.DEBIT_SUCCESS, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.DEBIT_FAILED, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.CREDIT_SUCCESS, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.CREDIT_FAILED, expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith(EventType.REFUND_COMPLETED, expect.any(Function));
    });

    it('should throw error if subscription fails', async () => {
      mockSubscribe.mockRejectedValueOnce(new Error('Subscription failed'));

      await expect(registerTransactionEventHandlers()).rejects.toThrow('Subscription failed');
    });
  });

  describe('unregisterTransactionEventHandlers', () => {
    it('should unsubscribe from all event types', async () => {
      await unregisterTransactionEventHandlers();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(5);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.DEBIT_SUCCESS);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.DEBIT_FAILED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.CREDIT_SUCCESS);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.CREDIT_FAILED);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.REFUND_COMPLETED);
    });

    it('should not throw if unsubscribe fails', async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error('Unsubscribe failed'));

      // Should not throw
      await unregisterTransactionEventHandlers();
    });
  });

  describe('handleDebitSuccess', () => {
    it('should call transactionService.onDebitSuccess', async () => {
      await registerTransactionEventHandlers();

      // Get the handler that was registered
      const debitSuccessHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      expect(debitSuccessHandler).toBeDefined();

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await debitSuccessHandler(event);

      expect(mockOnDebitSuccess).toHaveBeenCalledWith('txn_123');
    });

    it('should throw error if service call fails', async () => {
      mockOnDebitSuccess.mockRejectedValueOnce(new Error('Service error'));

      await registerTransactionEventHandlers();

      const debitSuccessHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await expect(debitSuccessHandler(event)).rejects.toThrow('Service error');
    });
  });

  describe('handleDebitFailed', () => {
    it('should call transactionService.onDebitFailed with reason', async () => {
      await registerTransactionEventHandlers();

      const debitFailedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_FAILED
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_FAILED,
        transactionId: 'txn_456',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100, reason: 'Insufficient balance' },
      };

      await debitFailedHandler(event);

      expect(mockOnDebitFailed).toHaveBeenCalledWith('txn_456', 'Insufficient balance');
    });

    it('should throw error if service call fails', async () => {
      mockOnDebitFailed.mockRejectedValueOnce(new Error('Service error'));

      await registerTransactionEventHandlers();

      const debitFailedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_FAILED
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_FAILED,
        transactionId: 'txn_456',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100, reason: 'Insufficient balance' },
      };

      await expect(debitFailedHandler(event)).rejects.toThrow('Service error');
    });
  });

  describe('handleCreditSuccess', () => {
    it('should call transactionService.onCreditSuccess', async () => {
      await registerTransactionEventHandlers();

      const creditSuccessHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.CREDIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.CREDIT_SUCCESS,
        transactionId: 'txn_789',
        timestamp: new Date(),
        payload: { receiverId: 'user_2', amount: 100 },
      };

      await creditSuccessHandler(event);

      expect(mockOnCreditSuccess).toHaveBeenCalledWith('txn_789');
    });

    it('should throw error if service call fails', async () => {
      mockOnCreditSuccess.mockRejectedValueOnce(new Error('Service error'));

      await registerTransactionEventHandlers();

      const creditSuccessHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.CREDIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.CREDIT_SUCCESS,
        transactionId: 'txn_789',
        timestamp: new Date(),
        payload: { receiverId: 'user_2', amount: 100 },
      };

      await expect(creditSuccessHandler(event)).rejects.toThrow('Service error');
    });
  });

  describe('handleCreditFailed', () => {
    it('should call transactionService.onCreditFailed with reason', async () => {
      await registerTransactionEventHandlers();

      const creditFailedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.CREDIT_FAILED
      )?.[1];

      const event = {
        eventType: EventType.CREDIT_FAILED,
        transactionId: 'txn_abc',
        timestamp: new Date(),
        payload: { receiverId: 'user_2', amount: 100, reason: 'Wallet not found' },
      };

      await creditFailedHandler(event);

      expect(mockOnCreditFailed).toHaveBeenCalledWith('txn_abc', 'Wallet not found');
    });

    it('should throw error if service call fails', async () => {
      mockOnCreditFailed.mockRejectedValueOnce(new Error('Service error'));

      await registerTransactionEventHandlers();

      const creditFailedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.CREDIT_FAILED
      )?.[1];

      const event = {
        eventType: EventType.CREDIT_FAILED,
        transactionId: 'txn_abc',
        timestamp: new Date(),
        payload: { receiverId: 'user_2', amount: 100, reason: 'Wallet not found' },
      };

      await expect(creditFailedHandler(event)).rejects.toThrow('Service error');
    });
  });

  describe('handleRefundCompleted', () => {
    it('should call transactionService.onRefundCompleted', async () => {
      await registerTransactionEventHandlers();

      const refundCompletedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.REFUND_COMPLETED
      )?.[1];

      const event = {
        eventType: EventType.REFUND_COMPLETED,
        transactionId: 'txn_def',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await refundCompletedHandler(event);

      expect(mockOnRefundCompleted).toHaveBeenCalledWith('txn_def');
    });

    it('should throw error if service call fails', async () => {
      mockOnRefundCompleted.mockRejectedValueOnce(new Error('Service error'));

      await registerTransactionEventHandlers();

      const refundCompletedHandler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.REFUND_COMPLETED
      )?.[1];

      const event = {
        eventType: EventType.REFUND_COMPLETED,
        transactionId: 'txn_def',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await expect(refundCompletedHandler(event)).rejects.toThrow('Service error');
    });
  });
});
