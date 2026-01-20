/**
 * Notification Service Module
 */

// Service
export { notificationService, NotificationService } from './notification.service';

// Types
export {
  NotificationTemplateData,
  NOTIFICATION_TEMPLATES,
  renderTemplate,
  formatAmount,
} from './notification.types';

// Event handlers
export {
  registerNotificationEventHandlers,
  unregisterNotificationEventHandlers,
} from './notification.events';
