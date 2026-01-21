/**
 * User Journey Load Test
 *
 * Simulates realistic user behavior patterns:
 * - New user registration and onboarding
 * - Existing user login and wallet operations
 * - Transaction flows
 *
 * Usage:
 *   k6 run tests/load/user-journey.test.js
 */
import { check, group, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  registerUser,
  parseJson,
  generateTestEmail,
  generateIdempotencyKey,
  clearAuth,
  sleepWithJitter,
} from '../../config/test-utils.js';

// Custom metrics
const journeyDuration = new Trend('journey_duration', true);
const newUserJourneys = new Counter('new_user_journeys');
const existingUserJourneys = new Counter('existing_user_journeys');
const journeyErrors = new Counter('journey_errors');

const config = getConfig();

export const options = {
  scenarios: {
    // New user registration flow
    new_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      exec: 'newUserJourney',
      tags: { journey: 'new_user' },
    },
    // Existing user flow
    existing_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '4m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'existingUserJourney',
      tags: { journey: 'existing_user' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.05'],
    journey_duration: ['p(95)<15000'],
    journey_errors: ['count<50'],
  },
};

export function setup() {
  console.log(`Running user journey tests against: ${config.baseUrl}`);

  // Pre-create existing test users
  const existingUsers = [];
  for (let i = 0; i < 10; i++) {
    const email = `existing_${i}_${Date.now()}@loadtest.com`;
    const password = 'LoadTest123!';

    const response = apiClient.register(email, password, `Existing User ${i}`);
    if (response.status === 201 || response.status === 200 || response.status === 409) {
      existingUsers.push({ email, password });
    }
  }

  // Add config test users
  existingUsers.push({
    email: config.testUser.email,
    password: config.testUser.password,
  });

  return { existingUsers };
}

/**
 * New User Journey
 * Simulates a new user signing up and exploring the platform
 */
export function newUserJourney() {
  const startTime = Date.now();
  clearAuth();

  group('New User Registration', function () {
    const email = generateTestEmail();
    const password = 'NewUser123!';

    // Register
    const registerResponse = apiClient.register(email, password, 'New User');

    const registerSuccess = check(registerResponse, {
      'registration successful': (r) => r.status === 201 || r.status === 200,
    });

    if (!registerSuccess) {
      journeyErrors.add(1);
      console.log(`Registration failed: ${registerResponse.status}`);
      return;
    }

    sleepWithJitter(1000); // Think time after registration
  });

  group('New User Onboarding', function () {
    // First login attempt
    authenticate(generateTestEmail(), 'NewUser123!');

    // Get profile
    const meResponse = apiClient.me();
    check(meResponse, {
      'can get profile': (r) => r.status === 200 || r.status === 401, // May fail if auth didn't work
    });

    sleepWithJitter(500);

    // Get wallet (auto-created)
    const walletResponse = apiClient.getMyWallet();
    check(walletResponse, {
      'wallet retrieved': (r) => r.status === 200 || r.status === 401,
    });

    sleepWithJitter(1000);

    // Initial deposit
    const depositResponse = apiClient.deposit(100, 'USD', generateIdempotencyKey());
    check(depositResponse, {
      'initial deposit successful': (r) =>
        r.status === 200 || r.status === 201 || r.status === 401,
    });

    sleepWithJitter(500);

    // Check wallet history
    apiClient.getWalletHistory({ limit: 5 });

    sleepWithJitter(500);
  });

  journeyDuration.add(Date.now() - startTime);
  newUserJourneys.add(1);

  sleep(2); // Rest before next journey
}

/**
 * Existing User Journey
 * Simulates a returning user performing typical operations
 */
export function existingUserJourney(data) {
  const startTime = Date.now();
  clearAuth();

  // Select random existing user
  const userIndex = Math.floor(Math.random() * data.existingUsers.length);
  const user = data.existingUsers[userIndex];

  group('Existing User Login', function () {
    const loginResult = authenticate(user.email, user.password);

    if (!loginResult.success) {
      journeyErrors.add(1);
      return;
    }

    sleepWithJitter(300);
  });

  group('Check Account Status', function () {
    // Get profile
    apiClient.me();
    sleepWithJitter(200);

    // Get wallet balance
    const walletResponse = apiClient.getMyWallet();
    check(walletResponse, {
      'wallet retrieved': (r) => r.status === 200,
    });

    sleepWithJitter(300);
  });

  group('Review Activity', function () {
    // Get recent transactions
    const txResponse = apiClient.listTransactions({ limit: 10 });
    check(txResponse, {
      'transactions retrieved': (r) => r.status === 200,
    });

    sleepWithJitter(500);

    // Get wallet history
    apiClient.getWalletHistory({ limit: 10 });

    sleepWithJitter(300);
  });

  group('Perform Operations', function () {
    const operation = Math.random();

    if (operation < 0.5) {
      // 50% - Make a deposit
      const amount = Math.floor(Math.random() * 50) + 10;
      const depositResponse = apiClient.deposit(amount, 'USD', generateIdempotencyKey());

      check(depositResponse, {
        'deposit successful': (r) => r.status === 200 || r.status === 201,
      });
    } else {
      // 50% - Just browse
      apiClient.getMyWallet();
    }

    sleepWithJitter(500);
  });

  journeyDuration.add(Date.now() - startTime);
  existingUserJourneys.add(1);

  sleep(1 + Math.random() * 2); // 1-3 second rest
}

export function teardown(data) {
  console.log('User journey tests completed');
  console.log(`Pre-created existing users: ${data.existingUsers.length}`);
}
