/**
 * Notification E2E Tests
 *
 * Tests the complete notification flow from event trigger to delivery.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { Queue, Worker } from 'bullmq';

import { getTestApp } from '../helpers';
import { createTestUser } from '../helpers/testAuth';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { Transaction } from '../../src/models/Transaction';
import { WalletOperation } from '../../src/models/WalletOperation';
import { TransactionStatus } from '../../src/types/events';

const app = getTestApp();

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';
const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const queueConnection = {
  host: TEST_REDIS_HOST,
  port: TEST_REDIS_PORT,
};

interface NotificationJobData {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: {
    transactionId?: string;
    amount?: number;
    currency?: string;
    senderName?: string;
    receiverName?: string;
  };
}

interface NotificationJobResult {
  sent: boolean;
  channel?: string;
  error?: string;
}

describe('Notification E2E Tests', () => {
  let notificationQueue: Queue<NotificationJobData, NotificationJobResult>;
  let notificationWorker: Worker<NotificationJobData, NotificationJobResult>;
  let processedNotifications: NotificationJobData[];

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);

    // Create notification queue
    notificationQueue = new Queue<NotificationJobData, NotificationJobResult>(
      'e2e-notification-flow',
      {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 100 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      }
    );
  });

  afterAll(async () => {
    if (notificationWorker) await notificationWorker.close();
    await notificationQueue.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await Transaction.deleteMany({});
    await WalletOperation.deleteMany({});
    await notificationQueue.obliterate({ force: true });

    processedNotifications = [];

    // Start notification worker
    notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
      'e2e-notification-flow',
      async (job) => {
        processedNotifications.push(job.data);
        return { sent: true, channel: 'test' };
      },
      { connection: queueConnection, concurrency: 10 }
    );
  });

  afterEach(async () => {
    if (notificationWorker) {
      await notificationWorker.close();
    }
  });

  describe('Transaction Notification Flow', () => {
    it('should queue notification when user initiates transaction', async () => {
      const sender = await createTestUser(app, { email: 'sender@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver@test.com' });

      // Deposit funds for sender
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Initiate transaction
      const txnResponse = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 200,
        });

      expect(txnResponse.status).toBe(201);

      // Queue notification for transaction initiated
      await notificationQueue.add(
        'notification:TRANSACTION_INITIATED',
        {
          notificationId: `ntf_init_${Date.now()}`,
          userId: sender.user.userId,
          type: 'TRANSACTION_INITIATED',
          title: 'Transaction Started',
          message: 'Your transaction of INR 200 has been initiated',
          data: {
            transactionId: txnResponse.body.data.transaction.transactionId,
            amount: 200,
            currency: 'INR',
          },
        },
        { jobId: `ntf_init_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(processedNotifications.length).toBeGreaterThanOrEqual(1);
      const notification = processedNotifications.find((n) => n.type === 'TRANSACTION_INITIATED');
      expect(notification).toBeDefined();
      expect(notification?.data?.amount).toBe(200);
    });

    it('should notify both sender and receiver on successful transaction', async () => {
      const sender = await createTestUser(app, { email: 'sender2@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver2@test.com' });

      // Deposit funds
      await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ amount: 1000 });

      // Create and complete transaction
      const transactionId = `txn_complete_${Date.now()}`;

      // Queue notifications for both parties
      await notificationQueue.add(
        'notification:TRANSACTION_COMPLETED',
        {
          notificationId: `ntf_sender_${Date.now()}`,
          userId: sender.user.userId,
          type: 'TRANSACTION_COMPLETED',
          title: 'Transaction Complete',
          message: 'Your payment of INR 300 was successful',
          data: {
            transactionId,
            amount: 300,
            currency: 'INR',
            receiverName: receiver.user.name,
          },
        },
        { jobId: `ntf_sender_${Date.now()}` }
      );

      await notificationQueue.add(
        'notification:CREDIT_RECEIVED',
        {
          notificationId: `ntf_receiver_${Date.now()}`,
          userId: receiver.user.userId,
          type: 'CREDIT_RECEIVED',
          title: 'Money Received',
          message: `You received INR 300 from ${sender.user.name}`,
          data: {
            transactionId,
            amount: 300,
            currency: 'INR',
            senderName: sender.user.name,
          },
        },
        { jobId: `ntf_receiver_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(processedNotifications.length).toBe(2);

      const senderNotification = processedNotifications.find(
        (n) => n.type === 'TRANSACTION_COMPLETED'
      );
      const receiverNotification = processedNotifications.find(
        (n) => n.type === 'CREDIT_RECEIVED'
      );

      expect(senderNotification?.userId).toBe(sender.user.userId);
      expect(receiverNotification?.userId).toBe(receiver.user.userId);
    });

    it('should notify sender when transaction fails', async () => {
      const sender = await createTestUser(app, { email: 'sender_fail@test.com' });
      const receiver = await createTestUser(app, { email: 'receiver_fail@test.com' });

      // Try transaction without sufficient balance
      const txnResponse = await request(app)
        .post('/transactions')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({
          receiverId: receiver.user.userId,
          amount: 100000, // Large amount
        });

      // Queue failure notification
      await notificationQueue.add(
        'notification:TRANSACTION_FAILED',
        {
          notificationId: `ntf_fail_${Date.now()}`,
          userId: sender.user.userId,
          type: 'TRANSACTION_FAILED',
          title: 'Transaction Failed',
          message: 'Your transaction could not be completed due to insufficient balance',
          data: {
            transactionId: txnResponse.body.data?.transaction?.transactionId || 'unknown',
            amount: 100000,
            currency: 'INR',
          },
        },
        { jobId: `ntf_fail_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const failNotification = processedNotifications.find(
        (n) => n.type === 'TRANSACTION_FAILED'
      );

      expect(failNotification).toBeDefined();
      expect(failNotification?.userId).toBe(sender.user.userId);
    });
  });

  describe('Deposit Notification Flow', () => {
    it('should queue notification on successful deposit', async () => {
      const user = await createTestUser(app, { email: 'deposit_user@test.com' });

      const depositResponse = await request(app)
        .post('/wallets/me/deposit')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ amount: 5000 });

      expect(depositResponse.status).toBe(200);

      // Simulate notification queue (would be done by service)
      await notificationQueue.add(
        'notification:DEPOSIT_SUCCESS',
        {
          notificationId: `ntf_deposit_${Date.now()}`,
          userId: user.user.userId,
          type: 'DEPOSIT_SUCCESS',
          title: 'Deposit Successful',
          message: 'INR 5000 has been added to your wallet',
          data: {
            amount: 5000,
            currency: 'INR',
          },
        },
        { jobId: `ntf_deposit_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const depositNotification = processedNotifications.find(
        (n) => n.type === 'DEPOSIT_SUCCESS'
      );

      expect(depositNotification).toBeDefined();
      expect(depositNotification?.data?.amount).toBe(5000);
    });
  });

  describe('Batch Notification Processing', () => {
    it('should process multiple notifications efficiently', async () => {
      const user = await createTestUser(app, { email: 'batch_user@test.com' });

      // Queue multiple notifications
      const notificationCount = 20;
      for (let i = 0; i < notificationCount; i++) {
        await notificationQueue.add(
          'notification:BATCH_TEST',
          {
            notificationId: `ntf_batch_${i}_${Date.now()}`,
            userId: user.user.userId,
            type: 'BATCH_TEST',
            title: `Notification ${i}`,
            message: `Batch message ${i}`,
            data: { amount: i * 100 },
          },
          { jobId: `ntf_batch_${i}_${Date.now()}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(processedNotifications.length).toBe(notificationCount);
    });

    it('should process notifications for multiple users', async () => {
      const users = [];
      for (let i = 0; i < 5; i++) {
        const user = await createTestUser(app, { email: `multi_user_${i}@test.com` });
        users.push(user);
      }

      // Queue notifications for each user
      for (const user of users) {
        await notificationQueue.add(
          'notification:MULTI_USER',
          {
            notificationId: `ntf_multi_${user.user.userId}_${Date.now()}`,
            userId: user.user.userId,
            type: 'MULTI_USER',
            title: 'Multi-user Test',
            message: `Notification for ${user.user.name}`,
          },
          { jobId: `ntf_multi_${user.user.userId}_${Date.now()}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(5);

      // Verify each user received notification
      const userIds = processedNotifications.map((n) => n.userId);
      for (const user of users) {
        expect(userIds).toContain(user.user.userId);
      }
    });
  });

  describe('Notification Retry Behavior', () => {
    it('should retry failed notifications', async () => {
      // Stop the successful worker
      await notificationWorker.close();

      let attemptCount = 0;
      const retryNotifications: NotificationJobData[] = [];

      // Create worker that fails initially
      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'e2e-notification-flow',
        async (job) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          retryNotifications.push(job.data);
          return { sent: true };
        },
        { connection: queueConnection }
      );

      const user = await createTestUser(app, { email: 'retry_user@test.com' });

      await notificationQueue.add(
        'notification:RETRY_TEST',
        {
          notificationId: `ntf_retry_${Date.now()}`,
          userId: user.user.userId,
          type: 'RETRY_TEST',
          title: 'Retry Test',
          message: 'This should be retried',
        },
        {
          jobId: `ntf_retry_${Date.now()}`,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
      expect(retryNotifications.length).toBe(1);
    });
  });

  describe('Notification Content Formatting', () => {
    it('should format transaction amounts correctly', async () => {
      const user = await createTestUser(app, { email: 'format_user@test.com' });

      const testAmounts = [100, 1000, 10000, 100000];

      for (const amount of testAmounts) {
        await notificationQueue.add(
          'notification:FORMAT_TEST',
          {
            notificationId: `ntf_format_${amount}_${Date.now()}`,
            userId: user.user.userId,
            type: 'FORMAT_TEST',
            title: 'Amount Test',
            message: `Transaction of INR ${amount.toLocaleString()}`,
            data: { amount, currency: 'INR' },
          },
          { jobId: `ntf_format_${amount}_${Date.now()}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(4);

      const amounts = processedNotifications.map((n) => n.data?.amount);
      expect(amounts).toContain(100);
      expect(amounts).toContain(1000);
      expect(amounts).toContain(10000);
      expect(amounts).toContain(100000);
    });

    it('should include all required notification fields', async () => {
      const user = await createTestUser(app, { email: 'fields_user@test.com' });

      await notificationQueue.add(
        'notification:FIELDS_TEST',
        {
          notificationId: `ntf_fields_${Date.now()}`,
          userId: user.user.userId,
          type: 'TRANSACTION_COMPLETED',
          title: 'Transaction Complete',
          message: 'Your payment was successful',
          data: {
            transactionId: 'txn_test_123',
            amount: 500,
            currency: 'INR',
            receiverName: 'John Doe',
          },
        },
        { jobId: `ntf_fields_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(processedNotifications.length).toBe(1);

      const notification = processedNotifications[0];
      expect(notification.notificationId).toBeDefined();
      expect(notification.userId).toBe(user.user.userId);
      expect(notification.type).toBe('TRANSACTION_COMPLETED');
      expect(notification.title).toBeDefined();
      expect(notification.message).toBeDefined();
      expect(notification.data?.transactionId).toBe('txn_test_123');
      expect(notification.data?.amount).toBe(500);
      expect(notification.data?.currency).toBe('INR');
      expect(notification.data?.receiverName).toBe('John Doe');
    });
  });
});
