import { eventBus } from '../../events/eventBus';
import { logger } from '../../observability';
import {
  EventType,
  TransactionInitiatedEvent,
  RefundRequestedEvent,
  DebitSuccessEvent,
  BaseEvent,
} from '../../types/events';

import { walletService } from './wallet.service';

/**
 * Handle transaction initiation - debit the sender's wallet
 */
async function handleTransactionInitiated(event: TransactionInitiatedEvent): Promise<void> {
  const { senderId, amount } = event.payload;
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId }, 'Handling TRANSACTION_INITIATED');

  try {
    await walletService.debit(senderId, amount, txnId);
    logger.info({ transactionId: txnId }, 'Debit successful');
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Debit failed');
    // DEBIT_FAILED event is published by the service
  }
}

/**
 * Handle refund request - credit back the sender's wallet
 */
async function handleRefundRequested(event: RefundRequestedEvent): Promise<void> {
  const { senderId, amount } = event.payload;
  const txnId = event.transactionId;

  logger.info({ transactionId: txnId }, 'Handling REFUND_REQUESTED');

  try {
    await walletService.refund(senderId, amount, txnId);
    logger.info({ transactionId: txnId }, 'Refund successful');
  } catch (error) {
    logger.error({ transactionId: txnId, err: error }, 'Refund failed');
    // REFUND_FAILED event is published by the service
  }
}

/**
 * Handle debit success - credit the receiver's wallet
 * This is called after sender's debit is successful
 */
async function handleDebitSuccess(event: DebitSuccessEvent): Promise<void> {
  // This will be handled by the Transaction Saga in Phase 4
  // The saga will call walletService.credit() directly after receiving DEBIT_SUCCESS
  logger.debug({ transactionId: event.transactionId }, 'DEBIT_SUCCESS received');
}

/**
 * Register all wallet event handlers
 */
export async function registerWalletEventHandlers(): Promise<void> {
  try {
    // Subscribe to transaction initiated event to perform debit
    await eventBus.subscribe(EventType.TRANSACTION_INITIATED, (event: BaseEvent) =>
      handleTransactionInitiated(event as TransactionInitiatedEvent)
    );

    // Subscribe to refund requests
    await eventBus.subscribe(EventType.REFUND_REQUESTED, (event: BaseEvent) =>
      handleRefundRequested(event as RefundRequestedEvent)
    );

    // Subscribe to debit success (for logging/monitoring)
    await eventBus.subscribe(EventType.DEBIT_SUCCESS, (event: BaseEvent) =>
      handleDebitSuccess(event as DebitSuccessEvent)
    );

    logger.info('Wallet event handlers registered');
  } catch (error) {
    logger.error({ err: error }, 'Failed to register wallet event handlers');
    throw error;
  }
}

/**
 * Unregister all wallet event handlers
 */
export async function unregisterWalletEventHandlers(): Promise<void> {
  try {
    await eventBus.unsubscribe(EventType.TRANSACTION_INITIATED);
    await eventBus.unsubscribe(EventType.REFUND_REQUESTED);
    await eventBus.unsubscribe(EventType.DEBIT_SUCCESS);
    logger.info('Wallet event handlers unregistered');
  } catch (error) {
    logger.error({ err: error }, 'Failed to unregister wallet event handlers');
  }
}
