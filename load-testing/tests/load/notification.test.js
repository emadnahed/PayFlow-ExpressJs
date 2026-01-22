/**
 * Notification Load Tests for PayFlow
 *
 * Tests notification-triggering operations under load:
 * - Transaction flows that generate notifications
 * - Deposit operations (notification triggers)
 * - Concurrent notification scenarios
 *
 * Note: This tests the API endpoints that trigger notifications,
 * not the notification worker directly (which is tested separately).
 *
 * Usage:
 *   k6 run tests/load/notification.test.js
 *   k6 run --vus 40 --duration 5m tests/load/notification.test.js
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
const depositLatency = new Trend('deposit_latency', true);
const transactionLatency = new Trend('transaction_latency', true);
const notificationTriggers = new Counter('notification_triggers');
const transactionNotifications = new Counter('transaction_notifications');
const depositNotifications = new Counter('deposit_notifications');

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm up
    { duration: '1m', target: 20 },   // Increase
    { duration: '2m', target: 40 },   // Target load
    { duration: '2m', target: 40 },   // Sustain
    { duration: '1m', target: 60 },   // Peak
    { duration: '1m', target: 60 },   // Sustain peak
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.03'],
    errors: ['rate<0.03'],
    deposit_latency: ['p(95)<1000'],
    transaction_latency: ['p(95)<1500'],
  },
  tags: {
    testType: 'load',
    component: 'notification',
  },
};

export function setup() {
  console.log(`Running notification load tests against: ${config.baseUrl}`);

  // Create test users (need at least 2 for transactions)
  const users = [];
  for (let i = 0; i < 10; i++) {
    const email = generateTestEmail();
    const password = 'NotificationTest123!';

    const registerResponse = apiClient.register(email, password, `Notification Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      const data = parseJson(registerResponse);
      const userId = data?.data?.user?.userId || data?.user?.userId;
      users.push({ email, password, userId });
      console.log(`Created test user: ${email}`);
    } else if (registerResponse.status === 409) {
      users.push({ email, password });
    }
  }

  // Add default test users
  users.push({
    email: config.testUser.email,
    password: config.testUser.password,
  });

  if (config.testUser2) {
    users.push({
      email: config.testUser2.email,
      password: config.testUser2.password,
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

  // Group 1: Deposit (triggers deposit notification)
  group('Deposit Notification Trigger', function () {
    const startTime = Date.now();
    const amount = Math.floor(Math.random() * 500) + 100; // 100-600
    const idempotencyKey = generateIdempotencyKey();

    const response = apiClient.deposit(amount, 'INR', idempotencyKey);
    depositLatency.add(Date.now() - startTime);

    const success = check(response, {
      'deposit successful': (r) => r.status === 200 || r.status === 201,
    });

    if (success) {
      depositNotifications.add(1);
      notificationTriggers.add(1);
    }

    sleepWithJitter(300);
  });

  // Group 2: Transaction (triggers multiple notifications)
  group('Transaction Notification Triggers', function () {
    // Get another user for transaction
    const otherUserIndex = (userIndex + 1) % data.users.length;
    const otherUser = data.users[otherUserIndex];

    // First ensure we have the receiver's userId
    clearAuth();
    const otherAuth = authenticate(otherUser.email, otherUser.password);

    if (!otherAuth.success) {
      errorRate.add(1);
      authenticate(testUser.email, testUser.password);
      return;
    }

    const otherWalletResponse = apiClient.getMyWallet();
    const otherWalletData = parseJson(otherWalletResponse);
    const receiverId = otherWalletData?.data?.wallet?.userId;

    // Switch back to original user
    clearAuth();
    authenticate(testUser.email, testUser.password);

    if (!receiverId) {
      return;
    }

    // Check if we have enough balance
    const walletResponse = apiClient.getMyWallet();
    const walletData = parseJson(walletResponse);
    const balance = walletData?.data?.wallet?.balance || 0;

    if (balance >= 50) {
      const startTime = Date.now();
      const amount = Math.min(Math.floor(Math.random() * 50) + 10, balance - 10); // 10-50
      const idempotencyKey = generateIdempotencyKey();

      const response = apiClient.createTransaction(
        receiverId,
        amount,
        'INR',
        'Notification load test',
        idempotencyKey
      );

      transactionLatency.add(Date.now() - startTime);

      const success = check(response, {
        'transaction created': (r) => r.status === 201 || r.status === 200,
      });

      if (success) {
        // Transaction triggers notifications for:
        // - Sender: TRANSACTION_INITIATED
        // - Sender: TRANSACTION_COMPLETED or TRANSACTION_FAILED
        // - Receiver: CREDIT_RECEIVED (if completed)
        transactionNotifications.add(1);
        notificationTriggers.add(3); // Up to 3 notifications per transaction
      }
    }

    sleepWithJitter(500);
  });

  // Group 3: Rapid deposits (burst notifications)
  group('Burst Deposit Notifications', function () {
    // Simulate burst of small deposits
    const burstCount = Math.floor(Math.random() * 3) + 1; // 1-3 rapid deposits

    for (let i = 0; i < burstCount; i++) {
      const startTime = Date.now();
      const amount = Math.floor(Math.random() * 100) + 10; // 10-110
      const idempotencyKey = generateIdempotencyKey();

      const response = apiClient.deposit(amount, 'INR', idempotencyKey);
      depositLatency.add(Date.now() - startTime);

      check(response, {
        'burst deposit successful': (r) => r.status === 200 || r.status === 201,
      });

      depositNotifications.add(1);
      notificationTriggers.add(1);

      sleepWithJitter(100); // Short delay between burst deposits
    }
  });

  // Group 4: Transaction list (read-heavy, no notifications)
  group('Read Operations (No Notifications)', function () {
    // These operations don't trigger notifications but represent realistic traffic

    // Get recent transactions
    const txnResponse = apiClient.listTransactions({ limit: 10 });
    check(txnResponse, {
      'transactions listed': (r) => r.status === 200,
    });

    // Get wallet history
    const historyResponse = apiClient.getWalletHistory({ limit: 10 });
    check(historyResponse, {
      'wallet history retrieved': (r) => r.status === 200,
    });

    // Get wallet balance
    const walletResponse = apiClient.getMyWallet();
    check(walletResponse, {
      'wallet retrieved': (r) => r.status === 200,
    });

    sleepWithJitter(300);
  });

  // Group 5: Mixed notification triggers
  group('Mixed Notification Patterns', function () {
    const operation = Math.random();

    if (operation < 0.4) {
      // 40% - Single deposit
      const response = apiClient.deposit(
        Math.floor(Math.random() * 200) + 50,
        'INR',
        generateIdempotencyKey()
      );
      if (response.status === 200 || response.status === 201) {
        notificationTriggers.add(1);
      }
    } else if (operation < 0.7) {
      // 30% - Wallet balance check (no notification)
      apiClient.getMyWallet();
    } else {
      // 30% - Transaction history (no notification)
      apiClient.listTransactions({ limit: 5 });
    }

    sleepWithJitter(200);
  });

  // Think time
  sleep(Math.random() * 1.5 + 0.5);
}

export function teardown(data) {
  console.log('Notification load tests completed');
  console.log(`Total test users: ${data.users.length}`);
}
