/**
 * Webhook Queue
 *
 * Handles async webhook delivery jobs with retries and backoff.
 */

import { Queue, Job } from 'bullmq';

import { EventType } from '../types/events';

import { queueConnection, webhookJobOptions, QUEUE_NAMES } from './queue.config';

/**
 * Webhook job data structure
 */
export interface WebhookJobData {
  webhookId: string;
  deliveryId: string;
  transactionId: string;
  eventType: EventType;
  payload: {
    event: EventType;
    transactionId: string;
    status: string;
    amount: number;
    currency: string;
    timestamp: string;
    senderId?: string;
    receiverId?: string;
    reason?: string;
  };
}

/**
 * Webhook job result
 */
export interface WebhookJobResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

let webhookQueue: Queue<WebhookJobData, WebhookJobResult> | null = null;

/**
 * Get or create the webhook queue
 */
export function getWebhookQueue(): Queue<WebhookJobData, WebhookJobResult> {
  if (!webhookQueue) {
    webhookQueue = new Queue<WebhookJobData, WebhookJobResult>(QUEUE_NAMES.WEBHOOKS, {
      connection: queueConnection,
      defaultJobOptions: webhookJobOptions,
    });
    console.log('[Webhook Queue] Initialized');
  }
  return webhookQueue;
}

/**
 * Add a webhook delivery job to the queue
 */
export async function enqueueWebhookDelivery(
  data: WebhookJobData
): Promise<Job<WebhookJobData, WebhookJobResult>> {
  const queue = getWebhookQueue();
  const job = await queue.add(`webhook:${data.eventType}`, data, {
    jobId: data.deliveryId, // Use delivery ID for idempotency
  });
  console.log(`[Webhook Queue] Job added: ${job.id} for webhook ${data.webhookId}`);
  return job;
}

/**
 * Close the webhook queue connection
 */
export async function closeWebhookQueue(): Promise<void> {
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
    console.log('[Webhook Queue] Closed');
  }
}

/**
 * Get queue statistics
 */
export async function getWebhookQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getWebhookQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
