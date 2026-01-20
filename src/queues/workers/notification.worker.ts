/**
 * Notification Worker
 *
 * Processes notification jobs (currently logs; can be extended for push/email/SMS).
 */

import { Worker, Job } from 'bullmq';

import { NotificationJobData, NotificationJobResult } from '../notification.queue';
import { queueConnection, QUEUE_NAMES, WORKER_CONCURRENCY } from '../queue.config';

let notificationWorker: Worker<NotificationJobData, NotificationJobResult> | null = null;

/**
 * Process a notification job
 *
 * Note: This is a stub implementation that logs notifications.
 * In production, this would integrate with:
 * - Push notification services (Firebase, APNs)
 * - Email services (SendGrid, SES)
 * - SMS services (Twilio)
 */
async function processNotificationJob(
  job: Job<NotificationJobData, NotificationJobResult>
): Promise<NotificationJobResult> {
  const { userId, type, title, message, data } = job.data;

  console.log(`[Notification Worker] Processing notification for user ${userId}`);
  console.log(`[Notification Worker] Type: ${type}`);
  console.log(`[Notification Worker] Title: ${title}`);
  console.log(`[Notification Worker] Message: ${message}`);

  if (data) {
    console.log(`[Notification Worker] Data: ${JSON.stringify(data)}`);
  }

  // Simulate notification delivery
  // In production, implement actual delivery here:
  // - Check user's notification preferences
  // - Send via appropriate channel (push/email/SMS)
  // - Track delivery status

  // For now, we just log and mark as sent
  return {
    sent: true,
    channel: 'console', // Stub channel
  };
}

/**
 * Setup worker event handlers
 */
function setupWorkerEvents(worker: Worker<NotificationJobData, NotificationJobResult>): void {
  worker.on('completed', (job, result) => {
    console.log(
      `[Notification Worker] Job ${job.id} completed: sent=${result.sent}, channel=${result.channel}`
    );
  });

  worker.on('failed', (job, err) => {
    if (!job) {return;}
    console.error(`[Notification Worker] Job ${job.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[Notification Worker] Worker error:', err);
  });
}

/**
 * Start the notification worker
 */
export function startNotificationWorker(): Worker<NotificationJobData, NotificationJobResult> {
  if (notificationWorker) {
    return notificationWorker;
  }

  notificationWorker = new Worker<NotificationJobData, NotificationJobResult>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotificationJob,
    {
      connection: queueConnection,
      concurrency: WORKER_CONCURRENCY.NOTIFICATIONS,
    }
  );

  setupWorkerEvents(notificationWorker);
  console.log('[Notification Worker] Started');

  return notificationWorker;
}

/**
 * Stop the notification worker
 */
export async function stopNotificationWorker(): Promise<void> {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
    console.log('[Notification Worker] Stopped');
  }
}

/**
 * Check if worker is running
 */
export function isNotificationWorkerRunning(): boolean {
  return notificationWorker !== null && !notificationWorker.closing;
}
