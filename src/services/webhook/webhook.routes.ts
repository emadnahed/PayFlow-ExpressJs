/**
 * Webhook API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { webhookController } from './webhook.controller';
import { authMiddleware } from '../../auth/auth.middleware';
import {
  createWebhookValidation,
  updateWebhookValidation,
  webhookIdValidation,
  listWebhooksValidation,
  deliveryLogsValidation,
} from './webhook.validation';
import { validateRequest } from '../../middlewares/validateRequest';

const router = Router();

// All webhook routes require authentication
router.use(authMiddleware);

/**
 * POST /webhooks
 * Create a new webhook subscription
 */
router.post(
  '/',
  createWebhookValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.create(req, res, next)
);

/**
 * GET /webhooks
 * List user's webhook subscriptions
 */
router.get(
  '/',
  listWebhooksValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.list(req, res, next)
);

/**
 * GET /webhooks/:id
 * Get webhook by ID
 */
router.get(
  '/:id',
  webhookIdValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.getById(req, res, next)
);

/**
 * PATCH /webhooks/:id
 * Update webhook subscription
 */
router.patch(
  '/:id',
  updateWebhookValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.update(req, res, next)
);

/**
 * DELETE /webhooks/:id
 * Delete webhook subscription
 */
router.delete(
  '/:id',
  webhookIdValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.delete(req, res, next)
);

/**
 * GET /webhooks/:id/logs
 * Get delivery logs for a webhook
 */
router.get(
  '/:id/logs',
  deliveryLogsValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => webhookController.getLogs(req, res, next)
);

export default router;
