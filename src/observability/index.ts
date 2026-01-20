// Logger exports
export { logger, createServiceLogger } from './logger';

// Log context exports
export {
  LogContext,
  asyncLocalStorage,
  getCorrelationId,
  getLogContext,
  addLogContext,
  runWithContext,
} from './log-context';

// Correlation middleware
export { correlationMiddleware } from './correlation';

// Metrics exports
export {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  transactionsTotal,
  activeTransactions,
  transactionAmount,
  sagaEventsTotal,
  sagaProcessingDuration,
  walletOperationsTotal,
  walletBalanceTotal,
  webhookDeliveriesTotal,
  webhookDeliveryDuration,
  webhookRetriesTotal,
  queueJobsTotal,
  queueJobDuration,
  authAttemptsTotal,
  activeSessions,
  resetMetrics,
  getMetrics,
  getMetricsContentType,
} from './metrics';

// Metrics middleware
export { metricsMiddleware } from './metrics.middleware';

// Tracing exports
export {
  initTracing,
  shutdownTracing,
  getTracer,
  createSagaSpan,
  traceTransaction,
  traceWebhook,
} from './tracing';
