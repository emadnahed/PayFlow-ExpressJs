/**
 * Webhook Service
 *
 * Manages webhook subscriptions and delivery.
 */

import crypto from 'crypto';

import { ApiError } from '../../middlewares/errorHandler';
import { WebhookDelivery, IWebhookDelivery } from '../../models/WebhookDelivery';
import { WebhookSubscription, IWebhookSubscription } from '../../models/WebhookSubscription';
import { logger } from '../../observability';
import { enqueueWebhookDelivery, WebhookJobData } from '../../queues';
import { EventType } from '../../types/events';

export interface CreateWebhookDTO {
  url: string;
  events: EventType[];
  secret?: string;
}

export interface UpdateWebhookDTO {
  url?: string;
  events?: EventType[];
  isActive?: boolean;
}

export interface WebhookQueryOptions {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface DeliveryLogQueryOptions {
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  limit?: number;
  offset?: number;
}

export class WebhookService {
  /**
   * Create a new webhook subscription
   */
  async createWebhook(userId: string, dto: CreateWebhookDTO): Promise<IWebhookSubscription> {
    // Validate URL format
    try {
      new URL(dto.url);
    } catch {
      throw new ApiError(400, 'Invalid webhook URL');
    }

    // Validate events
    if (!dto.events || dto.events.length === 0) {
      throw new ApiError(400, 'At least one event type is required');
    }

    const validEvents = Object.values(EventType);
    const invalidEvents = dto.events.filter((e) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      throw new ApiError(400, `Invalid event types: ${invalidEvents.join(', ')}`);
    }

    // Check for duplicate URL for this user
    const existing = await WebhookSubscription.findOne({ userId, url: dto.url });
    if (existing) {
      throw new ApiError(409, 'Webhook with this URL already exists');
    }

    // Create subscription
    const webhook = await WebhookSubscription.create({
      userId,
      url: dto.url,
      events: dto.events,
      secret: dto.secret || crypto.randomBytes(32).toString('hex'),
    });

    logger.info({ webhookId: webhook.webhookId, userId }, 'Webhook created');
    return webhook;
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhookId: string, userId: string): Promise<IWebhookSubscription> {
    const webhook = await WebhookSubscription.findOne({ webhookId });
    if (!webhook) {
      throw new ApiError(404, 'Webhook not found');
    }

    // Authorization: users can only access their own webhooks
    if (webhook.userId !== userId) {
      throw new ApiError(403, 'Not authorized to access this webhook');
    }

    return webhook;
  }

  /**
   * List webhooks for a user
   */
  async listWebhooks(
    userId: string,
    options: WebhookQueryOptions = {}
  ): Promise<{ webhooks: IWebhookSubscription[]; total: number }> {
    const { isActive, limit = 20, offset = 0 } = options;

    const query: Record<string, unknown> = { userId };
    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    const [webhooks, total] = await Promise.all([
      WebhookSubscription.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(Math.min(limit, 100)),
      WebhookSubscription.countDocuments(query),
    ]);

    return { webhooks, total };
  }

  /**
   * Update webhook subscription
   */
  async updateWebhook(
    webhookId: string,
    userId: string,
    dto: UpdateWebhookDTO
  ): Promise<IWebhookSubscription> {
    const webhook = await this.getWebhook(webhookId, userId);

    // Validate URL if provided
    if (dto.url) {
      try {
        new URL(dto.url);
      } catch {
        throw new ApiError(400, 'Invalid webhook URL');
      }
    }

    // Validate events if provided
    if (dto.events) {
      if (dto.events.length === 0) {
        throw new ApiError(400, 'At least one event type is required');
      }

      const validEvents = Object.values(EventType);
      const invalidEvents = dto.events.filter((e) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        throw new ApiError(400, `Invalid event types: ${invalidEvents.join(', ')}`);
      }
    }

    // Update fields
    if (dto.url !== undefined) {webhook.url = dto.url;}
    if (dto.events !== undefined) {webhook.events = dto.events;}
    if (dto.isActive !== undefined) {
      webhook.isActive = dto.isActive;
      // Reset failure count when re-enabling
      if (dto.isActive) {
        webhook.failureCount = 0;
      }
    }

    await webhook.save();

    logger.info({ webhookId }, 'Webhook updated');
    return webhook;
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhook(webhookId: string, userId: string): Promise<void> {
    const webhook = await this.getWebhook(webhookId, userId);
    await WebhookSubscription.deleteOne({ webhookId: webhook.webhookId });
    logger.info({ webhookId }, 'Webhook deleted');
  }

  /**
   * Get delivery logs for a webhook
   */
  async getDeliveryLogs(
    webhookId: string,
    userId: string,
    options: DeliveryLogQueryOptions = {}
  ): Promise<{ deliveries: IWebhookDelivery[]; total: number }> {
    // Verify ownership
    await this.getWebhook(webhookId, userId);

    const { status, limit = 20, offset = 0 } = options;

    const query: Record<string, unknown> = { webhookId };
    if (status) {
      query.status = status;
    }

    const [deliveries, total] = await Promise.all([
      WebhookDelivery.find(query).sort({ createdAt: -1 }).skip(offset).limit(Math.min(limit, 100)),
      WebhookDelivery.countDocuments(query),
    ]);

    return { deliveries, total };
  }

  /**
   * Trigger webhook delivery for an event
   */
  async triggerWebhooks(
    eventType: EventType,
    transactionId: string,
    payload: WebhookJobData['payload']
  ): Promise<number> {
    // Find all active webhooks subscribed to this event
    const webhooks = await WebhookSubscription.find({
      events: eventType,
      isActive: true,
    });

    if (webhooks.length === 0) {
      logger.debug({ eventType }, 'No webhooks subscribed to event');
      return 0;
    }

    logger.debug({ eventType, count: webhooks.length }, 'Triggering webhooks');

    // Create delivery records and enqueue jobs
    const jobs = webhooks.map(async (webhook) => {
      // Create delivery record
      const delivery = await WebhookDelivery.create({
        webhookId: webhook.webhookId,
        transactionId,
        eventType,
        payload,
        status: 'PENDING',
      });

      // Enqueue job
      await enqueueWebhookDelivery({
        webhookId: webhook.webhookId,
        deliveryId: delivery.deliveryId,
        transactionId,
        eventType,
        payload,
      });
    });

    await Promise.all(jobs);

    return webhooks.length;
  }

  /**
   * Get webhook by ID without authorization check (for internal use)
   */
  async getWebhookById(webhookId: string): Promise<IWebhookSubscription | null> {
    return WebhookSubscription.findOne({ webhookId });
  }
}

export const webhookService = new WebhookService();
