/**
 * Stress Tests for PayFlow API
 *
 * Tests system behavior under extreme load conditions.
 * Identifies breaking points and maximum capacity.
 *
 * WARNING: These tests can put significant load on your system.
 * Only run against staging/test environments, never production.
 *
 * Usage:
 *   k6 run tests/stress/stress.test.js
 *   k6 run -e ENV=staging tests/stress/stress.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  parseJson,
  generateTestEmail,
  generateIdempotencyKey,
  clearAuth,
} from '../../config/test-utils.js';

// Custom metrics for stress testing
const requestsUnderStress = new Counter('requests_under_stress');
const errorsUnderStress = new Counter('errors_under_stress');
const errorRateUnderStress = new Rate('error_rate_under_stress');
const responseTimeUnderStress = new Trend('response_time_under_stress', true);
const breakingPointReached = new Counter('breaking_point_reached');

const config = getConfig();

export const options = {
  // Aggressive ramping to find breaking point
  stages: [
    { duration: '2m', target: 50 },   // Warm up to 50 users
    { duration: '3m', target: 100 },  // Ramp to 100 users
    { duration: '3m', target: 200 },  // Ramp to 200 users
    { duration: '3m', target: 300 },  // Push to 300 users
    { duration: '3m', target: 400 },  // Push to 400 users
    { duration: '2m', target: 500 },  // Maximum stress: 500 users
    { duration: '3m', target: 500 },  // Hold at maximum
    { duration: '2m', target: 200 },  // Recovery phase
    { duration: '1m', target: 0 },    // Cool down
  ],
  thresholds: {
    // More lenient thresholds for stress testing
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.2'], // Allow up to 20% failures under stress
    error_rate_under_stress: ['rate<0.3'],
  },
  tags: {
    testType: 'stress',
  },
};

export function setup() {
  console.log(`Running STRESS tests against: ${config.baseUrl}`);
  console.log('WARNING: This will put significant load on the system!');

  // Pre-create test users for stress testing
  const users = [];
  for (let i = 0; i < 20; i++) {
    const email = `stress_${i}_${Date.now()}@loadtest.com`;
    const password = 'StressTest123!';

    const response = apiClient.register(email, password, `Stress User ${i}`);
    if (response.status === 201 || response.status === 200 || response.status === 409) {
      users.push({ email, password });
    }
  }

  // Register and add config test users
  const testUser1Response = apiClient.register(
    config.testUser.email,
    config.testUser.password,
    'Stress Test User 1'
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
      'Stress Test User 2'
    );
    if (testUser2Response.status === 201 || testUser2Response.status === 200 || testUser2Response.status === 409) {
      users.push({
        email: config.testUser2.email,
        password: config.testUser2.password,
      });
      console.log(`Registered/verified test user: ${config.testUser2.email}`);
    }
  }

  console.log(`Created ${users.length} test users for stress testing`);

  return { users };
}

export default function (data) {
  const userIndex = Math.floor(Math.random() * data.users.length);
  const user = data.users[userIndex];

  clearAuth();

  // Track all requests
  requestsUnderStress.add(1);

  // Authentication under stress
  group('Auth Under Stress', function () {
    const startTime = Date.now();

    const authResult = authenticate(user.email, user.password);
    const duration = Date.now() - startTime;
    responseTimeUnderStress.add(duration);

    if (!authResult.success) {
      errorsUnderStress.add(1);
      errorRateUnderStress.add(1);

      // Check if this might be a breaking point
      if (duration > 5000) {
        breakingPointReached.add(1);
      }
      return;
    }

    errorRateUnderStress.add(0);
  });

  // Rapid-fire API calls
  group('Rapid API Calls', function () {
    // Quick succession of wallet operations
    for (let i = 0; i < 3; i++) {
      const startTime = Date.now();

      const response = apiClient.getMyWallet();
      const duration = Date.now() - startTime;
      responseTimeUnderStress.add(duration);

      const success = check(response, {
        'wallet request successful': (r) => r.status === 200,
        'response time acceptable': (r) => r.timings.duration < 5000,
      });

      if (!success) {
        errorsUnderStress.add(1);
        errorRateUnderStress.add(1);

        if (duration > 5000) {
          breakingPointReached.add(1);
        }
      } else {
        errorRateUnderStress.add(0);
      }

      // Minimal sleep between requests
      sleep(0.1);
    }
  });

  // Transaction listing under stress
  group('Transactions Under Stress', function () {
    const startTime = Date.now();

    const response = apiClient.listTransactions({ limit: 50 });
    const duration = Date.now() - startTime;
    responseTimeUnderStress.add(duration);

    const success = check(response, {
      'transactions retrieved': (r) => r.status === 200,
    });

    if (!success) {
      errorsUnderStress.add(1);
      errorRateUnderStress.add(1);
    } else {
      errorRateUnderStress.add(0);
    }
  });

  // Deposit operations under stress (20% of requests)
  if (Math.random() < 0.2) {
    group('Deposits Under Stress', function () {
      const startTime = Date.now();

      const response = apiClient.deposit(
        Math.floor(Math.random() * 100) + 1,
        'USD',
        generateIdempotencyKey()
      );
      const duration = Date.now() - startTime;
      responseTimeUnderStress.add(duration);

      const success = check(response, {
        'deposit processed': (r) => r.status === 200 || r.status === 201,
      });

      if (!success) {
        errorsUnderStress.add(1);
        errorRateUnderStress.add(1);
      } else {
        errorRateUnderStress.add(0);
      }
    });
  }

  // Minimal think time during stress test
  sleep(Math.random() * 0.5);
}

export function teardown(data) {
  console.log('Stress tests completed');
  console.log('Review breaking_point_reached metric to identify system limits');
}
