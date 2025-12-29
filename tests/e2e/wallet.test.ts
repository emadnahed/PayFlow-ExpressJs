import request from 'supertest';
import mongoose from 'mongoose';
import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { WalletOperation } from '../../src/models/WalletOperation';
import { createTestUser, getAuthToken } from '../helpers/testAuth';

const app = getTestApp();

describe('Wallet Endpoints', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WalletOperation.deleteMany({});
  });

  describe('GET /wallets/me', () => {
    it('should return user wallet with zero balance', async () => {
      const { accessToken, user } = await createTestUser(app);

      const response = await request(app)
        .get('/wallets/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.wallet).toHaveProperty('walletId');
      expect(response.body.data.wallet.userId).toBe(user.userId);
      expect(response.body.data.wallet.balance).toBe(0);
      expect(response.body.data.wallet.currency).toBe('INR');
      expect(response.body.data.wallet.isActive).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app).get('/wallets/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/wallets/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /wallets/me/deposit', () => {
    it('should deposit funds to wallet', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.newBalance).toBe(1000);
      expect(response.body.data.operationId).toBeDefined();
    });

    it('should allow multiple deposits', async () => {
      const { accessToken } = await createTestUser(app);

      // First deposit
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500 });

      // Second deposit
      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 300 });

      expect(response.status).toBe(200);
      expect(response.body.data.newBalance).toBe(800);
    });

    it('should reject deposit with zero amount', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 0 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject deposit with negative amount', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: -100 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject deposit with missing amount', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept decimal amounts with up to 2 decimal places', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 100.50 });

      expect(response.status).toBe(200);
      expect(response.body.data.newBalance).toBe(100.50);
    });

    it('should reject deposit without authentication', async () => {
      const response = await request(app)
        .post('/wallets/me/deposit')
        .send({ amount: 1000 });

      expect(response.status).toBe(401);
    });

    it('should support idempotent deposits with idempotencyKey', async () => {
      const { accessToken } = await createTestUser(app);
      const idempotencyKey = 'test-deposit-key-123';

      // First deposit with idempotency key
      const response1 = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500, idempotencyKey });

      expect(response1.status).toBe(200);
      expect(response1.body.data.newBalance).toBe(500);
      expect(response1.body.data.idempotent).toBe(false);

      // Second deposit with same idempotency key (should be idempotent)
      const response2 = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500, idempotencyKey });

      expect(response2.status).toBe(200);
      expect(response2.body.data.newBalance).toBe(500);
      expect(response2.body.data.idempotent).toBe(true);
      expect(response2.body.data.message).toBe('Deposit already processed');

      // Verify final balance is 500 (not 1000)
      const walletResponse = await request(app)
        .get('/wallets/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(walletResponse.body.data.wallet.balance).toBe(500);
    });

    it('should allow different deposits with different idempotencyKeys', async () => {
      const { accessToken } = await createTestUser(app);

      // First deposit
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500, idempotencyKey: 'key-1' });

      // Second deposit with different key
      const response = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 300, idempotencyKey: 'key-2' });

      expect(response.status).toBe(200);
      expect(response.body.data.newBalance).toBe(800);
      expect(response.body.data.idempotent).toBe(false);
    });
  });

  describe('GET /wallets/:id/balance', () => {
    it('should return wallet balance', async () => {
      const { accessToken, user } = await createTestUser(app);

      // Get wallet ID first
      const walletResponse = await request(app)
        .get('/wallets/me')
        .set('Authorization', `Bearer ${accessToken}`);

      const walletId = walletResponse.body.data.wallet.walletId;

      // Deposit some funds
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 500 });

      // Get balance by ID
      const response = await request(app)
        .get(`/wallets/${walletId}/balance`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.balance).toBe(500);
      expect(response.body.data.walletId).toBe(walletId);
    });

    it('should reject access to other user wallet', async () => {
      const { accessToken: token1 } = await createTestUser(app, {
        email: 'user1@test.com',
        name: 'User 1',
      });
      const { accessToken: token2 } = await createTestUser(app, {
        email: 'user2@test.com',
        name: 'User 2',
      });

      // Get user1's wallet ID
      const walletResponse = await request(app)
        .get('/wallets/me')
        .set('Authorization', `Bearer ${token1}`);

      const walletId = walletResponse.body.data.wallet.walletId;

      // Try to access user1's wallet with user2's token
      const response = await request(app)
        .get(`/wallets/${walletId}/balance`)
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent wallet', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .get('/wallets/wallet_nonexistent123/balance')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /wallets/me/history', () => {
    it('should return empty history for new wallet', async () => {
      const { accessToken } = await createTestUser(app);

      const response = await request(app)
        .get('/wallets/me/history')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.operations).toHaveLength(0);
    });

    it('should return deposit history', async () => {
      const { accessToken } = await createTestUser(app);

      // Make deposits
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 100 });

      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 200 });

      const response = await request(app)
        .get('/wallets/me/history')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.operations).toHaveLength(2);
      expect(response.body.data.operations[0].type).toBe('DEPOSIT');
      expect(response.body.data.operations[0].amount).toBe(200);
      expect(response.body.data.operations[1].type).toBe('DEPOSIT');
      expect(response.body.data.operations[1].amount).toBe(100);
    });

    it('should respect limit parameter', async () => {
      const { accessToken } = await createTestUser(app);

      // Make 5 deposits
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/wallets/me/deposit')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ amount: 100 });
      }

      const response = await request(app)
        .get('/wallets/me/history?limit=3')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.operations).toHaveLength(3);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent deposits correctly', async () => {
      const { accessToken } = await createTestUser(app);

      // Make 5 concurrent deposits
      const deposits = Array(5).fill(null).map(() =>
        request(app)
          .post('/wallets/me/deposit')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ amount: 100 })
      );

      const results = await Promise.all(deposits);

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      // Final balance should be 500
      const walletResponse = await request(app)
        .get('/wallets/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(walletResponse.body.data.wallet.balance).toBe(500);
    });
  });
});

