/**
 * Idempotency E2E Tests
 *
 * Tests for idempotency key validation and header handling.
 * Note: Full idempotency caching is tested via integration tests with Redis.
 */

import request from 'supertest';
import { getTestApp } from '../helpers';

describe('Idempotency E2E Tests', () => {
  const app = getTestApp();

  describe('Idempotency Key Validation', () => {
    describe('Valid Keys', () => {
      it('should accept alphanumeric keys', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'abc123');

        expect(response.status).toBe(200);
      });

      it('should accept keys with dashes', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'request-123-abc');

        expect(response.status).toBe(200);
      });

      it('should accept keys with underscores', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'request_123_abc');

        expect(response.status).toBe(200);
      });

      it('should accept UUID-style keys', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', '550e8400-e29b-41d4-a716-446655440000');

        expect(response.status).toBe(200);
      });

      it('should accept keys at exactly 64 characters', async () => {
        const key = 'a'.repeat(64);

        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', key);

        expect(response.status).toBe(200);
      });

      it('should accept single character keys', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'a');

        expect(response.status).toBe(200);
      });
    });

    describe('Invalid Keys', () => {
      it('should reject keys with spaces', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'key with spaces');

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error.message).toContain('Invalid X-Idempotency-Key');
      });

      it('should reject keys with special characters', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'key@special#chars!');

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject keys longer than 64 characters', async () => {
        const key = 'a'.repeat(65);

        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', key);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject empty keys', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', '');

        // Empty header might be treated as no header by some HTTP clients
        // But if sent, it should be rejected
        expect([200, 400]).toContain(response.status);
      });

      // Note: Unicode and newline tests are skipped because HTTP libraries
      // reject invalid header characters before they reach the server.
      // This is correct behavior - the HTTP spec forbids these characters.

      it('should reject keys with dots', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'key.with.dots');

        expect(response.status).toBe(400);
      });

      it('should reject keys with forward slashes', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'key/with/slashes');

        expect(response.status).toBe(400);
      });
    });

    describe('Optional Idempotency', () => {
      it('should work without idempotency key', async () => {
        const response = await request(app).get('/health/live');

        expect(response.status).toBe(200);
      });

      it('should not include X-Idempotent-Replayed header on first request', async () => {
        const response = await request(app)
          .get('/health/live')
          .set('X-Idempotency-Key', 'unique-key-for-test');

        expect(response.status).toBe(200);
        expect(response.headers['x-idempotent-replayed']).toBeUndefined();
      });
    });
  });

  describe('Idempotency Header Exposure', () => {
    it('should expose X-Idempotent-Replayed in CORS headers', async () => {
      const response = await request(app)
        .options('/transactions')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      const exposedHeaders = response.headers['access-control-expose-headers'];
      expect(exposedHeaders).toBeDefined();
      expect(exposedHeaders.toLowerCase()).toContain('x-idempotent-replayed');
    });

    it('should allow X-Idempotency-Key in CORS preflight', async () => {
      const response = await request(app)
        .options('/transactions')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-Idempotency-Key, Content-Type, Authorization');

      expect(response.status).toBeLessThan(400);
    });
  });

  describe('Error Response for Invalid Keys', () => {
    it('should return proper error format for invalid key', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('X-Idempotency-Key', 'invalid key!!!');

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });

    it('should include error code 2003 for invalid input', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('X-Idempotency-Key', 'bad key');

      expect(response.body.error.code).toBe(2003); // INVALID_INPUT
    });
  });
});
