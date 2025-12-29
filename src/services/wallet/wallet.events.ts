import { eventBus } from '../../events/eventBus';
import { EventType, TransactionInitiatedEvent, RefundRequestedEvent } from '../../types/events';
import { walletService } from './wallet.service';

/**
 * Handle transaction initiation - debit the sender's wallet
 */
async function handleTransactionInitiated(event: TransactionInitiatedEvent): Promise<void> {
  const { senderId, amount } = event.payload;
  const txnId = event.transactionId;

  console.log(`[Wallet] Handling TRANSACTION_INITIATED for txn ${txnId}`);

  try {
    await walletService.debit(senderId, amount, txnId);
    console.log(`[Wallet] Debit successful for txn ${txnId}`);
  } catch (error) {
    console.error(`[Wallet] Debit failed for txn ${txnId}:`, error);
    // DEBIT_FAILED event is published by the service
  }
}

/**
 * Handle refund request - credit back the sender's wallet
 */
async function handleRefundRequested(event: RefundRequestedEvent): Promise<void> {
  const { senderId, amount } = event.payload;
  const txnId = event.transactionId;

  console.log(`[Wallet] Handling REFUND_REQUESTED for txn ${txnId}`);

  try {
    await walletService.refund(senderId, amount, txnId);
    console.log(`[Wallet] Refund successful for txn ${txnId}`);
  } catch (error) {
    console.error(`[Wallet] Refund failed for txn ${txnId}:`, error);
  }
}

/**
 * Handle debit success - credit the receiver's wallet
 * This is called after sender's debit is successful
 */
async function handleDebitSuccess(event: { transactionId: string; payload: { receiverId?: string; amount?: number } }): Promise<void> {
  // This will be handled by the Transaction Saga in Phase 4
  // The saga will call walletService.credit() directly after receiving DEBIT_SUCCESS
  console.log(`[Wallet] DEBIT_SUCCESS received for txn ${event.transactionId}`);
}

/**
 * Register all wallet event handlers
 */
export async function registerWalletEventHandlers(): Promise<void> {
  try {
    // Subscribe to transaction initiated event to perform debit
    await eventBus.subscribe(EventType.TRANSACTION_INITIATED, handleTransactionInitiated as any);

    // Subscribe to refund requests
    await eventBus.subscribe(EventType.REFUND_REQUESTED, handleRefundRequested as any);

    // Subscribe to debit success (for logging/monitoring)
    await eventBus.subscribe(EventType.DEBIT_SUCCESS, handleDebitSuccess as any);

    console.log('[Wallet] Event handlers registered');
  } catch (error) {
    console.error('[Wallet] Failed to register event handlers:', error);
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
    console.log('[Wallet] Event handlers unregistered');
  } catch (error) {
    console.error('[Wallet] Failed to unregister event handlers:', error);
  }
}
