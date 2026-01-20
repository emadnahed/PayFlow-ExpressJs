/**
 * Unit tests for Webhook Validation
 *
 * Tests the express-validator chains for webhook endpoints.
 */

import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import {
  createWebhookValidation,
  updateWebhookValidation,
  webhookIdValidation,
  listWebhooksValidation,
  deliveryLogsValidation,
} from '../../../src/services/webhook/webhook.validation';
import { EventType } from '../../../src/types/events';

// Helper functions
const runBodyValidation = async (validations: any[], body: Record<string, any>) => {
  const req = {
    body,
    params: {},
    query: {},
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

const runParamValidation = async (validations: any[], params: Record<string, any>) => {
  const req = {
    body: {},
    params,
    query: {},
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

const runQueryValidation = async (validations: any[], query: Record<string, any>) => {
  const req = {
    body: {},
    params: {},
    query,
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

const runCombinedValidation = async (
  validations: any[],
  {
    body = {},
    params = {},
    query = {},
  }: { body?: Record<string, any>; params?: Record<string, any>; query?: Record<string, any> }
) => {
  const req = { body, params, query } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

describe('Webhook Validation', () => {
  describe('createWebhookValidation', () => {
    describe('url field', () => {
      it('should pass with valid HTTPS URL', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors).toHaveLength(0);
      });

      it('should pass with HTTPS URL with path', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://api.example.com/v1/webhooks/payflow',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors).toHaveLength(0);
      });

      it('should pass with HTTPS URL with port', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com:8443/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors).toHaveLength(0);
      });

      it('should fail when URL is missing', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('URL is required');
      });

      it('should fail with HTTP URL (not HTTPS)', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'http://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Invalid URL format. Only HTTPS URLs are allowed.');
      });

      it('should fail with invalid URL format', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'not-a-url',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with empty string', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: '',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('events field', () => {
      it('should pass with single valid event', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors).toHaveLength(0);
      });

      it('should pass with multiple valid events', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [
            EventType.TRANSACTION_COMPLETED,
            EventType.TRANSACTION_FAILED,
            EventType.DEBIT_SUCCESS,
          ],
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors).toHaveLength(0);
      });

      it('should pass with all valid event types', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: Object.values(EventType),
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors).toHaveLength(0);
      });

      it('should fail when events is missing', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with empty events array', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [],
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('At least one event type is required');
      });

      it('should fail with invalid event type', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: ['INVALID_EVENT'],
        });
        const errors = result.array().filter((e: any) => e.path === 'events[0]');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when events contains invalid type among valid ones', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED, 'INVALID_EVENT'],
        });
        const errors = result.array().filter((e: any) => e.path === 'events[1]');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when events is not an array', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: EventType.TRANSACTION_COMPLETED,
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('secret field (optional)', () => {
      it('should pass when secret is not provided', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
        });
        const errors = result.array().filter((e: any) => e.path === 'secret');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid secret (16+ characters)', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
          secret: 'my-super-secret-key',
        });
        const errors = result.array().filter((e: any) => e.path === 'secret');
        expect(errors).toHaveLength(0);
      });

      it('should pass with secret exactly 16 characters', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
          secret: '1234567890123456',
        });
        const errors = result.array().filter((e: any) => e.path === 'secret');
        expect(errors).toHaveLength(0);
      });

      it('should fail when secret is less than 16 characters', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
          secret: 'short-secret',
        });
        const errors = result.array().filter((e: any) => e.path === 'secret');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Secret must be at least 16 characters');
      });

      it('should fail when secret is not a string', async () => {
        const result = await runBodyValidation(createWebhookValidation, {
          url: 'https://example.com/webhook',
          events: [EventType.TRANSACTION_COMPLETED],
          secret: 12345678901234567890,
        });
        const errors = result.array().filter((e: any) => e.path === 'secret');
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('updateWebhookValidation', () => {
    describe('id parameter', () => {
      it('should pass with valid webhook ID', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { isActive: false },
        });
        const errors = result.array().filter((e: any) => e.path === 'id');
        expect(errors).toHaveLength(0);
      });

      it('should fail when webhook ID is missing', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: {},
          body: { isActive: false },
        });
        const errors = result.array().filter((e: any) => e.path === 'id');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Webhook ID is required');
      });
    });

    describe('url field (optional)', () => {
      it('should pass when url is not provided', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: {},
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid URL', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { url: 'https://new-example.com/webhook' },
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors).toHaveLength(0);
      });

      it('should fail with invalid URL', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { url: 'not-a-url' },
        });
        const errors = result.array().filter((e: any) => e.path === 'url');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('events field (optional)', () => {
      it('should pass when events is not provided', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: {},
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid events', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { events: [EventType.DEBIT_SUCCESS, EventType.CREDIT_SUCCESS] },
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors).toHaveLength(0);
      });

      it('should fail with empty events array', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { events: [] },
        });
        const errors = result.array().filter((e: any) => e.path === 'events');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('isActive field (optional)', () => {
      it('should pass when isActive is not provided', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: {},
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors).toHaveLength(0);
      });

      it('should pass with isActive as true', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { isActive: true },
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors).toHaveLength(0);
      });

      it('should pass with isActive as false', async () => {
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { isActive: false },
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors).toHaveLength(0);
      });

      it('should fail when isActive is an invalid string', async () => {
        // Note: express-validator isBoolean() coerces 'true'/'false' strings to booleans
        // Only non-boolean strings should fail
        const result = await runCombinedValidation(updateWebhookValidation, {
          params: { id: 'webhook_123' },
          body: { isActive: 'maybe' },
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('isActive must be a boolean');
      });
    });
  });

  describe('webhookIdValidation', () => {
    it('should pass with valid webhook ID', async () => {
      const result = await runParamValidation(webhookIdValidation, {
        id: 'webhook_abc123',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });

    it('should fail when webhook ID is missing', async () => {
      const result = await runParamValidation(webhookIdValidation, {});
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Webhook ID is required');
    });

    it('should pass with MongoDB ObjectId format', async () => {
      const result = await runParamValidation(webhookIdValidation, {
        id: '507f1f77bcf86cd799439011',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });
  });

  describe('listWebhooksValidation', () => {
    it('should pass with no query parameters', async () => {
      const result = await runQueryValidation(listWebhooksValidation, {});
      expect(result.isEmpty()).toBe(true);
    });

    describe('isActive filter', () => {
      it('should pass with isActive as true', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          isActive: 'true',
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors).toHaveLength(0);
      });

      it('should pass with isActive as false', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          isActive: 'false',
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors).toHaveLength(0);
      });

      it('should fail with invalid isActive value', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          isActive: 'maybe',
        });
        const errors = result.array().filter((e: any) => e.path === 'isActive');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('limit parameter', () => {
      it('should pass with valid limit', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          limit: '50',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should pass with limit exactly 1', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          limit: '1',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should pass with limit exactly 100', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          limit: '100',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should fail when limit is 0', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          limit: '0',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when limit exceeds 100', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          limit: '101',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('offset parameter', () => {
      it('should pass with valid offset', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          offset: '10',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors).toHaveLength(0);
      });

      it('should pass with offset of 0', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          offset: '0',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors).toHaveLength(0);
      });

      it('should fail with negative offset', async () => {
        const result = await runQueryValidation(listWebhooksValidation, {
          offset: '-1',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('deliveryLogsValidation', () => {
    describe('webhook ID parameter', () => {
      it('should pass with valid webhook ID', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: {},
        });
        const errors = result.array().filter((e: any) => e.path === 'id');
        expect(errors).toHaveLength(0);
      });

      it('should fail when webhook ID is missing', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: {},
          query: {},
        });
        const errors = result.array().filter((e: any) => e.path === 'id');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('status filter', () => {
      it('should pass with status PENDING', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { status: 'PENDING' },
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with status SUCCESS', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { status: 'SUCCESS' },
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with status FAILED', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { status: 'FAILED' },
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with status RETRYING', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { status: 'RETRYING' },
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should fail with invalid status', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { status: 'INVALID_STATUS' },
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Status must be PENDING, SUCCESS, FAILED, or RETRYING');
      });
    });

    describe('pagination parameters', () => {
      it('should pass with valid limit and offset', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { limit: '20', offset: '0' },
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should fail when limit exceeds 100', async () => {
        const result = await runCombinedValidation(deliveryLogsValidation, {
          params: { id: 'webhook_123' },
          query: { limit: '150' },
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });
});
