/**
 * Unit Tests: WalletService
 *
 * Tests all wallet operations (getWallet, debit, credit, refund, deposit)
 * with Wallet, WalletOperation, and eventBus mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockWalletFindOne = jest.fn();
const mockWalletFindOneAndUpdate = jest.fn();
const mockOpFindOne = jest.fn();
const mockOpCreate = jest.fn();
const mockOpFind = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/models/Wallet', () => ({
  Wallet: {
    findOne: (...a: unknown[]) => mockWalletFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockWalletFindOneAndUpdate(...a),
  },
}));

jest.mock('../../../src/models/WalletOperation', () => ({
  WalletOperation: {
    findOne: (...a: unknown[]) => mockOpFindOne(...a),
    create: (...a: unknown[]) => mockOpCreate(...a),
    find: (...a: unknown[]) => mockOpFind(...a),
  },
}));

jest.mock('../../../src/events/eventBus', () => ({
  eventBus: { publish: (...a: unknown[]) => mockPublish(...a) },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { WalletService } from '../../../src/services/wallet/wallet.service';
import { EventType } from '../../../src/types/events';

// ── Helpers ───────────────────────────────────────────────────────────────────

const wallet = { walletId: 'w1', userId: 'u1', balance: 500, currency: 'INR' };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletService (unit)', () => {
  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletService();
  });

  // ── getWallet ─────────────────────────────────────────────────────────────

  describe('getWallet', () => {
    it('should return wallet when found', async () => {
      mockWalletFindOne.mockResolvedValue(wallet);
      const result = await service.getWallet('u1');
      expect(result).toBe(wallet);
    });

    it('should throw 404 when wallet not found', async () => {
      mockWalletFindOne.mockResolvedValue(null);
      await expect(service.getWallet('missing')).rejects.toThrow('Wallet not found');
    });
  });

  // ── getWalletById ─────────────────────────────────────────────────────────

  describe('getWalletById', () => {
    it('should return wallet when found by walletId', async () => {
      mockWalletFindOne.mockResolvedValue(wallet);
      const result = await service.getWalletById('w1');
      expect(result).toBe(wallet);
    });

    it('should throw 404 when wallet not found by walletId', async () => {
      mockWalletFindOne.mockResolvedValue(null);
      await expect(service.getWalletById('missing')).rejects.toThrow('Wallet not found');
    });
  });

  // ── getBalance ────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('should return the balance from the wallet', async () => {
      mockWalletFindOne.mockResolvedValue(wallet);
      const balance = await service.getBalance('u1');
      expect(balance).toBe(500);
    });
  });

  // ── debit ─────────────────────────────────────────────────────────────────

  describe('debit', () => {
    it('should return idempotent result when operation already exists', async () => {
      mockOpFindOne.mockResolvedValue({
        operationId: 'txn_1:DEBIT',
        resultBalance: 400,
      });

      const result = await service.debit('u1', 100, 'txn_1');

      expect(result.idempotent).toBe(true);
      expect(result.newBalance).toBe(400);
      expect(mockWalletFindOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should debit and publish DEBIT_SUCCESS on success', async () => {
      mockOpFindOne.mockResolvedValue(null); // no existing op
      mockWalletFindOne.mockResolvedValue(wallet); // wallet exists
      const updatedWallet = { ...wallet, balance: 400 };
      mockWalletFindOneAndUpdate.mockResolvedValue(updatedWallet);
      mockOpCreate.mockResolvedValue({});

      const result = await service.debit('u1', 100, 'txn_1');

      expect(result.type).toBe('DEBIT');
      expect(result.newBalance).toBe(400);
      expect(result.idempotent).toBe(false);
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.DEBIT_SUCCESS })
      );
    });

    it('should throw 404 and publish DEBIT_FAILED when wallet not found', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(null);

      await expect(service.debit('u1', 100, 'txn_1')).rejects.toThrow('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.DEBIT_FAILED })
      );
    });

    it('should throw 400 and publish DEBIT_FAILED when insufficient balance', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(wallet);
      mockWalletFindOneAndUpdate.mockResolvedValue(null); // balance check fails

      await expect(service.debit('u1', 1000, 'txn_1')).rejects.toThrow('Insufficient balance');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.DEBIT_FAILED })
      );
    });
  });

  // ── credit ─────────────────────────────────────────────────────────────────

  describe('credit', () => {
    it('should return idempotent result when operation already exists', async () => {
      mockOpFindOne.mockResolvedValue({ operationId: 'txn_1:CREDIT', resultBalance: 600 });

      const result = await service.credit('u1', 100, 'txn_1');

      expect(result.idempotent).toBe(true);
      expect(result.newBalance).toBe(600);
    });

    it('should credit and publish CREDIT_SUCCESS', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(wallet);
      const updatedWallet = { ...wallet, balance: 600 };
      mockWalletFindOneAndUpdate.mockResolvedValue(updatedWallet);
      mockOpCreate.mockResolvedValue({});

      const result = await service.credit('u1', 100, 'txn_1');

      expect(result.type).toBe('CREDIT');
      expect(result.newBalance).toBe(600);
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_SUCCESS })
      );
    });

    it('should throw 404 and publish CREDIT_FAILED when wallet not found', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(null);

      await expect(service.credit('u1', 100, 'txn_1')).rejects.toThrow('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_FAILED })
      );
    });

    it('should throw 404 and publish CREDIT_FAILED when wallet update returns null', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(wallet); // walletCheck passes
      mockWalletFindOneAndUpdate.mockResolvedValue(null); // update returns null

      await expect(service.credit('u1', 100, 'txn_1')).rejects.toThrow('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.CREDIT_FAILED })
      );
    });
  });

  // ── refund ─────────────────────────────────────────────────────────────────

  describe('refund', () => {
    it('should return idempotent result when refund already processed', async () => {
      mockOpFindOne.mockResolvedValue({ operationId: 'txn_1:REFUND', resultBalance: 500 });

      const result = await service.refund('u1', 100, 'txn_1');

      expect(result.idempotent).toBe(true);
      expect(result.type).toBe('REFUND');
    });

    it('should refund and publish REFUND_COMPLETED', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(wallet);
      const updatedWallet = { ...wallet, balance: 600 };
      mockWalletFindOneAndUpdate.mockResolvedValue(updatedWallet);
      mockOpCreate.mockResolvedValue({});

      const result = await service.refund('u1', 100, 'txn_1');

      expect(result.type).toBe('REFUND');
      expect(result.newBalance).toBe(600);
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REFUND_COMPLETED })
      );
    });

    it('should throw 404 and publish REFUND_FAILED when wallet not found', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(null);

      await expect(service.refund('u1', 100, 'txn_1')).rejects.toThrow('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REFUND_FAILED })
      );
    });

    it('should throw 404 and publish REFUND_FAILED when wallet update returns null', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOne.mockResolvedValue(wallet); // walletCheck passes
      mockWalletFindOneAndUpdate.mockResolvedValue(null); // update returns null

      await expect(service.refund('u1', 100, 'txn_1')).rejects.toThrow('Wallet not found');
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventType.REFUND_FAILED })
      );
    });
  });

  // ── deposit ─────────────────────────────────────────────────────────────────

  describe('deposit', () => {
    it('should throw 400 for non-positive amount', async () => {
      await expect(service.deposit('u1', 0)).rejects.toThrow('must be positive');
      await expect(service.deposit('u1', -10)).rejects.toThrow('must be positive');
    });

    it('should deposit and return new balance', async () => {
      mockOpFindOne.mockResolvedValue(null);
      const updatedWallet = { ...wallet, balance: 600 };
      mockWalletFindOneAndUpdate.mockResolvedValue(updatedWallet);
      mockOpCreate.mockResolvedValue({});

      const result = await service.deposit('u1', 100, 'key_123');

      expect(result.type).toBe('DEPOSIT');
      expect(result.newBalance).toBe(600);
      expect(result.idempotent).toBe(false);
    });

    it('should return idempotent=true when deposit already processed with same key', async () => {
      mockOpFindOne.mockResolvedValue({
        operationId: 'deposit:key_123',
        resultBalance: 600,
      });

      const result = await service.deposit('u1', 100, 'key_123');

      expect(result.idempotent).toBe(true);
      expect(result.newBalance).toBe(600);
    });

    it('should throw 404 when wallet not found during deposit', async () => {
      mockOpFindOne.mockResolvedValue(null);
      mockWalletFindOneAndUpdate.mockResolvedValue(null);

      await expect(service.deposit('u1', 100)).rejects.toThrow('Wallet not found');
    });
  });

  // ── getOperationHistory ───────────────────────────────────────────────────

  describe('getOperationHistory', () => {
    it('should return operation history for a wallet', async () => {
      mockWalletFindOne.mockResolvedValue(wallet);
      const ops = [{ operationId: 'op_1', type: 'DEBIT', amount: 100 }];
      const findQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(ops),
      };
      mockOpFind.mockReturnValue(findQuery);

      const result = await service.getOperationHistory('u1', 10);

      expect(result).toBe(ops);
    });
  });
});
