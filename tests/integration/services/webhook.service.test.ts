/**
 * Webhook Service Integration Tests
 *
 * Tests webhook subscription management, delivery, and retry logic with real MongoDB.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';

import { User } from '../../../src/models/User';
import { Wallet } from '../../../src/models/Wallet';
import { WebhookSubscription } from '../../../src/models/WebhookSubscription';
import { WebhookDelivery } from '../../../src/models/WebhookDelivery';
import { EventType } from '../../../src/types/events';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Import the real service
import { WebhookService } from '../../../src/services/webhook/webhook.service';

describe('Webhook Service Integration Tests', () => {
  let webhookService: WebhookService;
  let testUserId: string;

  beforeAll(async () => {
    await mongoose.connect(TEST_MONGODB_URI);
    webhookService = new WebhookService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WebhookSubscription.deleteMany({});
    await WebhookDelivery.deleteMany({});

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

  describe('Webhook Creation', () => {
    it('should create webhook subscription', async () => {
      const webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED, EventType.TRANSACTION_FAILED],
      });

      expect(webhook.webhookId).toMatch(/^whk_/);
      expect(webhook.userId).toBe(testUserId);
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toHaveLength(2);
      expect(webhook.isActive).toBe(true);
      expect(webhook.secret).toBeDefined();
      expect(webhook.secret.length).toBe(64); // 32 bytes hex
    });

    it('should create webhook with custom secret', async () => {
      const customSecret = 'my-custom-webhook-secret-key';

      const webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
        secret: customSecret,
      });

      expect(webhook.secret).toBe(customSecret);
    });

    it('should reject duplicate URL for same user', async () => {
      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      await expect(
        webhookService.createWebhook(testUserId, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_FAILED],
        })
      ).rejects.toThrow();
    });

    it('should allow same URL for different users', async () => {
      // Create second user
      const user2Id = `user_test_2_${Date.now()}`;
      await User.create({
        userId: user2Id,
        name: 'Test User 2',
        email: `test2_${Date.now()}@example.com`,
        password: 'hashedpassword',
      });

      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      const webhook2 = await webhookService.createWebhook(user2Id, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      expect(webhook2).toBeDefined();
    });

    it('should reject invalid URL', async () => {
      await expect(
        webhookService.createWebhook(testUserId, {
          url: 'not-a-valid-url',
          events: [EventType.TRANSACTION_COMPLETED],
        })
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should reject empty events array', async () => {
      await expect(
        webhookService.createWebhook(testUserId, {
          url: 'https://example.com/webhook',
          events: [],
        })
      ).rejects.toThrow('At least one event type is required');
    });
  });

  describe('List Webhooks', () => {
    beforeEach(async () => {
      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook1',
        events: [EventType.TRANSACTION_COMPLETED],
      });
      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook2',
        events: [EventType.TRANSACTION_FAILED],
      });
    });

    it('should list user webhooks', async () => {
      const result = await webhookService.listWebhooks(testUserId);

      expect(result.webhooks.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter by active status', async () => {
      // Deactivate one
      const list = await webhookService.listWebhooks(testUserId);
      await webhookService.updateWebhook(list.webhooks[0].webhookId, testUserId, {
        isActive: false,
      });

      const active = await webhookService.listWebhooks(testUserId, { isActive: true });
      const inactive = await webhookService.listWebhooks(testUserId, { isActive: false });

      expect(active.webhooks.length).toBe(1);
      expect(inactive.webhooks.length).toBe(1);
    });

    it('should paginate webhooks', async () => {
      // Create more webhooks
      for (let i = 0; i < 5; i++) {
        await webhookService.createWebhook(testUserId, {
          url: `https://example.com/webhook_extra_${i}`,
          events: [EventType.TRANSACTION_COMPLETED],
        });
      }

      const page1 = await webhookService.listWebhooks(testUserId, { limit: 3, offset: 0 });
      const page2 = await webhookService.listWebhooks(testUserId, { limit: 3, offset: 3 });

      expect(page1.webhooks.length).toBe(3);
      expect(page2.webhooks.length).toBe(3);
      expect(page1.webhooks[0].webhookId).not.toBe(page2.webhooks[0].webhookId);
    });
  });

  describe('Get Single Webhook', () => {
    it('should get webhook by ID', async () => {
      const created = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      const webhook = await webhookService.getWebhook(created.webhookId, testUserId);

      expect(webhook.webhookId).toBe(created.webhookId);
      expect(webhook.url).toBe('https://example.com/webhook');
    });

    it('should throw error for non-existent webhook', async () => {
      await expect(
        webhookService.getWebhook('whk_nonexistent', testUserId)
      ).rejects.toThrow();
    });

    it('should throw error when accessing other users webhook', async () => {
      const created = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      await expect(
        webhookService.getWebhook(created.webhookId, 'other_user')
      ).rejects.toThrow();
    });
  });

  describe('Update Webhook', () => {
    let webhook: any;

    beforeEach(async () => {
      webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });
    });

    it('should update webhook URL', async () => {
      const updated = await webhookService.updateWebhook(
        webhook.webhookId,
        testUserId,
        { url: 'https://example.com/new-webhook' }
      );

      expect(updated.url).toBe('https://example.com/new-webhook');
    });

    it('should update webhook events', async () => {
      const updated = await webhookService.updateWebhook(
        webhook.webhookId,
        testUserId,
        { events: [EventType.TRANSACTION_FAILED, EventType.CREDIT_SUCCESS] }
      );

      expect(updated.events).toHaveLength(2);
      expect(updated.events).toContain(EventType.TRANSACTION_FAILED);
      expect(updated.events).toContain(EventType.CREDIT_SUCCESS);
    });

    it('should deactivate webhook', async () => {
      const updated = await webhookService.updateWebhook(
        webhook.webhookId,
        testUserId,
        { isActive: false }
      );

      expect(updated.isActive).toBe(false);
    });

    it('should reset failure count when reactivating', async () => {
      // Simulate failures
      await WebhookSubscription.updateOne(
        { webhookId: webhook.webhookId },
        { $set: { failureCount: 5, isActive: false } }
      );

      const updated = await webhookService.updateWebhook(
        webhook.webhookId,
        testUserId,
        { isActive: true }
      );

      expect(updated.isActive).toBe(true);
      expect(updated.failureCount).toBe(0);
    });
  });

  describe('Delete Webhook', () => {
    it('should delete webhook', async () => {
      const webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      await webhookService.deleteWebhook(webhook.webhookId, testUserId);

      await expect(
        webhookService.getWebhook(webhook.webhookId, testUserId)
      ).rejects.toThrow();
    });

    it('should not allow deleting other users webhook', async () => {
      const webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      await expect(
        webhookService.deleteWebhook(webhook.webhookId, 'other_user')
      ).rejects.toThrow();
    });
  });

  describe('Webhook Delivery Logs', () => {
    let webhook: any;

    beforeEach(async () => {
      webhook = await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      // Create delivery logs directly
      for (let i = 0; i < 5; i++) {
        await WebhookDelivery.create({
          deliveryId: `dlv_test_${i}`,
          webhookId: webhook.webhookId,
          transactionId: `txn_test_${i}`,
          eventType: EventType.TRANSACTION_COMPLETED,
          payload: { event: EventType.TRANSACTION_COMPLETED },
          status: i < 3 ? 'SUCCESS' : 'FAILED',
          responseCode: i < 3 ? 200 : undefined,
          error: i >= 3 ? 'Connection timeout' : undefined,
        });
      }
    });

    it('should get delivery logs for webhook', async () => {
      const result = await webhookService.getDeliveryLogs(
        webhook.webhookId,
        testUserId
      );

      expect(result.deliveries.length).toBe(5);
      expect(result.total).toBe(5);
    });

    it('should filter logs by status', async () => {
      const successful = await webhookService.getDeliveryLogs(
        webhook.webhookId,
        testUserId,
        { status: 'SUCCESS' }
      );

      expect(successful.deliveries.length).toBe(3);

      const failed = await webhookService.getDeliveryLogs(
        webhook.webhookId,
        testUserId,
        { status: 'FAILED' }
      );

      expect(failed.deliveries.length).toBe(2);
    });

    it('should paginate delivery logs', async () => {
      const page1 = await webhookService.getDeliveryLogs(
        webhook.webhookId,
        testUserId,
        { limit: 2, offset: 0 }
      );

      const page2 = await webhookService.getDeliveryLogs(
        webhook.webhookId,
        testUserId,
        { limit: 2, offset: 2 }
      );

      expect(page1.deliveries.length).toBe(2);
      expect(page2.deliveries.length).toBe(2);
    });
  });

  describe('Trigger Webhooks', () => {
    beforeEach(async () => {
      // Create user 2
      const user2Id = `user_test_2_${Date.now()}`;
      await User.create({
        userId: user2Id,
        name: 'Test User 2',
        email: `test2_${Date.now()}@example.com`,
        password: 'hashedpassword',
      });

      // Webhooks for different events
      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook1',
        events: [EventType.TRANSACTION_COMPLETED, EventType.TRANSACTION_FAILED],
      });

      await webhookService.createWebhook(testUserId, {
        url: 'https://example.com/webhook2',
        events: [EventType.TRANSACTION_COMPLETED],
      });

      await webhookService.createWebhook(user2Id, {
        url: 'https://example.com/webhook3',
        events: [EventType.TRANSACTION_FAILED],
      });
    });

    it('should find active webhooks for event type', async () => {
      // triggerWebhooks finds and triggers webhooks internally
      // We can check the count returned
      const count = await webhookService.triggerWebhooks(
        EventType.TRANSACTION_COMPLETED,
        'txn_test_123',
        {
          event: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_test_123',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          timestamp: new Date().toISOString(),
        }
      );

      // 2 webhooks are subscribed to TRANSACTION_COMPLETED
      expect(count).toBe(2);
    });

    it('should not trigger inactive webhooks', async () => {
      // Deactivate one
      const list = await webhookService.listWebhooks(testUserId);
      await webhookService.updateWebhook(list.webhooks[0].webhookId, testUserId, {
        isActive: false,
      });

      const count = await webhookService.triggerWebhooks(
        EventType.TRANSACTION_COMPLETED,
        'txn_test_456',
        {
          event: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_test_456',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          timestamp: new Date().toISOString(),
        }
      );

      expect(count).toBe(1);
    });

    it('should return 0 for event with no subscribers', async () => {
      const count = await webhookService.triggerWebhooks(
        EventType.REFUND_COMPLETED,
        'txn_test_789',
        {
          event: EventType.REFUND_COMPLETED,
          transactionId: 'txn_test_789',
          status: 'COMPLETED',
          amount: 100,
          currency: 'INR',
          timestamp: new Date().toISOString(),
        }
      );

      expect(count).toBe(0);
    });
  });

  describe('HMAC Signature Generation', () => {
    it('should generate valid HMAC signature', () => {
      const payload = {
        event: EventType.TRANSACTION_COMPLETED,
        transactionId: 'txn_test123',
        amount: 100,
      };
      const secret = 'test-secret-key';

      const data = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures for same payload', () => {
      const payload = { event: 'TEST', data: 123 };
      const secret = 'consistent-secret';

      const sig1 = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
      const sig2 = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = { event: 'TEST', data: 123 };

      const sig1 = crypto.createHmac('sha256', 'secret1').update(JSON.stringify(payload)).digest('hex');
      const sig2 = crypto.createHmac('sha256', 'secret2').update(JSON.stringify(payload)).digest('hex');

      expect(sig1).not.toBe(sig2);
    });
  });
});
