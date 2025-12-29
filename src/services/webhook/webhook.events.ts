/**
 * Webhook Event Handlers
 *
 * Listens for transaction events and triggers webhook deliveries.
 * Uses event payload data directly to avoid redundant database lookups.
 */

import { eventBus } from '../../events/eventBus';
import {
  EventType,
  BaseEvent,
  TransactionCompletedEvent,
  TransactionFailedEvent,
} from '../../types/events';
import { webhookService } from './webhook.service';
import { Transaction } from '../../models/Transaction';

/**
 * Handle TRANSACTION_COMPLETED event
 * Uses event payload directly - no redundant database lookups
 */
async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const { transactionId } = event;
  const { senderId, receiverId, amount, currency } = event.payload;

  console.log(`[Webhook Events] TRANSACTION_COMPLETED for txn ${transactionId}`);

  try {
    // Build payload directly from event data - no DB lookup needed
    const payload = {
      event: EventType.TRANSACTION_COMPLETED,
      transactionId,
      status: 'COMPLETED',
      amount,
      currency,
      timestamp: event.timestamp.toISOString(),
      senderId,
      receiverId,
    };

    const count = await webhookService.triggerWebhooks(
      EventType.TRANSACTION_COMPLETED,
      transactionId,
      payload
    );

    console.log(`[Webhook Events] Triggered ${count} webhooks for TRANSACTION_COMPLETED`);
  } catch (error) {
    console.error(`[Webhook Events] Error triggering webhooks for TRANSACTION_COMPLETED:`, error);
  }
}

/**
 * Handle TRANSACTION_FAILED event
 * Requires DB lookup only for missing data (amount, currency)
 */
async function handleTransactionFailed(event: TransactionFailedEvent): Promise<void> {
  const { transactionId } = event;
  const { reason, refunded } = event.payload;

  console.log(`[Webhook Events] TRANSACTION_FAILED for txn ${transactionId}`);

  try {
    // Need to get transaction for amount/currency since not in event payload
    const transaction = await Transaction.findOne({ transactionId });

    const payload = {
      event: EventType.TRANSACTION_FAILED,
      transactionId,
      status: 'FAILED',
      amount: transaction?.amount || 0,
      currency: transaction?.currency || 'INR',
      timestamp: event.timestamp.toISOString(),
      senderId: transaction?.senderId,
      receiverId: transaction?.receiverId,
      reason,
      refunded,
    };

    const count = await webhookService.triggerWebhooks(
      EventType.TRANSACTION_FAILED,
      transactionId,
      payload
    );

    console.log(`[Webhook Events] Triggered ${count} webhooks for TRANSACTION_FAILED`);
  } catch (error) {
    console.error(`[Webhook Events] Error triggering webhooks for TRANSACTION_FAILED:`, error);
  }
}

/**
 * Register webhook event handlers
 */
export async function registerWebhookEventHandlers(): Promise<void> {
  try {
    await eventBus.subscribe(
      EventType.TRANSACTION_COMPLETED,
      (event: BaseEvent) => handleTransactionCompleted(event as TransactionCompletedEvent)
    );

    await eventBus.subscribe(
      EventType.TRANSACTION_FAILED,
      (event: BaseEvent) => handleTransactionFailed(event as TransactionFailedEvent)
    );

    console.log('[Webhook Events] Event handlers registered');
  } catch (error) {
    console.error('[Webhook Events] Failed to register event handlers:', error);
    throw error;
  }
}

/**
 * Unregister webhook event handlers
 */
export async function unregisterWebhookEventHandlers(): Promise<void> {
  try {
    await eventBus.unsubscribe(EventType.TRANSACTION_COMPLETED);
    await eventBus.unsubscribe(EventType.TRANSACTION_FAILED);
    console.log('[Webhook Events] Event handlers unregistered');
  } catch (error) {
    console.error('[Webhook Events] Failed to unregister event handlers:', error);
  }
}
