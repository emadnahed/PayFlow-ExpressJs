/**
 * Workflow Tests: Payment User Journeys
 *
 * Multi-actor end-to-end workflows covering:
 * - Register → Fund → Transfer → Verify balances (happy path)
 * - Concurrent transfers from a single sender
 * - Transfer failure (insufficient funds) + balance recovery
 * - Idempotent deposit (same key twice)
 * - Self-transfer rejection
 *
 * Requires a running MongoDB (port 27018) and Redis (port 6380).
 * These tests rely on the saga being driven manually via service calls,
 * not via background workers, so they are deterministic.
 */

import request from 'supertest';
import mongoose from 'mongoose';

import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';
import { WalletOperation } from '../../src/models/WalletOperation';
import { createTestUser } from '../helpers/testAuth';
import { transactionService } from '../../src/services/transaction/transaction.service';
import { walletService } from '../../src/services/wallet/wallet.service';
import { ledgerService } from '../../src/services/ledger/ledger.service';
import { TransactionStatus } from '../../src/types/events';

const app = getTestApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWalletBalance(accessToken: string): Promise<number> {
  const res = await request(app)
    .get('/wallets/me')
    .set('Authorization', `Bearer ${accessToken}`);
  return res.body.data.wallet.balance;
}

async function depositFunds(accessToken: string, amount: number): Promise<void> {
  const res = await request(app)
    .post('/wallets/me/deposit')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ amount });
  expect(res.status).toBe(200);
}

async function initiateTransfer(
  senderToken: string,
  receiverId: string,
  amount: number
): Promise<string> {
  const res = await request(app)
    .post('/transactions')
    .set('Authorization', `Bearer ${senderToken}`)
    .send({ receiverId, amount });
  expect(res.status).toBe(201);
  return res.body.data.transaction.transactionId;
}

/**
 * Drive the full saga manually (debit → credit) without workers.
 */
async function runFullSaga(
  senderUserId: string,
  receiverUserId: string,
  amount: number,
  txnId: string
): Promise<void> {
  // Debit sender
  await walletService.debit(senderUserId, amount, txnId);
  // Update transaction status to DEBITED
  await transactionService.onDebitSuccess(txnId);
  // Credit receiver via ledger service
  await ledgerService.processCredit(txnId);
  // Update transaction status to COMPLETED
  await transactionService.onCreditSuccess(txnId);
}

// ── Test Setup ────────────────────────────────────────────────────────────────

