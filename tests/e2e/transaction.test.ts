import request from 'supertest';
import mongoose from 'mongoose';
import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';
import { WalletOperation } from '../../src/models/WalletOperation';
import { createTestUser } from '../helpers/testAuth';
import { TransactionStatus } from '../../src/types/events';

const app = getTestApp();

describe('Transaction Endpoints', () => {
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

  describe('POST /transactions', () => {
    it('should create a new transaction', async () => {
      // Create sender and receiver
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender's wallet
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create transaction
      const response = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Test transfer',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transaction).toHaveProperty('transactionId');
      expect(response.body.data.transaction.senderId).toBe(sender.user.userId);
      expect(response.body.data.transaction.receiverId).toBe(receiver.user.userId);
      expect(response.body.data.transaction.amount).toBe(100);
      expect(response.body.data.transaction.status).toBe(TransactionStatus.INITIATED);
    });

    it('should reject transaction to self', async () => {
      const user = await createTestUser(app);

      const response = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          receiverId: user.user.userId,
          amount: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject transaction to non-existent receiver', async () => {
      const sender = await createTestUser(app);

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      const response = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: 'user_nonexistent123',
          amount: 100,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject transaction with zero amount', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      const response = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject transaction with negative amount', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      const response = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: -100,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject transaction without authentication', async () => {
      const response = await request(app).post('/transactions').send({
        receiverId: 'user_123',
        amount: 100,
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /transactions/:id', () => {
    it('should get transaction by ID for sender', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund and create transaction
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      const transactionId = createRes.body.data.transaction.transactionId;

      // Get transaction as sender
      const response = await request(app)
        .get(`/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transaction.transactionId).toBe(transactionId);
    });

    it('should get transaction by ID for receiver', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund and create transaction
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      const transactionId = createRes.body.data.transaction.transactionId;

      // Get transaction as receiver
      const response = await request(app)
        .get(`/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${receiver.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transaction.transactionId).toBe(transactionId);
    });

    it('should reject access by unrelated user', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });
      const unrelated = await createTestUser(app, { email: 'unrelated@test.com' });

      // Fund and create transaction
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      const createRes = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      const transactionId = createRes.body.data.transaction.transactionId;

      // Try to get transaction as unrelated user
      const response = await request(app)
        .get(`/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent transaction', async () => {
      const user = await createTestUser(app);

      const response = await request(app)
        .get('/transactions/txn_nonexistent123')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /transactions', () => {
    it('should list user transactions', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create multiple transactions
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver.user.userId, amount: 10 });
      }

      // List transactions for sender
      const response = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toHaveLength(3);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it('should include transactions where user is receiver', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create transaction
      await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      // List transactions for receiver
      const response = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${receiver.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toHaveLength(1);
    });

    it('should filter by status', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create transactions
      await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ receiverId: receiver.user.userId, amount: 100 });

      // Filter by INITIATED status
      const response = await request(app)
        .get('/transactions?status=INITIATED')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.transactions.every((t: { status: string }) => t.status === 'INITIATED')
      ).toBe(true);
    });

    it('should paginate results', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Fund sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/transactions')
          .set('Authorization', `Bearer ${sender.accessToken}`)
          .send({ receiverId: receiver.user.userId, amount: 10 });
      }

      // Get first page (2 items)
      const response = await request(app)
        .get('/transactions?limit=2&offset=0')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toHaveLength(2);
      expect(response.body.data.pagination.total).toBe(5);
      expect(response.body.data.pagination.hasMore).toBe(true);

      // Get second page
      const response2 = await request(app)
        .get('/transactions?limit=2&offset=2')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      expect(response2.body.data.transactions).toHaveLength(2);
      expect(response2.body.data.pagination.hasMore).toBe(true);
    });

    it('should return empty list for user with no transactions', async () => {
      const user = await createTestUser(app);

      const response = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toHaveLength(0);
      expect(response.body.data.pagination.total).toBe(0);
    });
  });
});

describe('Transaction State Machine', () => {
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

  it('should allow valid state transition: INITIATED -> DEBITED', async () => {
    const { transactionService } =
      await import('../../src/services/transaction/transaction.service');
    const sender = await createTestUser(app, { email: 'sender@test.com' });
    const receiver = await createTestUser(app, { email: 'receiver@test.com' });

    // Fund sender
    await request(app)
      .post('/wallets/me/deposit')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ amount: 1000 });

    // Create transaction
    const createRes = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ receiverId: receiver.user.userId, amount: 100 });

    const txnId = createRes.body.data.transaction.transactionId;

    // Update status to DEBITED
    const updated = await transactionService.updateStatus(txnId, TransactionStatus.DEBITED);
    expect(updated.status).toBe(TransactionStatus.DEBITED);
  });

  it('should reject invalid state transition: INITIATED -> COMPLETED', async () => {
    const { transactionService } =
      await import('../../src/services/transaction/transaction.service');
    const sender = await createTestUser(app, { email: 'sender@test.com' });
    const receiver = await createTestUser(app, { email: 'receiver@test.com' });

    // Fund sender
    await request(app)
      .post('/wallets/me/deposit')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ amount: 1000 });

    // Create transaction
    const createRes = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ receiverId: receiver.user.userId, amount: 100 });

    const txnId = createRes.body.data.transaction.transactionId;

    // Try invalid transition
    await expect(
      transactionService.updateStatus(txnId, TransactionStatus.COMPLETED)
    ).rejects.toThrow('Invalid state transition');
  });

  it('should not allow transitions from terminal states', async () => {
    const { transactionService } =
      await import('../../src/services/transaction/transaction.service');
    const sender = await createTestUser(app, { email: 'sender@test.com' });
    const receiver = await createTestUser(app, { email: 'receiver@test.com' });

    // Fund sender
    await request(app)
      .post('/wallets/me/deposit')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ amount: 1000 });

    // Create and complete transaction manually
    const createRes = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({ receiverId: receiver.user.userId, amount: 100 });

    const txnId = createRes.body.data.transaction.transactionId;

    // Move to terminal state: INITIATED -> FAILED
    await transactionService.updateStatus(txnId, TransactionStatus.FAILED);

    // Try to transition from FAILED
    await expect(transactionService.updateStatus(txnId, TransactionStatus.DEBITED)).rejects.toThrow(
      'Invalid state transition'
    );
  });
});
