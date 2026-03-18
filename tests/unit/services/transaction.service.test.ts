/**
 * Unit Tests: TransactionService
 *
 * All MongoDB, eventBus, and walletService calls are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTransactionFindOne = jest.fn();
const mockTransactionCreate = jest.fn();
const mockTransactionFindOneAndUpdate = jest.fn();
const mockTransactionFind = jest.fn();
const mockTransactionCountDocuments = jest.fn();

jest.mock('../../../src/models/Transaction', () => ({
  Transaction: {
    findOne: (...a: unknown[]) => mockTransactionFindOne(...a),
    create: (...a: unknown[]) => mockTransactionCreate(...a),
    findOneAndUpdate: (...a: unknown[]) => mockTransactionFindOneAndUpdate(...a),
    find: (...a: unknown[]) => mockTransactionFind(...a),
    countDocuments: (...a: unknown[]) => mockTransactionCountDocuments(...a),
  },
}));

const mockPublish = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/events/eventBus', () => ({
  eventBus: { publish: (...a: unknown[]) => mockPublish(...a) },
}));

const mockGetWallet = jest.fn();
jest.mock('../../../src/services/wallet/wallet.service', () => ({
  walletService: { getWallet: (...a: unknown[]) => mockGetWallet(...a) },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { TransactionService } from '../../../src/services/transaction/transaction.service';
import { TransactionStatus, EventType } from '../../../src/types/events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTxn(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: 'txn_test123',
    senderId: 'user_sender',
    receiverId: 'user_receiver',
    amount: 100,
    currency: 'INR',
    status: TransactionStatus.INITIATED,
    initiatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionService (unit)', () => {
  let service: TransactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TransactionService();
  });

  // ── initiateTransaction ──────────────────────────────────────────────────

  describe('initiateTransaction', () => {
    it('should create a transaction and publish TRANSACTION_INITIATED', async () => {
      mockGetWallet.mockResolvedValue({ walletId: 'w1' });
      const txn = makeTxn();
      mockTransactionCreate.mockResolvedValue(txn);

      const result = await service.initiateTransaction('user_sender', {
        receiverId: 'user_receiver',
        amount: 100,
      });

      expect(mockTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: 'user_sender', receiverId: 'user_receiver', amount: 100 })
      );
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.TRANSACTION_INITIATED })
      );
      expect(result).toBe(txn);
    });

    it('should throw 400 when sender equals receiver', async () => {
      await expect(
        service.initiateTransaction('same_user', { receiverId: 'same_user', amount: 100 })
      ).rejects.toThrow('Cannot transfer to yourself');
    });

    it('should throw 400 when amount is zero', async () => {
      await expect(
        service.initiateTransaction('u1', { receiverId: 'u2', amount: 0 })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should throw 400 when amount is negative', async () => {
      await expect(
        service.initiateTransaction('u1', { receiverId: 'u2', amount: -50 })
      ).rejects.toThrow('Amount must be positive');
    });

    it('should throw 404 when receiver has no wallet', async () => {
      mockGetWallet
        .mockResolvedValueOnce({ walletId: 'w1' }) // sender exists
        .mockRejectedValueOnce(new Error('Wallet not found')); // receiver missing

      await expect(
        service.initiateTransaction('u1', { receiverId: 'u2', amount: 50 })
      ).rejects.toThrow('Receiver wallet not found');
    });

    it('should default currency to INR', async () => {
      mockGetWallet.mockResolvedValue({ walletId: 'w1' });
      const txn = makeTxn({ currency: 'INR' });
      mockTransactionCreate.mockResolvedValue(txn);

      await service.initiateTransaction('u1', { receiverId: 'u2', amount: 50 });

      expect(mockTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'INR' })
      );
    });
  });

  // ── getTransaction ───────────────────────────────────────────────────────

  describe('getTransaction', () => {
    it('should return transaction when found', async () => {
      const txn = makeTxn();
      mockTransactionFindOne.mockResolvedValue(txn);

      const result = await service.getTransaction('txn_test123');

      expect(result).toBe(txn);
    });

    it('should throw 404 when not found', async () => {
      mockTransactionFindOne.mockResolvedValue(null);

      await expect(service.getTransaction('txn_missing')).rejects.toThrow('Transaction not found');
    });
  });

  // ── getUserTransactions ──────────────────────────────────────────────────

  describe('getUserTransactions', () => {
    it('should return transactions and total for a user', async () => {
      const txns = [makeTxn(), makeTxn({ transactionId: 'txn_2' })];
      const findQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(txns),
      };
      mockTransactionFind.mockReturnValue(findQuery);
      mockTransactionCountDocuments.mockResolvedValue(2);

      const result = await service.getUserTransactions('user_sender');

      expect(result.transactions).toBe(txns);
      expect(result.total).toBe(2);
    });

    it('should apply status filter when provided', async () => {
      const findQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      mockTransactionFind.mockReturnValue(findQuery);
      mockTransactionCountDocuments.mockResolvedValue(0);

      await service.getUserTransactions('u1', { status: TransactionStatus.COMPLETED });

      expect(mockTransactionFind).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.COMPLETED })
      );
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update to valid next status', async () => {
      const txn = makeTxn({ status: TransactionStatus.INITIATED });
      mockTransactionFindOne.mockResolvedValue(txn);
      const updated = makeTxn({ status: TransactionStatus.DEBITED });
      mockTransactionFindOneAndUpdate.mockResolvedValue(updated);

      const result = await service.updateStatus('txn_test123', TransactionStatus.DEBITED);

      expect(result.status).toBe(TransactionStatus.DEBITED);
    });

    it('should throw on invalid state transition', async () => {
      const txn = makeTxn({ status: TransactionStatus.COMPLETED });
      mockTransactionFindOne.mockResolvedValue(txn);

      await expect(
        service.updateStatus('txn_test123', TransactionStatus.FAILED)
      ).rejects.toThrow();
    });
  });

  // ── Saga handlers ────────────────────────────────────────────────────────

  describe('onDebitSuccess', () => {
    it('should transition to DEBITED', async () => {
      const txn = makeTxn({ status: TransactionStatus.INITIATED });
      mockTransactionFindOne.mockResolvedValue(txn);
      mockTransactionFindOneAndUpdate.mockResolvedValue(makeTxn({ status: TransactionStatus.DEBITED }));

      await service.onDebitSuccess('txn_test123');

      expect(mockTransactionFindOneAndUpdate).toHaveBeenCalledWith(
        { transactionId: 'txn_test123' },
        expect.objectContaining({ status: TransactionStatus.DEBITED }),
        expect.any(Object)
      );
    });
  });

  describe('onDebitFailed', () => {
    it('should transition to FAILED and publish TRANSACTION_FAILED', async () => {
      const txn = makeTxn({ status: TransactionStatus.INITIATED });
      mockTransactionFindOne.mockResolvedValue(txn);
      mockTransactionFindOneAndUpdate.mockResolvedValue(makeTxn({ status: TransactionStatus.FAILED }));

      await service.onDebitFailed('txn_test123', 'Insufficient balance');

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.TRANSACTION_FAILED })
      );
    });
  });

  describe('onCreditSuccess', () => {
    it('should transition to COMPLETED and publish TRANSACTION_COMPLETED', async () => {
      const txn = makeTxn({ status: TransactionStatus.DEBITED });
      mockTransactionFindOne.mockResolvedValue(txn);
      mockTransactionFindOneAndUpdate.mockResolvedValue(makeTxn({ status: TransactionStatus.COMPLETED }));

      await service.onCreditSuccess('txn_test123');

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.TRANSACTION_COMPLETED })
      );
    });
  });

  describe('onCreditFailed', () => {
    it('should transition to REFUNDING and publish REFUND_REQUESTED', async () => {
      const txn = makeTxn({ status: TransactionStatus.DEBITED });
      mockTransactionFindOne.mockResolvedValue(txn);
      mockTransactionFindOneAndUpdate.mockResolvedValue(makeTxn({ status: TransactionStatus.REFUNDING }));

      await service.onCreditFailed('txn_test123', 'Receiver error');

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REFUND_REQUESTED })
      );
    });
  });

  describe('onRefundCompleted', () => {
    it('should transition to FAILED and publish TRANSACTION_FAILED', async () => {
      const txn = makeTxn({ status: TransactionStatus.REFUNDING });
      mockTransactionFindOne.mockResolvedValue(txn);
      mockTransactionFindOneAndUpdate.mockResolvedValue(makeTxn({ status: TransactionStatus.FAILED }));

      await service.onRefundCompleted('txn_test123');

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.TRANSACTION_FAILED })
      );
    });
  });

  // ── canModify ─────────────────────────────────────────────────────────────

  describe('canModify', () => {
    it('should return true for non-terminal status', async () => {
      mockTransactionFindOne.mockResolvedValue(makeTxn({ status: TransactionStatus.INITIATED }));
      expect(await service.canModify('txn_test123')).toBe(true);
    });

    it('should return false for COMPLETED', async () => {
      mockTransactionFindOne.mockResolvedValue(makeTxn({ status: TransactionStatus.COMPLETED }));
      expect(await service.canModify('txn_test123')).toBe(false);
    });

    it('should return false for FAILED', async () => {
      mockTransactionFindOne.mockResolvedValue(makeTxn({ status: TransactionStatus.FAILED }));
      expect(await service.canModify('txn_test123')).toBe(false);
    });
  });
});
