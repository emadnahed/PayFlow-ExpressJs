/**
 * Notification Queue
 *
 * Handles async notification jobs for user alerts.
 */

import { Queue, Job } from 'bullmq';

import { logger } from '../observability';

import { queueConnection, notificationJobOptions, QUEUE_NAMES } from './queue.config';

/**
 * Notification types
 */
export enum NotificationType {
  TRANSACTION_INITIATED = 'TRANSACTION_INITIATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CREDIT_RECEIVED = 'CREDIT_RECEIVED',
}

/**
 * Notification job data structure
 */
export interface NotificationJobData {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: {
    transactionId?: string;
    amount?: number;
    currency?: string;
    senderName?: string;
    receiverName?: string;
  };
}

/**
 * Notification job result
 */
export interface NotificationJobResult {
  sent: boolean;
  channel?: string;
  error?: string;
}

let notificationQueue: Queue<NotificationJobData, NotificationJobResult> | null = null;

/**
 * Get or create the notification queue
 */
export function getNotificationQueue(): Queue<NotificationJobData, NotificationJobResult> {
  if (!notificationQueue) {
    notificationQueue = new Queue<NotificationJobData, NotificationJobResult>(
      QUEUE_NAMES.NOTIFICATIONS,
      {
        connection: queueConnection,
        defaultJobOptions: notificationJobOptions,
      }
    );
    logger.info('Notification queue initialized');
  }
  return notificationQueue;
}

/**
 * Add a notification job to the queue
 */
export async function enqueueNotification(
  data: NotificationJobData
): Promise<Job<NotificationJobData, NotificationJobResult>> {
  const queue = getNotificationQueue();
  const job = await queue.add(`notification:${data.type}`, data, {
    jobId: data.notificationId, // Use notification ID for idempotency
  });
  logger.debug({ jobId: job.id, userId: data.userId }, 'Notification job added');
  return job;
}

/**
 * Close the notification queue connection
 */
export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
    logger.info('Notification queue closed');
  }
}

/**
 * Get queue statistics
 */
export async function getNotificationQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getNotificationQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
