/**
 * Unit Tests: LedgerService
 *
 * Tests processCredit and processCreditWithDetails with mocked
 * walletService, eventBus, Transaction, and ledgerSimulation.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTransactionFindOne = jest.fn();

jest.mock('../../../src/models/Transaction', () => ({
  Transaction: {
    findOne: (...a: unknown[]) => mockTransactionFindOne(...a),
  },
}));

const mockCredit = jest.fn();
jest.mock('../../../src/services/wallet/wallet.service', () => ({
  walletService: { credit: (...a: unknown[]) => mockCredit(...a) },
}));

const mockPublish = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/events/eventBus', () => ({
  eventBus: { publish: (...a: unknown[]) => mockPublish(...a) },
}));

const mockSimulateFailure = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services/ledger/ledger.simulation', () => ({
  ledgerSimulation: {
    simulateFailure: (...a: unknown[]) => mockSimulateFailure(...a),
  },
  SimulatedFailureError: class SimulatedFailureError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SimulatedFailureError';
    }
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { LedgerService } from '../../../src/services/ledger/ledger.service';
import { EventType } from '../../../src/types/events';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LedgerService (unit)', () => {
  let service: LedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset implementations that may have been overridden per-test
    mockSimulateFailure.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);
    service = new LedgerService();
  });

  // ── processCredit ─────────────────────────────────────────────────────────

  describe('processCredit', () => {
    it('should return success=true when credit succeeds', async () => {
      mockTransactionFindOne.mockResolvedValue({
        transactionId: 'txn_1',
        receiverId: 'user_r',
        amount: 100,
      });
      mockCredit.mockResolvedValue({ newBalance: 600, type: 'CREDIT', idempotent: false });

      const result = await service.processCredit('txn_1');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('txn_1');
      expect(result.receiverId).toBe('user_r');
      expect(result.amount).toBe(100);
      expect(result.newBalance).toBe(600);
    });

    it('should return success=false when transaction not found', async () => {
      mockTransactionFindOne.mockResolvedValue(null);

      const result = await service.processCredit('txn_missing');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction not found');
      expect(mockCredit).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('should return success=false and publish CREDIT_FAILED when walletService.credit throws', async () => {
      mockTransactionFindOne.mockResolvedValue({
        transactionId: 'txn_1',
        receiverId: 'user_r',
        amount: 100,
      });
      mockCredit.mockRejectedValue(new Error('Wallet not found'));

      const result = await service.processCredit('txn_1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_FAILED })
      );
    });

    it('should return success=false and publish CREDIT_FAILED when simulation throws', async () => {
      mockTransactionFindOne.mockResolvedValue({
        transactionId: 'txn_1',
        receiverId: 'user_r',
        amount: 100,
      });
      mockSimulateFailure.mockRejectedValue(
        new Error('Simulated credit failure for transaction txn_1')
      );

      const result = await service.processCredit('txn_1');

      expect(result.success).toBe(false);
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_FAILED })
      );
    });
  });

  // ── processCreditWithDetails ──────────────────────────────────────────────

  describe('processCreditWithDetails', () => {
    it('should return success=true when credit succeeds', async () => {
      mockCredit.mockResolvedValue({ newBalance: 700, type: 'CREDIT', idempotent: false });

      const result = await service.processCreditWithDetails({
        transactionId: 'txn_1',
        receiverId: 'user_r',
        amount: 200,
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(700);
      expect(mockCredit).toHaveBeenCalledWith('user_r', 200, 'txn_1');
    });

    it('should return success=false and publish CREDIT_FAILED when credit throws', async () => {
      mockCredit.mockRejectedValue(new Error('Wallet not active'));

      const result = await service.processCreditWithDetails({
        transactionId: 'txn_2',
        receiverId: 'user_r',
        amount: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet not active');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_FAILED, transactionId: 'txn_2' })
      );
    });
  });
});
