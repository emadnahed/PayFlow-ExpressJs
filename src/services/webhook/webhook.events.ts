/**
 * Webhook Event Handlers
 *
 * Listens for transaction events and triggers webhook deliveries.
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
 * Build webhook payload for a transaction event
 */
async function buildTransactionPayload(
  event: BaseEvent,
  status: string,
  additionalData?: Record<string, unknown>
) {
  const transaction = await Transaction.findOne({ transactionId: event.transactionId });

  return {
    event: event.eventType,
    transactionId: event.transactionId,
    status,
    amount: transaction?.amount || 0,
    currency: transaction?.currency || 'INR',
    timestamp: event.timestamp.toISOString(),
    senderId: transaction?.senderId,
    receiverId: transaction?.receiverId,
    ...additionalData,
  };
}

/**
 * Handle TRANSACTION_COMPLETED event
 */
async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const { transactionId } = event;

  console.log(`[Webhook Events] TRANSACTION_COMPLETED for txn ${transactionId}`);

  try {
    const payload = await buildTransactionPayload(event, 'COMPLETED', {
      senderId: event.payload.senderId,
      receiverId: event.payload.receiverId,
    });

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
 */
async function handleTransactionFailed(event: TransactionFailedEvent): Promise<void> {
  const { transactionId } = event;

  console.log(`[Webhook Events] TRANSACTION_FAILED for txn ${transactionId}`);

  try {
    const payload = await buildTransactionPayload(event, 'FAILED', {
      reason: event.payload.reason,
      refunded: event.payload.refunded,
    });

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
