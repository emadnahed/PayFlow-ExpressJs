/**
 * Webhook Service Module
 */

// Service
export {
  webhookService,
  WebhookService,
  CreateWebhookDTO,
  UpdateWebhookDTO,
} from './webhook.service';

// Controller
export { webhookController } from './webhook.controller';

// Routes
export { default as webhookRoutes } from './webhook.routes';

// Event handlers
export { registerWebhookEventHandlers, unregisterWebhookEventHandlers } from './webhook.events';
