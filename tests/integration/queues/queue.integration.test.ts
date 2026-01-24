/**
 * Message Queue Integration Tests
 *
 * Tests BullMQ queues with real Redis for notification and webhook delivery.
 */
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const queueConnection = {
  host: TEST_REDIS_HOST,
  port: TEST_REDIS_PORT,
};

describe('Message Queue Integration Tests', () => {
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

  describe('Queue Operations', () => {
    let testQueue: Queue;

    beforeEach(async () => {
      testQueue = new Queue('test-queue', { connection: queueConnection });
      await testQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      await testQueue.close();
    });

    it('should create queue and add jobs', async () => {
      const job = await testQueue.add('test-job', { data: 'test-data' });
      expect(job.id).toBeDefined();
      expect(job.name).toBe('test-job');
    });

    it('should add jobs with custom options', async () => {
      const job = await testQueue.add(
        'priority-job',
        { data: 'important' },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );

      expect(job.opts.priority).toBe(1);
      expect(job.opts.attempts).toBe(3);
    });

    it('should add delayed jobs', async () => {
      const job = await testQueue.add(
        'delayed-job',
        { data: 'later' },
        { delay: 5000 }
      );

      const delayedCount = await testQueue.getDelayedCount();
      expect(delayedCount).toBe(1);
    });

    it('should support job idempotency with jobId', async () => {
      const jobId = 'unique-job-123';

      const job1 = await testQueue.add('idempotent-job', { attempt: 1 }, { jobId });
      const job2 = await testQueue.add('idempotent-job', { attempt: 2 }, { jobId });

      // Second add should return the same job
      expect(job1.id).toBe(job2.id);

      const waiting = await testQueue.getWaitingCount();
      expect(waiting).toBe(1);
    });

    it('should get queue statistics', async () => {
      await testQueue.add('job-1', { data: 1 });
      await testQueue.add('job-2', { data: 2 });
      await testQueue.add('job-3', { data: 3 });

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        testQueue.getWaitingCount(),
        testQueue.getActiveCount(),
        testQueue.getCompletedCount(),
        testQueue.getFailedCount(),
        testQueue.getDelayedCount(),
      ]);

      expect(waiting).toBe(3);
      expect(active).toBe(0);
      expect(completed).toBe(0);
      expect(failed).toBe(0);
      expect(delayed).toBe(0);
    });
  });

  describe('Worker Processing', () => {
    let testQueue: Queue;
    let testWorker: Worker<any, any, string>;

    beforeEach(async () => {
      testQueue = new Queue('worker-test-queue', { connection: queueConnection });
      await testQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (testWorker) await testWorker.close();
      await testQueue.close();
    });

    it('should process jobs with worker', async () => {
      const processedJobs: string[] = [];

      testWorker = new Worker(
        'worker-test-queue',
        async (job) => {
          processedJobs.push(job.data.message);
          return { success: true };
        },
        { connection: queueConnection }
      );

      await testQueue.add('process-job', { message: 'Hello World' });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedJobs).toContain('Hello World');
    });

    it('should handle job completion events', async () => {
      let completedJob: Job | null = null;

      testWorker = new Worker(
        'worker-test-queue',
        async (job) => {
          return { result: job.data.value * 2 };
        },
        { connection: queueConnection }
      );

      testWorker.on('completed', (job) => {
        completedJob = job;
      });

      await testQueue.add('compute-job', { value: 21 });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(completedJob).not.toBeNull();
      expect(completedJob!.returnvalue).toEqual({ result: 42 });
    });

    it('should handle job failures and retries', async () => {
      let attemptCount = 0;

      testWorker = new Worker(
        'worker-test-queue',
        async (job) => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Simulated failure');
          }
          return { success: true };
        },
        { connection: queueConnection }
      );

      await testQueue.add(
        'retry-job',
        { data: 'test' },
        { attempts: 3, backoff: { type: 'fixed', delay: 100 } }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBe(3);
    });

    it('should move jobs to failed after max attempts', async () => {
      testWorker = new Worker(
        'worker-test-queue',
        async (): Promise<{ success: boolean }> => {
          throw new Error('Always fails');
        },
        { connection: queueConnection }
      );

      await testQueue.add(
        'fail-job',
        { data: 'test' },
        { attempts: 2, backoff: { type: 'fixed', delay: 100 } }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const failedCount = await testQueue.getFailedCount();
      expect(failedCount).toBe(1);
    });

    it('should process jobs concurrently', async () => {
      const processingTimes: number[] = [];
      const startTime = Date.now();

      testWorker = new Worker(
        'worker-test-queue',
        async (job) => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          processingTimes.push(Date.now() - startTime);
          return { id: job.data.id };
        },
        { connection: queueConnection, concurrency: 5 }
      );

      // Add 5 jobs
      for (let i = 0; i < 5; i++) {
        await testQueue.add('concurrent-job', { id: i });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // With concurrency 5, all should complete around the same time
      expect(processingTimes.length).toBe(5);
      const maxDiff = Math.max(...processingTimes) - Math.min(...processingTimes);
      expect(maxDiff).toBeLessThan(500); // All within 500ms of each other
    });
  });

  describe('Notification Queue Pattern', () => {
    let notificationQueue: Queue;
    let notificationWorker: Worker;

    interface NotificationJobData {
      notificationId: string;
      userId: string;
      type: string;
      title: string;
      message: string;
    }

    beforeEach(async () => {
      notificationQueue = new Queue<NotificationJobData>('test-notifications', {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 500 },
        },
      });
      await notificationQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      if (notificationWorker) await notificationWorker.close();
      await notificationQueue.close();
    });

    it('should enqueue notification jobs', async () => {
      const notification: NotificationJobData = {
        notificationId: 'ntf_test123',
        userId: 'user_123',
        type: 'TRANSACTION_COMPLETED',
        title: 'Transaction Complete',
        message: 'Your transaction of $100 was successful',
      };

      const job = await notificationQueue.add(
        `notification:${notification.type}`,
        notification,
        { jobId: notification.notificationId }
      );

      expect(job.id).toBe('ntf_test123');
      expect(job.data.userId).toBe('user_123');
    });

    it('should process notifications', async () => {
      const processedNotifications: NotificationJobData[] = [];

      notificationWorker = new Worker<NotificationJobData>(
        'test-notifications',
        async (job) => {
          processedNotifications.push(job.data);
          return { sent: true, channel: 'test' };
        },
        { connection: queueConnection, concurrency: 10 }
      );

      const notification: NotificationJobData = {
        notificationId: 'ntf_process123',
        userId: 'user_456',
        type: 'CREDIT_RECEIVED',
        title: 'Money Received',
        message: 'You received $50 from John',
      };

      await notificationQueue.add(
        `notification:${notification.type}`,
        notification,
        { jobId: notification.notificationId }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(processedNotifications.length).toBe(1);
      expect(processedNotifications[0].title).toBe('Money Received');
    });
  });

  describe('Webhook Queue Pattern', () => {
    let webhookQueue: Queue;
    let webhookWorker: Worker;

    interface WebhookJobData {
      webhookId: string;
      deliveryId: string;
      transactionId: string;
      eventType: string;
      payload: object;
    }

    beforeEach(async () => {
      webhookQueue = new Queue<WebhookJobData>('test-webhooks', {
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

    it('should enqueue webhook delivery jobs', async () => {
      const webhook: WebhookJobData = {
        webhookId: 'whk_test123',
        deliveryId: 'dlv_test456',
        transactionId: 'txn_test789',
        eventType: 'TRANSACTION_COMPLETED',
        payload: {
          event: 'TRANSACTION_COMPLETED',
          transactionId: 'txn_test789',
          amount: 100,
        },
      };

      const job = await webhookQueue.add(
        `webhook:${webhook.eventType}`,
        webhook,
        { jobId: webhook.deliveryId }
      );

      expect(job.id).toBe('dlv_test456');
    });

    it('should retry failed webhook deliveries', async () => {
      let attempts = 0;

      webhookWorker = new Worker<WebhookJobData>(
        'test-webhooks',
        async (job) => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Simulated delivery failure');
          }
          return { success: true, statusCode: 200 };
        },
        { connection: queueConnection }
      );

      const webhook: WebhookJobData = {
        webhookId: 'whk_retry',
        deliveryId: 'dlv_retry',
        transactionId: 'txn_retry',
        eventType: 'TRANSACTION_FAILED',
        payload: { event: 'TRANSACTION_FAILED' },
      };

      await webhookQueue.add(
        `webhook:${webhook.eventType}`,
        webhook,
        {
          jobId: webhook.deliveryId,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attempts).toBe(3);
    });

    it('should track delivery attempts', async () => {
      const attemptHistory: number[] = [];

      webhookWorker = new Worker<WebhookJobData>(
        'test-webhooks',
        async (job) => {
          attemptHistory.push(job.attemptsMade);
          if (job.attemptsMade < 2) {
            throw new Error('Retry needed');
          }
          return { success: true };
        },
        { connection: queueConnection }
      );

      const webhook: WebhookJobData = {
        webhookId: 'whk_track',
        deliveryId: 'dlv_track',
        transactionId: 'txn_track',
        eventType: 'DEBIT_SUCCESS',
        payload: { event: 'DEBIT_SUCCESS' },
      };

      await webhookQueue.add(
        `webhook:${webhook.eventType}`,
        webhook,
        {
          jobId: webhook.deliveryId,
          attempts: 5,
          backoff: { type: 'fixed', delay: 100 },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptHistory).toEqual([0, 1, 2]);
    });
  });

  describe('Queue Cleanup', () => {
    let cleanupQueue: Queue;

    beforeEach(async () => {
      cleanupQueue = new Queue('cleanup-test', { connection: queueConnection });
      await cleanupQueue.obliterate({ force: true });
    });

    afterEach(async () => {
      await cleanupQueue.close();
    });

    it('should remove completed jobs based on retention', async () => {
      const worker = new Worker(
        'cleanup-test',
        async () => ({ success: true }),
        { connection: queueConnection }
      );

      // Add jobs with removeOnComplete
      for (let i = 0; i < 10; i++) {
        await cleanupQueue.add(
          'cleanup-job',
          { id: i },
          { removeOnComplete: { count: 5 } }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const completedCount = await cleanupQueue.getCompletedCount();
      expect(completedCount).toBeLessThanOrEqual(5);

      await worker.close();
    });

    it('should clean old jobs', async () => {
      // Add jobs
      for (let i = 0; i < 5; i++) {
        await cleanupQueue.add('old-job', { id: i });
      }

      const beforeClean = await cleanupQueue.getWaitingCount();
      expect(beforeClean).toBe(5);

      // Clean all waiting jobs
      await cleanupQueue.drain();

      const afterClean = await cleanupQueue.getWaitingCount();
      expect(afterClean).toBe(0);
    });

    it('should obliterate queue', async () => {
      for (let i = 0; i < 5; i++) {
        await cleanupQueue.add('obliterate-job', { id: i });
      }

      await cleanupQueue.obliterate({ force: true });

      const waiting = await cleanupQueue.getWaitingCount();
      expect(waiting).toBe(0);
    });
  });
});
