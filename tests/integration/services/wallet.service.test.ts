/**
 * Wallet Service Integration Tests
 *
 * Tests wallet operations, balance management, and idempotency with real MongoDB.
 */
import mongoose from 'mongoose';

import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';
import { WalletOperation } from '../../../src/models/WalletOperation';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Import the real service
import { WalletService } from '../../../src/services/wallet/wallet.service';

describe('Wallet Service Integration Tests', () => {
  let walletService: WalletService;
  let testUserId: string;
  let testWalletId: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
    walletService = new WalletService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WalletOperation.deleteMany({});

    // Create test user with wallet
    const timestamp = Date.now();
    testUserId = `user_test_${timestamp}`;
    testWalletId = `wallet_test_${timestamp}`;

    await User.create({
      userId: testUserId,
      name: 'Test User',
      email: `test_${timestamp}@example.com`,
      password: 'hashedpassword',
    });

    await Wallet.create({
      walletId: testWalletId,
      userId: testUserId,
      balance: 1000,
      currency: 'INR',
    });
  });

  describe('Wallet Retrieval', () => {
    it('should get wallet by userId', async () => {
      const wallet = await walletService.getWallet(testUserId);

      expect(wallet.userId).toBe(testUserId);
      expect(wallet.balance).toBe(1000);
      expect(wallet.currency).toBe('INR');
    });

    it('should get wallet by walletId', async () => {
      const wallet = await walletService.getWalletById(testWalletId);

      expect(wallet.walletId).toBe(testWalletId);
      expect(wallet.userId).toBe(testUserId);
    });

    it('should throw error for non-existent user wallet', async () => {
      await expect(walletService.getWallet('non_existent_user')).rejects.toThrow(
        'Wallet not found'
      );
    });

    it('should throw error for non-existent walletId', async () => {
      await expect(walletService.getWalletById('non_existent_wallet')).rejects.toThrow(
        'Wallet not found'
      );
    });

    it('should get wallet balance', async () => {
      const balance = await walletService.getBalance(testUserId);
      expect(balance).toBe(1000);
    });
  });

  describe('Deposit Operations', () => {
    it('should deposit funds successfully', async () => {
      const result = await walletService.deposit(testUserId, 500);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1500);
      expect(result.type).toBe('DEPOSIT');
    });

    it('should create wallet operation record for deposit', async () => {
      const result = await walletService.deposit(testUserId, 250);

      const operation = await WalletOperation.findOne({ operationId: result.operationId });
      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('DEPOSIT');
      expect(operation!.amount).toBe(250);
      expect(operation!.resultBalance).toBe(1250);
    });

    it('should reject negative deposit amount', async () => {
      await expect(walletService.deposit(testUserId, -100)).rejects.toThrow(
        'Deposit amount must be positive'
      );
    });

    it('should reject zero deposit amount', async () => {
      await expect(walletService.deposit(testUserId, 0)).rejects.toThrow(
        'Deposit amount must be positive'
      );
    });

    it('should handle idempotent deposits', async () => {
      const idempotencyKey = 'deposit_key_123';

      const first = await walletService.deposit(testUserId, 100, idempotencyKey);
      expect(first.newBalance).toBe(1100);
      expect(first.idempotent).toBe(false);

      // Second call with same key should return same result
      const second = await walletService.deposit(testUserId, 100, idempotencyKey);
      expect(second.newBalance).toBe(1100);
      expect(second.idempotent).toBe(true);

      // Balance should only be increased once
      const balance = await walletService.getBalance(testUserId);
      expect(balance).toBe(1100);
    });

    it('should allow same amount with different idempotency keys', async () => {
      await walletService.deposit(testUserId, 100, 'key_1');
      await walletService.deposit(testUserId, 100, 'key_2');

      const balance = await walletService.getBalance(testUserId);
      expect(balance).toBe(1200);
    });
  });

  describe('Debit Operations', () => {
    it('should debit funds successfully', async () => {
      const result = await walletService.debit(testUserId, 300, 'txn_test_001');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(700);
      expect(result.type).toBe('DEBIT');
    });

    it('should reject debit when insufficient balance', async () => {
      await expect(
        walletService.debit(testUserId, 1500, 'txn_insufficient')
      ).rejects.toThrow('Insufficient balance');
    });

    it('should debit exact balance amount', async () => {
      const result = await walletService.debit(testUserId, 1000, 'txn_exact');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(0);
    });

    it('should be idempotent for same transaction', async () => {
      const txnId = 'txn_idempotent_debit';

      const first = await walletService.debit(testUserId, 200, txnId);
      expect(first.newBalance).toBe(800);
      expect(first.idempotent).toBe(false);

      const second = await walletService.debit(testUserId, 200, txnId);
      expect(second.newBalance).toBe(800);
      expect(second.idempotent).toBe(true);

      // Balance should only be debited once
      const balance = await walletService.getBalance(testUserId);
      expect(balance).toBe(800);
    });

    it('should create operation record for debit', async () => {
      const result = await walletService.debit(testUserId, 150, 'txn_op_record');

      const operation = await WalletOperation.findOne({ operationId: result.operationId });
      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('DEBIT');
      expect(operation!.transactionId).toBe('txn_op_record');
    });

    it('should fail debit for non-existent wallet', async () => {
      await expect(
        walletService.debit('non_existent_user', 100, 'txn_no_wallet')
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('Credit Operations', () => {
    it('should credit funds successfully', async () => {
      const result = await walletService.credit(testUserId, 500, 'txn_credit_001');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1500);
      expect(result.type).toBe('CREDIT');
    });

    it('should be idempotent for same transaction', async () => {
      const txnId = 'txn_idempotent_credit';

      const first = await walletService.credit(testUserId, 300, txnId);
      expect(first.newBalance).toBe(1300);
      expect(first.idempotent).toBe(false);

      const second = await walletService.credit(testUserId, 300, txnId);
      expect(second.newBalance).toBe(1300);
      expect(second.idempotent).toBe(true);
    });

    it('should create operation record for credit', async () => {
      const result = await walletService.credit(testUserId, 250, 'txn_credit_record');

      const operation = await WalletOperation.findOne({ operationId: result.operationId });
      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('CREDIT');
    });

    it('should fail credit for non-existent wallet', async () => {
      await expect(
        walletService.credit('non_existent_user', 100, 'txn_no_credit_wallet')
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('Refund Operations', () => {
    it('should refund funds successfully', async () => {
      // First debit
      await walletService.debit(testUserId, 500, 'txn_refund_001');
      expect(await walletService.getBalance(testUserId)).toBe(500);

      // Then refund
      const result = await walletService.refund(testUserId, 500, 'txn_refund_001');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1000);
      expect(result.type).toBe('REFUND');
    });

    it('should be idempotent for same transaction refund', async () => {
      await walletService.debit(testUserId, 300, 'txn_refund_idem');

      const first = await walletService.refund(testUserId, 300, 'txn_refund_idem');
      expect(first.idempotent).toBe(false);

      const second = await walletService.refund(testUserId, 300, 'txn_refund_idem');
      expect(second.idempotent).toBe(true);

      // Balance should only be refunded once
      const balance = await walletService.getBalance(testUserId);
      expect(balance).toBe(1000);
    });

    it('should create operation record for refund', async () => {
      await walletService.debit(testUserId, 200, 'txn_refund_record');
      const result = await walletService.refund(testUserId, 200, 'txn_refund_record');

      const operation = await WalletOperation.findOne({ operationId: result.operationId });
      expect(operation).not.toBeNull();
      expect(operation!.type).toBe('REFUND');
    });
  });

  describe('Operation History', () => {
    beforeEach(async () => {
      // Create multiple operations
      await walletService.deposit(testUserId, 100, 'dep_1');
      await walletService.debit(testUserId, 50, 'txn_1');
      await walletService.credit(testUserId, 75, 'txn_2');
      await walletService.deposit(testUserId, 200, 'dep_2');
    });

    it('should get operation history', async () => {
      const history = await walletService.getOperationHistory(testUserId);

      expect(history.length).toBe(4);
    });

    it('should limit operation history', async () => {
      const history = await walletService.getOperationHistory(testUserId, 2);

      expect(history.length).toBe(2);
    });

    it('should order history by most recent first', async () => {
      const history = await walletService.getOperationHistory(testUserId);

      for (let i = 1; i < history.length; i++) {
        const prev = new Date(history[i - 1].createdAt).getTime();
        const curr = new Date(history[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should include all operation types in history', async () => {
      const history = await walletService.getOperationHistory(testUserId);

      const types = history.map((op) => op.type);
      expect(types).toContain('DEPOSIT');
      expect(types).toContain('DEBIT');
      expect(types).toContain('CREDIT');
    });
  });

  describe('Atomic Operations', () => {
    it('should handle concurrent debit attempts atomically', async () => {
      // Initial balance: 1000
      // Attempt 5 debits of 300 each (only 3 should succeed)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          walletService.debit(testUserId, 300, `txn_concurrent_${i}`).catch(() => null)
        );
      }

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r !== null);

      expect(successful.length).toBe(3);

      const finalBalance = await walletService.getBalance(testUserId);
      expect(finalBalance).toBe(100); // 1000 - (3 * 300)
    });

    it('should handle concurrent deposit attempts', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(walletService.deposit(testUserId, 100, `dep_concurrent_${i}`));
      }

      await Promise.all(promises);

      const finalBalance = await walletService.getBalance(testUserId);
      expect(finalBalance).toBe(1500); // 1000 + (5 * 100)
    });

    it('should handle mixed operations atomically', async () => {
      const operations = [
        walletService.deposit(testUserId, 200, 'mixed_dep_1'),
        walletService.debit(testUserId, 100, 'mixed_debit_1'),
        walletService.deposit(testUserId, 150, 'mixed_dep_2'),
        walletService.debit(testUserId, 50, 'mixed_debit_2'),
      ];

      await Promise.all(operations);

      const finalBalance = await walletService.getBalance(testUserId);
      // 1000 + 200 - 100 + 150 - 50 = 1200
      expect(finalBalance).toBe(1200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small amounts', async () => {
      const result = await walletService.deposit(testUserId, 0.01, 'small_amount');
      expect(result.success).toBe(true);
    });

    it('should handle very large amounts', async () => {
      const largeAmount = 1000000000;
      const result = await walletService.deposit(testUserId, largeAmount, 'large_amount');
      expect(result.newBalance).toBe(1000 + largeAmount);
    });

    it('should handle multiple users independently', async () => {
      // Create second user
      const user2Id = `user_test_2_${Date.now()}`;
      await User.create({
        userId: user2Id,
        name: 'Test User 2',
        email: `test2_${Date.now()}@example.com`,
        password: 'hashedpassword',
      });
      await Wallet.create({
        walletId: `wallet_test_2_${Date.now()}`,
        userId: user2Id,
        balance: 500,
        currency: 'INR',
      });

      // Operate on both wallets
      await walletService.deposit(testUserId, 100);
      await walletService.deposit(user2Id, 200);

      const balance1 = await walletService.getBalance(testUserId);
      const balance2 = await walletService.getBalance(user2Id);

      expect(balance1).toBe(1100);
      expect(balance2).toBe(700);
    });
  });
});
