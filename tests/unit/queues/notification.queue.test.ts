/**
 * Notification Queue Unit Tests
 *
 * Tests notification queue operations with mocked BullMQ.
 */

import { NotificationType } from '../../../src/queues/notification.queue';

// Mock BullMQ Queue
const mockAdd = jest.fn().mockResolvedValue({ id: 'notif-job-123' });
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockGetWaitingCount = jest.fn().mockResolvedValue(10);
const mockGetActiveCount = jest.fn().mockResolvedValue(3);
const mockGetCompletedCount = jest.fn().mockResolvedValue(500);
const mockGetFailedCount = jest.fn().mockResolvedValue(5);
const mockGetDelayedCount = jest.fn().mockResolvedValue(2);

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
  notificationJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 5000 } },
  QUEUE_NAMES: { NOTIFICATIONS: 'notifications' },
}));

describe('Notification Queue', () => {
  let getNotificationQueue: typeof import('../../../src/queues/notification.queue').getNotificationQueue;
  let enqueueNotification: typeof import('../../../src/queues/notification.queue').enqueueNotification;
  let closeNotificationQueue: typeof import('../../../src/queues/notification.queue').closeNotificationQueue;
  let getNotificationQueueStats: typeof import('../../../src/queues/notification.queue').getNotificationQueueStats;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/queues/notification.queue');
    getNotificationQueue = module.getNotificationQueue;
    enqueueNotification = module.enqueueNotification;
    closeNotificationQueue = module.closeNotificationQueue;
    getNotificationQueueStats = module.getNotificationQueueStats;
  });

  afterEach(async () => {
    await closeNotificationQueue();
  });

  describe('getNotificationQueue', () => {
    it('should create queue on first call', () => {
      const queue = getNotificationQueue();
      expect(queue).toBeDefined();
    });

    it('should return same queue instance on subsequent calls', () => {
      const queue1 = getNotificationQueue();
      const queue2 = getNotificationQueue();
      expect(queue1).toBe(queue2);
    });
  });

  describe('enqueueNotification', () => {
    it('should add notification job with correct data', async () => {
      const jobData = {
        notificationId: 'notif_123',
        userId: 'user_456',
        type: NotificationType.TRANSACTION_COMPLETED,
        title: 'Payment Successful',
        message: 'Your payment of ₹100 to John was successful',
        data: {
          transactionId: 'txn_789',
          amount: 100,
          currency: 'INR',
          receiverName: 'John',
        },
      };

      const job = await enqueueNotification(jobData);

      expect(mockAdd).toHaveBeenCalledWith(
        `notification:${NotificationType.TRANSACTION_COMPLETED}`,
        jobData,
        { jobId: 'notif_123' }
      );
      expect(job.id).toBe('notif-job-123');
    });

    it('should enqueue notification without optional data', async () => {
      const jobData = {
        notificationId: 'notif_simple',
        userId: 'user_abc',
        type: NotificationType.TRANSACTION_INITIATED,
        title: 'Payment Started',
        message: 'Your payment is being processed',
      };

      await enqueueNotification(jobData);

      expect(mockAdd).toHaveBeenCalledWith(
        `notification:${NotificationType.TRANSACTION_INITIATED}`,
        jobData,
        { jobId: 'notif_simple' }
      );
    });

    it('should use notificationId as jobId for idempotency', async () => {
      const jobData = {
        notificationId: 'unique-notification-id',
        userId: 'user_def',
        type: NotificationType.CREDIT_RECEIVED,
        title: 'Money Received',
        message: 'You received ₹50',
      };

      await enqueueNotification(jobData);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { jobId: 'unique-notification-id' }
      );
    });

    it('should support all notification types', async () => {
      const types = [
        NotificationType.TRANSACTION_INITIATED,
        NotificationType.TRANSACTION_COMPLETED,
        NotificationType.TRANSACTION_FAILED,
        NotificationType.CREDIT_RECEIVED,
      ];

      for (const type of types) {
        jest.clearAllMocks();

        await enqueueNotification({
          notificationId: `notif_${type}`,
          userId: 'user_test',
          type,
          title: 'Test',
          message: 'Test message',
        });

        expect(mockAdd).toHaveBeenCalledWith(
          `notification:${type}`,
          expect.any(Object),
          expect.any(Object)
        );
      }
    });
  });

  describe('closeNotificationQueue', () => {
    it('should close queue when initialized', async () => {
      getNotificationQueue(); // Initialize queue
      await closeNotificationQueue();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle close when queue not initialized', async () => {
      // Don't initialize queue
      await closeNotificationQueue();
      // Should not throw
    });

    it('should allow queue to be reinitialized after close', async () => {
      getNotificationQueue();
      await closeNotificationQueue();

      // Reset mocks to track new Queue creation
      jest.clearAllMocks();
      jest.resetModules();

      const module = await import('../../../src/queues/notification.queue');
      const queue = module.getNotificationQueue();
      expect(queue).toBeDefined();
    });
  });

  describe('getNotificationQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await getNotificationQueueStats();

      expect(stats).toEqual({
        waiting: 10,
        active: 3,
        completed: 500,
        failed: 5,
        delayed: 2,
      });
    });

    it('should call all count methods', async () => {
      await getNotificationQueueStats();

      expect(mockGetWaitingCount).toHaveBeenCalled();
      expect(mockGetActiveCount).toHaveBeenCalled();
      expect(mockGetCompletedCount).toHaveBeenCalled();
      expect(mockGetFailedCount).toHaveBeenCalled();
      expect(mockGetDelayedCount).toHaveBeenCalled();
    });
  });

  describe('NotificationType enum', () => {
    it('should have correct values', () => {
      expect(NotificationType.TRANSACTION_INITIATED).toBe('TRANSACTION_INITIATED');
      expect(NotificationType.TRANSACTION_COMPLETED).toBe('TRANSACTION_COMPLETED');
      expect(NotificationType.TRANSACTION_FAILED).toBe('TRANSACTION_FAILED');
      expect(NotificationType.CREDIT_RECEIVED).toBe('CREDIT_RECEIVED');
    });
  });
});