describe('Wallet Service Operations', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WalletOperation.deleteMany({});
  });

  describe('Debit Operation', () => {
    it('should debit wallet successfully', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { accessToken, user } = await createTestUser(app);

      // Deposit funds first
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000 });

      // Perform debit via service
      const result = await walletService.debit(user.userId, 300, 'txn_test123');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(700);
      expect(result.idempotent).toBe(false);
      expect(result.type).toBe('DEBIT');
    });

    it('should return idempotent result for duplicate debit', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { accessToken, user } = await createTestUser(app);

      // Deposit funds
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000 });

      const txnId = 'txn_idempotent123';

      // First debit
      const result1 = await walletService.debit(user.userId, 300, txnId);
      expect(result1.idempotent).toBe(false);
      expect(result1.newBalance).toBe(700);

      // Second debit with same txnId (should be idempotent)
      const result2 = await walletService.debit(user.userId, 300, txnId);
      expect(result2.idempotent).toBe(true);
      expect(result2.newBalance).toBe(700);

      // Balance should still be 700
      const wallet = await walletService.getWallet(user.userId);
      expect(wallet.balance).toBe(700);
    });

    it('should reject debit with insufficient balance', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { accessToken, user } = await createTestUser(app);

      // Deposit only 100
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 100 });

      // Try to debit 500
      await expect(
        walletService.debit(user.userId, 500, 'txn_insufficient')
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('Credit Operation', () => {
    it('should credit wallet successfully', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { user } = await createTestUser(app);

      // Credit via service
      const result = await walletService.credit(user.userId, 500, 'txn_credit123');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(500);
      expect(result.idempotent).toBe(false);
      expect(result.type).toBe('CREDIT');
    });

    it('should return idempotent result for duplicate credit', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { user } = await createTestUser(app);

      const txnId = 'txn_credit_idempotent';

      // First credit
      const result1 = await walletService.credit(user.userId, 500, txnId);
      expect(result1.idempotent).toBe(false);

      // Second credit with same txnId
      const result2 = await walletService.credit(user.userId, 500, txnId);
      expect(result2.idempotent).toBe(true);
      expect(result2.newBalance).toBe(500);

      // Balance should be 500 (not 1000)
      const wallet = await walletService.getWallet(user.userId);
      expect(wallet.balance).toBe(500);
    });
  });

  describe('Refund Operation', () => {
    it('should refund wallet successfully', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { accessToken, user } = await createTestUser(app);

      // Deposit and then debit
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000 });

      await walletService.debit(user.userId, 300, 'txn_refund_test');

      // Refund
      const result = await walletService.refund(user.userId, 300, 'txn_refund_test');

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1000);
      expect(result.type).toBe('REFUND');
    });

    it('should return idempotent result for duplicate refund', async () => {
      const { walletService } = await import('../../src/services/wallet/wallet.service');
      const { accessToken, user } = await createTestUser(app);

      // Deposit and debit
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ amount: 1000 });

      await walletService.debit(user.userId, 300, 'txn_refund_idempotent');

      const txnId = 'txn_refund_idempotent';

      // First refund
      const result1 = await walletService.refund(user.userId, 300, txnId);
      expect(result1.idempotent).toBe(false);

      // Second refund with same txnId
      const result2 = await walletService.refund(user.userId, 300, txnId);
      expect(result2.idempotent).toBe(true);

      // Balance should be 1000 (not 1300)
      const wallet = await walletService.getWallet(user.userId);
      expect(wallet.balance).toBe(1000);
    });
  });
});
