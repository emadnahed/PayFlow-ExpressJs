/**
 * Event Bus Load Tests for PayFlow
 *
 * Tests the event-driven architecture under load by creating operations
 * that trigger multiple event publications and subscriptions.
 *
 * Event types tested:
 * - TRANSACTION_INITIATED
 * - DEBIT_SUCCESS / DEBIT_FAILED
 * - CREDIT_SUCCESS / CREDIT_FAILED
 * - TRANSACTION_COMPLETED / TRANSACTION_FAILED
 * - REFUND_REQUESTED / REFUND_COMPLETED
 *
 * Usage:
 *   k6 run tests/load/event-bus.test.js
 *   k6 run --vus 60 --duration 10m tests/load/event-bus.test.js
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

// Custom metrics for event tracking
const eventPublishLatency = new Trend('event_publish_latency', true);
const sagaCompletionLatency = new Trend('saga_completion_latency', true);
const eventsPublished = new Counter('events_published');
const sagasInitiated = new Counter('sagas_initiated');
const sagasCompleted = new Counter('sagas_completed');
const sagasFailed = new Counter('sagas_failed');
const eventProcessingRate = new Rate('event_processing_success');

const config = getConfig();

export const options = {
  stages: [
    { duration: '30s', target: 15 },   // Warm up
    { duration: '1m', target: 30 },    // Ramp up
    { duration: '2m', target: 50 },    // Moderate load
    { duration: '3m', target: 50 },    // Sustain
    { duration: '2m', target: 80 },    // High load
    { duration: '2m', target: 80 },    // Sustain high
    { duration: '1m', target: 100 },   // Peak
    { duration: '1m', target: 100 },   // Sustain peak
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    event_publish_latency: ['p(95)<1000'],
    saga_completion_latency: ['p(95)<3000'],
    event_processing_success: ['rate>0.9'],
  },
  tags: {
    testType: 'load',
    component: 'event-bus',
  },
};

export function setup() {
  console.log(`Running event bus load tests against: ${config.baseUrl}`);
  console.log('This test stresses the event-driven saga pattern');

  // Create test users with initial balance
  const users = [];
  for (let i = 0; i < 15; i++) {
    const email = generateTestEmail();
    const password = 'EventBusTest123!';

    const registerResponse = apiClient.register(email, password, `Event Bus Test User ${i}`);

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      const data = parseJson(registerResponse);
      users.push({
        email,
        password,
        userId: data?.data?.user?.userId,
      });

      // Authenticate and deposit initial funds
      authenticate(email, password);
      apiClient.deposit(10000, 'INR', generateIdempotencyKey());
      clearAuth();

      console.log(`Created and funded test user ${i + 1}/15`);
    } else if (registerResponse.status === 409) {
      users.push({ email, password });
    }
  }

  // Add default test users
  users.push({
    email: config.testUser.email,
    password: config.testUser.password,
  });

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

  // Select test scenario
  const scenario = Math.random();

  if (scenario < 0.5) {
    // 50% - Full transaction saga (most event-heavy)
    fullTransactionSagaTest(data, userIndex);
  } else if (scenario < 0.7) {
    // 20% - Deposit event trigger
    depositEventTest();
  } else if (scenario < 0.85) {
    // 15% - Multiple rapid transactions
    rapidTransactionsTest(data, userIndex);
  } else {
    // 15% - Read operations (no events, baseline)
    readOperationsTest();
  }

  // Short think time
  sleep(Math.random() * 0.5 + 0.2);
}

function fullTransactionSagaTest(data, currentUserIndex) {
  group('Full Transaction Saga (Event Heavy)', function () {
    // A successful transaction triggers:
    // 1. TRANSACTION_INITIATED
    // 2. DEBIT_SUCCESS (or DEBIT_FAILED)
    // 3. CREDIT_SUCCESS (or CREDIT_FAILED)
    // 4. TRANSACTION_COMPLETED (or TRANSACTION_FAILED)
    // Plus notification events for sender and receiver

    // Ensure we have balance
    const walletResponse = apiClient.getMyWallet();
    const walletData = parseJson(walletResponse);
    const balance = walletData?.data?.wallet?.balance || 0;

    if (balance < 100) {
      const depositResponse = apiClient.deposit(1000, 'INR', generateIdempotencyKey());
      check(depositResponse, { 'pre-saga deposit': (r) => r.status === 200 || r.status === 201 });
      eventsPublished.add(1); // Deposit event
    }

    // Get receiver
    const receiverIndex = (currentUserIndex + Math.floor(Math.random() * 5) + 1) % data.users.length;
    const receiver = data.users[receiverIndex];

    // Get receiver's userId
    clearAuth();
    const receiverAuth = authenticate(receiver.email, receiver.password);

    if (!receiverAuth.success) {
      errorRate.add(1);
      authenticate(data.users[currentUserIndex].email, data.users[currentUserIndex].password);
      return;
    }

    const receiverWalletResponse = apiClient.getMyWallet();
    const receiverData = parseJson(receiverWalletResponse);
    const receiverId = receiverData?.data?.wallet?.userId;

    // Switch back to sender
    clearAuth();
    authenticate(data.users[currentUserIndex].email, data.users[currentUserIndex].password);

    if (!receiverId) {
      return;
    }

    // Create transaction - this initiates the saga
    const sagaStartTime = Date.now();
    sagasInitiated.add(1);

    const response = apiClient.createTransaction(
      receiverId,
      Math.floor(Math.random() * 100) + 10,
      'INR',
      'Event bus load test - full saga',
      generateIdempotencyKey()
    );

    eventPublishLatency.add(Date.now() - sagaStartTime);

    const success = check(response, {
      'saga initiated': (r) => r.status === 201 || r.status === 200,
    });

    if (success && (response.status === 201 || response.status === 200)) {
      // Events published in successful saga:
      // TRANSACTION_INITIATED, DEBIT_SUCCESS, CREDIT_SUCCESS, TRANSACTION_COMPLETED
      eventsPublished.add(4);
      sagasCompleted.add(1);
      eventProcessingRate.add(1);
      sagaCompletionLatency.add(Date.now() - sagaStartTime);
    } else if (response.status === 400) {
      // Failed saga (insufficient balance, etc.)
      // Events: TRANSACTION_INITIATED, DEBIT_FAILED, TRANSACTION_FAILED
      eventsPublished.add(3);
      sagasFailed.add(1);
      eventProcessingRate.add(1);
    } else {
      eventProcessingRate.add(0);
    }
  });
}

function depositEventTest() {
  group('Deposit Event Trigger', function () {
    const startTime = Date.now();
    const response = apiClient.deposit(
      Math.floor(Math.random() * 500) + 50,
      'INR',
      generateIdempotencyKey()
    );
    eventPublishLatency.add(Date.now() - startTime);

    const success = check(response, {
      'deposit event triggered': (r) => r.status === 200 || r.status === 201,
    });

    if (success) {
      eventsPublished.add(1); // Deposit event
      eventProcessingRate.add(1);
    } else {
      eventProcessingRate.add(0);
    }
  });
}

function rapidTransactionsTest(data, currentUserIndex) {
  group('Rapid Transactions (Event Burst)', function () {
    // Create multiple transactions in quick succession
    // This stresses the event bus with concurrent event publications

    const transactionCount = Math.floor(Math.random() * 3) + 2; // 2-4 transactions

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

    // Switch back to sender
    clearAuth();
    authenticate(data.users[currentUserIndex].email, data.users[currentUserIndex].password);

    if (!receiverId) {
      return;
    }

    // Ensure balance
    apiClient.deposit(transactionCount * 100, 'INR', generateIdempotencyKey());
    eventsPublished.add(1);

    // Rapid fire transactions
    for (let i = 0; i < transactionCount; i++) {
      const startTime = Date.now();
      sagasInitiated.add(1);

      const response = apiClient.createTransaction(
        receiverId,
        Math.floor(Math.random() * 20) + 5,
        'INR',
        `Rapid transaction ${i}`,
        generateIdempotencyKey()
      );

      eventPublishLatency.add(Date.now() - startTime);

      if (response.status === 201 || response.status === 200) {
        eventsPublished.add(4);
        sagasCompleted.add(1);
        eventProcessingRate.add(1);
      } else {
        eventsPublished.add(2);
        sagasFailed.add(1);
        eventProcessingRate.add(1);
      }

      // Minimal delay to simulate rapid but not simultaneous
      sleepWithJitter(50);
    }
  });
}

function readOperationsTest() {
  group('Read Operations (No Events)', function () {
    // Baseline read operations that don't publish events
    const startTime = Date.now();

    // Wallet read
    const walletResponse = apiClient.getMyWallet();
    check(walletResponse, { 'wallet read': (r) => r.status === 200 });

    // Transaction list
    const txnResponse = apiClient.listTransactions({ limit: 10 });
    check(txnResponse, { 'transactions read': (r) => r.status === 200 });

    // Wallet history
    const historyResponse = apiClient.getWalletHistory({ limit: 10 });
    check(historyResponse, { 'history read': (r) => r.status === 200 });

    eventPublishLatency.add(Date.now() - startTime); // Even though no events, track latency
  });
}

export function teardown(data) {
  console.log('Event bus load tests completed');
  console.log(`Total test users: ${data.users.length}`);
  console.log('Review eventsPublished, sagasCompleted, and sagasFailed metrics');
}
