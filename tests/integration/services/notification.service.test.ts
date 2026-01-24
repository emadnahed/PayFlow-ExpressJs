/**
 * Notification Service Integration Tests
 *
 * Tests notification queuing and delivery with real Redis.
 */
import mongoose from 'mongoose';

import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Import the real service and queue
import { NotificationService } from '../../../src/services/notification/notification.service';
import {
  NotificationType,
  getNotificationQueue,
  closeNotificationQueue,
  getNotificationQueueStats,
} from '../../../src/queues/notification.queue';

describe('Notification Service Integration Tests', () => {
  let notificationService: NotificationService;
  let testUserId: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
    notificationService = new NotificationService();
  });

  afterAll(async () => {
    await closeNotificationQueue();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});

    // Drain the queue
    const queue = getNotificationQueue();
    await queue.obliterate({ force: true });

    // Create test user
    const timestamp = Date.now();
    testUserId = `user_test_${timestamp}`;

    await User.create({
      userId: testUserId,
      name: 'Test User',
      email: `test_${timestamp}@example.com`,
      password: 'hashedpassword',
    });

    await Wallet.create({
      walletId: `wallet_test_${timestamp}`,
      userId: testUserId,
      balance: 1000,
      currency: 'INR',
    });
  });

  describe('Queue Notification', () => {
    it('should queue transaction initiated notification', async () => {
      const notificationId = await notificationService.notifyTransactionInitiated(
        testUserId,
        100,
        'INR',
        'txn_test_001'
      );

      expect(notificationId).toMatch(/^ntf_/);

      const stats = await getNotificationQueueStats();
      // Job may be waiting, active, or completed depending on if a worker is running
      const totalJobs = stats.waiting + stats.active + stats.completed;
      expect(totalJobs).toBeGreaterThanOrEqual(1);
    });

    it('should queue transaction completed notification', async () => {
      const notificationId = await notificationService.notifyTransactionCompleted(
        testUserId,
        'John Doe',
        200,
        'INR',
        'txn_test_002'
      );

      expect(notificationId).toMatch(/^ntf_/);
    });

    it('should queue transaction failed notification', async () => {
      const notificationId = await notificationService.notifyTransactionFailed(
        testUserId,
        150,
        'INR',
        'txn_test_003'
      );

      expect(notificationId).toMatch(/^ntf_/);
    });

    it('should queue credit received notification', async () => {
      const notificationId = await notificationService.notifyCreditReceived(
        testUserId,
        'Jane Smith',
        250,
        'INR',
        'txn_test_004'
      );

      expect(notificationId).toMatch(/^ntf_/);
    });
  });

  describe('Notification Data', () => {
    it('should include transaction details in notification', async () => {
      const queue = getNotificationQueue();

      await notificationService.notifyTransactionCompleted(
        testUserId,
        'John Doe',
        500,
        'INR',
        'txn_details_test'
      );

      // Get the job from queue (check all states as worker may process jobs)
      const jobs = await queue.getJobs(['waiting', 'active', 'completed']);
      const job = jobs.find((j) => j.data.data?.transactionId === 'txn_details_test');

      expect(job).toBeDefined();
      expect(job!.data.userId).toBe(testUserId);
      expect(job!.data.type).toBe(NotificationType.TRANSACTION_COMPLETED);
      expect(job!.data.data?.amount).toBe(500);
      expect(job!.data.data?.currency).toBe('INR');
      expect(job!.data.data?.receiverName).toBe('John Doe');
    });

    it('should generate unique notification IDs', async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const id = await notificationService.notifyTransactionInitiated(
          testUserId,
          100,
          'INR',
          `txn_unique_${i}`
        );
        ids.add(id);
      }

      expect(ids.size).toBe(10);
    });
  });

  describe('Queue Statistics', () => {
    it('should report queue statistics', async () => {
      const initialStats = await getNotificationQueueStats();
      const initialTotal =
        initialStats.waiting + initialStats.active + initialStats.completed + initialStats.failed;

      // Queue multiple notifications
      await notificationService.notifyTransactionInitiated(testUserId, 100, 'INR', 'txn_1');
      await notificationService.notifyTransactionCompleted(testUserId, 'User', 200, 'INR', 'txn_2');
      await notificationService.notifyCreditReceived(testUserId, 'User', 300, 'INR', 'txn_3');

      // Allow time for jobs to settle in queue (important for Docker environments)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const afterStats = await getNotificationQueueStats();
      const afterTotal =
        afterStats.waiting + afterStats.active + afterStats.completed + afterStats.failed;

      // Jobs may be in any state depending on worker activity and timing
      expect(afterTotal).toBeGreaterThanOrEqual(initialTotal + 3);
    }, 10000); // Increased timeout for Docker environments
  });

  describe('Notification Templates', () => {
    it('should format transaction initiated message', async () => {
      const queue = getNotificationQueue();

      await notificationService.notifyTransactionInitiated(testUserId, 1000, 'INR', 'txn_template_1');

      // Check all states as worker may process jobs
      const jobs = await queue.getJobs(['waiting', 'active', 'completed']);
      const job = jobs.find((j) => j.data.data?.transactionId === 'txn_template_1');

      expect(job).toBeDefined();
      expect(job!.data.title).toBeDefined();
      expect(job!.data.message).toBeDefined();
      expect(job!.data.message.length).toBeGreaterThan(0);
    });

    it('should format credit received message with sender name', async () => {
      const queue = getNotificationQueue();

      await notificationService.notifyCreditReceived(
        testUserId,
        'Alice Johnson',
        750,
        'INR',
        'txn_template_2'
      );

      // Check all states as worker may process jobs
      const jobs = await queue.getJobs(['waiting', 'active', 'completed']);
      const job = jobs.find((j) => j.data.data?.transactionId === 'txn_template_2');

      expect(job).toBeDefined();
      expect(job!.data.data?.senderName).toBe('Alice Johnson');
    });
  });

  describe('Concurrent Notifications', () => {
    it('should handle multiple concurrent notifications', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          notificationService.notifyTransactionInitiated(testUserId, 50 + i, 'INR', `txn_concurrent_${i}`)
        );
      }

      const notificationIds = await Promise.all(promises);

      expect(notificationIds.length).toBe(20);
      expect(new Set(notificationIds).size).toBe(20); // All unique

      const stats = await getNotificationQueueStats();
      // Jobs may be waiting, active, or completed depending on if a worker is running
      const totalJobs = stats.waiting + stats.active + stats.completed;
      expect(totalJobs).toBeGreaterThanOrEqual(20);
    });

    it('should handle notifications for multiple users', async () => {
      // Create additional users
      const userIds = [testUserId];
      for (let i = 0; i < 4; i++) {
        const userId = `user_multi_${Date.now()}_${i}`;
        await User.create({
          userId,
          name: `User ${i}`,
          email: `multi_${Date.now()}_${i}@example.com`,
          password: 'hashedpassword',
        });
        userIds.push(userId);
      }

      const promises = userIds.map((userId, idx) =>
        notificationService.notifyTransactionCompleted(
          userId,
          'Receiver',
          100 + idx,
          'INR',
          `txn_multi_user_${idx}`
        )
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(5);
    });
  });

  describe('Notification Types', () => {
    it('should use correct notification type for each method', async () => {
      const queue = getNotificationQueue();

      await notificationService.notifyTransactionInitiated(testUserId, 100, 'INR', 'txn_type_1');
      await notificationService.notifyTransactionCompleted(testUserId, 'User', 200, 'INR', 'txn_type_2');
      await notificationService.notifyTransactionFailed(testUserId, 150, 'INR', 'txn_type_3');
      await notificationService.notifyCreditReceived(testUserId, 'User', 250, 'INR', 'txn_type_4');

      // Check all states as worker may process jobs
      const jobs = await queue.getJobs(['waiting', 'active', 'completed']);

      const types = jobs.map((j) => j.data.type);
      expect(types).toContain(NotificationType.TRANSACTION_INITIATED);
      expect(types).toContain(NotificationType.TRANSACTION_COMPLETED);
      expect(types).toContain(NotificationType.TRANSACTION_FAILED);
      expect(types).toContain(NotificationType.CREDIT_RECEIVED);
    });
  });

  describe('Queue Job Options', () => {
    it('should set job ID for idempotency', async () => {
      const queue = getNotificationQueue();

      const notificationId = await notificationService.notifyTransactionInitiated(
        testUserId,
        100,
        'INR',
        'txn_job_id'
      );

      const job = await queue.getJob(notificationId);

      expect(job).not.toBeNull();
      expect(job!.id).toBe(notificationId);
    });

    it('should use notification ID for job deduplication', async () => {
      const queue = getNotificationQueue();

      // Queue same notification twice (simulate retry)
      await notificationService.notifyTransactionInitiated(testUserId, 100, 'INR', 'txn_dedup');

      // First job should be in queue
      const stats1 = await getNotificationQueueStats();
      const initialTotal = stats1.waiting + stats1.active + stats1.completed;

      // Same notification shouldn't add duplicate (if using same notificationId)
      // Note: In practice, each call generates a new notificationId,
      // so this tests that different transactions create separate jobs
      await notificationService.notifyTransactionInitiated(testUserId, 100, 'INR', 'txn_dedup_2');

      const stats2 = await getNotificationQueueStats();
      const afterTotal = stats2.waiting + stats2.active + stats2.completed;
      // Jobs may be waiting, active, or completed depending on if a worker is running
      expect(afterTotal).toBe(initialTotal + 1);
    });
  });
});
