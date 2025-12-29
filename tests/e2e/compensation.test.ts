import request from 'supertest';
import mongoose from 'mongoose';
import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';
import { WalletOperation } from '../../src/models/WalletOperation';
import { createTestUser } from '../helpers/testAuth';
import { TransactionStatus } from '../../src/types/events';
import { transactionService } from '../../src/services/transaction/transaction.service';
import { walletService } from '../../src/services/wallet/wallet.service';
import { ledgerService, ledgerSimulation } from '../../src/services/ledger';

const app = getTestApp();

/**
 * Helper to get wallet balance
 */
async function getBalance(accessToken: string): Promise<number> {
  const response = await request(app)
    .get('/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  return response.body.data.wallet.balance;
}

/**
 * Execute full saga with optional failure simulation
 */
async function executeSaga(
  senderId: string,
  txnId: string,
  amount: number
): Promise<{ success: boolean; refunded: boolean }> {
  // Step 1: Debit sender
  await walletService.debit(senderId, amount, txnId);

  // Step 2: Update transaction to DEBITED
  await transactionService.onDebitSuccess(txnId);

  // Step 3: Credit receiver via ledger service
  const creditResult = await ledgerService.processCredit(txnId);

  if (creditResult.success) {
    // Step 4a: Credit succeeded - complete transaction
    await transactionService.onCreditSuccess(txnId);
    return { success: true, refunded: false };
  } else {
    // Step 4b: Credit failed - trigger compensation
    await transactionService.onCreditFailed(txnId, creditResult.error || 'Credit failed');

    // Step 5: Execute refund
    const txn = await transactionService.getTransaction(txnId);
    await walletService.refund(txn.senderId, txn.amount, txnId);

    // Step 6: Complete refund
    await transactionService.onRefundCompleted(txnId);

    return { success: false, refunded: true };
  }
}

describe('Compensation Flow Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await Transaction.deleteMany({});
    await WalletOperation.deleteMany({});
    ledgerSimulation.reset();
  });

  describe('Credit Failure with Refund', () => {
    it('should refund sender when credit fails: INITIATED -> DEBITED -> REFUNDING -> FAILED', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      // Create transaction
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 200,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Enable failure simulation for this transaction
      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Record initial balances
      const initialSenderBalance = await getBalance(sender.accessToken);
      expect(initialSenderBalance).toBe(500);

      // Execute saga (will fail at credit and compensate)
      const result = await executeSaga(sender.user.userId, txnId, 200);

      expect(result.success).toBe(false);
      expect(result.refunded).toBe(true);

      // Verify final transaction state
      const txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.FAILED);
      expect(txn.failureReason).toContain('refunded');

      // Verify sender balance is restored
      const finalSenderBalance = await getBalance(sender.accessToken);
      expect(finalSenderBalance).toBe(500);

      // Verify receiver balance unchanged
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(0);
    });

    it('should track all operations in WalletOperation for compensation flow', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 300 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Enable failure simulation
      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Execute saga with compensation
      await executeSaga(sender.user.userId, txnId, 100);

      // Check wallet operations
      const operations = await WalletOperation.find({ transactionId: txnId }).sort({
        createdAt: 1,
      });

      // Should have DEBIT and REFUND operations
      expect(operations.length).toBe(2);
      expect(operations[0].type).toBe('DEBIT');
      expect(operations[0].amount).toBe(100);
      expect(operations[1].type).toBe('REFUND');
      expect(operations[1].amount).toBe(100);

      // No CREDIT operation should exist
      const creditOps = operations.filter((op) => op.type === 'CREDIT');
      expect(creditOps.length).toBe(0);
    });

    it('should preserve state consistency after compensation', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Both users start with some balance
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${receiver.accessToken}`)
        .send({ amount: 500 });

      const initialTotal =
        (await getBalance(sender.accessToken)) + (await getBalance(receiver.accessToken));
      expect(initialTotal).toBe(1500);

      // Create transaction that will fail
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 300,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Enable failure simulation
      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Execute saga (will compensate)
      await executeSaga(sender.user.userId, txnId, 300);

      // Total balance should remain unchanged (money not lost or duplicated)
      const finalTotal =
        (await getBalance(sender.accessToken)) + (await getBalance(receiver.accessToken));
      expect(finalTotal).toBe(1500);
    });
  });

  describe('Money Safety Guarantees', () => {
    it('should never lose money during compensation', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Run 5 transactions, some will fail
      const transactionIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount: 100,
          });
        transactionIds.push(createRes.body.data.transaction.transactionId);
      }

      // Fail transactions 1, 3, 5 (odd indices)
      ledgerSimulation.enable({
        failTransactionIds: new Set([transactionIds[0], transactionIds[2], transactionIds[4]]),
      });

      // Execute all sagas
      for (let i = 0; i < 5; i++) {
        await executeSaga(sender.user.userId, transactionIds[i], 100);
      }

      // Count successful and failed
      const txns = await Promise.all(
        transactionIds.map((id) => transactionService.getTransaction(id))
      );
      const successCount = txns.filter((t) => t.status === TransactionStatus.COMPLETED).length;
      const failedCount = txns.filter((t) => t.status === TransactionStatus.FAILED).length;

      expect(successCount).toBe(2); // txn 2, 4 succeeded
      expect(failedCount).toBe(3); // txn 1, 3, 5 failed

      // Sender should have: 1000 - (100 * 2) = 800 (only 2 succeeded)
      // Receiver should have: 100 * 2 = 200
      const senderBalance = await getBalance(sender.accessToken);
      const receiverBalance = await getBalance(receiver.accessToken);

      expect(senderBalance).toBe(800);
      expect(receiverBalance).toBe(200);

      // Total should still be 1000 (no money lost or created)
      expect(senderBalance + receiverBalance).toBe(1000);
    });

    it('should handle mixed success and failure scenarios correctly', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver1 = await createTestUser(app, { email: 'receiver1@test.com' });
      const receiver2 = await createTestUser(app, { email: 'receiver2@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      // Transaction to receiver1 (will succeed)
      const res1 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver1.user.userId,
          amount: 150,
        });

      // Transaction to receiver2 (will fail)
      const res2 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver2.user.userId,
          amount: 100,
        });

      const txn1Id = res1.body.data.transaction.transactionId;
      const txn2Id = res2.body.data.transaction.transactionId;

      // Only fail txn2
      ledgerSimulation.enable({
        failTransactionIds: new Set([txn2Id]),
      });

      // Execute both sagas
      const result1 = await executeSaga(sender.user.userId, txn1Id, 150);
      const result2 = await executeSaga(sender.user.userId, txn2Id, 100);

      expect(result1.success).toBe(true);
      expect(result1.refunded).toBe(false);

      expect(result2.success).toBe(false);
      expect(result2.refunded).toBe(true);

      // Verify balances
      const senderBalance = await getBalance(sender.accessToken);
      const r1Balance = await getBalance(receiver1.accessToken);
      const r2Balance = await getBalance(receiver2.accessToken);

      expect(senderBalance).toBe(350); // 500 - 150 (only txn1 succeeded)
      expect(r1Balance).toBe(150); // received from txn1
      expect(r2Balance).toBe(0); // txn2 was refunded

      // Total: 350 + 150 + 0 = 500
      expect(senderBalance + r1Balance + r2Balance).toBe(500);
    });
  });

  describe('State Transition Validation', () => {
    it('should follow correct state transitions during compensation', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Enable failure
      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Track state transitions
      const states: TransactionStatus[] = [];

      // INITIATED
      let txn = await transactionService.getTransaction(txnId);
      states.push(txn.status);
      expect(txn.status).toBe(TransactionStatus.INITIATED);

      // Debit
      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);

      // DEBITED
      txn = await transactionService.getTransaction(txnId);
      states.push(txn.status);
      expect(txn.status).toBe(TransactionStatus.DEBITED);

      // Credit fails
      const creditResult = await ledgerService.processCredit(txnId);
      expect(creditResult.success).toBe(false);

      // Trigger compensation
      await transactionService.onCreditFailed(txnId, 'Simulated failure');

      // REFUNDING
      txn = await transactionService.getTransaction(txnId);
      states.push(txn.status);
      expect(txn.status).toBe(TransactionStatus.REFUNDING);

      // Execute refund
      await walletService.refund(sender.user.userId, 100, txnId);
      await transactionService.onRefundCompleted(txnId);

      // FAILED
      txn = await transactionService.getTransaction(txnId);
      states.push(txn.status);
      expect(txn.status).toBe(TransactionStatus.FAILED);

      // Verify complete state transition path
      expect(states).toEqual([
        TransactionStatus.INITIATED,
        TransactionStatus.DEBITED,
        TransactionStatus.REFUNDING,
        TransactionStatus.FAILED,
      ]);
    });

    it('should set appropriate failure reason after compensation', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      await executeSaga(sender.user.userId, txnId, 100);

      const txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.FAILED);
      expect(txn.failureReason).toContain('refunded');
    });
  });

  describe('Idempotency During Compensation', () => {
    it('should handle duplicate refund requests gracefully', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Debit and fail credit
      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);
      const creditResult = await ledgerService.processCredit(txnId);
      expect(creditResult.success).toBe(false);

      await transactionService.onCreditFailed(txnId, 'Test failure');

      // First refund
      const refund1 = await walletService.refund(sender.user.userId, 100, txnId);
      expect(refund1.success).toBe(true);
      expect(refund1.idempotent).toBe(false);
      expect(refund1.newBalance).toBe(500);

      // Duplicate refund - should be idempotent
      const refund2 = await walletService.refund(sender.user.userId, 100, txnId);
      expect(refund2.success).toBe(true);
      expect(refund2.idempotent).toBe(true);
      expect(refund2.newBalance).toBe(500); // Same balance, not 600

      // Balance should be 500, not 600
      const balance = await getBalance(sender.accessToken);
      expect(balance).toBe(500);

      // Only one REFUND operation should exist
      const refundOps = await WalletOperation.find({
        transactionId: txnId,
        type: 'REFUND',
      });
      expect(refundOps.length).toBe(1);
    });
  });
});
