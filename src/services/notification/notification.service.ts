/**
 * Notification Service
 *
 * Queues notifications for users based on transaction events.
 */

import crypto from 'crypto';

import { logger } from '../../observability';
import { enqueueNotification, NotificationType, NotificationJobData } from '../../queues';

import { renderTemplate, NotificationTemplateData } from './notification.types';

export class NotificationService {
  /**
   * Generate a unique notification ID
   */
  private generateNotificationId(): string {
    return `ntf_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  /**
   * Queue a notification for a user
   */
  async queueNotification(
    userId: string,
    type: NotificationType,
    data: NotificationTemplateData
  ): Promise<string> {
    const notificationId = this.generateNotificationId();
    const { title, message } = renderTemplate(type, data);

    const jobData: NotificationJobData = {
      notificationId,
      userId,
      type,
      title,
      message,
      data: {
        transactionId: data.transactionId,
        amount: data.amount,
        currency: data.currency,
        senderName: data.senderName,
        receiverName: data.receiverName,
      },
    };

    await enqueueNotification(jobData);

    logger.debug({ type, userId, notificationId }, 'Notification queued');
    return notificationId;
  }

  /**
   * Notify sender that their transaction was initiated
   */
  async notifyTransactionInitiated(
    senderId: string,
    amount: number,
    currency: string,
    transactionId: string
  ): Promise<string> {
    return this.queueNotification(senderId, NotificationType.TRANSACTION_INITIATED, {
      amount,
      currency,
      transactionId,
    });
  }

  /**
   * Notify sender that their transaction completed
   */
  async notifyTransactionCompleted(
    senderId: string,
    receiverName: string,
    amount: number,
    currency: string,
    transactionId: string
  ): Promise<string> {
    return this.queueNotification(senderId, NotificationType.TRANSACTION_COMPLETED, {
      amount,
      currency,
      receiverName,
      transactionId,
    });
  }

  /**
   * Notify sender that their transaction failed
   */
  async notifyTransactionFailed(
    senderId: string,
    amount: number,
    currency: string,
    transactionId: string
  ): Promise<string> {
    return this.queueNotification(senderId, NotificationType.TRANSACTION_FAILED, {
      amount,
      currency,
      transactionId,
    });
  }

  /**
   * Notify receiver that they received a credit
   */
  async notifyCreditReceived(
    receiverId: string,
    senderName: string,
    amount: number,
    currency: string,
    transactionId: string
  ): Promise<string> {
    return this.queueNotification(receiverId, NotificationType.CREDIT_RECEIVED, {
      amount,
      currency,
      senderName,
      transactionId,
    });
  }
}

export const notificationService = new NotificationService();
