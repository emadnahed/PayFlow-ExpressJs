/**
 * Smoke Tests for PayFlow API
 *
 * Quick health checks to verify critical paths are working.
 * Run before every deployment to ensure basic functionality.
 *
 * Usage:
 *   k6 run tests/smoke/smoke.test.js
 *   k6 run -e ENV=staging tests/smoke/smoke.test.js
 */
import { check, group, sleep } from 'k6';

import { getConfig, getThresholds } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  registerUser,
  checkResponse,
  parseJson,
  generateTestEmail,
  clearAuth,
  errorRate,
  successRate,
} from '../../config/test-utils.js';

// Test configuration
export const options = {
  vus: 1, // Single virtual user for smoke testing
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<3000'], // Lenient for smoke tests
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
  tags: {
    testType: 'smoke',
  },
};

const config = getConfig();

export function setup() {
  console.log(`Running smoke tests against: ${config.baseUrl}`);

  // Generate unique test user for this run
  const testEmail = generateTestEmail();

  return {
    testEmail,
    testPassword: 'SmokeTest123!',
    testName: 'Smoke Test User',
  };
}

export default function (data) {
  // Group 1: Health Checks
  group('Health Checks', function () {
    // Health endpoint
    const healthResponse = apiClient.healthCheck();
    check(healthResponse, {
      'health check returns 200': (r) => r.status === 200,
      'health check has status': (r) => {
        const body = parseJson(r);
        return body && body.status;
      },
    });

    sleep(0.5);

    // Liveness probe
    const liveResponse = apiClient.liveness();
    check(liveResponse, {
      'liveness returns 200': (r) => r.status === 200,
      'liveness shows alive': (r) => {
        const body = parseJson(r);
        return body && body.status === 'alive';
      },
    });

    sleep(0.5);

    // Readiness probe
    const readyResponse = apiClient.readiness();
    check(readyResponse, {
      'readiness returns 200 or 503': (r) => r.status === 200 || r.status === 503,
    });

    sleep(0.5);
  });

  // Group 2: Authentication Flow
  group('Authentication Flow', function () {
    clearAuth(); // Start fresh

    // Register new user
    const registerResponse = apiClient.register(
      data.testEmail,
      data.testPassword,
      data.testName
    );

    const registerSuccess = check(registerResponse, {
      'register returns 201 or 409 (already exists)': (r) =>
        r.status === 201 || r.status === 409 || r.status === 200,
    });

    sleep(0.5);

    // Login
    const loginResponse = apiClient.login(data.testEmail, data.testPassword);
    const loginData = parseJson(loginResponse);

    const loginSuccess = check(loginResponse, {
      'login returns 200': (r) => r.status === 200,
      'login returns access token': (r) => {
        const body = parseJson(r);
        // Handle nested response: { success: true, data: { tokens: { accessToken: ... } } }
        return body && (
          (body.data && body.data.tokens && body.data.tokens.accessToken) ||
          body.accessToken ||
          body.token
        );
      },
    });

    if (loginSuccess && loginData) {
      // Authenticate for subsequent requests
      authenticate(data.testEmail, data.testPassword);
    }

    sleep(0.5);

    // Get current user
    if (loginSuccess) {
      const meResponse = apiClient.me();
      check(meResponse, {
        'me returns 200': (r) => r.status === 200,
        'me returns user data': (r) => {
          const body = parseJson(r);
          // Handle nested response: { success: true, data: { user: { email: ..., userId: ... } } }
          return body && (
            (body.data && body.data.user && (body.data.user.email || body.data.user.userId)) ||
            (body.data && (body.data.email || body.data.id)) ||
            body.email ||
            body.user
          );
        },
      });
    }

    sleep(0.5);
  });

  // Group 3: Wallet Operations (requires auth)
  group('Wallet Operations', function () {
    // Ensure authenticated
    const authResult = authenticate(data.testEmail, data.testPassword);

    if (!authResult.success) {
      console.log('Auth failed, skipping wallet tests');
      errorRate.add(1);
      return;
    }

    // Get wallet
    const walletResponse = apiClient.getMyWallet();
    const walletSuccess = check(walletResponse, {
      'get wallet returns 200': (r) => r.status === 200,
      'wallet has balance': (r) => {
        const body = parseJson(r);
        // Handle nested response: { success: true, data: { wallet: { balance: ... } } }
        return body && (
          (body.data && body.data.wallet && body.data.wallet.balance !== undefined) ||
          body.balance !== undefined ||
          body.wallet
        );
      },
    });

    sleep(0.5);

    // Deposit (small amount for smoke test)
    if (walletSuccess) {
      const depositResponse = apiClient.deposit(10.0, 'USD', `smoke_${Date.now()}`);
      check(depositResponse, {
        'deposit returns 200 or 201': (r) => r.status === 200 || r.status === 201,
      });
    }

    sleep(0.5);

    // Get wallet history
    const historyResponse = apiClient.getWalletHistory({ limit: 5 });
    check(historyResponse, {
      'wallet history returns 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // Group 4: Transaction Operations (basic check)
  group('Transaction Operations', function () {
    // Ensure authenticated
    const authResult = authenticate(data.testEmail, data.testPassword);

    if (!authResult.success) {
      console.log('Auth failed, skipping transaction tests');
      errorRate.add(1);
      return;
    }

    // List transactions
    const listResponse = apiClient.listTransactions({ limit: 5 });
    check(listResponse, {
      'list transactions returns 200': (r) => r.status === 200,
      'transactions is array': (r) => {
        const body = parseJson(r);
        return body && (Array.isArray(body) || Array.isArray(body.transactions) || body.data);
      },
    });

    sleep(0.5);
  });

  // Final sleep before next iteration
  sleep(1);
}

export function teardown(data) {
  console.log('Smoke tests completed');
  console.log(`Test user: ${data.testEmail}`);
}
