/**
 * Webhook API Validation Rules
 */

import { body, param, query } from 'express-validator';
import { EventType } from '../../types/events';

const validEventTypes = Object.values(EventType);

/**
 * Validation rules for creating a webhook
 */
export const createWebhookValidation = [
  body('url')
    .notEmpty()
    .withMessage('URL is required')
    .isURL({ require_protocol: true })
    .withMessage('Invalid URL format'),

  body('events')
    .isArray({ min: 1 })
    .withMessage('At least one event type is required'),

  body('events.*')
    .isIn(validEventTypes)
    .withMessage(`Invalid event type. Valid types: ${validEventTypes.join(', ')}`),

  body('secret')
    .optional()
    .isString()
    .isLength({ min: 16 })
    .withMessage('Secret must be at least 16 characters'),
];

/**
 * Validation rules for updating a webhook
 */
export const updateWebhookValidation = [
  param('id')
    .notEmpty()
    .withMessage('Webhook ID is required'),

  body('url')
    .optional()
    .isURL({ require_protocol: true })
    .withMessage('Invalid URL format'),

  body('events')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one event type is required'),

  body('events.*')
    .optional()
    .isIn(validEventTypes)
    .withMessage(`Invalid event type. Valid types: ${validEventTypes.join(', ')}`),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

/**
 * Validation rules for webhook ID parameter
 */
export const webhookIdValidation = [
  param('id')
    .notEmpty()
    .withMessage('Webhook ID is required')
    .isString()
    .withMessage('Webhook ID must be a string'),
];

/**
 * Validation rules for listing webhooks
 */
export const listWebhooksValidation = [
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
];

/**
 * Validation rules for delivery logs
 */
export const deliveryLogsValidation = [
  param('id')
    .notEmpty()
    .withMessage('Webhook ID is required'),

  query('status')
    .optional()
    .isIn(['PENDING', 'SUCCESS', 'FAILED', 'RETRYING'])
    .withMessage('Status must be PENDING, SUCCESS, FAILED, or RETRYING'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
];
