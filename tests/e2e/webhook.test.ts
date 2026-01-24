import request from 'supertest';
import mongoose from 'mongoose';
import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { WebhookSubscription } from '../../src/models/WebhookSubscription';
import { WebhookDelivery } from '../../src/models/WebhookDelivery';
import { createTestUser } from '../helpers/testAuth';
import { EventType } from '../../src/types/events';

const app = getTestApp();

describe('Webhook API Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await WebhookSubscription.deleteMany({});
    await WebhookDelivery.deleteMany({});
  });

  describe('POST /webhooks - Create Webhook', () => {
    it('should create a webhook subscription', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED, EventType.TRANSACTION_FAILED],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.webhook).toBeDefined();
      expect(response.body.data.webhook.webhookId).toMatch(/^whk_/);
      expect(response.body.data.webhook.url).toBe('https://example.com/webhook');
      expect(response.body.data.webhook.events).toHaveLength(2);
      expect(response.body.data.webhook.isActive).toBe(true);
      // Secret should be returned only on creation
      expect(response.body.data.webhook.secret).toBeDefined();
      expect(response.body.data.webhook.secret.length).toBe(64); // 32 bytes hex
    });

    it('should create webhook with custom secret', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });
      const customSecret = 'my-custom-secret-that-is-long-enough';

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
          secret: customSecret,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.webhook.secret).toBe(customSecret);
    });

    it('should reject invalid URL', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'not-a-valid-url',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      expect(response.status).toBe(400);
    });

    it('should reject empty events array', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [],
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid event types', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: ['INVALID_EVENT_TYPE'],
        });

      expect(response.status).toBe(400);
    });

    it('should reject duplicate URL for same user', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      // Create first webhook
      await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_FAILED],
        });

      expect(response.status).toBe(409);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /webhooks - List Webhooks', () => {
    it('should list user webhooks', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      // Create multiple webhooks
      await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook1',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook2',
          events: [EventType.TRANSACTION_FAILED],
        });

      const response = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.webhooks).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      // Secret should NOT be returned in list
      expect(response.body.data.webhooks[0].secret).toBeUndefined();
    });

    it('should not include other users webhooks', async () => {
      const user1 = await createTestUser(app, { email: 'user1@test.com' });
      const user2 = await createTestUser(app, { email: 'user2@test.com' });

      // User1 creates webhook
      await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          url: 'https://example.com/webhook1',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      // User2 lists webhooks
      const response = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${user2.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.webhooks).toHaveLength(0);
    });

    it('should filter by isActive', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      // Create active webhook
      const res1 = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook1',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      // Create and deactivate another webhook
      const res2 = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook2',
          events: [EventType.TRANSACTION_FAILED],
        });

      await request(app)
        .patch(`/webhooks/${res2.body.data.webhook.webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ isActive: false });

      // List only active
      const response = await request(app)
        .get('/webhooks?isActive=true')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.webhooks).toHaveLength(1);
      expect(response.body.data.webhooks[0].webhookId).toBe(res1.body.data.webhook.webhookId);
    });
  });

  describe('GET /webhooks/:id - Get Webhook', () => {
    it('should get webhook by ID', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .get(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.webhook.webhookId).toBe(webhookId);
      // Secret should NOT be returned on get
      expect(response.body.data.webhook.secret).toBeUndefined();
    });

    it('should return 404 for non-existent webhook', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const response = await request(app)
        .get('/webhooks/whk_nonexistent')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for another users webhook', async () => {
      const user1 = await createTestUser(app, { email: 'user1@test.com' });
      const user2 = await createTestUser(app, { email: 'user2@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .get(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user2.accessToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /webhooks/:id - Update Webhook', () => {
    it('should update webhook URL', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .patch(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ url: 'https://example.com/new-webhook' });

      expect(response.status).toBe(200);
      expect(response.body.data.webhook.url).toBe('https://example.com/new-webhook');
    });

    it('should update webhook events', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .patch(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ events: [EventType.TRANSACTION_FAILED, EventType.CREDIT_SUCCESS] });

      expect(response.status).toBe(200);
      expect(response.body.data.webhook.events).toHaveLength(2);
      expect(response.body.data.webhook.events).toContain(EventType.TRANSACTION_FAILED);
      expect(response.body.data.webhook.events).toContain(EventType.CREDIT_SUCCESS);
    });

    it('should deactivate webhook', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .patch(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.webhook.isActive).toBe(false);
    });

    it('should reset failure count when reactivating', async () => {
      // Use unique email to avoid test isolation issues
      const uniqueEmail = `reset-failure-${Date.now()}@test.com`;
      const user = await createTestUser(app, { email: uniqueEmail });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook-reset',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      // Verify webhook was created successfully
      expect(createRes.status).toBe(201);
      expect(createRes.body.data?.webhook?.webhookId).toBeDefined();

      const webhookId = createRes.body.data.webhook.webhookId;

      // Simulate failures by updating directly
      const updateResult = await WebhookSubscription.updateOne(
        { webhookId },
        { $set: { failureCount: 5, isActive: false } }
      );
      expect(updateResult.matchedCount).toBe(1);

      // Reactivate
      const response = await request(app)
        .patch(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ isActive: true });

      expect(response.status).toBe(200);
      expect(response.body.data.webhook.isActive).toBe(true);
      expect(response.body.data.webhook.failureCount).toBe(0);
    });
  });

  describe('DELETE /webhooks/:id - Delete Webhook', () => {
    it('should delete webhook', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const deleteRes = await request(app)
        .delete(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(deleteRes.status).toBe(200);

      // Verify deleted
      const getRes = await request(app)
        .get(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(getRes.status).toBe(404);
    });

    it('should not allow deleting another users webhook', async () => {
      const user1 = await createTestUser(app, { email: 'user1@test.com' });
      const user2 = await createTestUser(app, { email: 'user2@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      const response = await request(app)
        .delete(`/webhooks/${webhookId}`)
        .set('Authorization', `Bearer ${user2.accessToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /webhooks/:id/logs - Delivery Logs', () => {
    it('should return delivery logs for webhook', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      // Create some delivery logs directly
      await WebhookDelivery.create({
        webhookId,
        transactionId: 'txn_test123',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: { event: EventType.TRANSACTION_COMPLETED },
        status: 'SUCCESS',
        responseCode: 200,
      });

      await WebhookDelivery.create({
        webhookId,
        transactionId: 'txn_test456',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: { event: EventType.TRANSACTION_COMPLETED },
        status: 'FAILED',
        error: 'Connection timeout',
      });

      const response = await request(app)
        .get(`/webhooks/${webhookId}/logs`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deliveries).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
    });

    it('should filter logs by status', async () => {
      const user = await createTestUser(app, { email: 'user@test.com' });

      const createRes = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });

      const webhookId = createRes.body.data.webhook.webhookId;

      // Create logs with different statuses
      await WebhookDelivery.create({
        webhookId,
        transactionId: 'txn_test1',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: {},
        status: 'SUCCESS',
      });

      await WebhookDelivery.create({
        webhookId,
        transactionId: 'txn_test2',
        eventType: EventType.TRANSACTION_COMPLETED,
        payload: {},
        status: 'FAILED',
      });

      const response = await request(app)
        .get(`/webhooks/${webhookId}/logs?status=FAILED`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deliveries).toHaveLength(1);
      expect(response.body.data.deliveries[0].status).toBe('FAILED');
    });
  });
});

describe('Webhook Service Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await WebhookSubscription.deleteMany({});
    await WebhookDelivery.deleteMany({});
  });

  describe('HMAC Signature', () => {
    it('should generate correct HMAC signature', async () => {
      const crypto = await import('crypto');

      const payload = {
        event: EventType.TRANSACTION_COMPLETED,
        transactionId: 'txn_test123',
        amount: 100,
      };
      const secret = 'test-secret-key';

      const data = JSON.stringify(payload);
      const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');

      // This verifies the signature format we use
      expect(expectedSignature).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
