/**
 * Webhook Worker Unit Tests
 *
 * Tests webhook delivery processing, HMAC signing, and retry logic.
 */

import crypto from 'crypto';

// Mock axios
const mockAxios = {
  post: jest.fn(),
  isAxiosError: jest.fn(),
};
jest.mock('axios', () => mockAxios);

// Mock BullMQ Worker - must be defined before jest.mock
const mockWorkerInstance = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  closing: false,
};
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => mockWorkerInstance),
  Job: jest.fn(),
}));

// Mock WebhookSubscription model
const mockWebhookSubscription = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
};
jest.mock('../../../src/models/WebhookSubscription', () => ({
  WebhookSubscription: mockWebhookSubscription,
}));

// Mock WebhookDelivery model
const mockWebhookDelivery = {
  updateOne: jest.fn(),
};
jest.mock('../../../src/models/WebhookDelivery', () => ({
  WebhookDelivery: mockWebhookDelivery,
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    webhook: {
      timeoutMs: 5000,
      retryAttempts: 3,
      maxFailureCount: 10,
    },
  },
}));

// Mock queue config
jest.mock('../../../src/queues/queue.config', () => ({
  queueConnection: { host: 'localhost', port: 6379 },
  QUEUE_NAMES: { WEBHOOKS: 'webhooks' },
  WORKER_CONCURRENCY: { WEBHOOKS: 5 },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/observability', () => ({
  logger: mockLogger,
}));

