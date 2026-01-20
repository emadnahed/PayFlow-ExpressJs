/**
 * Ledger Event Handlers Unit Tests
 *
 * Tests the ledger event handlers for credit operations.
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

// Mock ledgerService
const mockProcessCredit = jest.fn().mockResolvedValue({ success: true, newBalance: 1100 });

jest.mock('../../../src/services/ledger/ledger.service', () => ({
  ledgerService: {
    processCredit: mockProcessCredit,
  },
}));

describe('Ledger Event Handlers', () => {
  let registerLedgerEventHandlers: typeof import('../../../src/services/ledger/ledger.events').registerLedgerEventHandlers;
  let unregisterLedgerEventHandlers: typeof import('../../../src/services/ledger/ledger.events').unregisterLedgerEventHandlers;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/services/ledger/ledger.events');
    registerLedgerEventHandlers = module.registerLedgerEventHandlers;
    unregisterLedgerEventHandlers = module.unregisterLedgerEventHandlers;
  });

  describe('registerLedgerEventHandlers', () => {
    it('should subscribe to DEBIT_SUCCESS event', async () => {
      await registerLedgerEventHandlers();

      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith(
        EventType.DEBIT_SUCCESS,
        expect.any(Function)
      );
    });

    it('should throw error if subscription fails', async () => {
      mockSubscribe.mockRejectedValueOnce(new Error('Subscription failed'));

      await expect(registerLedgerEventHandlers()).rejects.toThrow('Subscription failed');
    });
  });

  describe('unregisterLedgerEventHandlers', () => {
    it('should unsubscribe from DEBIT_SUCCESS event', async () => {
      await unregisterLedgerEventHandlers();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.DEBIT_SUCCESS);
    });

    it('should not throw if unsubscribe fails', async () => {
      mockUnsubscribe.mockRejectedValueOnce(new Error('Unsubscribe failed'));

      // Should not throw
      await unregisterLedgerEventHandlers();
    });
  });

  describe('handleDebitSuccess', () => {
    it('should call ledgerService.processCredit with correct parameters', async () => {
      await registerLedgerEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await handler(event);

      expect(mockProcessCredit).toHaveBeenCalledWith('txn_123');
    });

    it('should log success when credit completes', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockProcessCredit.mockResolvedValueOnce({ success: true, newBalance: 1100 });

      await registerLedgerEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_456',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Credit completed for transaction txn_456')
      );

      consoleSpy.mockRestore();
    });

    it('should log failure when credit fails', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockProcessCredit.mockResolvedValueOnce({ success: false, error: 'Credit failed' });

      await registerLedgerEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_789',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await handler(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Credit failed for transaction txn_789')
      );

      consoleSpy.mockRestore();
    });

    it('should throw and log error on unexpected failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Unexpected error');
      mockProcessCredit.mockRejectedValueOnce(error);

      await registerLedgerEventHandlers();

      const handler = mockSubscribe.mock.calls.find(
        (call) => call[0] === EventType.DEBIT_SUCCESS
      )?.[1];

      const event = {
        eventType: EventType.DEBIT_SUCCESS,
        transactionId: 'txn_abc',
        timestamp: new Date(),
        payload: { senderId: 'user_1', amount: 100 },
      };

      await expect(handler(event)).rejects.toThrow('Unexpected error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Unexpected error handling DEBIT_SUCCESS'),
        error
      );

      consoleSpy.mockRestore();
    });
  });
});
