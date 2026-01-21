/**
 * Spike Tests for PayFlow API
 *
 * Tests system behavior under sudden, extreme load spikes.
 * Simulates viral events, marketing campaigns, or DDoS-like conditions.
 *
 * Usage:
 *   k6 run tests/stress/spike.test.js
 */
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import {
  authenticate,
  generateIdempotencyKey,
  clearAuth,
} from '../../config/test-utils.js';

// Spike-specific metrics
const spikeRequests = new Counter('spike_requests');
const spikeErrors = new Counter('spike_errors');
const spikeRecoveryTime = new Trend('spike_recovery_time', true);
const preSpikeLatency = new Trend('pre_spike_latency', true);
const duringSpikeLatency = new Trend('during_spike_latency', true);
const postSpikeLatency = new Trend('post_spike_latency', true);

const config = getConfig();

export const options = {
  scenarios: {
    // Baseline traffic
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '15m',
      exec: 'baselineTraffic',
      tags: { phase: 'baseline' },
    },
    // First spike
    spike1: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 200 },  // Sudden spike
        { duration: '1m', target: 200 },   // Hold spike
        { duration: '10s', target: 0 },    // Drop
      ],
      startTime: '2m',
      exec: 'spikeTraffic',
      tags: { phase: 'spike1' },
    },
    // Second spike (larger)
    spike2: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 400 },   // Extreme spike
        { duration: '30s', target: 400 },  // Brief hold
        { duration: '10s', target: 0 },    // Drop
      ],
      startTime: '6m',
      exec: 'spikeTraffic',
      tags: { phase: 'spike2' },
    },
    // Third spike (recovery test)
    spike3: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 300 },
        { duration: '2m', target: 300 },
        { duration: '30s', target: 0 },
      ],
      startTime: '10m',
      exec: 'spikeTraffic',
      tags: { phase: 'spike3' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000'], // Allow high latency during spikes
    http_req_failed: ['rate<0.3'],      // Allow failures during spikes
    pre_spike_latency: ['p(95)<1000'],
    post_spike_latency: ['p(95)<2000'], // Should recover
  },
  tags: {
    testType: 'spike',
  },
};

export function setup() {
  console.log(`Running SPIKE tests against: ${config.baseUrl}`);

  // Create test users
  const users = [];
  for (let i = 0; i < 15; i++) {
    const email = `spike_${i}_${Date.now()}@loadtest.com`;
    const password = 'SpikeTest123!';

    const response = apiClient.register(email, password, `Spike User ${i}`);
    if (response.status === 201 || response.status === 200 || response.status === 409) {
      users.push({ email, password });
    }
  }

  users.push({
    email: config.testUser.email,
    password: config.testUser.password,
  });

  return { users };
}

/**
 * Baseline traffic - normal operations
 */
export function baselineTraffic(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  clearAuth();

  const startTime = Date.now();

  // Normal login flow
  const authResult = authenticate(user.email, user.password);
  if (!authResult.success) {
    spikeErrors.add(1);
    return;
  }

  // Normal wallet check
  const walletResponse = apiClient.getMyWallet();
  const latency = Date.now() - startTime;

  check(walletResponse, {
    'baseline wallet request ok': (r) => r.status === 200,
  });

  // Track latency based on test phase
  preSpikeLatency.add(latency);

  spikeRequests.add(1);
  sleep(2 + Math.random() * 3); // 2-5 second think time
}

/**
 * Spike traffic - aggressive requests
 */
export function spikeTraffic(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  clearAuth();

  const startTime = Date.now();

  // Quick auth attempt
  const authResult = authenticate(user.email, user.password);

  if (authResult.success) {
    // Rapid requests during spike
    apiClient.getMyWallet();
    apiClient.listTransactions({ limit: 10 });

    // Some deposits during spike
    if (Math.random() < 0.3) {
      apiClient.deposit(10, 'USD', generateIdempotencyKey());
    }
  }

  const latency = Date.now() - startTime;
  duringSpikeLatency.add(latency);

  spikeRequests.add(1);

  // Minimal delay during spike
  sleep(0.1 + Math.random() * 0.2);
}

export function teardown(data) {
  console.log('Spike tests completed');
  console.log('Compare pre_spike_latency vs during_spike_latency vs post_spike_latency');
}
