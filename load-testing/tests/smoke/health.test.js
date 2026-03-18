/**
 * Health Endpoint Smoke Tests
 *
 * Focused tests for health check endpoints only.
 * Use this for quick verification that the service is running.
 *
 * Usage:
 *   k6 run tests/smoke/health.test.js
 */
import { check, sleep } from 'k6';

import { getConfig } from '../../config/index.js';
import { apiClient } from '../../config/api-client.js';
import { parseJson } from '../../config/test-utils.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
  tags: {
    testType: 'smoke',
    endpoint: 'health',
  },
};

const config = getConfig();

export function setup() {
  console.log(`Running health smoke tests against: ${config.baseUrl}`);
  return {};
}

export default function () {
  // Main health check
  const healthResponse = apiClient.healthCheck();
  check(healthResponse, {
    'health check returns 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
    'health check has valid status': (r) => {
      const body = parseJson(r);
      return body && (body.status === 'healthy' || body.status === 'unhealthy');
    },
    'health check has services info': (r) => {
      const body = parseJson(r);
      return body && body.services;
    },
  });

  sleep(1);

  // Liveness probe
  const liveResponse = apiClient.liveness();
  check(liveResponse, {
    'liveness returns 200': (r) => r.status === 200,
    'liveness response time < 200ms': (r) => r.timings.duration < 200,
    'liveness shows alive': (r) => {
      const body = parseJson(r);
      return body && body.status === 'alive';
    },
  });

  sleep(1);

  // Readiness probe
  const readyResponse = apiClient.readiness();
  check(readyResponse, {
    'readiness returns expected status': (r) => r.status === 200 || r.status === 503,
    'readiness response time < 500ms': (r) => r.timings.duration < 500,
    'readiness has valid status': (r) => {
      const body = parseJson(r);
      return body && (body.status === 'ready' || body.status === 'not ready');
    },
  });

  sleep(1);
}

export function teardown() {
  console.log('Health smoke tests completed');
}
