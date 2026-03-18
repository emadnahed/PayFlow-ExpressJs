/**
 * PayFlow API Client for k6 Load Testing
 * Provides typed methods for all API endpoints
 */
import http from 'k6/http';
import { check } from 'k6';

import { getConfig } from './index.js';
import { getHeaders, getAuthToken, setWalletId, parseJson, transactionErrors } from './test-utils.js';

/**
 * API Client class for PayFlow endpoints
 */
class ApiClient {
  constructor() {
    this.config = getConfig();
  }

  get baseUrl() {
    return this.config.baseUrl;
  }

  // ==================== Health Endpoints ====================

  /**
   * GET /health - Health check
   */
  healthCheck() {
    return http.get(`${this.baseUrl}/health`, {
      headers: getHeaders(false),
      tags: { name: 'health_check' },
    });
  }

  /**
   * GET /health/live - Liveness probe
   */
  liveness() {
    return http.get(`${this.baseUrl}/health/live`, {
      headers: getHeaders(false),
      tags: { name: 'liveness' },
    });
  }

  /**
   * GET /health/ready - Readiness probe
   */
  readiness() {
    return http.get(`${this.baseUrl}/health/ready`, {
      headers: getHeaders(false),
      tags: { name: 'readiness' },
    });
  }

  // ==================== Auth Endpoints ====================

  /**
   * POST /auth/register - Register new user
   */
  register(email, password, name = 'Load Test User') {
    return http.post(
      `${this.baseUrl}/auth/register`,
      JSON.stringify({ email, password, name }),
      {
        headers: getHeaders(false),
        tags: { name: 'auth_register' },
      }
    );
  }

  /**
   * POST /auth/login - Login user
   */
  login(email, password) {
    return http.post(
      `${this.baseUrl}/auth/login`,
      JSON.stringify({ email, password }),
      {
        headers: getHeaders(false),
        tags: { name: 'auth_login' },
      }
    );
  }

  /**
   * POST /auth/refresh - Refresh token
   */
  refresh(refreshToken) {
    return http.post(
      `${this.baseUrl}/auth/refresh`,
      JSON.stringify({ refreshToken }),
      {
        headers: getHeaders(false),
        tags: { name: 'auth_refresh' },
      }
    );
  }

  /**
   * GET /auth/me - Get current user
   */
  me() {
    return http.get(`${this.baseUrl}/auth/me`, {
      headers: getHeaders(true),
      tags: { name: 'auth_me' },
    });
  }

  // ==================== Wallet Endpoints ====================

  /**
   * GET /wallets/me - Get current user's wallet
   */
  getMyWallet() {
    const response = http.get(`${this.baseUrl}/wallets/me`, {
      headers: getHeaders(true),
      tags: { name: 'wallet_get' },
    });

    // Store wallet ID for later use
    if (response.status === 200) {
      const data = parseJson(response);
      if (data && data.data && data.data.wallet) {
        setWalletId(data.data.wallet.walletId);
      } else if (data && data.id) {
        setWalletId(data.id);
      }
    }

    return response;
  }

