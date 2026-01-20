import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { config } from '../config';

/**
 * Prometheus metrics registry
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'payflow' });

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
if (!config.isTest) {
  collectDefaultMetrics({ register: registry });
}

// ============================================
// HTTP Metrics
// ============================================

/**
 * Total HTTP requests counter
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// ============================================
// Transaction Metrics
// ============================================

/**
 * Total transactions counter by status
 */
export const transactionsTotal = new Counter({
  name: 'transactions_total',
  help: 'Total transactions by status',
  labelNames: ['status'] as const,
  registers: [registry],
});

/**
 * Active transactions gauge
 */
export const activeTransactions = new Gauge({
  name: 'active_transactions',
  help: 'Currently processing transactions',
  registers: [registry],
});

/**
 * Transaction amount histogram
 */
export const transactionAmount = new Histogram({
  name: 'transaction_amount',
  help: 'Transaction amounts',
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000],
  registers: [registry],
});

// ============================================
// Saga Metrics
// ============================================

/**
 * Saga events counter by type
 */
export const sagaEventsTotal = new Counter({
  name: 'saga_events_total',
  help: 'Saga events by type',
  labelNames: ['event_type'] as const,
  registers: [registry],
});

/**
 * Saga processing duration
 */
export const sagaProcessingDuration = new Histogram({
  name: 'saga_processing_duration_seconds',
  help: 'Saga processing duration in seconds',
  labelNames: ['outcome'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

// ============================================
// Wallet Metrics
// ============================================

/**
 * Wallet operations counter
 */
export const walletOperationsTotal = new Counter({
  name: 'wallet_operations_total',
  help: 'Wallet operations by type',
  labelNames: ['operation'] as const, // debit, credit, refund
  registers: [registry],
});

/**
 * Wallet balance gauge (for monitoring purposes)
 */
export const walletBalanceTotal = new Gauge({
  name: 'wallet_balance_total',
  help: 'Total balance across all wallets',
  registers: [registry],
});

// ============================================
// Webhook Metrics
// ============================================

/**
 * Webhook deliveries counter
 */
export const webhookDeliveriesTotal = new Counter({
  name: 'webhook_deliveries_total',
  help: 'Webhook deliveries by status',
  labelNames: ['status'] as const, // success, failure
  registers: [registry],
});

/**
 * Webhook delivery duration
 */
export const webhookDeliveryDuration = new Histogram({
  name: 'webhook_delivery_duration_seconds',
  help: 'Webhook delivery duration in seconds',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

/**
 * Webhook retry counter
 */
export const webhookRetriesTotal = new Counter({
  name: 'webhook_retries_total',
  help: 'Total webhook retry attempts',
  registers: [registry],
});

// ============================================
// Queue Metrics
// ============================================

/**
 * Queue job counter
 */
export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Queue jobs by queue and status',
  labelNames: ['queue', 'status'] as const, // queue name, completed/failed
  registers: [registry],
});

/**
 * Queue job processing duration
 */
export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Queue job processing duration in seconds',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// ============================================
// Authentication Metrics
// ============================================

/**
 * Authentication attempts counter
 */
export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Authentication attempts by outcome',
  labelNames: ['outcome'] as const, // success, failure
  registers: [registry],
});

/**
 * Active sessions gauge
 */
export const activeSessions = new Gauge({
  name: 'active_sessions',
  help: 'Currently active user sessions',
  registers: [registry],
});

// ============================================
// Utility Functions
// ============================================

/**
 * Reset all metrics (useful for testing)
 */
export const resetMetrics = (): void => {
  registry.resetMetrics();
};

/**
 * Get all metrics as Prometheus text format
 */
export const getMetrics = async (): Promise<string> => {
  return registry.metrics();
};

/**
 * Get content type for metrics response
 */
export const getMetricsContentType = (): string => {
  return registry.contentType;
};
