/**
 * Ledger Event Handlers
 *
 * Subscribes to DEBIT_SUCCESS events to credit receivers.
 * This separates the credit responsibility from the Transaction Service,
 * allowing for independent failure handling and testing of compensation.
 */

import { eventBus } from '../../events/eventBus';
import { EventType, BaseEvent, DebitSuccessEvent } from '../../types/events';
import { ledgerService } from './ledger.service';

/**
 * Handle DEBIT_SUCCESS event - credit the receiver's wallet
 *
 * This handler is called after the Transaction Service has updated
 * the transaction status to DEBITED.
 */
async function handleDebitSuccess(event: DebitSuccessEvent): Promise<void> {
  const txnId = event.transactionId;

  console.log(`[Ledger Events] Handling DEBIT_SUCCESS for transaction ${txnId}`);

  try {
    // Process the credit via ledger service
    // The ledger service will:
    // 1. Check for simulated failures (testing)
    // 2. Call walletService.credit()
    // 3. Handle errors and publish appropriate events
    const result = await ledgerService.processCredit(txnId);

    if (result.success) {
      console.log(
        `[Ledger Events] Credit completed for transaction ${txnId}, new balance: ${result.newBalance}`
      );
    } else {
      console.log(
        `[Ledger Events] Credit failed for transaction ${txnId}: ${result.error}`
      );
      // Note: ledgerService.processCredit handles publishing CREDIT_FAILED event
    }
  } catch (error) {
    // Unexpected error - log and let the event bus handle it
    console.error(`[Ledger Events] CRITICAL: Unexpected error handling DEBIT_SUCCESS for ${txnId}:`, error);
    throw error;
  }
}

/**
 * Register ledger event handlers
 *
 * IMPORTANT: This should be called AFTER transaction event handlers are registered
 * to ensure proper ordering (transaction status update happens before credit attempt).
 */
export async function registerLedgerEventHandlers(): Promise<void> {
  try {
    await eventBus.subscribe(
      EventType.DEBIT_SUCCESS,
      (event: BaseEvent) => handleDebitSuccess(event as DebitSuccessEvent)
    );

    console.log('[Ledger Events] Event handlers registered');
  } catch (error) {
    console.error('[Ledger Events] Failed to register event handlers:', error);
    throw error;
  }
}

/**
 * Unregister ledger event handlers
 */
export async function unregisterLedgerEventHandlers(): Promise<void> {
  try {
    await eventBus.unsubscribe(EventType.DEBIT_SUCCESS);
    console.log('[Ledger Events] Event handlers unregistered');
  } catch (error) {
    console.error('[Ledger Events] Failed to unregister event handlers:', error);
  }
}
