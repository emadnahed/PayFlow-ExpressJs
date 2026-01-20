/**
 * Webhook Queue Unit Tests
 *
 * Tests webhook queue operations with mocked BullMQ.
 */

import { EventType } from '../../../src/types/events';

// Mock BullMQ Queue
const mockAdd = jest.fn().mockResolvedValue({ id: 'job-123' });
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockGetWaitingCount = jest.fn().mockResolvedValue(5);
const mockGetActiveCount = jest.fn().mockResolvedValue(2);
const mockGetCompletedCount = jest.fn().mockResolvedValue(100);
const mockGetFailedCount = jest.fn().mockResolvedValue(3);
const mockGetDelayedCount = jest.fn().mockResolvedValue(1);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockClose,
    getWaitingCount: mockGetWaitingCount,
    getActiveCount: mockGetActiveCount,
    getCompletedCount: mockGetCompletedCount,
    getFailedCount: mockGetFailedCount,
    getDelayedCount: mockGetDelayedCount,
  })),
}));

// Mock queue config
jest.mock('../../../src/queues/queue.config', () => ({
  queueConnection: { host: 'localhost', port: 6379 },
  webhookJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  QUEUE_NAMES: { WEBHOOKS: 'webhooks' },
}));

describe('Webhook Queue', () => {
  let getWebhookQueue: typeof import('../../../src/queues/webhook.queue').getWebhookQueue;
  let enqueueWebhookDelivery: typeof import('../../../src/queues/webhook.queue').enqueueWebhookDelivery;
  let closeWebhookQueue: typeof import('../../../src/queues/webhook.queue').closeWebhookQueue;
  let getWebhookQueueStats: typeof import('../../../src/queues/webhook.queue').getWebhookQueueStats;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/queues/webhook.queue');
    getWebhookQueue = module.getWebhookQueue;
    enqueueWebhookDelivery = module.enqueueWebhookDelivery;
    closeWebhookQueue = module.closeWebhookQueue;
    getWebhookQueueStats = module.getWebhookQueueStats;
  });

  afterEach(async () => {
    await closeWebhookQueue();
  });

  describe('getWebhookQueue', () => {
    it('should create queue on first call', () => {
      const queue = getWebhookQueue();
      expect(queue).toBeDefined();
    });

    it('should return same queue instance on subsequent calls', () => {
      const queue1 = getWebhookQueue();
      const queue2 = getWebhookQueue();
      expect(queue1).toBe(queue2);
    });
  });

  describe('enqueueWebhookDelivery', () => {
    it('should add job to queue with correct data', async () => {
      const jobData = {
        webhookId: 'wh_123',
        deliveryId: 'del_456',
        transactionId: 'txn_789',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: {
          event: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_789',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          timestamp: new Date().toISOString(),
          senderId: 'user_1',
          receiverId: 'user_2',
        },
      };

      const job = await enqueueWebhookDelivery(jobData);

      expect(mockAdd).toHaveBeenCalledWith(
        `webhook:${EventType.TRANSACTION_COMPLETED}`,
        jobData,
        { jobId: 'del_456' }
      );
      expect(job.id).toBe('job-123');
    });

    it('should use deliveryId as jobId for idempotency', async () => {
      const jobData = {
        webhookId: 'wh_abc',
        deliveryId: 'unique-delivery-id',
        transactionId: 'txn_def',
        eventType: EventType.TRANSACTION_FAILED,
        payload: {
          event: EventType.TRANSACTION_FAILED,
          transactionId: 'txn_def',
          status: 'FAILED',
          amount: 50,
          currency: 'INR',
          timestamp: new Date().toISOString(),
          reason: 'Credit failed',
        },
      };

      await enqueueWebhookDelivery(jobData);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { jobId: 'unique-delivery-id' }
      );
    });
  });

  describe('closeWebhookQueue', () => {
    it('should close queue when initialized', async () => {
      getWebhookQueue(); // Initialize queue
      await closeWebhookQueue();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle close when queue not initialized', async () => {
      // Don't initialize queue
      await closeWebhookQueue();
      // Should not throw
    });

    it('should allow queue to be reinitialized after close', async () => {
      getWebhookQueue();
      await closeWebhookQueue();

      // Reset mocks to track new Queue creation
      jest.clearAllMocks();
      jest.resetModules();

      const module = await import('../../../src/queues/webhook.queue');
      const queue = module.getWebhookQueue();
      expect(queue).toBeDefined();
    });
  });

  describe('getWebhookQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await getWebhookQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
    });

    it('should call all count methods', async () => {
      await getWebhookQueueStats();

      expect(mockGetWaitingCount).toHaveBeenCalled();
      expect(mockGetActiveCount).toHaveBeenCalled();
      expect(mockGetCompletedCount).toHaveBeenCalled();
      expect(mockGetFailedCount).toHaveBeenCalled();
      expect(mockGetDelayedCount).toHaveBeenCalled();
    });
  });
});
