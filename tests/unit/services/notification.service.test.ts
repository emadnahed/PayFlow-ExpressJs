/**
 * Unit Tests: NotificationService
 *
 * Tests notification queuing with enqueueNotification mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockEnqueueNotification = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/queues', () => ({
  enqueueNotification: (...a: unknown[]) => mockEnqueueNotification(...a),
  NotificationType: {
    TRANSACTION_INITIATED: 'TRANSACTION_INITIATED',
    TRANSACTION_COMPLETED: 'TRANSACTION_COMPLETED',
    TRANSACTION_FAILED: 'TRANSACTION_FAILED',
    CREDIT_RECEIVED: 'CREDIT_RECEIVED',
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { NotificationService } from '../../../src/services/notification/notification.service';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationService (unit)', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  // ── queueNotification ─────────────────────────────────────────────────────

  describe('queueNotification', () => {
    it('should enqueue a notification and return a notificationId', async () => {
      const id = await service.queueNotification(
        'u1',
        'TRANSACTION_INITIATED' as never,
        { amount: 100, currency: 'INR', transactionId: 'txn_1' }
      );

      expect(id).toMatch(/^ntf_/);
      expect(mockEnqueueNotification).toHaveBeenCalledTimes(1);
      const jobData = mockEnqueueNotification.mock.calls[0][0];
      expect(jobData.userId).toBe('u1');
      expect(jobData.type).toBe('TRANSACTION_INITIATED');
      expect(jobData.notificationId).toBe(id);
    });
  });

  // ── notifyTransactionInitiated ────────────────────────────────────────────

  describe('notifyTransactionInitiated', () => {
    it('should queue a TRANSACTION_INITIATED notification', async () => {
      const id = await service.notifyTransactionInitiated('u1', 100, 'INR', 'txn_1');

      expect(id).toMatch(/^ntf_/);
      const jobData = mockEnqueueNotification.mock.calls[0][0];
      expect(jobData.type).toBe('TRANSACTION_INITIATED');
    });
  });

  // ── notifyTransactionCompleted ────────────────────────────────────────────

  describe('notifyTransactionCompleted', () => {
    it('should queue a TRANSACTION_COMPLETED notification', async () => {
      const id = await service.notifyTransactionCompleted('u1', 'Alice', 100, 'INR', 'txn_1');

      expect(id).toMatch(/^ntf_/);
      const jobData = mockEnqueueNotification.mock.calls[0][0];
      expect(jobData.type).toBe('TRANSACTION_COMPLETED');
    });
  });

  // ── notifyTransactionFailed ───────────────────────────────────────────────

  describe('notifyTransactionFailed', () => {
    it('should queue a TRANSACTION_FAILED notification', async () => {
      const id = await service.notifyTransactionFailed('u1', 100, 'INR', 'txn_1');

      expect(id).toMatch(/^ntf_/);
      const jobData = mockEnqueueNotification.mock.calls[0][0];
      expect(jobData.type).toBe('TRANSACTION_FAILED');
    });
  });

  // ── notifyCreditReceived ──────────────────────────────────────────────────

  describe('notifyCreditReceived', () => {
    it('should queue a CREDIT_RECEIVED notification', async () => {
      const id = await service.notifyCreditReceived('u2', 'Bob', 200, 'INR', 'txn_2');

      expect(id).toMatch(/^ntf_/);
      const jobData = mockEnqueueNotification.mock.calls[0][0];
      expect(jobData.type).toBe('CREDIT_RECEIVED');
      expect(jobData.userId).toBe('u2');
    });
  });
});
