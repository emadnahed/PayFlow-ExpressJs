/**
 * Webhook Worker
 *
 * Processes webhook delivery jobs with retries, HMAC signing, and delivery logging.
 */

import { Worker, Job } from 'bullmq';
import axios from 'axios';
import crypto from 'crypto';
import { queueConnection, QUEUE_NAMES, WORKER_CONCURRENCY } from '../queue.config';
import { WebhookJobData, WebhookJobResult } from '../webhook.queue';
import { WebhookSubscription } from '../../models/WebhookSubscription';
import { WebhookDelivery } from '../../models/WebhookDelivery';
import { config } from '../../config';

let webhookWorker: Worker<WebhookJobData, WebhookJobResult> | null = null;

/**
 * Sign payload with HMAC-SHA256
 */
function signPayload(payload: object, secret: string): string {
  const data = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Process a webhook delivery job
 */
async function processWebhookJob(job: Job<WebhookJobData, WebhookJobResult>): Promise<WebhookJobResult> {
  const { webhookId, deliveryId, payload } = job.data;

  console.log(`[Webhook Worker] Processing job ${job.id} for webhook ${webhookId}, attempt ${job.attemptsMade + 1}`);

  // Get webhook subscription
  const subscription = await WebhookSubscription.findOne({ webhookId, isActive: true });
  if (!subscription) {
    console.log(`[Webhook Worker] Webhook ${webhookId} not found or inactive, skipping`);
    await updateDeliveryStatus(deliveryId, 'FAILED', {
      error: 'Webhook subscription not found or inactive',
    });
    return { success: false, error: 'Webhook not found' };
  }

  // Sign the payload
  const signature = signPayload(payload, subscription.secret);

  try {
    // Make HTTP request
    const response = await axios.post(subscription.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-PayFlow-Signature': `sha256=${signature}`,
        'X-PayFlow-Delivery-ID': deliveryId,
        'X-PayFlow-Event': payload.event,
      },
      timeout: config.webhook.timeoutMs,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    console.log(`[Webhook Worker] Delivery successful for ${deliveryId}: status ${response.status}`);

    // Update delivery record
    await updateDeliveryStatus(deliveryId, 'SUCCESS', {
      responseCode: response.status,
      responseBody: truncateResponse(response.data),
    });

    // Reset failure count and update last delivery time
    await WebhookSubscription.updateOne(
      { webhookId },
      { $set: { failureCount: 0, lastDeliveryAt: new Date() } }
    );

    return { success: true, statusCode: response.status };
  } catch (error) {
    // Use axios.isAxiosError() type guard for proper error handling
    let statusCode: number | undefined;
    let errorMessage: string;

    if (axios.isAxiosError(error)) {
      statusCode = error.response?.status;
      errorMessage = error.message;
    } else {
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    console.error(`[Webhook Worker] Delivery failed for ${deliveryId}: ${errorMessage}`);

    // Update delivery as retrying (if more attempts remain) or failed
    const maxAttempts = job.opts.attempts || config.webhook.retryAttempts;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

    await updateDeliveryStatus(deliveryId, isLastAttempt ? 'FAILED' : 'RETRYING', {
      responseCode: statusCode,
      error: errorMessage,
      attemptCount: job.attemptsMade + 1,
    });

    // Increment failure count
    await WebhookSubscription.updateOne(
      { webhookId },
      { $inc: { failureCount: 1 } }
    );

    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Update delivery record status
 */
async function updateDeliveryStatus(
  deliveryId: string,
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING',
  data: {
    responseCode?: number;
    responseBody?: string;
    error?: string;
    attemptCount?: number;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = { status, ...data };

  if (status === 'SUCCESS' || status === 'FAILED') {
    updateData.completedAt = new Date();
  }

  await WebhookDelivery.updateOne({ deliveryId }, { $set: updateData });
}

/**
 * Truncate response body for storage
 */
function truncateResponse(data: unknown): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return str.length > 1000 ? str.substring(0, 1000) + '...' : str;
}

/**
 * Handle worker errors and dead letter queue
 */
function setupWorkerEvents(worker: Worker<WebhookJobData, WebhookJobResult>): void {
  worker.on('completed', (job, result) => {
    console.log(`[Webhook Worker] Job ${job.id} completed: success=${result.success}`);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;

    const maxAttempts = job.opts.attempts || config.webhook.retryAttempts;
    const isLastAttempt = job.attemptsMade >= maxAttempts;
    console.error(`[Webhook Worker] Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err.message}`);

    if (isLastAttempt) {
      console.log(`[Webhook Worker] Job ${job.id} moved to dead letter queue after ${job.attemptsMade} attempts`);

      // Check if we should disable the webhook after too many failures (configurable)
      const subscription = await WebhookSubscription.findOne({ webhookId: job.data.webhookId });
      if (subscription && subscription.failureCount >= config.webhook.maxFailureCount) {
        await WebhookSubscription.updateOne(
          { webhookId: job.data.webhookId },
          { $set: { isActive: false } }
        );
        console.log(`[Webhook Worker] Webhook ${job.data.webhookId} disabled after ${subscription.failureCount} failures`);
      }
    }
  });

  worker.on('error', (err) => {
    console.error('[Webhook Worker] Worker error:', err);
  });
}

/**
 * Start the webhook worker
 */
export function startWebhookWorker(): Worker<WebhookJobData, WebhookJobResult> {
  if (webhookWorker) {
    return webhookWorker;
  }

  webhookWorker = new Worker<WebhookJobData, WebhookJobResult>(
    QUEUE_NAMES.WEBHOOKS,
    processWebhookJob,
    {
      connection: queueConnection,
      concurrency: WORKER_CONCURRENCY.WEBHOOKS,
    }
  );

  setupWorkerEvents(webhookWorker);
  console.log('[Webhook Worker] Started');

  return webhookWorker;
}

/**
 * Stop the webhook worker
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    console.log('[Webhook Worker] Stopped');
  }
}

/**
 * Check if worker is running
 */
export function isWebhookWorkerRunning(): boolean {
  return webhookWorker !== null && !webhookWorker.closing;
}
