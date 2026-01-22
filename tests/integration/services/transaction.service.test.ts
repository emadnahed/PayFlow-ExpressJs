/**
 * Transaction Service Integration Tests
 *
 * Tests transaction creation, state management, and saga orchestration with real MongoDB.
 */
import mongoose from 'mongoose';

import { Transaction, ITransaction } from '../../../src/models/Transaction';
import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';
import { TransactionStatus } from '../../../src/types/events';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Import the real service
import { TransactionService, CreateTransactionDTO } from '../../../src/services/transaction/transaction.service';

describe('Transaction Service Integration Tests', () => {
  let transactionService: TransactionService;
  let senderUserId: string;
  let receiverUserId: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
    transactionService = new TransactionService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Transaction.deleteMany({});
    await User.deleteMany({});
    await Wallet.deleteMany({});

    // Create test users with wallets
    const sender = await User.create({
      userId: `user_sender_${Date.now()}`,
      name: 'Sender User',
      email: `sender_${Date.now()}@test.com`,
      password: 'hashedpassword',
    });
    senderUserId = sender.userId;

    await Wallet.create({
      walletId: `wallet_sender_${Date.now()}`,
      userId: senderUserId,
      balance: 1000,
      currency: 'INR',
    });

    const receiver = await User.create({
      userId: `user_receiver_${Date.now()}`,
      name: 'Receiver User',
      email: `receiver_${Date.now()}@test.com`,
      password: 'hashedpassword',
    });
    receiverUserId = receiver.userId;

    await Wallet.create({
      walletId: `wallet_receiver_${Date.now()}`,
      userId: receiverUserId,
      balance: 500,
      currency: 'INR',
    });
  });

  describe('Transaction Creation', () => {
    it('should initiate a transaction successfully', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: receiverUserId,
        amount: 100,
        currency: 'INR',
        description: 'Test payment',
      };

      const transaction = await transactionService.initiateTransaction(senderUserId, dto);

      expect(transaction.transactionId).toMatch(/^txn_/);
      expect(transaction.senderId).toBe(senderUserId);
      expect(transaction.receiverId).toBe(receiverUserId);
      expect(transaction.amount).toBe(100);
      expect(transaction.currency).toBe('INR');
      expect(transaction.status).toBe(TransactionStatus.INITIATED);
      expect(transaction.initiatedAt).toBeDefined();
    });

    it('should generate unique transaction IDs', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: receiverUserId,
        amount: 50,
      };

      const tx1 = await transactionService.initiateTransaction(senderUserId, dto);
      const tx2 = await transactionService.initiateTransaction(senderUserId, dto);

      expect(tx1.transactionId).not.toBe(tx2.transactionId);
    });

    it('should reject self-transfer', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: senderUserId,
        amount: 100,
      };

      await expect(
        transactionService.initiateTransaction(senderUserId, dto)
      ).rejects.toThrow('Cannot transfer to yourself');
    });

    it('should reject negative amount', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: receiverUserId,
        amount: -100,
      };

      await expect(
        transactionService.initiateTransaction(senderUserId, dto)
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject zero amount', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: receiverUserId,
        amount: 0,
      };

      await expect(
        transactionService.initiateTransaction(senderUserId, dto)
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject non-existent receiver', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: 'non_existent_user',
        amount: 100,
      };

      await expect(
        transactionService.initiateTransaction(senderUserId, dto)
      ).rejects.toThrow('Receiver wallet not found');
    });

    it('should use default currency if not specified', async () => {
      const dto: CreateTransactionDTO = {
        receiverId: receiverUserId,
        amount: 100,
      };

      const transaction = await transactionService.initiateTransaction(senderUserId, dto);
      expect(transaction.currency).toBe('INR');
    });
  });

  describe('Transaction Retrieval', () => {
    let testTransaction: ITransaction;

    beforeEach(async () => {
      testTransaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 200,
        description: 'Test transaction',
      });
    });

    it('should get transaction by ID', async () => {
      const transaction = await transactionService.getTransaction(testTransaction.transactionId);

      expect(transaction.transactionId).toBe(testTransaction.transactionId);
      expect(transaction.amount).toBe(200);
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        transactionService.getTransaction('txn_nonexistent')
      ).rejects.toThrow('Transaction not found');
    });

    it('should get user transactions as sender', async () => {
      // Create multiple transactions
      await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 50,
      });
      await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 75,
      });

      const result = await transactionService.getUserTransactions(senderUserId);

      expect(result.transactions.length).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('should get user transactions as receiver', async () => {
      const result = await transactionService.getUserTransactions(receiverUserId);

      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
      result.transactions.forEach((tx) => {
        expect(tx.receiverId).toBe(receiverUserId);
      });
    });

    it('should filter transactions by status', async () => {
      const result = await transactionService.getUserTransactions(senderUserId, {
        status: TransactionStatus.INITIATED,
      });

      result.transactions.forEach((tx) => {
        expect(tx.status).toBe(TransactionStatus.INITIATED);
      });
    });

    it('should paginate transactions', async () => {
      // Create more transactions
      for (let i = 0; i < 10; i++) {
        await transactionService.initiateTransaction(senderUserId, {
          receiverId: receiverUserId,
          amount: 10,
        });
      }

      const page1 = await transactionService.getUserTransactions(senderUserId, {
        limit: 5,
        offset: 0,
      });

      const page2 = await transactionService.getUserTransactions(senderUserId, {
        limit: 5,
        offset: 5,
      });

      expect(page1.transactions.length).toBe(5);
      expect(page2.transactions.length).toBe(5);
      expect(page1.transactions[0].transactionId).not.toBe(page2.transactions[0].transactionId);
    });

    it('should sort transactions by creation date descending', async () => {
      await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 25,
      });

      const result = await transactionService.getUserTransactions(senderUserId);

      for (let i = 1; i < result.transactions.length; i++) {
        const prev = new Date(result.transactions[i - 1].createdAt).getTime();
        const curr = new Date(result.transactions[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe('Status Updates', () => {
    let testTransaction: ITransaction;

    beforeEach(async () => {
      testTransaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 150,
      });
    });

    it('should update status from INITIATED to DEBITED', async () => {
      const updated = await transactionService.updateStatus(
        testTransaction.transactionId,
        TransactionStatus.DEBITED
      );

      expect(updated.status).toBe(TransactionStatus.DEBITED);
    });

    it('should reject invalid state transitions', async () => {
      // Try to skip DEBITED and go directly to CREDITED
      await expect(
        transactionService.updateStatus(
          testTransaction.transactionId,
          TransactionStatus.COMPLETED // Invalid: should go through DEBITED first
        )
      ).rejects.toThrow();
    });

    it('should allow transition to FAILED from INITIATED', async () => {
      const updated = await transactionService.updateStatus(
        testTransaction.transactionId,
        TransactionStatus.FAILED,
        { failureReason: 'Insufficient balance' }
      );

      expect(updated.status).toBe(TransactionStatus.FAILED);
      expect(updated.failureReason).toBe('Insufficient balance');
    });

    it('should set completedAt when completing transaction', async () => {
      // Progress through states
      await transactionService.updateStatus(
        testTransaction.transactionId,
        TransactionStatus.DEBITED
      );

      const completed = await transactionService.updateStatus(
        testTransaction.transactionId,
        TransactionStatus.COMPLETED,
        { completedAt: new Date() }
      );

      expect(completed.status).toBe(TransactionStatus.COMPLETED);
      expect(completed.completedAt).toBeDefined();
    });
  });

  describe('Saga Event Handlers', () => {
    let testTransaction: ITransaction;

    beforeEach(async () => {
      testTransaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 100,
      });
    });

    it('should handle debit success', async () => {
      await transactionService.onDebitSuccess(testTransaction.transactionId);

      const updated = await transactionService.getTransaction(testTransaction.transactionId);
      expect(updated.status).toBe(TransactionStatus.DEBITED);
    });

    it('should handle debit failed', async () => {
      await transactionService.onDebitFailed(
        testTransaction.transactionId,
        'Insufficient balance'
      );

      const updated = await transactionService.getTransaction(testTransaction.transactionId);
      expect(updated.status).toBe(TransactionStatus.FAILED);
      expect(updated.failureReason).toBe('Insufficient balance');
    });

    it('should handle credit success', async () => {
      // First debit
      await transactionService.onDebitSuccess(testTransaction.transactionId);

      // Then credit
      await transactionService.onCreditSuccess(testTransaction.transactionId);

      const updated = await transactionService.getTransaction(testTransaction.transactionId);
      expect(updated.status).toBe(TransactionStatus.COMPLETED);
      expect(updated.completedAt).toBeDefined();
    });

    it('should handle credit failed and initiate refund', async () => {
      // First debit
      await transactionService.onDebitSuccess(testTransaction.transactionId);

      // Credit fails
      await transactionService.onCreditFailed(
        testTransaction.transactionId,
        'Receiver wallet not found'
      );

      const updated = await transactionService.getTransaction(testTransaction.transactionId);
      expect(updated.status).toBe(TransactionStatus.REFUNDING);
    });

    it('should handle refund completed', async () => {
      // Progress to REFUNDING state
      await transactionService.onDebitSuccess(testTransaction.transactionId);
      await transactionService.onCreditFailed(testTransaction.transactionId, 'Failed');

      // Complete refund
      await transactionService.onRefundCompleted(testTransaction.transactionId);

      const updated = await transactionService.getTransaction(testTransaction.transactionId);
      expect(updated.status).toBe(TransactionStatus.FAILED);
      expect(updated.failureReason).toContain('refunded');
    });
  });

  describe('Transaction Modification Check', () => {
    it('should allow modification for non-terminal states', async () => {
      const transaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 100,
      });

      const canModify = await transactionService.canModify(transaction.transactionId);
      expect(canModify).toBe(true);
    });

    it('should not allow modification for COMPLETED transactions', async () => {
      const transaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 100,
      });

      // Complete the transaction
      await transactionService.onDebitSuccess(transaction.transactionId);
      await transactionService.onCreditSuccess(transaction.transactionId);

      const canModify = await transactionService.canModify(transaction.transactionId);
      expect(canModify).toBe(false);
    });

    it('should not allow modification for FAILED transactions', async () => {
      const transaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 100,
      });

      await transactionService.onDebitFailed(transaction.transactionId, 'Insufficient balance');

      const canModify = await transactionService.canModify(transaction.transactionId);
      expect(canModify).toBe(false);
    });
  });

  describe('Concurrent Transactions', () => {
    it('should handle multiple concurrent transactions from same sender', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          transactionService.initiateTransaction(senderUserId, {
            receiverId: receiverUserId,
            amount: 10,
          })
        );
      }

      const transactions = await Promise.all(promises);

      expect(transactions.length).toBe(5);
      const ids = new Set(transactions.map((t) => t.transactionId));
      expect(ids.size).toBe(5); // All unique IDs
    });

    it('should handle rapid status updates', async () => {
      const transaction = await transactionService.initiateTransaction(senderUserId, {
        receiverId: receiverUserId,
        amount: 100,
      });

      // Rapid sequential updates (simulating saga flow)
      await transactionService.onDebitSuccess(transaction.transactionId);
      await transactionService.onCreditSuccess(transaction.transactionId);

      const final = await transactionService.getTransaction(transaction.transactionId);
      expect(final.status).toBe(TransactionStatus.COMPLETED);
    });
  });
});
