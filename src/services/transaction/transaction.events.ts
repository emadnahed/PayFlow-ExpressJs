import { eventBus } from '../../events/eventBus';
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

  console.log(`[Transaction Saga] DEBIT_SUCCESS for txn ${txnId}`);

  try {
    await transactionService.onDebitSuccess(txnId);
  } catch (error) {
    console.error(`[Transaction Saga] CRITICAL: Error handling DEBIT_SUCCESS for ${txnId}:`, error);
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

  console.log(`[Transaction Saga] DEBIT_FAILED for txn ${txnId}: ${reason}`);

  try {
    await transactionService.onDebitFailed(txnId, reason);
  } catch (error) {
    console.error(`[Transaction Saga] CRITICAL: Error handling DEBIT_FAILED for ${txnId}:`, error);
    throw error;
  }
}

/**
 * Handle CREDIT_SUCCESS - Receiver credited, transaction completes
 */
async function handleCreditSuccess(event: CreditSuccessEvent): Promise<void> {
  const txnId = event.transactionId;

  console.log(`[Transaction Saga] CREDIT_SUCCESS for txn ${txnId}`);

  try {
    await transactionService.onCreditSuccess(txnId);
  } catch (error) {
    console.error(
      `[Transaction Saga] CRITICAL: Error handling CREDIT_SUCCESS for ${txnId}:`,
      error
    );
    throw error;
  }
}

/**
 * Handle CREDIT_FAILED - Receiver couldn't be credited, trigger refund
 */
async function handleCreditFailed(event: CreditFailedEvent): Promise<void> {
  const { reason } = event.payload;
  const txnId = event.transactionId;

  console.log(`[Transaction Saga] CREDIT_FAILED for txn ${txnId}: ${reason}`);

  try {
    await transactionService.onCreditFailed(txnId, reason);
  } catch (error) {
    console.error(`[Transaction Saga] CRITICAL: Error handling CREDIT_FAILED for ${txnId}:`, error);
    throw error;
  }
}

/**
 * Handle REFUND_COMPLETED - Refund successful, transaction fails gracefully
 */
async function handleRefundCompleted(event: RefundCompletedEvent): Promise<void> {
  const txnId = event.transactionId;

  console.log(`[Transaction Saga] REFUND_COMPLETED for txn ${txnId}`);

  try {
    await transactionService.onRefundCompleted(txnId);
  } catch (error) {
    console.error(
      `[Transaction Saga] CRITICAL: Error handling REFUND_COMPLETED for ${txnId}:`,
      error
    );
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

    console.log('[Transaction Saga] Event handlers registered');
  } catch (error) {
    console.error('[Transaction Saga] Failed to register event handlers:', error);
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
    console.log('[Transaction Saga] Event handlers unregistered');
  } catch (error) {
    console.error('[Transaction Saga] Failed to unregister event handlers:', error);
  }
}
