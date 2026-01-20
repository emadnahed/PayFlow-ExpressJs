import request from 'supertest';
import { Application } from 'express';

import { createTestApp, closeTestApp } from '../helpers/testApp';
import { connectTestDB, closeTestDB, clearTestDB } from '../helpers/testDatabase';
import { createTestUser, TestUserResult } from '../helpers/testAuth';
import { connectTestEventBus, closeTestEventBus } from '../helpers/testEventBus';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';

describe('Chaos Testing: Credit Failure Scenarios', () => {
  let app: Application;
  let sender: TestUserResult;
  let receiver: TestUserResult;

  beforeAll(async () => {
    await connectTestDB();
    await connectTestEventBus();
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestEventBus();
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

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

  describe('Random Failure Rate Testing', () => {
    it('should properly compensate when credit fails with 50% failure rate', async () => {
      // Enable 50% failure rate
      await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 0.5,
          failureType: 'ERROR',
        });

      const transactionCount = 20;
      const amount = 100;

      // Execute multiple transactions
      const results = await Promise.allSettled(
        Array(transactionCount)
          .fill(null)
          .map(() =>
            request(app)
              .post('/transactions')
              .set('Authorization', `Bearer ${sender.accessToken}`)
              .send({
                receiverId: receiver.user.userId,
                amount,
                description: 'Chaos test transaction',
              })
          )
      );

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Analyze results
      const completed = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201
      ).length;
      const failed = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status !== 201
      ).length;

      console.log(`Completed: ${completed}, Failed: ${failed}`);

      // Verify wallet balances are consistent
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });

      const successfulTransactions = await Transaction.find({
        senderId: sender.user.userId,
        status: 'COMPLETED',
      });

      // Total transferred should equal receiver balance
      const totalTransferred = successfulTransactions.length * amount;
      expect(receiverWallet?.balance).toBe(totalTransferred);

      // Sender should have original balance minus successful transfers
      expect(senderWallet?.balance).toBe(10000 - totalTransferred);

      // No money should be lost - sum of all wallets should equal initial total
      const totalInSystem = (senderWallet?.balance || 0) + (receiverWallet?.balance || 0);
      expect(totalInSystem).toBe(10000);

      // Disable simulation
      await request(app)
        .delete('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);
    });

    it('should handle 100% failure rate with complete compensation', async () => {
      // Enable 100% failure rate
      await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 1.0,
          failureType: 'ERROR',
        });

      const transactionCount = 5;
      const amount = 100;
      const initialBalance = 10000;

      // Execute transactions
      await Promise.all(
        Array(transactionCount)
          .fill(null)
          .map(() =>
            request(app)
              .post('/transactions')
              .set('Authorization', `Bearer ${sender.accessToken}`)
              .send({
                receiverId: receiver.user.userId,
                amount,
                description: 'Should fail and compensate',
              })
          )
      );

      // Wait for compensation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // All transactions should have failed
      const failedTransactions = await Transaction.find({
        senderId: sender.user.userId,
        status: 'FAILED',
      });
      expect(failedTransactions.length).toBe(transactionCount);

      // Sender balance should be fully restored
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      expect(senderWallet?.balance).toBe(initialBalance);

      // Receiver should have received nothing
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });
      expect(receiverWallet?.balance).toBe(0);

      // Disable simulation
      await request(app)
        .delete('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);
    });
  });

  describe('Specific Transaction Failure', () => {
    it('should fail only targeted transaction while others succeed', async () => {
      // First, create a transaction to get its ID
      const response1 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'First transaction - should succeed',
        });

      expect(response1.status).toBe(201);

      // Now the simulation would need the transaction ID before creation
      // For this test, we verify compensation works when enabled mid-stream

      // Enable failure for next transaction
      await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 1.0,
          failureType: 'ERROR',
        });

      // This transaction should fail
      await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Second transaction - should fail',
        });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Disable simulation
      await request(app)
        .delete('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      // Third transaction should succeed
      const response3 = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100,
          description: 'Third transaction - should succeed',
        });

      expect(response3.status).toBe(201);

      // Wait for all processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify final state
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });

      // Two successful transactions of 100 each
      const completedCount = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: 'COMPLETED',
      });
      expect(completedCount).toBe(2);

      // Verify balances
      expect(receiverWallet?.balance).toBe(200); // 2 * 100
      expect(senderWallet?.balance).toBe(10000 - 200); // Initial - successful transfers
    });
  });

  describe('Recovery Verification', () => {
    it('should verify no orphaned debits after failures', async () => {
      // Enable failures
      await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 0.7,
          failureType: 'ERROR',
        });

      // Create many transactions
      await Promise.all(
        Array(10)
          .fill(null)
          .map(() =>
            request(app)
              .post('/transactions')
              .set('Authorization', `Bearer ${sender.accessToken}`)
              .send({
                receiverId: receiver.user.userId,
                amount: 100,
                description: 'Recovery test',
              })
          )
      );

      // Wait for all compensations
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Disable simulation
      await request(app)
        .delete('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

      // Check for orphaned states
      const debitedButNotCompleted = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: 'DEBITED', // This state should not persist
      });

      expect(debitedButNotCompleted).toBe(0);

      // All transactions should be either COMPLETED or FAILED
      const finalStates = await Transaction.find({ senderId: sender.user.userId });
      finalStates.forEach((tx) => {
        expect(['COMPLETED', 'FAILED']).toContain(tx.status);
      });

      // Verify money conservation
      const senderWallet = await Wallet.findOne({ userId: sender.user.userId });
      const receiverWallet = await Wallet.findOne({ userId: receiver.user.userId });
      const completedTransactions = await Transaction.countDocuments({
        senderId: sender.user.userId,
        status: 'COMPLETED',
      });

      expect(senderWallet?.balance).toBe(10000 - completedTransactions * 100);
      expect(receiverWallet?.balance).toBe(completedTransactions * 100);
    });
  });

  describe('Concurrent Failure Handling', () => {
    it('should handle concurrent failures without race conditions', async () => {
      // Create multiple receivers
      const receivers: TestUserResult[] = [];
      for (let i = 0; i < 5; i++) {
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
      await request(app)
        .post('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          enabled: true,
          failureRate: 0.3,
          failureType: 'ERROR',
        });

      // Send concurrent transactions to different receivers
      const transactions = receivers.flatMap((rec) =>
        Array(4)
          .fill(null)
          .map(() =>
            request(app)
              .post('/transactions')
              .set('Authorization', `Bearer ${sender.accessToken}`)
              .send({
                receiverId: rec.user.userId,
                amount: 50,
                description: 'Concurrent test',
              })
          )
      );

      await Promise.allSettled(transactions);

      // Wait for all processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Disable simulation
      await request(app)
        .delete('/ledger/simulation')
        .set('Authorization', `Bearer ${sender.accessToken}`);

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
        status: 'COMPLETED',
      });
      expect(totalReceived).toBe(completedCount * 50);
    });
  });
});
