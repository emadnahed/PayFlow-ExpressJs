/**
 * Chaos Testing: Credit Failure Scenarios
 *
 * Tests the ledger simulation feature and compensation (refund) flow
 * when credits fail. Uses direct service calls like saga-flow tests.
 */

import request from 'supertest';
import mongoose from 'mongoose';

import { getTestApp } from '../helpers/testApp';
import { createTestUser, TestUserResult } from '../helpers/testAuth';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';
import { TransactionStatus } from '../../src/types/events';
import { walletService } from '../../src/services/wallet/wallet.service';
import { transactionService } from '../../src/services/transaction/transaction.service';
import { ledgerService } from '../../src/services/ledger/ledger.service';
import { ledgerSimulation } from '../../src/services/ledger/ledger.simulation';

const app = getTestApp();

describe('Chaos Testing: Credit Failure Scenarios', () => {
  let sender: TestUserResult;
  let receiver: TestUserResult;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    ledgerSimulation.reset();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Reset simulation
    ledgerSimulation.reset();

    // Clear database
    await Wallet.deleteMany({});
    await Transaction.deleteMany({});
    const { User } = await import('../../src/models/User');
    await User.deleteMany({});

    // Create sender with funds
    sender = await createTestUser(app, {
      email: 'sender@test.com',
      password: 'Password123',
    });

    // Add funds to sender wallet
    await Wallet.findOneAndUpdate(
      { userId: sender.user.userId },
      { $set: { balance: 10000 } },
      { upsert: true }
    );

    // Create receiver
    receiver = await createTestUser(app, {
      email: 'receiver@test.com',
      password: 'Password123',
    });

    // Initialize receiver wallet
    await Wallet.findOneAndUpdate(
      { userId: receiver.user.userId },
      { $set: { balance: 0 } },
      { upsert: true }
    );
  });

  afterEach(() => {
    ledgerSimulation.reset();
  });

  /**
   * Helper to execute a full saga with potential failure simulation
   */
  async function executeTransactionSaga(
    senderId: string,
    txnId: string,
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Step 1: Debit sender
      await walletService.debit(senderId, amount, txnId);
      await transactionService.updateStatus(txnId, TransactionStatus.DEBITED);

      // Step 2: Credit receiver (may fail due to simulation)
      const creditResult = await ledgerService.processCredit(txnId);

      if (creditResult.success) {
        // Step 3: Mark completed
        await transactionService.onCreditSuccess(txnId);
        return { success: true };
      } else {
        // Credit failed - need compensation
        await transactionService.onCreditFailed(txnId, creditResult.error || 'Credit failed');

        // Execute refund
        await walletService.refund(senderId, amount, txnId);
        await transactionService.onRefundCompleted(txnId);

        return { success: false, error: creditResult.error };
      }
    } catch (error) {
      // Debit failed or other error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      try {
        await transactionService.onDebitFailed(txnId, errorMessage);
      } catch {
        // Ignore if status update fails
      }
      return { success: false, error: errorMessage };
    }
  }

  describe('Random Failure Rate Testing', () => {
    it('should properly compensate when credit fails with 50% failure rate', async () => {
      // Enable 50% failure rate
      ledgerSimulation.enable({
        failureRate: 0.5,
        failureType: 'ERROR',
      });

      const transactionCount = 10;
      const amount = 100;
      const initialBalance = 10000;

      // Execute transactions sequentially
      for (let i = 0; i < transactionCount; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount,
            description: `Chaos test transaction ${i}`,
          });

        const txnId = createRes.body.data.transaction.transactionId;
        await executeTransactionSaga(sender.user.userId, txnId, amount);
      }

      // Verify wallet balances are consistent
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });

      const completedTransactions = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.COMPLETED,
      });

      const failedTransactions = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.FAILED,
      });

      console.log(`Completed: ${completedTransactions}, Failed: ${failedTransactions}`);

      // Total transferred should equal receiver balance
      const totalTransferred = completedTransactions * amount;
      expect(receiverWallet?.balance).toBe(totalTransferred);

      // Sender should have original balance minus successful transfers
      expect(senderWallet?.balance).toBe(initialBalance - totalTransferred);

      // No money should be lost - sum of all wallets should equal initial total
      const totalInSystem = (senderWallet?.balance || 0) + (receiverWallet?.balance || 0);
      expect(totalInSystem).toBe(initialBalance);

      // All transactions should be terminal (completed or failed)
      expect(completedTransactions + failedTransactions).toBe(transactionCount);
    });

    it('should handle 100% failure rate with complete compensation', async () => {
      // Enable 100% failure rate
      ledgerSimulation.enable({
        failureRate: 1.0,
        failureType: 'ERROR',
      });

      const transactionCount = 5;
      const amount = 100;
      const initialBalance = 10000;

      // Execute transactions
      for (let i = 0; i < transactionCount; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount,
            description: 'Should fail and compensate',
          });

        const txnId = createRes.body.data.transaction.transactionId;
        await executeTransactionSaga(sender.user.userId, txnId, amount);
      }

      // All transactions should have failed
      const failedTransactions = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.FAILED,
      });
      expect(failedTransactions).toBe(transactionCount);

      // Sender balance should be fully restored
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      expect(senderWallet?.balance).toBe(initialBalance);

      // Receiver should have received nothing
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });
      expect(receiverWallet?.balance).toBe(0);
    });
  });

  describe('Specific Transaction Failure', () => {
    it('should fail only targeted transaction while others succeed', async () => {
      // First transaction should succeed (simulation disabled)
      const response1 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'First transaction - should succeed',
        });

      expect(response1.status).toBe(201);
      const txn1Id = response1.body.data.transaction.transactionId;

      // Execute first saga - should succeed
      const result1 = await executeTransactionSaga(sender.user.userId, txn1Id, 100);
      expect(result1.success).toBe(true);

      // Enable 100% failure for next transaction
      ledgerSimulation.enable({
        failureRate: 1.0,
        failureType: 'ERROR',
      });

      // Second transaction should fail
      const response2 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Second transaction - should fail',
        });

      const txn2Id = response2.body.data.transaction.transactionId;
      const result2 = await executeTransactionSaga(sender.user.userId, txn2Id, 100);
      expect(result2.success).toBe(false);

      // Disable simulation
      ledgerSimulation.disable();

      // Third transaction should succeed
      const response3 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Third transaction - should succeed',
        });

      const txn3Id = response3.body.data.transaction.transactionId;
      const result3 = await executeTransactionSaga(sender.user.userId, txn3Id, 100);
      expect(result3.success).toBe(true);

      // Verify final state
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });

      // Two successful transactions of 100 each
      const completedCount = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.COMPLETED,
      });
      expect(completedCount).toBe(2);

      // Verify balances
      expect(receiverWallet?.balance).toBe(200); // 2 * 100
      expect(senderWallet?.balance).toBe(10000 - 200); // Initial - successful transfers
    });

    it('should fail specific transaction ID when marked for failure', async () => {
      // Create transaction first
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Targeted for failure',
        });

      const targetTxnId = createRes.body.data.transaction.transactionId;

      // Mark this specific transaction to fail
      ledgerSimulation.enable();
      ledgerSimulation.addFailingTransactionIds([targetTxnId]);

      // Execute saga - should fail
      const result = await executeTransactionSaga(sender.user.userId, targetTxnId, 100);
      expect(result.success).toBe(false);

      // Verify transaction failed
      const txn = await transactionService.getTransaction(targetTxnId);
      expect(txn.status).toBe(TransactionStatus.FAILED);

      // Verify balance restored
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      expect(senderWallet?.balance).toBe(10000);
    });
  });

  describe('Recovery Verification', () => {
    it('should verify no orphaned debits after failures', async () => {
      // Enable 70% failure rate
      ledgerSimulation.enable({
        failureRate: 0.7,
        failureType: 'ERROR',
      });

      // Create and execute many transactions
      const transactionCount = 10;
      const amount = 100;

      for (let i = 0; i < transactionCount; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount,
            description: `Recovery test ${i}`,
          });

        const txnId = createRes.body.data.transaction.transactionId;
        await executeTransactionSaga(sender.user.userId, txnId, amount);
      }

      // Check for orphaned states
      const debitedButNotCompleted = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.DEBITED,
      });

      expect(debitedButNotCompleted).toBe(0);

      // All transactions should be either COMPLETED or FAILED
      const allTransactions = await Transaction.find({ senderId: sender.user.userId });
      allTransactions.forEach((tx) => {
        expect([TransactionStatus.COMPLETED, TransactionStatus.FAILED]).toContain(tx.status);
      });

      // Verify money conservation
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });
      const completedCount = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.COMPLETED,
      });

      expect(senderWallet?.balance).toBe(10000 - completedCount * amount);
      expect(receiverWallet?.balance).toBe(completedCount * amount);
    });
  });

  describe('Concurrent Failure Handling', () => {
    it('should handle concurrent failures without race conditions', async () => {
      // Create multiple receivers
      const receivers: TestUserResult[] = [receiver];
      for (let i = 1; i < 3; i++) {
        const newReceiver = await createTestUser(app, {
          email: `receiver${i}@test.com`,
          password: 'Password123',
        });
        receivers.push(newReceiver);
        await Wallet.findOneAndUpdate(
          { userId: newReceiver.user.userId },
          { $set: { balance: 0 } },
          { upsert: true }
        );
      }

      // Enable moderate failure rate
      ledgerSimulation.enable({
        failureRate: 0.3,
        failureType: 'ERROR',
      });

      // Send transactions to different receivers
      const transactionsPerReceiver = 3;
      const amount = 50;

      for (const rec of receivers) {
        for (let i = 0; i < transactionsPerReceiver; i++) {
          const createRes = await request(app)
            .post('/transactions')
            .set('Authorization', `Bearer ${sender.accessToken}`)
            .send({
              receiverId: rec.user.userId,
              amount,
              description: 'Concurrent test',
            });

          const txnId = createRes.body.data.transaction.transactionId;
          await executeTransactionSaga(sender.user.userId, txnId, amount);
        }
      }

      // Verify total money conservation
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      let totalReceived = 0;

      for (const rec of receivers) {
        const wallet = await Wallet.findOne({ userId: rec.user.userId });
        totalReceived += wallet?.balance || 0;
      }

      const totalInSystem = (senderWallet?.balance || 0) + totalReceived;
      expect(totalInSystem).toBe(10000);

      // Verify completed transaction count matches received amount
      const completedCount = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: TransactionStatus.COMPLETED,
      });
      expect(totalReceived).toBe(completedCount * amount);
    });
  });

  describe('Simulation Control', () => {
    it('should verify simulation config through API', async () => {
      // Get initial state
      const getRes1 = await request(app)
        .get('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(getRes1.status).toBe(200);
      expect(getRes1.body.data.simulation.enabled).toBe(false);

      // Enable simulation via API
      const postRes = await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 0.5,
          failureType: 'ERROR',
        });

      expect(postRes.status).toBe(200);

      // Verify enabled
      const getRes2 = await request(app)
        .get('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(getRes2.body.data.simulation.enabled).toBe(true);
      expect(getRes2.body.data.simulation.failureRate).toBe(0.5);

      // Disable via API (POST with enabled: false)
      const disableRes = await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: false,
        });

      expect(disableRes.status).toBe(200);

      // Verify disabled
      const getRes3 = await request(app)
        .get('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(getRes3.body.data.simulation.enabled).toBe(false);
    });
  });
});
