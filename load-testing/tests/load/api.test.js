/**
 * API Load Tests for PayFlow
 *
 * Standard performance testing to simulate expected traffic patterns.
 * Tests all major API endpoints under moderate load.
 *
 * Usage:
 *   k6 run tests/load/api.test.js
 *   k6 run --vus 50 --duration 5m tests/load/api.test.js
 *   k6 run -e ENV=staging tests/load/api.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig, getThresholds } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  checkResponse,
  parseJson,
  generateTestEmail,
  generateIdempotencyKey,
  clearAuth,
  sleepWithJitter,
  errorRate,
  successRate,
} from '../../config/test-utils.js';

// Custom metrics for this test
const authLatency = new Trend('auth_latency', true);
const walletLatency = new Trend('wallet_latency', true);
const transactionLatency = new Trend('transaction_latency', true);
const depositCount = new Counter('deposits');
const transactionCount = new Counter('transactions');

// Test configuration
const config = getConfig();
const envThresholds = getThresholds();

// Default thresholds (used if environment doesn't specify)
const defaultThresholds = {
  http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  http_req_failed: ['rate<0.01'],
  errors: ['rate<0.01'],
  auth_latency: ['p(95)<500'],
  wallet_latency: ['p(95)<800'],
  transaction_latency: ['p(95)<1000'],
};

// Merge environment thresholds with defaults (env takes precedence)
const thresholds = { ...defaultThresholds, ...envThresholds };

export const options = {
  // Stages for ramping up and down
  stages: [
    { duration: '1m', target: 10 },  // Ramp up to 10 users
    { duration: '3m', target: 50 },  // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '3m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down to 0
  ],
  thresholds,
  tags: {
    testType: 'load',
  },
};

// Shared state for test users
const testUsers = [];

export function setup() {
  console.log(`Running load tests against: ${config.baseUrl}`);
  console.log('Creating test users...');

  // Pre-create some test users
  const users = [];
  for (let i = 0; i < 5; i++) {
    const email = generateTestEmail();
    const password = 'LoadTest123!';

    const registerResponse = apiClient.register(email, password, `Load Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      users.push({ email, password });
      console.log(`Created test user: ${email}`);
    } else if (registerResponse.status === 409) {
      // User already exists, can still use
      users.push({ email, password });
    }
  }

  // Also register and add the default test users from config
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Load Test User 1'
  );
  if (testUser1Response.status === 201 || testUser1Response.status === 200 || testUser1Response.status === 409) {
    users.push({
      email: config.testUser.email,
      password: config.testUser.password,
    });
    console.log(`Registered/verified test user: ${config.testUser.email}`);
  }

  if (config.testUser2) {
    const testUser2Response = apiClient.register(
      config.testUser2.email,
      config.testUser2.password,
      'Load Test User 2'
    );
    if (testUser2Response.status === 201 || testUser2Response.status === 200 || testUser2Response.status === 409) {
      users.push({
        email: config.testUser2.email,
        password: config.testUser2.password,
      });
      console.log(`Registered/verified test user: ${config.testUser2.email}`);
    }
  }

  return { users };
}

export default function (data) {
  // Select a random test user
  const userIndex = Math.floor(Math.random() * data.users.length);
  const testUser = data.users[userIndex];

  // Clear any previous auth state
  clearAuth();

  // Group 1: Authentication
  group('Authentication', function () {
    const startTime = Date.now();

    // Login
    const loginResponse = apiClient.login(testUser.email, testUser.password);
    authLatency.add(Date.now() - startTime);

    const loginSuccess = check(loginResponse, {
      'login successful': (r) => r.status === 200,
      'login returns token': (r) => {
        const body = parseJson(r);
        // Handle nested response: { success: true, data: { tokens: { accessToken: ... } } }
        return body && (
          (body.data && body.data.tokens && body.data.tokens.accessToken) ||
          body.accessToken ||
          body.token
        );
      },
    });

    if (!loginSuccess) {
      errorRate.add(1);
      console.log(`Login failed for ${testUser.email}: ${loginResponse.status}`);
      return;
    }

    // Store auth for subsequent requests
    authenticate(testUser.email, testUser.password);
    successRate.add(1);

    sleepWithJitter(500);
  });

  // Group 2: Wallet Operations
  group('Wallet Operations', function () {
    const startTime = Date.now();

    // Get wallet
    const walletResponse = apiClient.getMyWallet();
    walletLatency.add(Date.now() - startTime);

    const walletSuccess = check(walletResponse, {
      'get wallet successful': (r) => r.status === 200,
      'wallet has balance': (r) => {
        const body = parseJson(r);
        // Handle nested response: { success: true, data: { wallet: { balance: ... } } }
        return body && (
          (body.data && body.data.wallet && body.data.wallet.balance !== undefined) ||
          body.balance !== undefined
        );
      },
    });

    if (!walletSuccess) {
      errorRate.add(1);
      return;
    }
    successRate.add(1);

    sleepWithJitter(300);

    // Random deposit (30% chance)
    if (Math.random() < 0.3) {
      const amount = Math.floor(Math.random() * 100) + 10; // 10-110
      const idempotencyKey = generateIdempotencyKey();

      const depositResponse = apiClient.deposit(amount, 'USD', idempotencyKey);

      check(depositResponse, {
        'deposit successful': (r) => r.status === 200 || r.status === 201,
      });

      depositCount.add(1);
      sleepWithJitter(500);
    }

    // Get wallet history
    const historyResponse = apiClient.getWalletHistory({ limit: 10 });

    check(historyResponse, {
      'get history successful': (r) => r.status === 200,
    });

    sleepWithJitter(300);
  });

  // Group 3: Transaction Operations
  group('Transaction Operations', function () {
    const startTime = Date.now();

    // List transactions
    const listResponse = apiClient.listTransactions({ limit: 20 });
    transactionLatency.add(Date.now() - startTime);

    check(listResponse, {
      'list transactions successful': (r) => r.status === 200,
    });

    sleepWithJitter(300);

    // Get a specific transaction if available
    const transactions = parseJson(listResponse);
    // Handle nested response: { success: true, data: { transactions: [...] } }
    const txList = transactions && (
      (transactions.data && transactions.data.transactions) ||
      transactions.transactions ||
      (Array.isArray(transactions.data) ? transactions.data : null)
    );
    if (txList && txList.length > 0) {
      const txId = txList[0].transactionId || txList[0].id || txList[0]._id;
      if (txId) {
        const txResponse = apiClient.getTransaction(txId);

        check(txResponse, {
          'get transaction successful': (r) => r.status === 200,
        });

        sleepWithJitter(200);
      }
    }
  });

  // Group 4: Mixed Read Operations (simulate real traffic)
  group('Mixed Operations', function () {
    // Randomly perform different operations
    const operation = Math.random();

    if (operation < 0.4) {
      // 40% - Get wallet
      apiClient.getMyWallet();
    } else if (operation < 0.7) {
      // 30% - List transactions
      apiClient.listTransactions({ limit: 10 });
    } else if (operation < 0.9) {
      // 20% - Get wallet history
      apiClient.getWalletHistory({ limit: 10 });
    } else {
      // 10% - Auth refresh (me endpoint)
      apiClient.me();
    }

    sleepWithJitter(500);
  });

  // Think time between iterations
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

export function teardown(data) {
  console.log('Load tests completed');
  console.log(`Total test users: ${data.users.length}`);
}