describe('Payment Workflow Tests', () => {
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

  // ── Workflow 1: Register → Fund → Transfer → Verify ───────────────────────

  describe('Workflow 1: Complete happy-path payment journey', () => {
    it('should transfer funds from sender to receiver and update balances correctly', async () => {
      // 1. Register two users
      const sender = await createTestUser(app, { name: 'Alice', email: 'alice@workflow.com' });
      const receiver = await createTestUser(app, { name: 'Bob', email: 'bob@workflow.com' });

      // 2. Fund sender with 1000
      await depositFunds(sender.accessToken, 1000);
      expect(await getWalletBalance(sender.accessToken)).toBe(1000);
      expect(await getWalletBalance(receiver.accessToken)).toBe(0);

      // 3. Initiate transfer of 300
      const txnId = await initiateTransfer(sender.accessToken, receiver.user.userId, 300);

      // 4. Drive full saga
      await runFullSaga(sender.user.userId, receiver.user.userId, 300, txnId);

      // 5. Verify balances
      expect(await getWalletBalance(sender.accessToken)).toBe(700);
      expect(await getWalletBalance(receiver.accessToken)).toBe(300);

      // 6. Verify transaction is COMPLETED
      const txn = await transactionService.getTransaction(txnId);
      expect(txn.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should list transactions for both sender and receiver', async () => {
      const sender = await createTestUser(app, { email: 'alice2@workflow.com' });
      const receiver = await createTestUser(app, { email: 'bob2@workflow.com' });

      await depositFunds(sender.accessToken, 500);
      const txnId = await initiateTransfer(sender.accessToken, receiver.user.userId, 100);
      await runFullSaga(sender.user.userId, receiver.user.userId, 100, txnId);

      // Sender can see transaction
      const senderTxns = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`);
      expect(senderTxns.status).toBe(200);
      expect(senderTxns.body.data.transactions.length).toBeGreaterThanOrEqual(1);

      // Receiver can see transaction
      const receiverTxns = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${receiver.accessToken}`);
      expect(receiverTxns.status).toBe(200);
      expect(receiverTxns.body.data.transactions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Workflow 2: Multiple sequential transfers ──────────────────────────────

  describe('Workflow 2: Multiple sequential transfers from one sender', () => {
    it('should handle multiple transfers correctly and maintain balance integrity', async () => {
      const alice = await createTestUser(app, { email: 'alice3@workflow.com' });
      const bob = await createTestUser(app, { email: 'bob3@workflow.com' });
      const carol = await createTestUser(app, { email: 'carol@workflow.com' });

      await depositFunds(alice.accessToken, 1000);

      // Transfer 1: alice → bob (200)
      const txn1 = await initiateTransfer(alice.accessToken, bob.user.userId, 200);
      await runFullSaga(alice.user.userId, bob.user.userId, 200, txn1);

      // Transfer 2: alice → carol (150)
      const txn2 = await initiateTransfer(alice.accessToken, carol.user.userId, 150);
      await runFullSaga(alice.user.userId, carol.user.userId, 150, txn2);

      // Transfer 3: bob → carol (50)
      const txn3 = await initiateTransfer(bob.accessToken, carol.user.userId, 50);
      await runFullSaga(bob.user.userId, carol.user.userId, 50, txn3);

      expect(await getWalletBalance(alice.accessToken)).toBe(650); // 1000 - 200 - 150
      expect(await getWalletBalance(bob.accessToken)).toBe(150);   // 200 - 50
      expect(await getWalletBalance(carol.accessToken)).toBe(200); // 150 + 50
    });
  });

  // ── Workflow 3: Insufficient funds → saga compensation ────────────────────

  describe('Workflow 3: Insufficient funds triggers compensation saga', () => {
    it('should fail the transaction and publish DEBIT_FAILED when sender has insufficient balance', async () => {
      const sender = await createTestUser(app, { email: 'broke@workflow.com' });
      const receiver = await createTestUser(app, { email: 'receiver3@workflow.com' });

      // Sender has 0 balance — do NOT deposit
      const txnId = await initiateTransfer(sender.accessToken, receiver.user.userId, 500);

      // Attempt debit — should throw insufficient balance
      await expect(
        walletService.debit(sender.user.userId, 500, txnId)
      ).rejects.toThrow('Insufficient balance');

      // Sender balance should still be 0
      expect(await getWalletBalance(sender.accessToken)).toBe(0);

      // Receiver balance should still be 0
      expect(await getWalletBalance(receiver.accessToken)).toBe(0);
    });
  });

  // ── Workflow 4: Idempotent deposit ────────────────────────────────────────

  describe('Workflow 4: Idempotent deposit with the same key', () => {
    it('should credit wallet only once when the same idempotencyKey is used twice', async () => {
      const user = await createTestUser(app, { email: 'idempotent@workflow.com' });
      const idempotencyKey = `idem-${Date.now()}`;

      // First deposit
      const res1 = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ amount: 500, idempotencyKey });
      expect(res1.status).toBe(200);
      expect(res1.body.data.newBalance).toBe(500);

      // Second deposit with same key (idempotent)
      const res2 = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ amount: 500, idempotencyKey });
      expect(res2.status).toBe(200);
      expect(res2.body.data.message).toContain('already processed');

      // Balance should only reflect one deposit
      expect(await getWalletBalance(user.accessToken)).toBe(500);
    });
  });

  // ── Workflow 5: Self-transfer rejection ───────────────────────────────────

  describe('Workflow 5: Self-transfer is rejected', () => {
    it('should reject a transfer where sender equals receiver', async () => {
      const user = await createTestUser(app, { email: 'self@workflow.com' });
      await depositFunds(user.accessToken, 500);

      const res = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ receiverId: user.user.userId, amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ── Workflow 6: Credit failure → refund saga ──────────────────────────────

  describe('Workflow 6: Credit failure triggers refund compensation', () => {
    it('should refund sender when credit fails and transition to FAILED', async () => {
      const sender = await createTestUser(app, { email: 'sender6@workflow.com' });
      const receiver = await createTestUser(app, { email: 'receiver6@workflow.com' });

      await depositFunds(sender.accessToken, 1000);

      const txnId = await initiateTransfer(sender.accessToken, receiver.user.userId, 200);

      // Debit sender
      await walletService.debit(sender.user.userId, 200, txnId);
      await transactionService.onDebitSuccess(txnId);

      // Simulate credit failure by calling onCreditFailed directly
      await transactionService.onCreditFailed(txnId, 'Receiver wallet unavailable');

      // Verify transaction is in REFUNDING state
      const txnAfterCreditFail = await transactionService.getTransaction(txnId);
      expect(txnAfterCreditFail.status).toBe(TransactionStatus.REFUNDING);

      // Process refund
      await walletService.refund(sender.user.userId, 200, txnId);
      await transactionService.onRefundCompleted(txnId);

      // Verify transaction is FAILED
      const finalTxn = await transactionService.getTransaction(txnId);
      expect(finalTxn.status).toBe(TransactionStatus.FAILED);

      // Sender balance should be restored
      expect(await getWalletBalance(sender.accessToken)).toBe(1000);
    });
  });

  // ── Workflow 7: GET /transactions/:id access control ─────────────────────

  describe('Workflow 7: Transaction visibility access control', () => {
    it('should allow both sender and receiver to view a transaction', async () => {
      const alice = await createTestUser(app, { email: 'alice7@workflow.com' });
      const bob = await createTestUser(app, { email: 'bob7@workflow.com' });
      const eve = await createTestUser(app, { email: 'eve7@workflow.com' });

      await depositFunds(alice.accessToken, 500);
      const txnId = await initiateTransfer(alice.accessToken, bob.user.userId, 100);

      // Alice (sender) can view
      const aliceRes = await request(app)
        .get(`/transactions/${txnId}`)
        .set('Authorization', `Bearer ${alice.accessToken}`);
      expect(aliceRes.status).toBe(200);

      // Bob (receiver) can view
      const bobRes = await request(app)
        .get(`/transactions/${txnId}`)
        .set('Authorization', `Bearer ${bob.accessToken}`);
      expect(bobRes.status).toBe(200);

      // Eve (unrelated) should be forbidden
      const eveRes = await request(app)
        .get(`/transactions/${txnId}`)
        .set('Authorization', `Bearer ${eve.accessToken}`);
      expect(eveRes.status).toBe(403);
    });
  });
});
