/**
 * Ledger Service Integration Tests
 *
 * Tests ledger credit processing with real MongoDB and wallet service integration.
 */
import mongoose from 'mongoose';

import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';
import { WalletOperation } from '../../../src/models/WalletOperation';
import { Transaction } from '../../../src/models/Transaction';
import { TransactionStatus } from '../../../src/types/events';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Import the real service
import { LedgerService, CreditRequest } from '../../../src/services/ledger/ledger.service';
import { ledgerSimulation } from '../../../src/services/ledger/ledger.simulation';

describe('Ledger Service Integration Tests', () => {
  let ledgerService: LedgerService;
  let senderUserId: string;
  let receiverUserId: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
    ledgerService = new LedgerService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WalletOperation.deleteMany({});
    await Transaction.deleteMany({});

    // Reset simulation
    ledgerSimulation.reset();

    // Create test users with wallets
    const timestamp = Date.now();

    const sender = await User.create({
      userId: `user_sender_${timestamp}`,
      name: 'Sender User',
      email: `sender_${timestamp}@test.com`,
      password: 'hashedpassword',
    });
    senderUserId = sender.userId;

    await Wallet.create({
      walletId: `wallet_sender_${timestamp}`,
      userId: senderUserId,
      balance: 1000,
      currency: 'INR',
    });

    const receiver = await User.create({
      userId: `user_receiver_${timestamp}`,
      name: 'Receiver User',
      email: `receiver_${timestamp}@test.com`,
      password: 'hashedpassword',
    });
    receiverUserId = receiver.userId;

    await Wallet.create({
      walletId: `wallet_receiver_${timestamp}`,
      userId: receiverUserId,
      balance: 500,
      currency: 'INR',
    });
  });

  describe('Process Credit from Transaction', () => {
    it('should process credit successfully for valid transaction', async () => {
      // Create a transaction
      const transactionId = `txn_credit_test_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 200,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      const result = await ledgerService.processCredit(transactionId);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(transactionId);
      expect(result.receiverId).toBe(receiverUserId);
      expect(result.amount).toBe(200);
      expect(result.newBalance).toBe(700); // 500 + 200
    });

    it('should fail for non-existent transaction', async () => {
      const result = await ledgerService.processCredit('txn_nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle credit to receiver wallet', async () => {
      const transactionId = `txn_credit_wallet_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 150,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      await ledgerService.processCredit(transactionId);

      const wallet = await Wallet.findOne({ userId: receiverUserId });
      expect(wallet!.balance).toBe(650); // 500 + 150
    });

    it('should create wallet operation for credit', async () => {
      const transactionId = `txn_credit_op_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 100,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      await ledgerService.processCredit(transactionId);

      const operation = await WalletOperation.findOne({
        transactionId,
        type: 'CREDIT',
      });

      expect(operation).not.toBeNull();
      expect(operation!.amount).toBe(100);
    });
  });

  describe('Process Credit with Details', () => {
    it('should process credit with direct details', async () => {
      const request: CreditRequest = {
        transactionId: `txn_direct_${Date.now()}`,
        receiverId: receiverUserId,
        amount: 300,
      };

      const result = await ledgerService.processCreditWithDetails(request);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(800); // 500 + 300
    });

    it('should fail for non-existent receiver', async () => {
      const request: CreditRequest = {
        transactionId: `txn_no_receiver_${Date.now()}`,
        receiverId: 'non_existent_user',
        amount: 100,
      };

      const result = await ledgerService.processCreditWithDetails(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Failure Simulation', () => {
    it('should fail when transaction is marked for failure', async () => {
      const transactionId = `txn_sim_fail_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 100,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      // Configure simulation to fail this specific transaction
      ledgerSimulation.enable();
      ledgerSimulation.addFailingTransactionIds([transactionId]);

      const result = await ledgerService.processCredit(transactionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated');
    });

    it('should succeed when simulation is disabled', async () => {
      const transactionId = `txn_sim_success_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 100,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      ledgerSimulation.disable();

      const result = await ledgerService.processCredit(transactionId);

      expect(result.success).toBe(true);
    });

    it('should handle failure rate simulation', async () => {
      // Enable simulation with 100% failure rate
      ledgerSimulation.enable({ failureRate: 1.0 });

      const transactionId = `txn_rate_fail_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 10,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      const result = await ledgerService.processCredit(transactionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated');
    });

    it('should get current simulation configuration', () => {
      ledgerSimulation.enable({ failureRate: 0.5 });
      ledgerSimulation.addFailingTransactionIds(['txn_1', 'txn_2']);

      const config = ledgerSimulation.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.failureRate).toBe(0.5);
      expect(config.failTransactionIds).toContain('txn_1');
      expect(config.failTransactionIds).toContain('txn_2');
    });

    it('should clear failing transaction IDs', () => {
      ledgerSimulation.enable();
      ledgerSimulation.addFailingTransactionIds(['txn_1', 'txn_2']);
      ledgerSimulation.clearFailingTransactionIds();

      const config = ledgerSimulation.getConfig();
      expect(config.failTransactionIds).toHaveLength(0);
    });
  });

  describe('Idempotency', () => {
    it('should be idempotent for same transaction', async () => {
      const transactionId = `txn_idem_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: receiverUserId,
        amount: 200,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      // First credit
      const first = await ledgerService.processCredit(transactionId);
      expect(first.success).toBe(true);
      expect(first.newBalance).toBe(700);

      // Second credit (should be idempotent via wallet service)
      const second = await ledgerService.processCredit(transactionId);
      expect(second.success).toBe(true);
      expect(second.newBalance).toBe(700); // Same balance, not doubled

      // Verify balance wasn't doubled
      const wallet = await Wallet.findOne({ userId: receiverUserId });
      expect(wallet!.balance).toBe(700);
    });
  });

  describe('Multiple Credits', () => {
    it('should process multiple credits for different transactions', async () => {
      const transactions = [];
      for (let i = 0; i < 5; i++) {
        const transactionId = `txn_multi_${Date.now()}_${i}`;
        await Transaction.create({
          transactionId,
          senderId: senderUserId,
          receiverId: receiverUserId,
          amount: 100,
          currency: 'INR',
          status: TransactionStatus.DEBITED,
          initiatedAt: new Date(),
        });
        transactions.push(transactionId);
      }

      for (const txnId of transactions) {
        const result = await ledgerService.processCredit(txnId);
        expect(result.success).toBe(true);
      }

      const wallet = await Wallet.findOne({ userId: receiverUserId });
      expect(wallet!.balance).toBe(1000); // 500 + (5 * 100)
    });

    it('should handle concurrent credit processing', async () => {
      const transactions = [];
      for (let i = 0; i < 5; i++) {
        const transactionId = `txn_concurrent_${Date.now()}_${i}`;
        await Transaction.create({
          transactionId,
          senderId: senderUserId,
          receiverId: receiverUserId,
          amount: 50,
          currency: 'INR',
          status: TransactionStatus.DEBITED,
          initiatedAt: new Date(),
        });
        transactions.push(transactionId);
      }

      const results = await Promise.all(
        transactions.map((txnId) => ledgerService.processCredit(txnId))
      );

      const successful = results.filter((r) => r.success);
      expect(successful.length).toBe(5);

      const wallet = await Wallet.findOne({ userId: receiverUserId });
      expect(wallet!.balance).toBe(750); // 500 + (5 * 50)
    });
  });

  describe('Error Handling', () => {
    it('should handle missing receiver wallet gracefully', async () => {
      // Create transaction with non-existent receiver wallet
      const transactionId = `txn_no_wallet_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: senderUserId,
        receiverId: 'user_no_wallet',
        amount: 100,
        currency: 'INR',
        status: TransactionStatus.DEBITED,
        initiatedAt: new Date(),
      });

      const result = await ledgerService.processCredit(transactionId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return proper error response structure', async () => {
      const result = await ledgerService.processCredit('txn_nonexistent');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('receiverId');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('error');
    });
  });
});
