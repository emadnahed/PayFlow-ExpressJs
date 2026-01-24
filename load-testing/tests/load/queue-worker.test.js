/**
 * Queue and Worker Load Tests for PayFlow
 *
 * Tests the message queue and worker infrastructure under load.
 * This test simulates high-volume scenarios that stress the queue system.
 *
 * Tests:
 * - High-volume transaction creation (queue load)
 * - Concurrent webhook subscription management
 * - Notification-triggering operations at scale
 *
 * Usage:
 *   k6 run tests/load/queue-worker.test.js
 *   k6 run --vus 50 --duration 10m tests/load/queue-worker.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  generateTestEmail,
  generateIdempotencyKey,
  clearAuth,
  sleepWithJitter,
  parseJson,
  errorRate,
  successRate,
} from '../../config/test-utils.js';

// Custom metrics
const queueJobLatency = new Trend('queue_job_latency', true);
const workerThroughput = new Counter('worker_throughput');
const transactionsQueued = new Counter('transactions_queued');
const webhookJobsQueued = new Counter('webhook_jobs_queued');
const notificationJobsQueued = new Counter('notification_jobs_queued');
const queueBackpressureRate = new Rate('queue_backpressure');

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up
    { duration: '2m', target: 50 },    // Increase to moderate load
    { duration: '3m', target: 50 },    // Sustain moderate load
    { duration: '2m', target: 100 },   // Ramp to high load
    { duration: '3m', target: 100 },   // Sustain high load
    { duration: '1m', target: 150 },   // Peak load
    { duration: '2m', target: 150 },   // Sustain peak
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    queue_job_latency: ['p(95)<1500'],
    queue_backpressure: ['rate<0.1'],
  },
  tags: {
    testType: 'load',
    component: 'queue-worker',
  },
};

export function setup() {
  console.log(`Running queue/worker load tests against: ${config.baseUrl}`);

  // Create test users
  const users = [];
  for (let i = 0; i < 20; i++) {
    const email = generateTestEmail();
    const password = 'QueueTest123!';

    const registerResponse = apiClient.register(email, password, `Queue Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      const data = parseJson(registerResponse);
      users.push({
        email,
        password,
        userId: data?.data?.user?.userId,
      });
      console.log(`Created test user ${i + 1}/20`);
    } else if (registerResponse.status === 409) {
      users.push({ email, password });
    }
  }

  // Register and add default test user
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Queue Worker Test User'
  );
  if (testUser1Response.status === 201 || testUser1Response.status === 200 || testUser1Response.status === 409) {
    users.push({
      email: config.testUser.email,
      password: config.testUser.password,
    });
  }

  return { users };
}

export default function (data) {
  const userIndex = Math.floor(Math.random() * data.users.length);
  const testUser = data.users[userIndex];

  clearAuth();

  // Authenticate
  const authResult = authenticate(testUser.email, testUser.password);
  if (!authResult.success) {
    errorRate.add(1);
    return;
  }
  successRate.add(1);

  // Scenario selection (weighted random)
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Transaction flow (queue heavy)
    transactionFlowTest(data, userIndex);
  } else if (scenario < 0.6) {
    // 20% - Webhook operations
    webhookOperationsTest();
  } else if (scenario < 0.8) {
    // 20% - Deposit burst (notification queue)
    depositBurstTest();
  } else {
    // 20% - Read operations (baseline)
    readOperationsTest();
  }

  // Short think time
  sleep(Math.random() * 0.5 + 0.2);
}

function transactionFlowTest(data, currentUserIndex) {
  group('Transaction Queue Load', function () {
    // Get wallet balance first
    const walletResponse = apiClient.getMyWallet();
    const walletData = parseJson(walletResponse);
    const balance = walletData?.data?.wallet?.balance || 0;

    if (balance < 100) {
      // Deposit first
      const depositResponse = apiClient.deposit(500, 'INR', generateIdempotencyKey());
      check(depositResponse, {
        'pre-transaction deposit': (r) => r.status === 200 || r.status === 201,
      });
      notificationJobsQueued.add(1);
      sleepWithJitter(100);
    }

    // Get a receiver
    const receiverIndex = (currentUserIndex + 1) % data.users.length;
    const receiver = data.users[receiverIndex];

    // Get receiver's userId
    clearAuth();
    const receiverAuth = authenticate(receiver.email, receiver.password);

    if (!receiverAuth.success) {
      errorRate.add(1);
      return;
    }

    const receiverWalletResponse = apiClient.getMyWallet();
    const receiverData = parseJson(receiverWalletResponse);
    const receiverId = receiverData?.data?.wallet?.userId;

    // Switch back
    clearAuth();
    authenticate(data.users[currentUserIndex].email, data.users[currentUserIndex].password);

    if (!receiverId) {
      return;
    }

    // Create transaction (this queues notification and potentially webhook jobs)
    const startTime = Date.now();
    const response = apiClient.createTransaction(
      receiverId,
      Math.floor(Math.random() * 50) + 10,
      'INR',
      'Queue load test',
      generateIdempotencyKey()
    );
    queueJobLatency.add(Date.now() - startTime);

    const success = check(response, {
      'transaction queued': (r) => r.status === 201 || r.status === 200 || r.status === 400,
    });

    if (success && (response.status === 201 || response.status === 200)) {
      transactionsQueued.add(1);
      notificationJobsQueued.add(3); // INITIATED, COMPLETED/FAILED, CREDIT_RECEIVED
      workerThroughput.add(1);
    } else {
      queueBackpressureRate.add(1);
    }
  });
}

function webhookOperationsTest() {
  group('Webhook Queue Operations', function () {
    // List webhooks
    const listResponse = apiClient.listWebhooks({ limit: 10 });
    check(listResponse, {
      'webhooks listed': (r) => r.status === 200,
    });

    const webhooks = parseJson(listResponse)?.data?.webhooks || [];

    // Create new webhook (triggers webhook job processing setup)
    const startTime = Date.now();
    const webhookUrl = `https://queue-test-${Date.now()}-${__VU}-${__ITER}.example.com/hook`;

    const createResponse = apiClient.createWebhook(webhookUrl, ['TRANSACTION_COMPLETED']);
    queueJobLatency.add(Date.now() - startTime);

    check(createResponse, {
      'webhook created': (r) => r.status === 201 || r.status === 409,
    });

    if (createResponse.status === 201) {
      webhookJobsQueued.add(1);
      workerThroughput.add(1);
    }

    // Delete a random old webhook to prevent accumulation
    if (webhooks.length > 5) {
      const oldWebhook = webhooks[webhooks.length - 1];
      apiClient.deleteWebhook(oldWebhook.webhookId);
    }
  });
}

function depositBurstTest() {
  group('Deposit Burst (Notification Queue)', function () {
    // Rapid deposits to stress notification queue
    const burstSize = Math.floor(Math.random() * 5) + 2; // 2-6 rapid deposits

    for (let i = 0; i < burstSize; i++) {
      const startTime = Date.now();
      const response = apiClient.deposit(
        Math.floor(Math.random() * 100) + 10,
        'INR',
        generateIdempotencyKey()
      );
      queueJobLatency.add(Date.now() - startTime);

      const success = check(response, {
        'burst deposit queued': (r) => r.status === 200 || r.status === 201,
      });

      if (success) {
        notificationJobsQueued.add(1);
        workerThroughput.add(1);
      } else {
        queueBackpressureRate.add(1);
      }

      // Minimal delay between burst items
      sleepWithJitter(50);
    }
  });
}

function readOperationsTest() {
  group('Read Operations (Baseline)', function () {
    // These don't queue jobs but represent normal traffic mixed with queue operations

    const operations = [
      () => apiClient.getMyWallet(),
      () => apiClient.listTransactions({ limit: 10 }),
      () => apiClient.getWalletHistory({ limit: 10 }),
      () => apiClient.listWebhooks({ limit: 5 }),
    ];

    // Perform 2-3 random read operations
    const opCount = Math.floor(Math.random() * 2) + 2;
    for (let i = 0; i < opCount; i++) {
      const op = operations[Math.floor(Math.random() * operations.length)];
      const response = op();
      check(response, {
        'read operation successful': (r) => r.status === 200,
      });
      sleepWithJitter(100);
    }
  });
}

export function teardown(data) {
  console.log('Queue/Worker load tests completed');
  console.log(`Total test users: ${data.users.length}`);
  console.log('Check metrics for queue_job_latency and worker_throughput');
}
