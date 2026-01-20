/**
 * Notification Event Handlers
 *
 * Listens for transaction events and queues user notifications.
 */

import { eventBus } from '../../events/eventBus';
import { User } from '../../models/User';
import { logger } from '../../observability';
import {
  EventType,
  BaseEvent,
  TransactionInitiatedEvent,
  TransactionCompletedEvent,
  TransactionFailedEvent,
  CreditSuccessEvent,
} from '../../types/events';

import { notificationService } from './notification.service';

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

  logger.debug({ transactionId }, 'Notification Events: TRANSACTION_INITIATED');

  try {
    await notificationService.notifyTransactionInitiated(senderId, amount, currency, transactionId);
  } catch (error) {
    logger.error(
      { transactionId, err: error },
      'Notification Events: Error queueing TRANSACTION_INITIATED notification'
    );
  }
}

/**
 * Handle TRANSACTION_COMPLETED event
 */
async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const { senderId, receiverId, amount, currency } = event.payload;
  const { transactionId } = event;

  logger.debug({ transactionId }, 'Notification Events: TRANSACTION_COMPLETED');

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
    logger.error(
      { transactionId, err: error },
      'Notification Events: Error queueing TRANSACTION_COMPLETED notification'
    );
  }
}

/**
 * Handle TRANSACTION_FAILED event
 */
async function handleTransactionFailed(event: TransactionFailedEvent): Promise<void> {
  const { transactionId } = event;

  logger.debug({ transactionId }, 'Notification Events: TRANSACTION_FAILED');

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
    logger.error({ transactionId, err: error }, 'Notification Events: Error queueing TRANSACTION_FAILED notification');
  }
}

/**
 * Handle CREDIT_SUCCESS event - notify receiver they got paid
 */
async function handleCreditSuccess(event: CreditSuccessEvent): Promise<void> {
  const { receiverId, amount } = event.payload;
  const { transactionId } = event;

  logger.debug({ transactionId }, 'Notification Events: CREDIT_SUCCESS');

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
    logger.error({ transactionId, err: error }, 'Notification Events: Error queueing CREDIT_RECEIVED notification');
  }
}

/**
 * Register notification event handlers
 */
export async function registerNotificationEventHandlers(): Promise<void> {
  try {
    await eventBus.subscribe(EventType.TRANSACTION_INITIATED, (event: BaseEvent) =>
      handleTransactionInitiated(event as TransactionInitiatedEvent)
    );

    await eventBus.subscribe(EventType.TRANSACTION_COMPLETED, (event: BaseEvent) =>
      handleTransactionCompleted(event as TransactionCompletedEvent)
    );

    await eventBus.subscribe(EventType.TRANSACTION_FAILED, (event: BaseEvent) =>
      handleTransactionFailed(event as TransactionFailedEvent)
    );

    await eventBus.subscribe(EventType.CREDIT_SUCCESS, (event: BaseEvent) =>
      handleCreditSuccess(event as CreditSuccessEvent)
    );

    logger.info('Notification event handlers registered');
  } catch (error) {
    logger.error({ err: error }, 'Notification Events: Failed to register event handlers');
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
    logger.info('Notification event handlers unregistered');
  } catch (error) {
    logger.error({ err: error }, 'Notification Events: Failed to unregister event handlers');
  }
}
