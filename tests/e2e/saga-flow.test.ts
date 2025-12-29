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

const app = getTestApp();

/**
 * Helper to wait for a condition with timeout
 */
async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

/**
 * Helper to get wallet balance
 */
async function getBalance(accessToken: string): Promise<number> {
  const response = await request(app)
    .get('/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  return response.body.data.wallet.balance;
}

describe('Saga Flow Tests', () => {
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
  });

  describe('Happy Path - Complete Transaction Flow', () => {
    it('should complete full saga: INITIATED -> DEBITED -> CREDITED -> COMPLETED', async () => {
      // Setup: Create sender and receiver with funded wallets
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender's wallet
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      const initialSenderBalance = await getBalance(sender.accessToken);
      const initialReceiverBalance = await getBalance(receiver.accessToken);

      expect(initialSenderBalance).toBe(1000);
      expect(initialReceiverBalance).toBe(0);

      // Step 1: Initiate transaction
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Test saga flow',
        });

      expect(createRes.status).toBe(201);
      const txnId = createRes.body.data.transaction.transactionId;

      // Verify initial state
      let txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.INITIATED);

      // Step 2: Simulate DEBIT_SUCCESS event (debit the sender)
      await walletService.debit(sender.user.userId, 100, txnId);

      // Step 3: Simulate saga handling of DEBIT_SUCCESS
      await transactionService.onDebitSuccess(txnId, sender.user.userId, 100);

      // Verify state after debit (credit happens in onDebitSuccess)
      txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.DEBITED);

      // Step 4: Simulate CREDIT_SUCCESS event handling
      await transactionService.onCreditSuccess(txnId);

      // Verify final state
      txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.COMPLETED);
      expect(txn.completedAt).toBeDefined();

      // Verify balances
      const finalSenderBalance = await getBalance(sender.accessToken);
      const finalReceiverBalance = await getBalance(receiver.accessToken);

      expect(finalSenderBalance).toBe(900); // 1000 - 100
      expect(finalReceiverBalance).toBe(100); // 0 + 100
    });

    it('should maintain balance consistency across multiple successful transactions', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      // Execute 5 transactions of 50 each
      for (let i = 0; i < 5; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount: 50,
          });

        const txnId = createRes.body.data.transaction.transactionId;

        // Simulate full saga
        await walletService.debit(sender.user.userId, 50, txnId);
        await transactionService.onDebitSuccess(txnId, sender.user.userId, 50);
        await transactionService.onCreditSuccess(txnId);
      }

      // Verify final balances
      const senderBalance = await getBalance(sender.accessToken);
      const receiverBalance = await getBalance(receiver.accessToken);

      expect(senderBalance).toBe(250); // 500 - (50 * 5)
      expect(receiverBalance).toBe(250); // 0 + (50 * 5)

      // Verify all transactions are completed
      const { transactions, total } = await transactionService.getUserTransactions(
        sender.user.userId,
        { status: TransactionStatus.COMPLETED }
      );

      expect(total).toBe(5);
      expect(transactions.every((t) => t.status === TransactionStatus.COMPLETED)).toBe(true);
    });
  });

  describe('Debit Failure - Insufficient Balance', () => {
    it('should fail transaction when sender has insufficient balance', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Sender has 0 balance (no deposit)

      // Initiate transaction
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Simulate debit attempt (will throw due to insufficient balance)
      try {
        await walletService.debit(sender.user.userId, 100, txnId);
      } catch {
        // Expected to fail
        // Simulate DEBIT_FAILED event handling
        await transactionService.onDebitFailed(txnId, 'Insufficient balance');
      }

      // Verify final state
      const txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.FAILED);
      expect(txn.failureReason).toBe('Insufficient balance');

      // Verify balances unchanged
      const senderBalance = await getBalance(sender.accessToken);
      const receiverBalance = await getBalance(receiver.accessToken);

      expect(senderBalance).toBe(0);
      expect(receiverBalance).toBe(0);
    });

    it('should not affect other transactions when one fails due to insufficient balance', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender with only 100
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 100 });

      // First transaction - should succeed
      const res1 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      const txn1Id = res1.body.data.transaction.transactionId;

      // Complete first transaction
      await walletService.debit(sender.user.userId, 100, txn1Id);
      await transactionService.onDebitSuccess(txn1Id, sender.user.userId, 100);
      await transactionService.onCreditSuccess(txn1Id);

      // Second transaction - should fail (no balance left)
      const res2 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 50 });

      const txn2Id = res2.body.data.transaction.transactionId;

      // Attempt debit and handle failure
      try {
        await walletService.debit(sender.user.userId, 50, txn2Id);
      } catch {
        await transactionService.onDebitFailed(txn2Id, 'Insufficient balance');
      }

      // Verify states
      const txn1 = await transactionService.getTransaction(txn1Id);
      const txn2 = await transactionService.getTransaction(txn2Id);

      expect(txn1.status).toBe(TransactionStatus.COMPLETED);
      expect(txn2.status).toBe(TransactionStatus.FAILED);

      // Verify balances
      expect(await getBalance(sender.accessToken)).toBe(0);
      expect(await getBalance(receiver.accessToken)).toBe(100);
    });
  });

  describe('Credit Failure with Refund - Compensation Flow', () => {
    it('should refund sender when credit fails: DEBITED -> REFUNDING -> FAILED', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      // Initiate transaction
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 200,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Step 1: Debit succeeds
      await walletService.debit(sender.user.userId, 200, txnId);
      await transactionService.updateStatus(txnId, TransactionStatus.DEBITED);

      // Verify sender balance after debit
      let senderBalance = await getBalance(sender.accessToken);
      expect(senderBalance).toBe(300); // 500 - 200

      // Step 2: Simulate credit failure
      await transactionService.onCreditFailed(txnId, 'Receiver wallet error');

      // Verify state is REFUNDING
      let txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.REFUNDING);

      // Step 3: Execute refund (compensation)
      await walletService.refund(sender.user.userId, 200, txnId);

      // Step 4: Handle REFUND_COMPLETED
      await transactionService.onRefundCompleted(txnId);

      // Verify final state
      txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.FAILED);
      expect(txn.failureReason).toContain('refunded');

      // Verify sender balance is restored
      senderBalance = await getBalance(sender.accessToken);
      expect(senderBalance).toBe(500); // Fully restored

      // Verify receiver balance unchanged
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(0);
    });

    it('should correctly track operations in WalletOperation for refunded transaction', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 300 });

      // Create and process transaction with credit failure
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Execute debit
      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.updateStatus(txnId, TransactionStatus.DEBITED);

      // Simulate credit failure and refund
      await transactionService.onCreditFailed(txnId, 'Test failure');
      await walletService.refund(sender.user.userId, 100, txnId);
      await transactionService.onRefundCompleted(txnId);

      // Check wallet operations for this transaction
      const operations = await WalletOperation.find({ transactionId: txnId }).sort({
        createdAt: 1,
      });

      expect(operations.length).toBe(2); // DEBIT + REFUND
      expect(operations[0].type).toBe('DEBIT');
      expect(operations[0].amount).toBe(100);
      expect(operations[1].type).toBe('REFUND');
      expect(operations[1].amount).toBe(100);
    });
  });

  describe('Concurrent Transfers - Race Conditions', () => {
    it('should handle multiple concurrent transfers from same sender', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver1 = await createTestUser(app, { email: 'receiver1@test.com' });
      const receiver2 = await createTestUser(app, { email: 'receiver2@test.com' });
      const receiver3 = await createTestUser(app, { email: 'receiver3@test.com' });

      // Fund sender with enough for all transfers
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create 3 concurrent transactions
      const [res1, res2, res3] = await Promise.all([
        request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver1.user.userId, amount: 100 }),
        request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver2.user.userId, amount: 150 }),
        request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver3.user.userId, amount: 200 }),
      ]);

      const txn1Id = res1.body.data.transaction.transactionId;
      const txn2Id = res2.body.data.transaction.transactionId;
      const txn3Id = res3.body.data.transaction.transactionId;

      // Process all transactions (simulating concurrent saga execution)
      await Promise.all([
        (async () => {
          await walletService.debit(sender.user.userId, 100, txn1Id);
          await transactionService.onDebitSuccess(txn1Id, sender.user.userId, 100);
          await transactionService.onCreditSuccess(txn1Id);
        })(),
        (async () => {
          await walletService.debit(sender.user.userId, 150, txn2Id);
          await transactionService.onDebitSuccess(txn2Id, sender.user.userId, 150);
          await transactionService.onCreditSuccess(txn2Id);
        })(),
        (async () => {
          await walletService.debit(sender.user.userId, 200, txn3Id);
          await transactionService.onDebitSuccess(txn3Id, sender.user.userId, 200);
          await transactionService.onCreditSuccess(txn3Id);
        })(),
      ]);

      // Verify all transactions completed
      const txn1 = await transactionService.getTransaction(txn1Id);
      const txn2 = await transactionService.getTransaction(txn2Id);
      const txn3 = await transactionService.getTransaction(txn3Id);

      expect(txn1.status).toBe(TransactionStatus.COMPLETED);
      expect(txn2.status).toBe(TransactionStatus.COMPLETED);
      expect(txn3.status).toBe(TransactionStatus.COMPLETED);

      // Verify final balances
      const senderBalance = await getBalance(sender.accessToken);
      const r1Balance = await getBalance(receiver1.accessToken);
      const r2Balance = await getBalance(receiver2.accessToken);
      const r3Balance = await getBalance(receiver3.accessToken);

      expect(senderBalance).toBe(550); // 1000 - 100 - 150 - 200
      expect(r1Balance).toBe(100);
      expect(r2Balance).toBe(150);
      expect(r3Balance).toBe(200);
    });

    it('should handle race condition: insufficient balance during concurrent debits', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver1 = await createTestUser(app, { email: 'receiver1@test.com' });
      const receiver2 = await createTestUser(app, { email: 'receiver2@test.com' });

      // Fund sender with only 100
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 100 });

      // Create 2 transactions that together exceed balance
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver1.user.userId, amount: 80 }),
        request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver2.user.userId, amount: 80 }),
      ]);

      const txn1Id = res1.body.data.transaction.transactionId;
      const txn2Id = res2.body.data.transaction.transactionId;

      // Try to process both - one should fail due to insufficient balance
      const results = await Promise.allSettled([
        (async () => {
          await walletService.debit(sender.user.userId, 80, txn1Id);
          await transactionService.onDebitSuccess(txn1Id, sender.user.userId, 80);
          await transactionService.onCreditSuccess(txn1Id);
          return 'success';
        })(),
        (async () => {
          await walletService.debit(sender.user.userId, 80, txn2Id);
          await transactionService.onDebitSuccess(txn2Id, sender.user.userId, 80);
          await transactionService.onCreditSuccess(txn2Id);
          return 'success';
        })(),
      ]);

      // Mark failed transactions
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const txnId = i === 0 ? txn1Id : txn2Id;
          const txn = await transactionService.getTransaction(txnId);
          if (txn.status === TransactionStatus.INITIATED) {
            await transactionService.onDebitFailed(txnId, 'Insufficient balance');
          }
        }
      }

      // Count successful and failed
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;

      // At least one should succeed, at least one should fail
      expect(successCount).toBeGreaterThanOrEqual(1);
      expect(failedCount).toBeGreaterThanOrEqual(1);

      // Verify final sender balance (should be 20 if one succeeded)
      const senderBalance = await getBalance(sender.accessToken);
      expect(senderBalance).toBeLessThanOrEqual(20); // Either 20 (one succeeded) or could be 100 if both failed
    });
  });

  describe('State Machine Invariants', () => {
    it('should never have negative wallet balance', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 100 });

      // Try to create transaction for more than available
      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 500, // More than available
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Attempt debit (should fail)
      try {
        await walletService.debit(sender.user.userId, 500, txnId);
        // Should not reach here
        expect(true).toBe(false);
      } catch {
        await transactionService.onDebitFailed(txnId, 'Insufficient balance');
      }

      // Verify balance is still non-negative
      const balance = await getBalance(sender.accessToken);
      expect(balance).toBeGreaterThanOrEqual(0);
      expect(balance).toBe(100); // Unchanged
    });

    it('should ensure transaction amounts match wallet operations', async () => {
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
          amount: 123,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Complete the saga
      await walletService.debit(sender.user.userId, 123, txnId);
      await transactionService.onDebitSuccess(txnId, sender.user.userId, 123);
      await transactionService.onCreditSuccess(txnId);

      // Verify transaction amount
      const txn = await transactionService.getTransaction(txnId);
      expect(txn.amount).toBe(123);

      // Verify wallet operations match
      const operations = await WalletOperation.find({ transactionId: txnId });
      const debitOp = operations.find((op) => op.type === 'DEBIT');
      const creditOp = operations.find((op) => op.type === 'CREDIT');

      expect(debitOp?.amount).toBe(123);
      expect(creditOp?.amount).toBe(123);
    });

    it('should maintain double-entry bookkeeping invariant', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Initial state
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

      // Execute multiple transactions
      for (let i = 0; i < 3; i++) {
        const createRes = await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({
            receiverId: receiver.user.userId,
            amount: 100,
          });

        const txnId = createRes.body.data.transaction.transactionId;

        await walletService.debit(sender.user.userId, 100, txnId);
        await transactionService.onDebitSuccess(txnId, sender.user.userId, 100);
        await transactionService.onCreditSuccess(txnId);
      }

      // Total system balance should remain the same (no money created/destroyed)
      const finalTotal =
        (await getBalance(sender.accessToken)) + (await getBalance(receiver.accessToken));
      expect(finalTotal).toBe(1500);
    });
  });
});
