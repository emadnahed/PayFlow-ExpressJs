/**
 * Test Utilities for PayFlow Load Testing
 * Shared helper functions and utilities for all tests
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

import { getConfig } from './index.js';

// Custom metrics
export const errorRate = new Rate('errors');
export const successRate = new Rate('success');
export const authFailures = new Counter('auth_failures');
export const transactionErrors = new Counter('transaction_errors');
export const responseTime = new Trend('response_time', true);

// Authentication token storage
let authToken = null;
let refreshToken = null;
let currentUserId = null;
let currentWalletId = null;

/**
 * Get default headers for API requests
 * Includes load test bypass token if configured (bypasses rate limiting)
 */
export function getHeaders(withAuth = false) {
  const config = getConfig();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add load test bypass header if token is configured
  // This bypasses rate limiting on the server
  if (config.loadTestToken) {
    headers['X-Load-Test-Token'] = config.loadTestToken;
  }

  if (withAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Make HTTP request with common error handling
 */
export function makeRequest(method, url, body = null, params = {}) {
  const config = getConfig();
  const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;

  const requestParams = {
    headers: getHeaders(params.auth || false),
    ...params,
  };
  delete requestParams.auth;

  let response;
  const payload = body ? JSON.stringify(body) : null;

  switch (method.toUpperCase()) {
    case 'GET':
      response = http.get(fullUrl, requestParams);
      break;
    case 'POST':
      response = http.post(fullUrl, payload, requestParams);
      break;
    case 'PUT':
      response = http.put(fullUrl, payload, requestParams);
      break;
    case 'DELETE':
      response = http.del(fullUrl, payload, requestParams);
      break;
    case 'PATCH':
      response = http.patch(fullUrl, payload, requestParams);
      break;
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }

  // Track custom metrics
  responseTime.add(response.timings.duration);

  if (response.status >= 200 && response.status < 300) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    successRate.add(0);
    errorRate.add(1);
  }

  return response;
}

/**
 * Authenticate and store tokens
 */
export function authenticate(email, password) {
  const config = getConfig();

  const response = http.post(
    `${config.baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: getHeaders(false) }
  );

  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      // Handle nested response structure: { success: true, data: { user: {...}, tokens: {...} } }
      if (data.data && data.data.tokens) {
        authToken = data.data.tokens.accessToken;
        refreshToken = data.data.tokens.refreshToken;
        currentUserId = data.data.user?.userId || data.data.user?.id;
      } else {
        // Fallback for flat structure
        authToken = data.accessToken || data.token;
        refreshToken = data.refreshToken;
        currentUserId = data.user?.id || data.userId;
      }
      return { success: true, data };
    } catch (e) {
      authFailures.add(1);
      return { success: false, error: 'Failed to parse response' };
    }
  }

  authFailures.add(1);
  return { success: false, status: response.status, body: response.body };
}

/**
 * Register a new user
 */
export function registerUser(email, password, name = 'Load Test User') {
  const config = getConfig();

  const response = http.post(
    `${config.baseUrl}/auth/register`,
    JSON.stringify({ email, password, name }),
    { headers: getHeaders(false) }
  );

  if (response.status === 201 || response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      // Handle nested response structure: { success: true, data: { user: {...}, tokens: {...} } }
      if (data.data && data.data.tokens) {
        authToken = data.data.tokens.accessToken;
        refreshToken = data.data.tokens.refreshToken;
        currentUserId = data.data.user?.userId || data.data.user?.id;
      } else {
        // Fallback for flat structure
        authToken = data.accessToken || data.token;
        refreshToken = data.refreshToken;
        currentUserId = data.user?.id || data.userId;
      }
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'Failed to parse response' };
    }
  }

  return { success: false, status: response.status, body: response.body };
}

/**
 * Refresh authentication token
 */
export function refreshAuth() {
  const config = getConfig();

  if (!refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }

  const response = http.post(
    `${config.baseUrl}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: getHeaders(false) }
  );

  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      // Handle nested response structure
      if (data.data && data.data.tokens) {
        authToken = data.data.tokens.accessToken;
        if (data.data.tokens.refreshToken) {
          refreshToken = data.data.tokens.refreshToken;
        }
      } else {
        authToken = data.accessToken || data.token;
        if (data.refreshToken) {
          refreshToken = data.refreshToken;
        }
      }
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'Failed to parse response' };
    }
  }

  return { success: false, status: response.status };
}

/**
 * Get current authentication token
 */
export function getAuthToken() {
  return authToken;
}

/**
 * Get current user ID
 */
export function getUserId() {
  return currentUserId;
}

/**
 * Get current wallet ID
 */
export function getWalletId() {
  return currentWalletId;
}

/**
 * Set wallet ID (after fetching wallet)
 */
export function setWalletId(id) {
  currentWalletId = id;
}

/**
 * Clear authentication state
 */
export function clearAuth() {
  authToken = null;
  refreshToken = null;
  currentUserId = null;
  currentWalletId = null;
}

/**
 * Generate unique test data
 */
export function generateTestEmail() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `loadtest_${timestamp}_${random}@example.com`;
}

/**
 * Generate unique idempotency key
 */
export function generateIdempotencyKey() {
  return `idem_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Check response with detailed assertions
 */
export function checkResponse(response, name, expectedStatus = 200) {
  const checks = {};
  checks[`${name} - status is ${expectedStatus}`] = response.status === expectedStatus;
  checks[`${name} - response time < 2000ms`] = response.timings.duration < 2000;

  if (expectedStatus >= 200 && expectedStatus < 300) {
    checks[`${name} - has body`] = response.body && response.body.length > 0;
  }

  return check(response, checks);
}

/**
 * Parse JSON response safely
 */
export function parseJson(response) {
  try {
    return JSON.parse(response.body);
  } catch (e) {
    return null;
  }
}

/**
 * Sleep with random jitter
 */
export function sleepWithJitter(baseMs, jitterMs = 500) {
  const jitter = Math.random() * jitterMs * 2 - jitterMs;
  sleep((baseMs + jitter) / 1000);
}

/**
 * Format duration for logging
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export default {
  makeRequest,
  authenticate,
  registerUser,
  refreshAuth,
  getAuthToken,
  getUserId,
  getWalletId,
  setWalletId,
  clearAuth,
  getHeaders,
  generateTestEmail,
  generateIdempotencyKey,
  checkResponse,
  parseJson,
  sleepWithJitter,
  formatDuration,
  errorRate,
  successRate,
  authFailures,
  transactionErrors,
  responseTime,
};
