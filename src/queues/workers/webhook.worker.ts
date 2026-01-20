/**
 * Webhook Worker
 *
 * Processes webhook delivery jobs with retries, HMAC signing, and delivery logging.
 */

import crypto from 'crypto';

import axios from 'axios';
import { Worker, Job } from 'bullmq';

import { config } from '../../config';
import { ApiError } from '../../middlewares/errorHandler';
import { WebhookDelivery } from '../../models/WebhookDelivery';
import { WebhookSubscription } from '../../models/WebhookSubscription';
import { logger } from '../../observability';
import { queueConnection, QUEUE_NAMES, WORKER_CONCURRENCY } from '../queue.config';
import { WebhookJobData, WebhookJobResult } from '../webhook.queue';

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
async function processWebhookJob(
  job: Job<WebhookJobData, WebhookJobResult>
): Promise<WebhookJobResult> {
  const { webhookId, deliveryId, payload } = job.data;

  logger.info(
    { jobId: job.id, webhookId, attempt: job.attemptsMade + 1 },
    'Processing webhook delivery job'
  );

  // Get webhook subscription
  const subscription = await WebhookSubscription.findOne({ webhookId, isActive: true });
  if (!subscription) {
    const errorMessage = ApiError.notFound('Webhook subscription').message;
    logger.warn({ webhookId }, 'Webhook not found or inactive, skipping');
    await updateDeliveryStatus(deliveryId, 'FAILED', {
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
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

    logger.info(
      { deliveryId, statusCode: response.status },
      'Webhook delivery successful'
    );

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

    logger.error({ deliveryId, error: errorMessage }, 'Webhook delivery failed');

    // Update delivery as retrying (if more attempts remain) or failed
    const maxAttempts = job.opts.attempts || config.webhook.retryAttempts;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

    await updateDeliveryStatus(deliveryId, isLastAttempt ? 'FAILED' : 'RETRYING', {
      responseCode: statusCode,
      error: errorMessage,
      attemptCount: job.attemptsMade + 1,
    });

    // Increment failure count
    await WebhookSubscription.updateOne({ webhookId }, { $inc: { failureCount: 1 } });

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
    logger.info({ jobId: job.id, success: result.success }, 'Webhook job completed');
  });

  worker.on('failed', async (job, err) => {
    if (!job) {
      return;
    }

    const maxAttempts = job.opts.attempts || config.webhook.retryAttempts;
    const isLastAttempt = job.attemptsMade >= maxAttempts;
    logger.error(
      { jobId: job.id, attempt: job.attemptsMade, maxAttempts, error: err.message },
      'Webhook job failed'
    );

    if (isLastAttempt) {
      logger.warn(
        { jobId: job.id, attempts: job.attemptsMade },
        'Webhook job moved to dead letter queue'
      );

      // Check if we should disable the webhook after too many failures (configurable)
      const subscription = await WebhookSubscription.findOne({ webhookId: job.data.webhookId });
      if (subscription && subscription.failureCount >= config.webhook.maxFailureCount) {
        await WebhookSubscription.updateOne(
          { webhookId: job.data.webhookId },
          { $set: { isActive: false } }
        );
        logger.warn(
          { webhookId: job.data.webhookId, failureCount: subscription.failureCount },
          'Webhook disabled due to excessive failures'
        );
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Webhook worker error');
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
  logger.info('Webhook worker started');

  return webhookWorker;
}

/**
 * Stop the webhook worker
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    logger.info('Webhook worker stopped');
  }
}

/**
 * Check if worker is running
 */
export function isWebhookWorkerRunning(): boolean {
  return webhookWorker !== null && !webhookWorker.closing;
}
