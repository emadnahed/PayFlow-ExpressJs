import { AsyncLocalStorage } from 'async_hooks';

/**
 * Log context stored in AsyncLocalStorage
 * Provides request-scoped context for logging
 */
export interface LogContext {
  correlationId: string;
  userId?: string;
  transactionId?: string;
  [key: string]: unknown;
}

/**
 * AsyncLocalStorage instance for maintaining request context
 * across async operations without explicit parameter passing
 */
export const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/**
 * Get the current correlation ID from the async context
 */
export const getCorrelationId = (): string | undefined => {
  return asyncLocalStorage.getStore()?.correlationId;
};

/**
 * Get the current log context
 */
export const getLogContext = (): LogContext | undefined => {
  return asyncLocalStorage.getStore();
};

/**
 * Add additional context to the current log context
 */
export const addLogContext = (context: Partial<LogContext>): void => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
};

/**
 * Run a function within a specific log context
 */
export const runWithContext = <T>(context: LogContext, fn: () => T): T => {
  return asyncLocalStorage.run(context, fn);
};
