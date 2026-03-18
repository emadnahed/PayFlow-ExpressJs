/**
 * Workers E2E Tests
 *
 * Tests the complete worker lifecycle including job processing,
 * retries, and integration with the rest of the system.
 */
import mongoose from 'mongoose';
import { Queue, Worker, Job } from 'bullmq';

import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { WebhookSubscription } from '../../src/models/WebhookSubscription';
import { WebhookDelivery } from '../../src/models/WebhookDelivery';
import { EventType, TransactionStatus } from '../../src/types/events';
import { Transaction } from '../../src/models/Transaction';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';
const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const queueConnection = {
  host: TEST_REDIS_HOST,
  port: TEST_REDIS_PORT,
};

describe('Workers E2E Tests', () => {
  let testUserId: string;
  let testUser2Id: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WebhookSubscription.deleteMany({});
    await WebhookDelivery.deleteMany({});
    await Transaction.deleteMany({});

    // Create test users
    const timestamp = Date.now();

    const user1 = await User.create({
      userId: `user_test_${timestamp}`,
      name: 'Test User 1',
      email: `test1_${timestamp}@example.com`,
      password: 'hashedpassword',
    });
    testUserId = user1.userId;

    await Wallet.create({
      walletId: `wallet_test_${timestamp}`,
      userId: testUserId,
      balance: 5000,
      currency: 'INR',
    });

    const user2 = await User.create({
      userId: `user_test2_${timestamp}`,
      name: 'Test User 2',
      email: `test2_${timestamp}@example.com`,
      password: 'hashedpassword',
    });
    testUser2Id = user2.userId;

    await Wallet.create({
      walletId: `wallet_test2_${timestamp}`,
      userId: testUser2Id,
      balance: 2000,
      currency: 'INR',
    });
  });

  describe('Notification Worker E2E', () => {
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
      };
    }

    interface NotificationJobResult {
      sent: boolean;
      channel?: string;
      error?: string;
    }

    let notificationQueue: Queue<NotificationJobData, NotificationJobResult>;
    let notificationWorker: Worker<NotificationJobData, NotificationJobResult>;

    beforeEach(async () => {
      notificationQueue = new Queue<NotificationJobData, NotificationJobResult>(
        'e2e-notifications',
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
      await notificationQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (notificationWorker) await notificationWorker.close();
      await notificationQueue.close();
    });

    it('should process notification when transaction completes', async () => {
      const processedNotifications: NotificationJobData[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'e2e-notifications',
        async (job) => {
          processedNotifications.push(job.data);
          return { sent: true, channel: 'push' };
        },
        { connection: queueConnection, concurrency: 5 }
      );

      // Simulate transaction completion
      const transactionId = `txn_e2e_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: testUserId,
        receiverId: testUser2Id,
        amount: 500,
        currency: 'INR',
        status: TransactionStatus.COMPLETED,
        initiatedAt: new Date(),
        completedAt: new Date(),
      });

      // Queue notification (simulating what the service does)
      await notificationQueue.add(
        'notification:TRANSACTION_COMPLETED',
        {
          notificationId: `ntf_${Date.now()}`,
          userId: testUserId,
          type: 'TRANSACTION_COMPLETED',
          title: 'Transaction Complete',
          message: 'Your payment of INR 500 was successful',
          data: { transactionId, amount: 500, currency: 'INR' },
        },
        { jobId: `ntf_${Date.now()}` }
      );

      // Queue notification for receiver
      await notificationQueue.add(
        'notification:CREDIT_RECEIVED',
        {
          notificationId: `ntf_${Date.now()}_recv`,
          userId: testUser2Id,
          type: 'CREDIT_RECEIVED',
          title: 'Money Received',
          message: 'You received INR 500 from Test User 1',
          data: { transactionId, amount: 500, currency: 'INR' },
        },
        { jobId: `ntf_${Date.now()}_recv` }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(2);

      const senderNotification = processedNotifications.find(
        (n) => n.type === 'TRANSACTION_COMPLETED'
      );
      const receiverNotification = processedNotifications.find(
        (n) => n.type === 'CREDIT_RECEIVED'
      );

      expect(senderNotification?.userId).toBe(testUserId);
      expect(receiverNotification?.userId).toBe(testUser2Id);
    });

    it('should process notification when transaction fails', async () => {
      const processedNotifications: NotificationJobData[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'e2e-notifications',
        async (job) => {
          processedNotifications.push(job.data);
          return { sent: true, channel: 'push' };
        },
        { connection: queueConnection }
      );

      // Simulate failed transaction
      const transactionId = `txn_e2e_fail_${Date.now()}`;
      await Transaction.create({
        transactionId,
        senderId: testUserId,
        receiverId: testUser2Id,
        amount: 100000, // Amount greater than balance
        currency: 'INR',
        status: TransactionStatus.FAILED,
        failureReason: 'Insufficient balance',
        initiatedAt: new Date(),
      });

      await notificationQueue.add(
        'notification:TRANSACTION_FAILED',
        {
          notificationId: `ntf_fail_${Date.now()}`,
          userId: testUserId,
          type: 'TRANSACTION_FAILED',
          title: 'Transaction Failed',
          message: 'Your payment could not be completed',
          data: { transactionId, amount: 100000, currency: 'INR' },
        },
        { jobId: `ntf_fail_${Date.now()}` }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(1);
      expect(processedNotifications[0].type).toBe('TRANSACTION_FAILED');
    });

    it('should retry failed notifications', async () => {
      let attemptCount = 0;

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'e2e-notifications',
        async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Notification service temporarily unavailable');
          }
          return { sent: true, channel: 'push' };
        },
        { connection: queueConnection }
      );

      await notificationQueue.add(
        'notification:TEST',
        {
          notificationId: `ntf_retry_${Date.now()}`,
          userId: testUserId,
          type: 'TRANSACTION_COMPLETED',
          title: 'Test',
          message: 'Test message',
        },
        {
          jobId: `ntf_retry_${Date.now()}`,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
    });

    it('should process notifications in order per user', async () => {
      const processedOrder: string[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'e2e-notifications',
        async (job) => {
          processedOrder.push(job.data.notificationId);
          return { sent: true };
        },
        { connection: queueConnection, concurrency: 1 } // Single concurrency to maintain order
      );

      // Add notifications in order
      for (let i = 0; i < 5; i++) {
        await notificationQueue.add(
          'notification:TEST',
          {
            notificationId: `ntf_order_${i}`,
            userId: testUserId,
            type: 'TRANSACTION_COMPLETED',
            title: `Notification ${i}`,
            message: `Message ${i}`,
          },
          { jobId: `ntf_order_${i}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(processedOrder).toEqual([
        'ntf_order_0',
        'ntf_order_1',
        'ntf_order_2',
        'ntf_order_3',
        'ntf_order_4',
      ]);
    });
  });

  describe('Webhook Worker E2E', () => {
    interface WebhookJobData {
      webhookId: string;
      deliveryId: string;
      transactionId: string;
      eventType: string;
      payload: object;
    }

    interface WebhookJobResult {
      success: boolean;
      statusCode?: number;
      error?: string;
    }

    let webhookQueue: Queue<WebhookJobData, WebhookJobResult>;
    let webhookWorker: Worker<WebhookJobData, WebhookJobResult>;

    beforeEach(async () => {
      webhookQueue = new Queue<WebhookJobData, WebhookJobResult>('e2e-webhooks', {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 100 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      });
      await webhookQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (webhookWorker) await webhookWorker.close();
      await webhookQueue.close();
    });

    it('should deliver webhook when transaction completes', async () => {
      const deliveredWebhooks: WebhookJobData[] = [];

      // Create webhook subscription
      const subscription = await WebhookSubscription.create({
        webhookId: `whk_e2e_${Date.now()}`,
        userId: testUserId,
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
        secret: 'test-secret',
        isActive: true,
      });

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'e2e-webhooks',
        async (job) => {
          deliveredWebhooks.push(job.data);
          // Simulate successful delivery
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      // Simulate webhook delivery job
      const transactionId = `txn_webhook_${Date.now()}`;
      const deliveryId = `dlv_${Date.now()}`;

      await WebhookDelivery.create({
        deliveryId,
        webhookId: subscription.webhookId,
        transactionId,
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: { event: EventType.TRANSACTION_COMPLETED, amount: 500 },
        status: 'PENDING',
      });

      await webhookQueue.add(
        `webhook:${EventType.TRANSACTION_COMPLETED}`,
        {
          webhookId: subscription.webhookId,
          deliveryId,
          transactionId,
          eventType: EventType.TRANSACTION_COMPLETED,
          payload: {
            event: EventType.TRANSACTION_COMPLETED,
            transactionId,
            status: 'COMPLETED',
            amount: 500,
            currency: 'INR',
            timestamp: new Date().toISOString(),
          },
        },
        { jobId: deliveryId }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(deliveredWebhooks.length).toBe(1);
      expect(deliveredWebhooks[0].eventType).toBe(EventType.TRANSACTION_COMPLETED);
    });

    it('should retry failed webhook deliveries', async () => {
      let attemptCount = 0;
      const deliveryId = `dlv_retry_${Date.now()}`;

      await WebhookSubscription.create({
        webhookId: 'whk_retry',
        userId: testUserId,
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_FAILED],
        secret: 'test-secret',
        isActive: true,
      });

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'e2e-webhooks',
        async (job) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Connection timeout');
          }
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      await WebhookDelivery.create({
        deliveryId,
        webhookId: 'whk_retry',
        transactionId: 'txn_retry',
        eventType: EventType.TRANSACTION_FAILED,
        payload: {},
        status: 'PENDING',
      });

      await webhookQueue.add(
        `webhook:${EventType.TRANSACTION_FAILED}`,
        {
          webhookId: 'whk_retry',
          deliveryId,
          transactionId: 'txn_retry',
          eventType: EventType.TRANSACTION_FAILED,
          payload: { event: EventType.TRANSACTION_FAILED },
        },
        {
          jobId: deliveryId,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
    });

    it('should deliver webhooks to multiple subscribers', async () => {
      const deliveries: string[] = [];

      // Create multiple webhook subscriptions
      await WebhookSubscription.create({
        webhookId: 'whk_multi_1',
        userId: testUserId,
        url: 'https://example.com/webhook1',
        events: [EventType.TRANSACTION_COMPLETED],
        secret: 'secret1',
        isActive: true,
      });

      await WebhookSubscription.create({
        webhookId: 'whk_multi_2',
        userId: testUserId,
        url: 'https://example.com/webhook2',
        events: [EventType.TRANSACTION_COMPLETED],
        secret: 'secret2',
        isActive: true,
      });

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'e2e-webhooks',
        async (job) => {
          deliveries.push(job.data.webhookId);
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection, concurrency: 5 }
      );

      const transactionId = `txn_multi_${Date.now()}`;

      // Queue deliveries for both subscriptions
      for (let i = 1; i <= 2; i++) {
        const deliveryId = `dlv_multi_${i}_${Date.now()}`;
        await webhookQueue.add(
          `webhook:${EventType.TRANSACTION_COMPLETED}`,
          {
            webhookId: `whk_multi_${i}`,
            deliveryId,
            transactionId,
            eventType: EventType.TRANSACTION_COMPLETED,
            payload: { event: EventType.TRANSACTION_COMPLETED, amount: 100 },
          },
          { jobId: deliveryId }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(deliveries.length).toBe(2);
      expect(deliveries).toContain('whk_multi_1');
      expect(deliveries).toContain('whk_multi_2');
    });

    it('should track delivery attempts in delivery record', async () => {
      const deliveryId = `dlv_track_${Date.now()}`;
      let attemptCount = 0;

      await WebhookSubscription.create({
        webhookId: 'whk_track',
        userId: testUserId,
        url: 'https://example.com/webhook',
        events: [EventType.DEBIT_SUCCESS],
        secret: 'secret',
        isActive: true,
      });

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'e2e-webhooks',
        async (job) => {
          attemptCount = job.attemptsMade + 1;

          // Update delivery record with attempt count
          await WebhookDelivery.updateOne(
            { deliveryId },
            {
              $set: {
                attemptCount,
                status: attemptCount >= 3 ? 'SUCCESS' : 'RETRYING',
              },
            }
          );

          if (attemptCount < 3) {
            throw new Error('Retry');
          }
          return { success: true };
        },
        { connection: queueConnection }
      );

      await WebhookDelivery.create({
        deliveryId,
        webhookId: 'whk_track',
        transactionId: 'txn_track',
        eventType: EventType.DEBIT_SUCCESS,
        payload: {},
        status: 'PENDING',
        attemptCount: 0,
      });

      await webhookQueue.add(
        `webhook:${EventType.DEBIT_SUCCESS}`,
        {
          webhookId: 'whk_track',
          deliveryId,
          transactionId: 'txn_track',
          eventType: EventType.DEBIT_SUCCESS,
          payload: { event: EventType.DEBIT_SUCCESS },
        },
        {
          jobId: deliveryId,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const delivery = await WebhookDelivery.findOne({ deliveryId });
      expect(delivery?.attemptCount).toBe(3);
      expect(delivery?.status).toBe('SUCCESS');
    });
  });

  describe('Worker Coordination', () => {
    it('should process notifications and webhooks in parallel', async () => {
      interface NotificationJobData {
        notificationId: string;
        userId: string;
        type: string;
        title: string;
        message: string;
      }

      interface WebhookJobData {
        webhookId: string;
        deliveryId: string;
        transactionId: string;
        eventType: string;
        payload: object;
      }

      const notificationQueue = new Queue<NotificationJobData>('e2e-parallel-notifications', {
        connection: queueConnection,
      });
      const webhookQueue = new Queue<WebhookJobData>('e2e-parallel-webhooks', {
        connection: queueConnection,
      });

      await notificationQueue.obliterate({ force: true });
      await webhookQueue.obliterate({ force: true });

      const processedItems: string[] = [];

      const notificationWorker = new Worker<NotificationJobData>(
        'e2e-parallel-notifications',
        async (job) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          processedItems.push(`notification:${job.data.notificationId}`);
          return { sent: true };
        },
        { connection: queueConnection }
      );

      const webhookWorker = new Worker<WebhookJobData>(
        'e2e-parallel-webhooks',
        async (job) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          processedItems.push(`webhook:${job.data.deliveryId}`);
          return { success: true };
        },
        { connection: queueConnection }
      );

      // Queue both types
      await notificationQueue.add(
        'notification:TEST',
        {
          notificationId: 'ntf_parallel',
          userId: testUserId,
          type: 'TEST',
          title: 'Test',
          message: 'Test',
        },
        { jobId: 'ntf_parallel' }
      );

      await webhookQueue.add(
        'webhook:TEST',
        {
          webhookId: 'whk_parallel',
          deliveryId: 'dlv_parallel',
          transactionId: 'txn_parallel',
          eventType: 'TEST',
          payload: {},
        },
        { jobId: 'dlv_parallel' }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedItems.length).toBe(2);
      expect(processedItems).toContain('notification:ntf_parallel');
      expect(processedItems).toContain('webhook:dlv_parallel');

      await notificationWorker.close();
      await webhookWorker.close();
      await notificationQueue.close();
      await webhookQueue.close();
    });
  });
});