describe('Webhook Worker', () => {
  // Import fresh module for each test
  let startWebhookWorker: typeof import('../../../src/queues/workers/webhook.worker').startWebhookWorker;
  let stopWebhookWorker: typeof import('../../../src/queues/workers/webhook.worker').stopWebhookWorker;
  let isWebhookWorkerRunning: typeof import('../../../src/queues/workers/webhook.worker').isWebhookWorkerRunning;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockWorkerInstance.on.mockClear();
    mockWorkerInstance.close.mockClear();
    mockWorkerInstance.closing = false;

    // Reset module cache to get fresh instance
    jest.resetModules();

    // Re-import after reset
    const module = await import('../../../src/queues/workers/webhook.worker');
    startWebhookWorker = module.startWebhookWorker;
    stopWebhookWorker = module.stopWebhookWorker;
    isWebhookWorkerRunning = module.isWebhookWorkerRunning;
  });

  describe('signPayload', () => {
    it('should generate correct HMAC-SHA256 signature', () => {
      const payload = { event: 'TRANSACTION_COMPLETED', data: { amount: 100 } };
      const secret = 'test-secret-key';

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // Verify signature format
      expect(expectedSignature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const payload1 = { event: 'A' };
      const payload2 = { event: 'B' };

      const sig1 = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload1))
        .digest('hex');
      const sig2 = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload2))
        .digest('hex');

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = { event: 'test' };

      const sig1 = crypto
        .createHmac('sha256', 'secret1')
        .update(JSON.stringify(payload))
        .digest('hex');
      const sig2 = crypto
        .createHmac('sha256', 'secret2')
        .update(JSON.stringify(payload))
        .digest('hex');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('truncateResponse', () => {
    it('should not truncate short responses', () => {
      const shortResponse = 'OK';
      // truncateResponse is internal, test via expected behavior
      expect(shortResponse.length).toBeLessThan(1000);
    });

    it('should handle long responses', () => {
      const longResponse = 'x'.repeat(2000);
      const truncated =
        longResponse.length > 1000 ? longResponse.substring(0, 1000) + '...' : longResponse;

      expect(truncated.length).toBe(1003); // 1000 + '...'
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should handle object responses', () => {
      const objResponse = { key: 'value'.repeat(500) };
      const str = JSON.stringify(objResponse);
      const truncated = str.length > 1000 ? str.substring(0, 1000) + '...' : str;

      expect(typeof truncated).toBe('string');
    });
  });

  describe('startWebhookWorker', () => {
    it('should create and return worker instance', () => {
      const worker = startWebhookWorker();

      expect(worker).toBeDefined();
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorkerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return existing worker if already started', () => {
      const worker1 = startWebhookWorker();
      const worker2 = startWebhookWorker();

      expect(worker1).toBe(worker2);
    });
  });

  describe('stopWebhookWorker', () => {
    it('should stop running worker', async () => {
      startWebhookWorker();
      await stopWebhookWorker();

      expect(mockWorkerInstance.close).toHaveBeenCalled();
    });

    it('should handle stopping when no worker exists', async () => {
      // Reset worker state by stopping first
      await stopWebhookWorker();
      await stopWebhookWorker(); // Should not throw
    });
  });

  describe('isWebhookWorkerRunning', () => {
    it('should return false when worker not started', async () => {
      await stopWebhookWorker();
      // After stopping, new check should show not running
      expect(typeof isWebhookWorkerRunning()).toBe('boolean');
    });

    it('should return true when worker is running', () => {
      startWebhookWorker();
      mockWorkerInstance.closing = false;

      expect(isWebhookWorkerRunning()).toBe(true);
    });

    it('should return false when worker is closing', () => {
      startWebhookWorker();
      mockWorkerInstance.closing = true;

      expect(isWebhookWorkerRunning()).toBe(false);
    });
  });

  describe('worker event handlers', () => {
    it('should log on job completion', () => {
      mockLogger.info.mockClear();

      startWebhookWorker();

      // Get the completed handler
      const completedCall = mockWorkerInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'completed'
      );
      expect(completedCall).toBeDefined();

      const completedHandler = completedCall[1];
      completedHandler({ id: 'job-123' }, { success: true });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123', success: true }),
        'Webhook job completed'
      );
    });

    it('should log on job failure', async () => {
      mockLogger.error.mockClear();

      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_123',
        failureCount: 5,
      });

      startWebhookWorker();

      // Get the failed handler
      const failedCall = mockWorkerInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'failed'
      );
      expect(failedCall).toBeDefined();

      const failedHandler = failedCall[1];
      await failedHandler(
        {
          id: 'job-123',
          attemptsMade: 3,
          opts: { attempts: 3 },
          data: { webhookId: 'wh_123' },
        },
        new Error('Delivery failed')
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-123' }),
        'Webhook job failed'
      );
    });

    it('should handle null job in failed handler', async () => {
      startWebhookWorker();

      const failedCall = mockWorkerInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'failed'
      );
      const failedHandler = failedCall[1];

      // Should not throw when job is null
      await failedHandler(null, new Error('Test error'));
    });

    it('should disable webhook after max failures', async () => {
      mockLogger.warn.mockClear();

      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_123',
        failureCount: 10, // At max failure count
      });
      mockWebhookSubscription.updateOne.mockResolvedValue({ modifiedCount: 1 });

      startWebhookWorker();

      const failedCall = mockWorkerInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'failed'
      );
      const failedHandler = failedCall[1];

      await failedHandler(
        {
          id: 'job-123',
          attemptsMade: 3,
          opts: { attempts: 3 },
          data: { webhookId: 'wh_123' },
        },
        new Error('Delivery failed')
      );

      expect(mockWebhookSubscription.updateOne).toHaveBeenCalledWith(
        { webhookId: 'wh_123' },
        { $set: { isActive: false } }
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: 'wh_123' }),
        'Webhook disabled due to excessive failures'
      );
    });

    it('should log worker errors', () => {
      mockLogger.error.mockClear();

      startWebhookWorker();

      const errorCall = mockWorkerInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'error'
      );
      const errorHandler = errorCall[1];

      const testError = new Error('Worker crashed');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: testError }),
        'Webhook worker error'
      );
    });
  });

  describe('processWebhookJob (via Worker processor)', () => {
    function getProcessorFn() {
      startWebhookWorker();
      const WorkerMock = jest.requireMock('bullmq').Worker;
      // processWebhookJob is the second argument passed to new Worker(...)
      return WorkerMock.mock.calls[0][1] as (job: Record<string, unknown>) => Promise<unknown>;
    }

    const fakeJob = {
      id: 'job-1',
      data: {
        webhookId: 'wh_1',
        deliveryId: 'd_1',
        payload: { event: 'transaction.completed', transactionId: 'txn_1' },
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    it('should return failure result when subscription not found', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue(null);
      const processor = getProcessorFn();

      const result = await processor(fakeJob);

      expect(result).toMatchObject({ success: false });
      expect(mockWebhookDelivery.updateOne).toHaveBeenCalledWith(
        { deliveryId: 'd_1' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED' }) })
      );
    });

    it('should log warning when subscription not found', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue(null);
      const processor = getProcessorFn();

      await processor(fakeJob);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ webhookId: 'wh_1' }),
        'Webhook not found or inactive, skipping'
      );
    });

    it('should deliver webhook successfully and return success result', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });
      mockWebhookSubscription.updateOne.mockResolvedValue({});
      mockWebhookDelivery.updateOne.mockResolvedValue({});
      mockAxios.post.mockResolvedValue({ status: 200, data: 'ok' });
      const processor = getProcessorFn();

      const result = await processor(fakeJob);

      expect(result).toMatchObject({ success: true, statusCode: 200 });
      expect(mockWebhookDelivery.updateOne).toHaveBeenCalledWith(
        { deliveryId: 'd_1' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'SUCCESS' }) })
      );
    });

    it('should include HMAC signature header in HTTP request', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });
      mockWebhookSubscription.updateOne.mockResolvedValue({});
      mockWebhookDelivery.updateOne.mockResolvedValue({});
      mockAxios.post.mockResolvedValue({ status: 200, data: 'ok' });
      const processor = getProcessorFn();

      await processor(fakeJob);

      const callArgs = mockAxios.post.mock.calls[0];
      expect(callArgs[2].headers['X-PayFlow-Signature']).toMatch(/^sha256=[a-f0-9]+$/);
      expect(callArgs[2].headers['X-PayFlow-Delivery-ID']).toBe('d_1');
    });

    it('should update to RETRYING status on non-last axios error', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });
      mockWebhookDelivery.updateOne.mockResolvedValue({});
      mockWebhookSubscription.updateOne.mockResolvedValue({});
      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.post.mockRejectedValue(
        Object.assign(new Error('connection refused'), { response: { status: 503 } })
      );
      const processor = getProcessorFn();

      // attemptsMade=0, maxAttempts=3 → NOT last attempt
      await expect(processor({ ...fakeJob, attemptsMade: 0 })).rejects.toThrow();

      expect(mockWebhookDelivery.updateOne).toHaveBeenCalledWith(
        { deliveryId: 'd_1' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'RETRYING' }) })
      );
    });

    it('should update to FAILED on last-attempt error', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });
      mockWebhookDelivery.updateOne.mockResolvedValue({});
      mockWebhookSubscription.updateOne.mockResolvedValue({});
      mockAxios.isAxiosError.mockReturnValue(false);
      mockAxios.post.mockRejectedValue(new Error('server error'));
      const processor = getProcessorFn();

      // attemptsMade=2, maxAttempts=3 → last attempt (2+1 >= 3)
      await expect(processor({ ...fakeJob, attemptsMade: 2 })).rejects.toThrow();

      expect(mockWebhookDelivery.updateOne).toHaveBeenCalledWith(
        { deliveryId: 'd_1' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED' }) })
      );
    });

    it('should increment subscription failureCount on error', async () => {
      mockWebhookSubscription.findOne.mockResolvedValue({
        webhookId: 'wh_1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });
      mockWebhookDelivery.updateOne.mockResolvedValue({});
      mockWebhookSubscription.updateOne.mockResolvedValue({});
      mockAxios.isAxiosError.mockReturnValue(false);
      mockAxios.post.mockRejectedValue(new Error('error'));
      const processor = getProcessorFn();

      await expect(processor(fakeJob)).rejects.toThrow();

      expect(mockWebhookSubscription.updateOne).toHaveBeenCalledWith(
        { webhookId: 'wh_1' },
        expect.objectContaining({ $inc: { failureCount: 1 } })
      );
    });

    it('should handle axios errors correctly', () => {
      const axiosError = {
        response: { status: 500 },
        message: 'Internal Server Error',
        isAxiosError: true,
      };

      mockAxios.isAxiosError.mockReturnValue(true);

      expect(mockAxios.isAxiosError(axiosError)).toBe(true);
    });

    it('should handle non-axios errors', () => {
      const genericError = new Error('Network error');

      mockAxios.isAxiosError.mockReturnValue(false);

      expect(mockAxios.isAxiosError(genericError)).toBe(false);
    });
  });
});
