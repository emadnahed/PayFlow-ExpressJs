/**
 * Webhook API Load Tests for PayFlow
 *
 * Tests webhook subscription and delivery under load including:
 * - Webhook CRUD operations
 * - Subscription management
 * - Delivery log retrieval
 *
 * Usage:
 *   k6 run tests/load/webhook.test.js
 *   k6 run --vus 30 --duration 5m tests/load/webhook.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  generateTestEmail,
  clearAuth,
  sleepWithJitter,
  parseJson,
  errorRate,
  successRate,
} from '../../config/test-utils.js';

// Custom metrics
const webhookCreateLatency = new Trend('webhook_create_latency', true);
const webhookListLatency = new Trend('webhook_list_latency', true);
const webhookGetLatency = new Trend('webhook_get_latency', true);
const webhookUpdateLatency = new Trend('webhook_update_latency', true);
const webhookDeleteLatency = new Trend('webhook_delete_latency', true);
const webhookOperations = new Counter('webhook_operations');

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up
    { duration: '1m', target: 20 },   // Increase
    { duration: '2m', target: 20 },   // Sustain
    { duration: '1m', target: 30 },   // Peak
    { duration: '1m', target: 30 },   // Sustain peak
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.02'],
    errors: ['rate<0.02'],
    webhook_create_latency: ['p(95)<800'],
    webhook_list_latency: ['p(95)<600'],
    webhook_get_latency: ['p(95)<500'],
  },
  tags: {
    testType: 'load',
    component: 'webhook',
  },
};

// Webhook event types for testing
const EVENT_TYPES = [
  'TRANSACTION_COMPLETED',
  'TRANSACTION_FAILED',
  'DEBIT_SUCCESS',
  'CREDIT_SUCCESS',
];

export function setup() {
  console.log(`Running webhook load tests against: ${config.baseUrl}`);

  // Create test users
  const users = [];
  for (let i = 0; i < 5; i++) {
    const email = generateTestEmail();
    const password = 'WebhookTest123!';

    const registerResponse = apiClient.register(email, password, `Webhook Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      users.push({ email, password, webhooks: [] });
      console.log(`Created test user: ${email}`);
    } else if (registerResponse.status === 409) {
      users.push({ email, password, webhooks: [] });
    }
  }

  // Register and add default test user
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Webhook Test User Default'
  );
  if (testUser1Response.status === 201 || testUser1Response.status === 200 || testUser1Response.status === 409) {
    users.push({
      email: config.testUser.email,
      password: config.testUser.password,
      webhooks: [],
    });
  }

  return { users };
}

export default function (data) {
  const userIndex = Math.floor(Math.random() * data.users.length);
  const testUser = data.users[userIndex];

  clearAuth();

  // Authenticate
  group('Authentication', function () {
    const loginSuccess = authenticate(testUser.email, testUser.password);
    if (!loginSuccess.success) {
      errorRate.add(1);
      return;
    }
    successRate.add(1);
    sleepWithJitter(200);
  });

  // Group 1: Create Webhook
  group('Create Webhook', function () {
    const startTime = Date.now();
    const webhookUrl = `https://webhook-test-${Date.now()}-${Math.random().toString(36).substring(7)}.example.com/hook`;
    const events = [EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]];

    const response = apiClient.createWebhook(webhookUrl, events);
    webhookCreateLatency.add(Date.now() - startTime);

    const createSuccess = check(response, {
      'webhook created': (r) => r.status === 201 || r.status === 409, // 409 for duplicate URL
    });

    if (createSuccess && response.status === 201) {
      const data = parseJson(response);
      const webhookId = data?.data?.webhook?.webhookId;
      if (webhookId) {
        // Store for later operations (note: shared state doesn't work in k6, so we fetch fresh)
        testUser.webhooks.push(webhookId);
      }
    }

    webhookOperations.add(1);
    sleepWithJitter(300);
  });

  // Group 2: List Webhooks
  group('List Webhooks', function () {
    const startTime = Date.now();

    const response = apiClient.listWebhooks({ limit: 20 });
    webhookListLatency.add(Date.now() - startTime);

    check(response, {
      'webhooks listed': (r) => r.status === 200,
      'response has webhooks array': (r) => {
        const data = parseJson(r);
        return data?.data?.webhooks !== undefined || data?.webhooks !== undefined;
      },
    });

    webhookOperations.add(1);
    sleepWithJitter(200);
  });

  // Group 3: Get Single Webhook
  group('Get Webhook Details', function () {
    // First get list to find a webhook ID
    const listResponse = apiClient.listWebhooks({ limit: 5 });
    const listData = parseJson(listResponse);
    const webhooks = listData?.data?.webhooks || listData?.webhooks || [];

    if (webhooks.length > 0) {
      const webhookId = webhooks[0].webhookId;

      const startTime = Date.now();
      const response = apiClient.getWebhook(webhookId);
      webhookGetLatency.add(Date.now() - startTime);

      check(response, {
        'webhook retrieved': (r) => r.status === 200,
        'webhook has correct id': (r) => {
          const data = parseJson(r);
          return data?.data?.webhook?.webhookId === webhookId;
        },
      });

      webhookOperations.add(1);
    }

    sleepWithJitter(200);
  });

  // Group 4: Filter Webhooks
  group('Filter Webhooks by Status', function () {
    const startTime = Date.now();

    // List only active webhooks
    const activeResponse = apiClient.listWebhooks({ isActive: true });
    webhookListLatency.add(Date.now() - startTime);

    check(activeResponse, {
      'active webhooks filtered': (r) => r.status === 200,
    });

    const activeData = parseJson(activeResponse);
    const activeWebhooks = activeData?.data?.webhooks || activeData?.webhooks || [];

    check(activeWebhooks, {
      'all returned webhooks are active': (webhooks) =>
        webhooks.length === 0 || webhooks.every((w) => w.isActive === true),
    });

    webhookOperations.add(1);
    sleepWithJitter(200);
  });

  // Group 5: Mixed Operations (simulating real usage)
  group('Mixed Webhook Operations', function () {
    const operation = Math.random();

    if (operation < 0.3) {
      // 30% - List webhooks
      const response = apiClient.listWebhooks();
      check(response, { 'list successful': (r) => r.status === 200 });
    } else if (operation < 0.5) {
      // 20% - Get specific webhook
      const listResponse = apiClient.listWebhooks({ limit: 1 });
      const listData = parseJson(listResponse);
      const webhooks = listData?.data?.webhooks || [];

      if (webhooks.length > 0) {
        const response = apiClient.getWebhook(webhooks[0].webhookId);
        check(response, { 'get successful': (r) => r.status === 200 });
      }
    } else if (operation < 0.7) {
      // 20% - Create new webhook
      const url = `https://mixed-${Date.now()}-${__VU}.example.com/hook`;
      const response = apiClient.createWebhook(url, [EVENT_TYPES[0]]);
      check(response, {
        'create successful': (r) => r.status === 201 || r.status === 409,
      });
    } else {
      // 30% - List with filters
      const response = apiClient.listWebhooks({ limit: 10, isActive: true });
      check(response, { 'filtered list successful': (r) => r.status === 200 });
    }

    webhookOperations.add(1);
    sleepWithJitter(300);
  });

  // Think time
  sleep(Math.random() * 2 + 0.5);
}

export function teardown(data) {
  console.log('Webhook load tests completed');
  console.log(`Total test users: ${data.users.length}`);

  // Note: In a real scenario, you might want to clean up created webhooks
  // However, cleanup during teardown with multiple VUs can be complex
  // Consider using a separate cleanup script
}
