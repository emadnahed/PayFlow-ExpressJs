/**
 * Webhook Controller
 *
 * Handles HTTP requests for webhook management.
 */

import { Response, NextFunction } from 'express';

import { AuthRequest } from '../../auth';
import { ApiError } from '../../middlewares/errorHandler';
import { DeliveryStatus } from '../../models/WebhookDelivery';
import { IWebhookSubscription } from '../../models/WebhookSubscription';

import { webhookService, CreateWebhookDTO, UpdateWebhookDTO } from './webhook.service';


/**
 * Convert webhook document to safe DTO (hide secret)
 */
function toWebhookDTO(webhook: IWebhookSubscription): Record<string, unknown> {
  return {
    webhookId: webhook.webhookId,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    failureCount: webhook.failureCount,
    lastDeliveryAt: webhook.lastDeliveryAt,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

class WebhookController {
  /**
   * Create a new webhook
   * POST /webhooks
   */
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const dto: CreateWebhookDTO = {
        url: req.body.url,
        events: req.body.events,
        secret: req.body.secret,
      };

      const webhook = await webhookService.createWebhook(req.user.userId, dto);

      // Include secret only on creation
      res.status(201).json({
        success: true,
        data: {
          webhook: {
            ...toWebhookDTO(webhook),
            secret: webhook.secret, // Only returned on creation
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get webhook by ID
   * GET /webhooks/:id
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const webhook = await webhookService.getWebhook(req.params.id, req.user.userId);

      res.status(200).json({
        success: true,
        data: {
          webhook: toWebhookDTO(webhook),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List user's webhooks
   * GET /webhooks
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const options = {
        isActive:
          req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const { webhooks, total } = await webhookService.listWebhooks(req.user.userId, options);

      res.status(200).json({
        success: true,
        data: {
          webhooks: webhooks.map(toWebhookDTO),
          total,
          limit: options.limit || 20,
          offset: options.offset || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update webhook
   * PATCH /webhooks/:id
   */
  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const dto: UpdateWebhookDTO = {
        url: req.body.url,
        events: req.body.events,
        isActive: req.body.isActive,
      };

      const webhook = await webhookService.updateWebhook(req.params.id, req.user.userId, dto);

      res.status(200).json({
        success: true,
        data: {
          webhook: toWebhookDTO(webhook),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete webhook
   * DELETE /webhooks/:id
   */
  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      await webhookService.deleteWebhook(req.params.id, req.user.userId);

      res.status(200).json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get delivery logs for a webhook
   * GET /webhooks/:id/logs
   */
  async getLogs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const options = {
        status: req.query.status as DeliveryStatus | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const { deliveries, total } = await webhookService.getDeliveryLogs(
        req.params.id,
        req.user.userId,
        options
      );

      res.status(200).json({
        success: true,
        data: {
          deliveries: deliveries.map((d) => ({
            deliveryId: d.deliveryId,
            transactionId: d.transactionId,
            eventType: d.eventType,
            status: d.status,
            attemptCount: d.attemptCount,
            responseCode: d.responseCode,
            error: d.error,
            completedAt: d.completedAt,
            createdAt: d.createdAt,
          })),
          total,
          limit: options.limit || 20,
          offset: options.offset || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
