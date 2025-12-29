/**
 * Queue Module Exports
 */

// Configuration
export { queueConnection, webhookJobOptions, notificationJobOptions, QUEUE_NAMES, WORKER_CONCURRENCY } from './queue.config';

// Webhook Queue
export {
  WebhookJobData,
  WebhookJobResult,
  getWebhookQueue,
  enqueueWebhookDelivery,
  closeWebhookQueue,
  getWebhookQueueStats,
} from './webhook.queue';

// Notification Queue
export {
  NotificationType,
  NotificationJobData,
  NotificationJobResult,
  getNotificationQueue,
  enqueueNotification,
  closeNotificationQueue,
  getNotificationQueueStats,
} from './notification.queue';

// Workers
export {
  startWebhookWorker,
  stopWebhookWorker,
  isWebhookWorkerRunning,
} from './workers/webhook.worker';

export {
  startNotificationWorker,
  stopNotificationWorker,
  isNotificationWorkerRunning,
} from './workers/notification.worker';
