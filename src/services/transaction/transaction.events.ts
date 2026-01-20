import { eventBus } from '../../events/eventBus';
import { logger } from '../../observability';
import {
  EventType,
  BaseEvent,
  DebitSuccessEvent,
  DebitFailedEvent,
  CreditSuccessEvent,
  CreditFailedEvent,
  RefundCompletedEvent,
} from '../../types/events';

import { transactionService } from './transaction.service';

/**
 * Handle DEBIT_SUCCESS - Sender's wallet debited, update transaction status
 *
 * Note: The actual credit operation is handled by the Ledger Service,
 * which subscribes to DEBIT_SUCCESS events separately.
 */
async function handleDebitSuccess(event: DebitSuccessEvent): Promise<void> {
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId }, 'Transaction Saga: DEBIT_SUCCESS');

  try {
    await transactionService.onDebitSuccess(txnId);
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Transaction Saga: CRITICAL error handling DEBIT_SUCCESS');
    // Re-throw to allow higher-level error handling (e.g., dead-letter queue)
    throw error;
  }
}

/**
 * Handle DEBIT_FAILED - Sender didn't have enough balance, transaction fails
 */
async function handleDebitFailed(event: DebitFailedEvent): Promise<void> {
  const { reason } = event.payload;
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId, reason }, 'Transaction Saga: DEBIT_FAILED');

  try {
    await transactionService.onDebitFailed(txnId, reason);
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Transaction Saga: CRITICAL error handling DEBIT_FAILED');
    throw error;
  }
}

/**
 * Handle CREDIT_SUCCESS - Receiver credited, transaction completes
 */
async function handleCreditSuccess(event: CreditSuccessEvent): Promise<void> {
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId }, 'Transaction Saga: CREDIT_SUCCESS');

  try {
    await transactionService.onCreditSuccess(txnId);
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Transaction Saga: CRITICAL error handling CREDIT_SUCCESS');
    throw error;
  }
}

/**
 * Handle CREDIT_FAILED - Receiver couldn't be credited, trigger refund
 */
async function handleCreditFailed(event: CreditFailedEvent): Promise<void> {
  const { reason } = event.payload;
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId, reason }, 'Transaction Saga: CREDIT_FAILED');

  try {
    await transactionService.onCreditFailed(txnId, reason);
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Transaction Saga: CRITICAL error handling CREDIT_FAILED');
    throw error;
  }
}

/**
 * Handle REFUND_COMPLETED - Refund successful, transaction fails gracefully
 */
async function handleRefundCompleted(event: RefundCompletedEvent): Promise<void> {
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId }, 'Transaction Saga: REFUND_COMPLETED');

  try {
    await transactionService.onRefundCompleted(txnId);
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Transaction Saga: CRITICAL error handling REFUND_COMPLETED');
    throw error;
  }
}

/**
 * Register all transaction Saga event handlers
 */
export async function registerTransactionEventHandlers(): Promise<void> {
  try {
    // Subscribe to debit results
    await eventBus.subscribe(EventType.DEBIT_SUCCESS, (event: BaseEvent) =>
      handleDebitSuccess(event as DebitSuccessEvent)
    );
    await eventBus.subscribe(EventType.DEBIT_FAILED, (event: BaseEvent) =>
      handleDebitFailed(event as DebitFailedEvent)
    );

    // Subscribe to credit results
    await eventBus.subscribe(EventType.CREDIT_SUCCESS, (event: BaseEvent) =>
      handleCreditSuccess(event as CreditSuccessEvent)
    );
    await eventBus.subscribe(EventType.CREDIT_FAILED, (event: BaseEvent) =>
      handleCreditFailed(event as CreditFailedEvent)
    );

    // Subscribe to refund completion
    await eventBus.subscribe(EventType.REFUND_COMPLETED, (event: BaseEvent) =>
      handleRefundCompleted(event as RefundCompletedEvent)
    );

    logger.info('Transaction Saga event handlers registered');
  } catch (error) {
    logger.error({ err: error }, 'Transaction Saga: Failed to register event handlers');
    throw error;
  }
}

/**
 * Unregister all transaction Saga event handlers
 */
export async function unregisterTransactionEventHandlers(): Promise<void> {
  try {
    await eventBus.unsubscribe(EventType.DEBIT_SUCCESS);
    await eventBus.unsubscribe(EventType.DEBIT_FAILED);
    await eventBus.unsubscribe(EventType.CREDIT_SUCCESS);
    await eventBus.unsubscribe(EventType.CREDIT_FAILED);
    await eventBus.unsubscribe(EventType.REFUND_COMPLETED);
    logger.info('Transaction Saga event handlers unregistered');
  } catch (error) {
    logger.error({ err: error }, 'Transaction Saga: Failed to unregister event handlers');
  }
}
