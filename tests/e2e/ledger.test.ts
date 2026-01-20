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

describe('Ledger Service Tests', () => {
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
    // Reset simulation state before each test
    ledgerSimulation.reset();
  });

  describe('Credit Success Path', () => {
    it('should credit receiver when DEBIT_SUCCESS is processed', async () => {
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
          amount: 150,
        });

      const txnId = createRes.body.data.transaction.transactionId;

      // Debit sender
      await walletService.debit(sender.user.userId, 150, txnId);

      // Update transaction status to DEBITED
      await transactionService.onDebitSuccess(txnId);

      // Ledger service credits the receiver
      const result = await ledgerService.processCredit(txnId);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(txnId);
      expect(result.receiverId).toBe(receiver.user.userId);
      expect(result.amount).toBe(150);
      expect(result.newBalance).toBe(150);

      // Verify receiver balance
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(150);
    });

    it('should maintain idempotency - duplicate credits return same result', async () => {
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

      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);

      // First credit
      const result1 = await ledgerService.processCredit(txnId);
      expect(result1.success).toBe(true);
      expect(result1.newBalance).toBe(100);

      // Duplicate credit - should return idempotent result
      const result2 = await ledgerService.processCredit(txnId);
      expect(result2.success).toBe(true);
      // Balance should still be 100, not 200
      expect(result2.newBalance).toBe(100);

      // Verify receiver only has 100 (not 200)
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(100);

      // Verify only one CREDIT operation was recorded
      const creditOps = await WalletOperation.find({
        transactionId: txnId,
        type: 'CREDIT',
      });
      expect(creditOps.length).toBe(1);
    });
  });

  describe('Failure Simulation', () => {
    it('should simulate failure when enabled for specific transaction ID', async () => {
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

      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);

      // Enable failure simulation for this specific transaction
      ledgerSimulation.enable({
        failTransactionIds: new Set([txnId]),
      });

      // Credit should fail due to simulation
      const result = await ledgerService.processCredit(txnId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated credit failure');

      // Receiver should have 0 balance (credit didn't happen)
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(0);
    });

    it('should allow normal processing when simulation is disabled', async () => {
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

      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);

      // Ensure simulation is disabled
      ledgerSimulation.disable();

      const result = await ledgerService.processCredit(txnId);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(100);
    });

    it('should only fail transactions in the fail list', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 500 });

      // Create two transactions
      const res1 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 50,
        });

      const res2 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 50,
        });

      const txn1Id = res1.body.data.transaction.transactionId;
      const txn2Id = res2.body.data.transaction.transactionId;

      // Only mark txn1 to fail
      ledgerSimulation.enable({
        failTransactionIds: new Set([txn1Id]),
      });

      // Process txn1 (should fail)
      await walletService.debit(sender.user.userId, 50, txn1Id);
      await transactionService.onDebitSuccess(txn1Id);
      const result1 = await ledgerService.processCredit(txn1Id);

      expect(result1.success).toBe(false);

      // Process txn2 (should succeed)
      await walletService.debit(sender.user.userId, 50, txn2Id);
      await transactionService.onDebitSuccess(txn2Id);
      const result2 = await ledgerService.processCredit(txn2Id);

      expect(result2.success).toBe(true);

      // Receiver should only have 50 from txn2
      const receiverBalance = await getBalance(receiver.accessToken);
      expect(receiverBalance).toBe(50);
    });
  });

  describe('Simulation API', () => {
    it('should get current simulation config', async () => {
      const response = await request(app).get('/ledger/simulation');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.simulation).toBeDefined();
      expect(response.body.data.simulation.enabled).toBe(false);
    });

    it('should enable simulation via API', async () => {
      const response = await request(app)
        .post('/ledger/simulation')
        .send({
          enabled: true,
          failureRate: 0.5,
          failTransactionIds: ['txn_test123'],
          failureType: 'ERROR',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.simulation.enabled).toBe(true);
      expect(response.body.data.simulation.failureRate).toBe(0.5);
      expect(response.body.data.simulation.failTransactionIds).toContain('txn_test123');
    });

    it('should disable simulation via API', async () => {
      // First enable
      await request(app).post('/ledger/simulation').send({
        enabled: true,
        failureRate: 0.5,
      });

      // Then disable
      const response = await request(app).post('/ledger/simulation').send({
        enabled: false,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.simulation.enabled).toBe(false);
    });

    it('should add failing transaction IDs via API', async () => {
      // First enable simulation
      await request(app).post('/ledger/simulation').send({
        enabled: true,
      });

      const response = await request(app)
        .post('/ledger/simulation/fail-transactions')
        .send({
          transactionIds: ['txn_abc', 'txn_def'],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.simulation.failTransactionIds).toContain('txn_abc');
      expect(response.body.data.simulation.failTransactionIds).toContain('txn_def');
    });

    it('should reset simulation via API', async () => {
      // Enable simulation with config
      await request(app)
        .post('/ledger/simulation')
        .send({
          enabled: true,
          failureRate: 0.8,
          failTransactionIds: ['txn_123'],
        });

      // Reset
      const response = await request(app).post('/ledger/simulation/reset');

      expect(response.status).toBe(200);
      expect(response.body.data.simulation.enabled).toBe(false);
      expect(response.body.data.simulation.failureRate).toBe(0);
      expect(response.body.data.simulation.failTransactionIds).toHaveLength(0);
    });

    it('should validate simulation config input', async () => {
      const response = await request(app).post('/ledger/simulation').send({
        enabled: 'not-a-boolean',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Edge Cases', () => {
    it('should handle transaction not found error', async () => {
      const result = await ledgerService.processCredit('txn_nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction not found');
    });

    it('should handle receiver wallet not found', async () => {
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

      await walletService.debit(sender.user.userId, 100, txnId);
      await transactionService.onDebitSuccess(txnId);

      // Delete receiver's wallet before credit
      await Wallet.deleteOne({ userId: receiver.user.userId });

      const result = await ledgerService.processCredit(txnId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet not found');
    });
  });
});