  /**
   * GET /wallets/me/history - Get wallet history
   */
  getWalletHistory(params = {}) {
    const queryParts = [];
    if (params.page) queryParts.push(`page=${params.page}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    if (params.type) queryParts.push(`type=${params.type}`);

    const queryString = queryParts.join('&');
    const url = `${this.baseUrl}/wallets/me/history${queryString ? '?' + queryString : ''}`;

    return http.get(url, {
      headers: getHeaders(true),
      tags: { name: 'wallet_history' },
    });
  }

  /**
   * POST /wallets/me/deposit - Deposit funds
   */
  deposit(amount, currency = 'USD', idempotencyKey = null) {
    const headers = getHeaders(true);
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    return http.post(
      `${this.baseUrl}/wallets/me/deposit`,
      JSON.stringify({ amount, idempotencyKey }),
      {
        headers,
        tags: { name: 'wallet_deposit' },
      }
    );
  }

  /**
   * GET /wallets/:id/balance - Get wallet balance by ID
   */
  getWalletBalance(walletId) {
    return http.get(`${this.baseUrl}/wallets/${walletId}/balance`, {
      headers: getHeaders(true),
      tags: { name: 'wallet_balance' },
    });
  }

  // ==================== Transaction Endpoints ====================

  /**
   * POST /transactions - Create a new transaction
   */
  createTransaction(receiverId, amount, currency = 'USD', description = '', idempotencyKey = null) {
    const headers = getHeaders(true);
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    const response = http.post(
      `${this.baseUrl}/transactions`,
      JSON.stringify({
        receiverId,
        amount,
        currency,
        description,
      }),
      {
        headers,
        tags: { name: 'transaction_create' },
      }
    );

    if (response.status >= 400) {
      transactionErrors.add(1);
    }

    return response;
  }

  /**
   * GET /transactions - List user's transactions
   */
  listTransactions(params = {}) {
    const queryParts = [];
    if (params.page) queryParts.push(`page=${params.page}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    if (params.status) queryParts.push(`status=${params.status}`);
    if (params.type) queryParts.push(`type=${params.type}`);
    if (params.offset) queryParts.push(`offset=${params.offset}`);

    const queryString = queryParts.join('&');
    const url = `${this.baseUrl}/transactions${queryString ? '?' + queryString : ''}`;

    return http.get(url, {
      headers: getHeaders(true),
      tags: { name: 'transaction_list' },
    });
  }

  /**
   * GET /transactions/:id - Get transaction by ID
   */
  getTransaction(transactionId) {
    return http.get(`${this.baseUrl}/transactions/${transactionId}`, {
      headers: getHeaders(true),
      tags: { name: 'transaction_get' },
    });
  }

  // ==================== Ledger Endpoints ====================

  /**
   * GET /ledger/simulation - Get simulation config
   */
  getSimulationConfig() {
    return http.get(`${this.baseUrl}/ledger/simulation`, {
      headers: getHeaders(false),
      tags: { name: 'ledger_simulation_get' },
    });
  }

  /**
   * POST /ledger/simulation/reset - Reset simulation
   */
  resetSimulation() {
    return http.post(
      `${this.baseUrl}/ledger/simulation/reset`,
      null,
      {
        headers: getHeaders(false),
        tags: { name: 'ledger_simulation_reset' },
      }
    );
  }

  // ==================== Webhook Endpoints ====================

  /**
   * GET /webhooks - List webhooks
   */
  listWebhooks(params = {}) {
    const queryParts = [];
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    if (params.offset) queryParts.push(`offset=${params.offset}`);
    if (params.isActive !== undefined) queryParts.push(`isActive=${params.isActive}`);

    const queryString = queryParts.join('&');
    const url = `${this.baseUrl}/webhooks${queryString ? '?' + queryString : ''}`;

    return http.get(url, {
      headers: getHeaders(true),
      tags: { name: 'webhook_list' },
    });
  }

  /**
   * POST /webhooks - Create webhook
   */
  createWebhook(url, events, secret) {
    return http.post(
      `${this.baseUrl}/webhooks`,
      JSON.stringify({ url, events, secret }),
      {
        headers: getHeaders(true),
        tags: { name: 'webhook_create' },
      }
    );
  }

  /**
   * GET /webhooks/:id - Get webhook by ID
   */
  getWebhook(webhookId) {
    return http.get(`${this.baseUrl}/webhooks/${webhookId}`, {
      headers: getHeaders(true),
      tags: { name: 'webhook_get' },
    });
  }

  /**
   * DELETE /webhooks/:id - Delete webhook
   */
  deleteWebhook(webhookId) {
    return http.del(`${this.baseUrl}/webhooks/${webhookId}`, null, {
      headers: getHeaders(true),
      tags: { name: 'webhook_delete' },
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
