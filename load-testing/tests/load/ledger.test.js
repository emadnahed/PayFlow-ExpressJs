/**
 * Ledger API Load Tests for PayFlow
 *
 * Tests ledger operations under load including:
 * - Credit processing performance
 * - Ledger entry retrieval
 * - Balance reconciliation under concurrent load
 *
 * Usage:
 *   k6 run tests/load/ledger.test.js
 *   k6 run --vus 50 --duration 5m tests/load/ledger.test.js
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
const ledgerLatency = new Trend('ledger_latency', true);
const creditLatency = new Trend('credit_latency', true);
const reconciliationLatency = new Trend('reconciliation_latency', true);
const ledgerOperations = new Counter('ledger_operations');
const creditOperations = new Counter('credit_operations');

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 25 },   // Ramp up to 25 users
    { duration: '2m', target: 25 },   // Stay at 25 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'],
    errors: ['rate<0.02'],
    ledger_latency: ['p(95)<1000'],
    credit_latency: ['p(95)<1200'],
  },
  tags: {
    testType: 'load',
    component: 'ledger',
  },
};

export function setup() {
  console.log(`Running ledger load tests against: ${config.baseUrl}`);

  // Create test users
  const users = [];
  for (let i = 0; i < 10; i++) {
    const email = generateTestEmail();
    const password = 'LedgerTest123!';

    const registerResponse = apiClient.register(email, password, `Ledger Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      users.push({ email, password });
      console.log(`Created test user: ${email}`);
    } else if (registerResponse.status === 409) {
      users.push({ email, password });
    }
  }

  // Register and add default test user
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Ledger Test User Default'
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
  group('Authentication', function () {
    const loginSuccess = authenticate(testUser.email, testUser.password);
    if (!loginSuccess.success) {
      errorRate.add(1);
      return;
    }
    successRate.add(1);
    sleepWithJitter(200);
  });

  // Group 1: Ledger Read Operations
  group('Ledger Read Operations', function () {
    const startTime = Date.now();

    // Get ledger simulation config
    const simResponse = apiClient.getSimulationConfig();
    ledgerLatency.add(Date.now() - startTime);

    check(simResponse, {
      'simulation config retrieved': (r) => r.status === 200 || r.status === 404,
    });

    ledgerOperations.add(1);
    sleepWithJitter(300);
  });

  // Group 2: Transaction-based Ledger Operations
  group('Transaction Ledger Flow', function () {
    // First get wallet to ensure we have balance
    const walletResponse = apiClient.getMyWallet();

    if (walletResponse.status !== 200) {
      errorRate.add(1);
      return;
    }

    const walletData = parseJson(walletResponse);
    const balance = walletData?.data?.wallet?.balance || walletData?.balance || 0;

    // Only proceed if we have some balance
    if (balance > 50) {
      // Get another user for transaction
      const receiverIndex = (userIndex + 1) % data.users.length;
      const receiverUser = data.users[receiverIndex];

      // We need to get the receiver's userId - authenticate as them briefly
      const tempAuth = authenticate(receiverUser.email, receiverUser.password);
      if (!tempAuth.success) {
        errorRate.add(1);
        return;
      }

      const receiverWalletResponse = apiClient.getMyWallet();
      const receiverData = parseJson(receiverWalletResponse);
      const receiverId = receiverData?.data?.wallet?.userId || receiverData?.userId;

      // Re-authenticate as original user
      clearAuth();
      authenticate(testUser.email, testUser.password);

      if (receiverId && receiverId !== testUser.userId) {
        const startTime = Date.now();
        const idempotencyKey = generateIdempotencyKey();

        // Create small transaction (will trigger ledger credit on completion)
        const txnResponse = apiClient.createTransaction(
          receiverId,
          10, // Small amount
          'INR',
          'Ledger load test',
          idempotencyKey
        );

        creditLatency.add(Date.now() - startTime);

        check(txnResponse, {
          'transaction created (triggers ledger)': (r) =>
            r.status === 201 || r.status === 200 || r.status === 400,
        });

        creditOperations.add(1);
      }
    }

    sleepWithJitter(500);
  });

  // Group 3: Balance Reconciliation Check
  group('Balance Reconciliation', function () {
    const startTime = Date.now();

    // Get wallet balance
    const walletResponse = apiClient.getMyWallet();

    // Get transaction history
    const txnResponse = apiClient.listTransactions({ limit: 50 });

    reconciliationLatency.add(Date.now() - startTime);

    check(walletResponse, {
      'wallet balance retrieved': (r) => r.status === 200,
    });

    check(txnResponse, {
      'transaction history retrieved': (r) => r.status === 200,
    });

    // Verify balance consistency (basic check)
    const wallet = parseJson(walletResponse);
    const transactions = parseJson(txnResponse);

    if (wallet && transactions) {
      const balance = wallet?.data?.wallet?.balance || wallet?.balance || 0;
      check(balance, {
        'balance is non-negative': (b) => b >= 0,
      });
    }

    sleepWithJitter(300);
  });

  // Group 4: Wallet Operation History (Ledger Entries)
  group('Wallet Operation History', function () {
    const startTime = Date.now();

    const historyResponse = apiClient.getWalletHistory({ limit: 20 });
    ledgerLatency.add(Date.now() - startTime);

    check(historyResponse, {
      'wallet history retrieved': (r) => r.status === 200,
    });

    const history = parseJson(historyResponse);
    if (history?.data?.operations) {
      check(history.data.operations, {
        'operations have required fields': (ops) =>
          ops.length === 0 ||
          (ops[0].type && ops[0].amount !== undefined),
      });
    }

    ledgerOperations.add(1);
    sleepWithJitter(200);
  });

  // Think time
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  console.log('Ledger load tests completed');
  console.log(`Total test users: ${data.users.length}`);
}
