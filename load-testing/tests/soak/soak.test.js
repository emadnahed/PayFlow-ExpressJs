/**
 * Soak Tests for PayFlow API
 *
 * Long-running tests to detect:
 * - Memory leaks
 * - Resource exhaustion
 * - Performance degradation over time
 * - Connection pool issues
 *
 * Default duration: 1 hour (can be extended to 4-12 hours)
 *
 * Usage:
 *   k6 run tests/soak/soak.test.js
 *   k6 run -e SOAK_DURATION=4h tests/soak/soak.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  parseJson,
  generateIdempotencyKey,
  clearAuth,
  sleepWithJitter,
} from '../../config/test-utils.js';

// Soak test specific metrics
const soakRequests = new Counter('soak_requests');
const soakErrors = new Counter('soak_errors');
const soakErrorRate = new Rate('soak_error_rate');

// Time-based metrics to track degradation
const latencyMinute1 = new Trend('latency_minute_1', true);
const latencyMinute15 = new Trend('latency_minute_15', true);
const latencyMinute30 = new Trend('latency_minute_30', true);
const latencyMinute45 = new Trend('latency_minute_45', true);
const latencyMinute60 = new Trend('latency_minute_60', true);

// Memory tracking (if endpoint available)
const memoryUsage = new Trend('memory_usage');

const config = getConfig();

// Configurable duration
const soakDuration = __ENV.SOAK_DURATION || '1h';

export const options = {
  stages: [
    { duration: '5m', target: 30 },    // Ramp up
    { duration: soakDuration, target: 30 }, // Sustained load
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
    soak_error_rate: ['rate<0.01'],
    // Compare early vs late latencies to detect degradation
    latency_minute_1: ['p(95)<1500'],
    latency_minute_60: ['p(95)<2000'], // Allow some degradation but not much
  },
  tags: {
    testType: 'soak',
  },
};

// Track test start time
let testStartTime = 0;

export function setup() {
  console.log(`Running SOAK test against: ${config.baseUrl}`);
  console.log(`Duration: ${soakDuration}`);
  console.log('Monitoring for memory leaks and performance degradation...');

  testStartTime = Date.now();

  // Create test users
  const users = [];
  for (let i = 0; i < 10; i++) {
    const email = `soak_${i}_${Date.now()}@loadtest.com`;
    const password = 'SoakTest123!';

    const response = apiClient.register(email, password, `Soak User ${i}`);
    if (response.status === 201 || response.status === 200 || response.status === 409) {
      users.push({ email, password });
    }
  }

  // Register and add config test user
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Soak Test User'
  );
  if (testUser1Response.status === 201 || testUser1Response.status === 200 || testUser1Response.status === 409) {
    users.push({
      email: config.testUser.email,
      password: config.testUser.password,
    });
  }

  return { users, startTime: Date.now() };
}

export default function (data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  clearAuth();

  const iterationStart = Date.now();
  const elapsedMinutes = Math.floor((iterationStart - data.startTime) / 60000);

  // Track which time bucket we're in
  const trackLatency = (duration) => {
    if (elapsedMinutes < 5) {
      latencyMinute1.add(duration);
    } else if (elapsedMinutes >= 13 && elapsedMinutes < 17) {
      latencyMinute15.add(duration);
    } else if (elapsedMinutes >= 28 && elapsedMinutes < 32) {
      latencyMinute30.add(duration);
    } else if (elapsedMinutes >= 43 && elapsedMinutes < 47) {
      latencyMinute45.add(duration);
    } else if (elapsedMinutes >= 58) {
      latencyMinute60.add(duration);
    }
  };

  soakRequests.add(1);

  // Standard user flow
  group('Authentication', function () {
    const startTime = Date.now();

    const authResult = authenticate(user.email, user.password);
    const duration = Date.now() - startTime;

    trackLatency(duration);

    if (!authResult.success) {
      soakErrors.add(1);
      soakErrorRate.add(1);
      return;
    }

    soakErrorRate.add(0);
    sleepWithJitter(300);
  });

  group('Wallet Operations', function () {
    const startTime = Date.now();

    // Get wallet
    const walletResponse = apiClient.getMyWallet();
    const duration = Date.now() - startTime;

    trackLatency(duration);

    const success = check(walletResponse, {
      'wallet retrieved': (r) => r.status === 200,
    });

    if (!success) {
      soakErrors.add(1);
      soakErrorRate.add(1);
    } else {
      soakErrorRate.add(0);
    }

    sleepWithJitter(500);

    // Get history
    apiClient.getWalletHistory({ limit: 10 });

    sleepWithJitter(300);
  });

  group('Transaction Operations', function () {
    const startTime = Date.now();

    // List transactions
    const txResponse = apiClient.listTransactions({ limit: 20 });
    const duration = Date.now() - startTime;

    trackLatency(duration);

    check(txResponse, {
      'transactions listed': (r) => r.status === 200,
    });

    sleepWithJitter(300);
  });

  // Periodic deposit (10% of iterations)
  if (Math.random() < 0.1) {
    group('Deposit Operation', function () {
      const depositResponse = apiClient.deposit(
        Math.floor(Math.random() * 50) + 5,
        'USD',
        generateIdempotencyKey()
      );

      check(depositResponse, {
        'deposit successful': (r) => r.status === 200 || r.status === 201,
      });
    });

    sleepWithJitter(500);
  }

  // Periodic health check (5% of iterations)
  if (Math.random() < 0.05) {
    group('Health Check', function () {
      const healthResponse = apiClient.healthCheck();

      check(healthResponse, {
        'health check ok': (r) => r.status === 200,
      });

      // Try to extract memory info if available
      const healthData = parseJson(healthResponse);
      if (healthData && healthData.memory) {
        memoryUsage.add(healthData.memory.heapUsed || healthData.memory.used || 0);
      }
    });
  }

  // Normal think time for soak testing
  sleep(2 + Math.random() * 3); // 2-5 seconds
}

export function teardown(data) {
  const totalDuration = (Date.now() - data.startTime) / 1000 / 60;
  console.log(`Soak test completed after ${totalDuration.toFixed(2)} minutes`);
  console.log('Compare latency_minute_* metrics to detect performance degradation');
  console.log('Check memory_usage trend for memory leaks');
}
