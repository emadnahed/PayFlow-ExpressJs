/**
 * Worker Integration Tests
 *
 * Tests notification and webhook workers with real Redis and queue processing.
 */
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const queueConnection = {
  host: TEST_REDIS_HOST,
  port: TEST_REDIS_PORT,
};

// Notification types matching the real implementation
enum NotificationType {
  TRANSACTION_INITIATED = 'TRANSACTION_INITIATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CREDIT_RECEIVED = 'CREDIT_RECEIVED',
}

interface NotificationJobData {
  notificationId: string;
  userId: string;
  type: NotificationType;
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

interface WebhookJobData {
  webhookId: string;
  deliveryId: string;
  transactionId: string;
  eventType: string;
  payload: {
    event: string;
    transactionId: string;
    status: string;
    amount: number;
    currency: string;
    timestamp: string;
    senderId?: string;
    receiverId?: string;
    reason?: string;
  };
}

interface WebhookJobResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

describe('Worker Integration Tests', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(queueConnection);
    await new Promise<void>((resolve) => {
      redis.on('ready', () => resolve());
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('Notification Worker', () => {
    let notificationQueue: Queue<NotificationJobData, NotificationJobResult>;
    let notificationWorker: Worker<NotificationJobData, NotificationJobResult>;

    beforeEach(async () => {
      notificationQueue = new Queue<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        {
          connection: queueConnection,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 500 },
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 500 },
          },
        }
      );
      await notificationQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (notificationWorker) await notificationWorker.close();
      await notificationQueue.close();
    });

    it('should process notification job successfully', async () => {
      const processedNotifications: NotificationJobData[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        async (job) => {
          processedNotifications.push(job.data);
          return { sent: true, channel: 'console' };
        },
        { connection: queueConnection, concurrency: 10 }
      );

      const notification: NotificationJobData = {
        notificationId: 'ntf_test001',
        userId: 'user_123',
        type: NotificationType.TRANSACTION_COMPLETED,
        title: 'Transaction Complete',
        message: 'Your payment of INR 500 was successful',
        data: {
          transactionId: 'txn_123',
          amount: 500,
          currency: 'INR',
          receiverName: 'John Doe',
        },
      };

      await notificationQueue.add(
        `notification:${notification.type}`,
        notification,
        { jobId: notification.notificationId }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(1);
      expect(processedNotifications[0].userId).toBe('user_123');
      expect(processedNotifications[0].title).toBe('Transaction Complete');
    });

    it('should handle multiple notification types', async () => {
      const processedByType: Record<string, number> = {};

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        async (job) => {
          processedByType[job.data.type] = (processedByType[job.data.type] || 0) + 1;
          return { sent: true, channel: 'console' };
        },
        { connection: queueConnection, concurrency: 10 }
      );

      const notifications: NotificationJobData[] = [
        {
          notificationId: 'ntf_001',
          userId: 'user_1',
          type: NotificationType.TRANSACTION_INITIATED,
          title: 'Transaction Started',
          message: 'Your transaction has been initiated',
        },
        {
          notificationId: 'ntf_002',
          userId: 'user_1',
          type: NotificationType.TRANSACTION_COMPLETED,
          title: 'Transaction Complete',
          message: 'Your transaction has been completed',
        },
        {
          notificationId: 'ntf_003',
          userId: 'user_2',
          type: NotificationType.CREDIT_RECEIVED,
          title: 'Money Received',
          message: 'You received a payment',
        },
        {
          notificationId: 'ntf_004',
          userId: 'user_1',
          type: NotificationType.TRANSACTION_FAILED,
          title: 'Transaction Failed',
          message: 'Your transaction has failed',
        },
      ];

      for (const notification of notifications) {
        await notificationQueue.add(
          `notification:${notification.type}`,
          notification,
          { jobId: notification.notificationId }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(processedByType[NotificationType.TRANSACTION_INITIATED]).toBe(1);
      expect(processedByType[NotificationType.TRANSACTION_COMPLETED]).toBe(1);
      expect(processedByType[NotificationType.CREDIT_RECEIVED]).toBe(1);
      expect(processedByType[NotificationType.TRANSACTION_FAILED]).toBe(1);
    });

    it('should retry failed notifications', async () => {
      let attemptCount = 0;

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        async (job) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Notification service unavailable');
          }
          return { sent: true, channel: 'console' };
        },
        { connection: queueConnection }
      );

      await notificationQueue.add(
        'notification:TEST',
        {
          notificationId: 'ntf_retry',
          userId: 'user_retry',
          type: NotificationType.TRANSACTION_COMPLETED,
          title: 'Retry Test',
          message: 'This should retry',
        },
        {
          jobId: 'ntf_retry',
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
    });

    it('should handle concurrent notifications', async () => {
      const processedIds: string[] = [];
      const startTime = Date.now();
      const processingTimes: number[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        async (job) => {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
          processedIds.push(job.data.notificationId);
          processingTimes.push(Date.now() - startTime);
          return { sent: true, channel: 'console' };
        },
        { connection: queueConnection, concurrency: 5 }
      );

      // Add 5 notifications
      for (let i = 0; i < 5; i++) {
        await notificationQueue.add(
          'notification:TEST',
          {
            notificationId: `ntf_concurrent_${i}`,
            userId: `user_${i}`,
            type: NotificationType.TRANSACTION_COMPLETED,
            title: `Notification ${i}`,
            message: `Message ${i}`,
          },
          { jobId: `ntf_concurrent_${i}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedIds.length).toBe(5);
      // With concurrency 5, all should complete around the same time
      const maxDiff = Math.max(...processingTimes) - Math.min(...processingTimes);
      expect(maxDiff).toBeLessThan(200);
    });

    it('should track worker events', async () => {
      const completedJobs: Job<NotificationJobData, NotificationJobResult>[] = [];
      const failedJobs: { job: Job<NotificationJobData, NotificationJobResult> | undefined; error: Error }[] = [];

      notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
        'test-notification-worker',
        async (job) => {
          if (job.data.notificationId === 'ntf_fail') {
            throw new Error('Intentional failure');
          }
          return { sent: true, channel: 'console' };
        },
        { connection: queueConnection }
      );

      notificationWorker.on('completed', (job) => {
        completedJobs.push(job);
      });

      notificationWorker.on('failed', (job, err) => {
        failedJobs.push({ job, error: err });
      });

      await notificationQueue.add(
        'notification:SUCCESS',
        {
          notificationId: 'ntf_success',
          userId: 'user_1',
          type: NotificationType.TRANSACTION_COMPLETED,
          title: 'Success',
          message: 'This should succeed',
        },
        { jobId: 'ntf_success' }
      );

      await notificationQueue.add(
        'notification:FAIL',
        {
          notificationId: 'ntf_fail',
          userId: 'user_2',
          type: NotificationType.TRANSACTION_FAILED,
          title: 'Fail',
          message: 'This should fail',
        },
        { jobId: 'ntf_fail', attempts: 1 }
      );

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(completedJobs.length).toBe(1);
      expect(failedJobs.length).toBe(1);
      expect(failedJobs[0].error.message).toBe('Intentional failure');
    });
  });

  describe('Webhook Worker', () => {
    let webhookQueue: Queue<WebhookJobData, WebhookJobResult>;
    let webhookWorker: Worker<WebhookJobData, WebhookJobResult>;

    beforeEach(async () => {
      webhookQueue = new Queue<WebhookJobData, WebhookJobResult>('test-webhook-worker', {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 1000 },
        },
      });
      await webhookQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (webhookWorker) await webhookWorker.close();
      await webhookQueue.close();
    });

    it('should process webhook delivery', async () => {
      const deliveredWebhooks: WebhookJobData[] = [];

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'test-webhook-worker',
        async (job) => {
          deliveredWebhooks.push(job.data);
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      const webhook: WebhookJobData = {
        webhookId: 'whk_test001',
        deliveryId: 'dlv_test001',
        transactionId: 'txn_test001',
        eventType: 'TRANSACTION_COMPLETED',
        payload: {
          event: 'TRANSACTION_COMPLETED',
          transactionId: 'txn_test001',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          timestamp: new Date().toISOString(),
          senderId: 'user_1',
          receiverId: 'user_2',
        },
      };

      await webhookQueue.add(`webhook:${webhook.eventType}`, webhook, {
        jobId: webhook.deliveryId,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(deliveredWebhooks.length).toBe(1);
      expect(deliveredWebhooks[0].webhookId).toBe('whk_test001');
    });

    it('should retry failed webhook deliveries', async () => {
      let attemptCount = 0;

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'test-webhook-worker',
        async (job) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Connection timeout');
          }
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      await webhookQueue.add(
        'webhook:TEST',
        {
          webhookId: 'whk_retry',
          deliveryId: 'dlv_retry',
          transactionId: 'txn_retry',
          eventType: 'TRANSACTION_FAILED',
          payload: {
            event: 'TRANSACTION_FAILED',
            transactionId: 'txn_retry',
            status: 'FAILED',
            amount: 50,
            currency: 'INR',
            timestamp: new Date().toISOString(),
            reason: 'Insufficient balance',
          },
        },
        {
          jobId: 'dlv_retry',
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
    });

    it('should track attempt count', async () => {
      const attemptHistory: { jobId: string; attemptsMade: number }[] = [];

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'test-webhook-worker',
        async (job) => {
          attemptHistory.push({
            jobId: job.id!,
            attemptsMade: job.attemptsMade,
          });
          if (job.attemptsMade < 2) {
            throw new Error('Retry needed');
          }
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      await webhookQueue.add(
        'webhook:TEST',
        {
          webhookId: 'whk_track',
          deliveryId: 'dlv_track',
          transactionId: 'txn_track',
          eventType: 'DEBIT_SUCCESS',
          payload: {
            event: 'DEBIT_SUCCESS',
            transactionId: 'txn_track',
            status: 'DEBITED',
            amount: 75,
            currency: 'INR',
            timestamp: new Date().toISOString(),
          },
        },
        {
          jobId: 'dlv_track',
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptHistory.length).toBe(3);
      expect(attemptHistory.map((h) => h.attemptsMade)).toEqual([0, 1, 2]);
    });

    it('should move to failed after max attempts', async () => {
      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'test-webhook-worker',
        async () => {
          throw new Error('Always fails');
        },
        { connection: queueConnection }
      );

      await webhookQueue.add(
        'webhook:TEST',
        {
          webhookId: 'whk_maxfail',
          deliveryId: 'dlv_maxfail',
          transactionId: 'txn_maxfail',
          eventType: 'CREDIT_SUCCESS',
          payload: {
            event: 'CREDIT_SUCCESS',
            transactionId: 'txn_maxfail',
            status: 'CREDITED',
            amount: 25,
            currency: 'INR',
            timestamp: new Date().toISOString(),
          },
        },
        {
          jobId: 'dlv_maxfail',
          attempts: 3,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const failedCount = await webhookQueue.getFailedCount();
      expect(failedCount).toBe(1);
    });

    it('should handle different event types', async () => {
      const processedByEvent: Record<string, number> = {};

      webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
        'test-webhook-worker',
        async (job) => {
          processedByEvent[job.data.eventType] =
            (processedByEvent[job.data.eventType] || 0) + 1;
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      const eventTypes = [
        'TRANSACTION_INITIATED',
        'DEBIT_SUCCESS',
        'CREDIT_SUCCESS',
        'TRANSACTION_COMPLETED',
        'TRANSACTION_FAILED',
      ];

      for (let i = 0; i < eventTypes.length; i++) {
        await webhookQueue.add(
          `webhook:${eventTypes[i]}`,
          {
            webhookId: `whk_event_${i}`,
            deliveryId: `dlv_event_${i}`,
            transactionId: `txn_event_${i}`,
            eventType: eventTypes[i],
            payload: {
              event: eventTypes[i],
              transactionId: `txn_event_${i}`,
              status: eventTypes[i],
              amount: 100,
              currency: 'INR',
              timestamp: new Date().toISOString(),
            },
          },
          { jobId: `dlv_event_${i}` }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(Object.keys(processedByEvent).length).toBe(5);
      for (const eventType of eventTypes) {
        expect(processedByEvent[eventType]).toBe(1);
      }
    });
  });

  describe('Worker Lifecycle', () => {
    it('should start and stop workers gracefully', async () => {
      const queue = new Queue('lifecycle-test', { connection: queueConnection });
      await queue.obliterate({ force: true });

      const worker = new Worker(
        'lifecycle-test',
        async () => ({ success: true }),
        { connection: queueConnection }
      );

      // Worker should be running initially
      expect(worker.isRunning()).toBe(true);

      // Stop worker - close() returns a promise that resolves when closed
      await worker.close();

      // After close, worker should no longer process jobs
      // The isRunning() state may take a moment to update
      // Verify by checking the worker doesn't pick up new jobs
      await queue.add('post-close-job', { test: 'data' });
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Job should remain in queue (not processed)
      const waitingCount = await queue.getWaitingCount();
      expect(waitingCount).toBe(1);

      await queue.close();
    });

    it('should pause and resume workers', async () => {
      const queue = new Queue('pause-test', { connection: queueConnection });
      await queue.obliterate({ force: true });

      const processedJobs: string[] = [];

      const worker = new Worker(
        'pause-test',
        async (job) => {
          processedJobs.push(job.id!);
          return { success: true };
        },
        { connection: queueConnection }
      );

      // Add first job
      await queue.add('job-1', { id: 1 });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(processedJobs.length).toBe(1);

      // Pause worker
      await worker.pause();

      // Add job while paused
      await queue.add('job-2', { id: 2 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should not process while paused
      expect(processedJobs.length).toBe(1);

      // Resume worker
      worker.resume();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should process the queued job
      expect(processedJobs.length).toBe(2);

      await worker.close();
      await queue.close();
    });

    it('should handle worker errors gracefully', async () => {
      const queue = new Queue('error-handling-test', { connection: queueConnection });
      await queue.obliterate({ force: true });

      const errors: Error[] = [];

      const worker = new Worker(
        'error-handling-test',
        async () => {
          throw new Error('Worker processing error');
        },
        { connection: queueConnection }
      );

      worker.on('error', (err) => {
        errors.push(err);
      });

      worker.on('failed', (_job, err) => {
        errors.push(err);
      });

      await queue.add('error-job', { data: 'test' }, { attempts: 1 });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(errors.length).toBeGreaterThan(0);

      await worker.close();
      await queue.close();
    });
  });
});
