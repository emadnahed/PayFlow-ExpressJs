/**
 * Notification Event Handlers
 *
 * Listens for transaction events and queues user notifications.
 */

import { eventBus } from '../../events/eventBus';
import {
  EventType,
  BaseEvent,
  TransactionInitiatedEvent,
  TransactionCompletedEvent,
  TransactionFailedEvent,
  CreditSuccessEvent,
} from '../../types/events';
import { notificationService } from './notification.service';
import { User } from '../../models/User';

/**
 * Get user name by userId (for notification messages)
 */
async function getUserName(userId: string): Promise<string> {
  const user = await User.findOne({ userId });
  return user?.name || 'PayFlow User';
}

/**
 * Handle TRANSACTION_INITIATED event
 */
async function handleTransactionInitiated(event: TransactionInitiatedEvent): Promise<void> {
  const { senderId, amount, currency } = event.payload;
  const { transactionId } = event;

  console.log(`[Notification Events] TRANSACTION_INITIATED for txn ${transactionId}`);

  try {
    await notificationService.notifyTransactionInitiated(senderId, amount, currency, transactionId);
  } catch (error) {
    console.error('[Notification Events] Error queueing TRANSACTION_INITIATED notification:', error);
  }
}

/**
 * Handle TRANSACTION_COMPLETED event
 */
async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const { senderId, receiverId, amount, currency } = event.payload;
  const { transactionId } = event;

  console.log(`[Notification Events] TRANSACTION_COMPLETED for txn ${transactionId}`);

  try {
    const receiverName = await getUserName(receiverId);
    await notificationService.notifyTransactionCompleted(
      senderId,
      receiverName,
      amount,
      currency,
      transactionId
    );
  } catch (error) {
    console.error('[Notification Events] Error queueing TRANSACTION_COMPLETED notification:', error);
  }
}

/**
 * Handle TRANSACTION_FAILED event
 */
async function handleTransactionFailed(event: TransactionFailedEvent): Promise<void> {
  const { transactionId } = event;

  console.log(`[Notification Events] TRANSACTION_FAILED for txn ${transactionId}`);

  try {
    // Get transaction details to find sender and amount
    const { Transaction } = await import('../../models/Transaction');
    const transaction = await Transaction.findOne({ transactionId });

    if (transaction) {
      await notificationService.notifyTransactionFailed(
        transaction.senderId,
        transaction.amount,
        transaction.currency,
        transactionId
      );
    }
  } catch (error) {
    console.error('[Notification Events] Error queueing TRANSACTION_FAILED notification:', error);
  }
}

/**
 * Handle CREDIT_SUCCESS event - notify receiver they got paid
 */
async function handleCreditSuccess(event: CreditSuccessEvent): Promise<void> {
  const { receiverId, amount } = event.payload;
  const { transactionId } = event;

  console.log(`[Notification Events] CREDIT_SUCCESS for txn ${transactionId}`);

  try {
    // Get transaction to find sender
    const { Transaction } = await import('../../models/Transaction');
    const transaction = await Transaction.findOne({ transactionId });

    if (transaction) {
      const senderName = await getUserName(transaction.senderId);
      await notificationService.notifyCreditReceived(
        receiverId,
        senderName,
        amount,
        transaction.currency,
        transactionId
      );
    }
  } catch (error) {
    console.error('[Notification Events] Error queueing CREDIT_RECEIVED notification:', error);
  }
}

/**
 * Register notification event handlers
 */
export async function registerNotificationEventHandlers(): Promise<void> {
  try {
    await eventBus.subscribe(
      EventType.TRANSACTION_INITIATED,
      (event: BaseEvent) => handleTransactionInitiated(event as TransactionInitiatedEvent)
    );

    await eventBus.subscribe(
      EventType.TRANSACTION_COMPLETED,
      (event: BaseEvent) => handleTransactionCompleted(event as TransactionCompletedEvent)
    );

    await eventBus.subscribe(
      EventType.TRANSACTION_FAILED,
      (event: BaseEvent) => handleTransactionFailed(event as TransactionFailedEvent)
    );

    await eventBus.subscribe(
      EventType.CREDIT_SUCCESS,
      (event: BaseEvent) => handleCreditSuccess(event as CreditSuccessEvent)
    );

    console.log('[Notification Events] Event handlers registered');
  } catch (error) {
    console.error('[Notification Events] Failed to register event handlers:', error);
    throw error;
  }
}

/**
 * Unregister notification event handlers
 */
export async function unregisterNotificationEventHandlers(): Promise<void> {
  try {
    await eventBus.unsubscribe(EventType.TRANSACTION_INITIATED);
    await eventBus.unsubscribe(EventType.TRANSACTION_COMPLETED);
    await eventBus.unsubscribe(EventType.TRANSACTION_FAILED);
    await eventBus.unsubscribe(EventType.CREDIT_SUCCESS);
    console.log('[Notification Events] Event handlers unregistered');
  } catch (error) {
    console.error('[Notification Events] Failed to unregister event handlers:', error);
  }
}
