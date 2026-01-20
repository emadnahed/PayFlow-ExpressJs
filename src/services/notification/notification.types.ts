/**
 * Notification Types and Templates
 */

import { NotificationType } from '../../queues/notification.queue';

/**
 * Notification templates
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; message: string }> =
  {
    [NotificationType.TRANSACTION_INITIATED]: {
      title: 'Transfer Initiated',
      message: 'Your transfer of {currency} {amount} has been initiated',
    },
    [NotificationType.TRANSACTION_COMPLETED]: {
      title: 'Transfer Successful',
      message: 'Transfer of {currency} {amount} to {receiverName} was successful',
    },
    [NotificationType.TRANSACTION_FAILED]: {
      title: 'Transfer Failed',
      message: 'Transfer failed. {currency} {amount} has been refunded to your wallet',
    },
    [NotificationType.CREDIT_RECEIVED]: {
      title: 'Payment Received',
      message: 'You received {currency} {amount} from {senderName}',
    },
  };

/**
 * Template data for notification messages
 */
export interface NotificationTemplateData {
  amount?: number;
  currency?: string;
  senderName?: string;
  receiverName?: string;
  transactionId?: string;
}

/**
 * Format currency amount
 */
export function formatAmount(amount: number, currency: string = 'INR'): string {
  const symbols: Record<string, string> = {
    INR: '\u20B9', // Rupee symbol
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
  };
  return `${symbols[currency] || currency} ${amount.toFixed(2)}`;
}

/**
 * Render a notification template with data
 */
export function renderTemplate(
  type: NotificationType,
  data: NotificationTemplateData
): { title: string; message: string } {
  const template = NOTIFICATION_TEMPLATES[type];

  let title = template.title;
  let message = template.message;

  // Replace placeholders
  const replacements: Record<string, string> = {
    '{amount}': data.amount?.toString() || '0',
    '{currency}': data.currency || 'INR',
    '{senderName}': data.senderName || 'someone',
    '{receiverName}': data.receiverName || 'recipient',
    '{transactionId}': data.transactionId || '',
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    title = title.replace(placeholder, value);
    message = message.replace(placeholder, value);
  }

  return { title, message };
}
