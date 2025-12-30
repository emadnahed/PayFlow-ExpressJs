/**
 * Security E2E Tests
 *
 * Tests for security headers, CORS, rate limiting, and error handling.
 */

import request from 'supertest';
import { getTestApp } from '../helpers';

describe('Security E2E Tests', () => {
  const app = getTestApp();

  describe('Security Headers', () => {
    it('should include Helmet security headers', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);

      // Check for key security headers set by Helmet
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should set Content-Security-Policy header', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should set Strict-Transport-Security header', async () => {
      const response = await request(app).get('/health/live');

      // HSTS header
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
    });

    it('should not expose X-Powered-By header', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const response = await request(app)
        .options('/health/live')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('should expose X-Correlation-Id in CORS headers', async () => {
      const response = await request(app)
        .options('/health/live')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      const exposedHeaders = response.headers['access-control-expose-headers'];
      expect(exposedHeaders).toBeDefined();
      expect(exposedHeaders.toLowerCase()).toContain('x-correlation-id');
    });

    it('should allow X-Idempotency-Key header', async () => {
      const response = await request(app)
        .options('/transactions')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-Idempotency-Key');

      expect(response.status).toBeLessThan(400);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for 404', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('correlationId');
    });

    it('should include error code in error response', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(typeof response.body.error.code).toBe('number');
    });

    it('should include ISO timestamp in error response', async () => {
      const response = await request(app).get('/nonexistent-route');

      const timestamp = response.body.error.timestamp;
      expect(timestamp).toBeDefined();
      expect(() => new Date(timestamp).toISOString()).not.toThrow();
    });

    it('should include correlationId in error response', async () => {
      const response = await request(app).get('/nonexistent-route');

      expect(response.body.error.correlationId).toBeDefined();
      expect(typeof response.body.error.correlationId).toBe('string');
    });
  });

  describe('Request Body Limits', () => {
    it('should reject oversized JSON bodies', async () => {
      // Create a payload larger than 10kb
      const largePayload = {
        data: 'x'.repeat(15000), // ~15kb
      };

      const response = await request(app)
        .post('/auth/register')
        .send(largePayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(413);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid X-Idempotency-Key format', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('X-Idempotency-Key', 'invalid key with spaces!!!');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid X-Idempotency-Key');
    });

    it('should accept valid X-Idempotency-Key format', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('X-Idempotency-Key', 'valid-key-123_abc');

      expect(response.status).toBe(200);
    });

    it('should reject X-Idempotency-Key longer than 64 characters', async () => {
      const longKey = 'a'.repeat(65);

      const response = await request(app)
        .get('/health/live')
        .set('X-Idempotency-Key', longKey);

      expect(response.status).toBe(400);
    });
  });

  describe('API Documentation', () => {
    it('should serve Scalar API docs at /api-docs', async () => {
      const response = await request(app).get('/api-docs');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should serve OpenAPI spec at /api-docs.json', async () => {
      const response = await request(app).get('/api-docs.json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi', '3.0.3');
      expect(response.body).toHaveProperty('info');
      expect(response.body.info).toHaveProperty('title', 'PayFlow API');
      expect(response.body).toHaveProperty('paths');
      expect(response.body).toHaveProperty('components');
    });

    it('should include all API endpoints in spec', async () => {
      const response = await request(app).get('/api-docs.json');
      const paths = Object.keys(response.body.paths);

      expect(paths).toContain('/auth/register');
      expect(paths).toContain('/auth/login');
      expect(paths).toContain('/wallets/me');
      expect(paths).toContain('/transactions');
      expect(paths).toContain('/health');
      expect(paths).toContain('/metrics');
    });

    it('should include security schemes in spec', async () => {
      const response = await request(app).get('/api-docs.json');

      expect(response.body.components.securitySchemes).toHaveProperty('bearerAuth');
      expect(response.body.components.securitySchemes.bearerAuth).toHaveProperty('type', 'http');
      expect(response.body.components.securitySchemes.bearerAuth).toHaveProperty('scheme', 'bearer');
    });
  });

  describe('Root Endpoint', () => {
    it('should return API info at root', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'PayFlow API');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('documentation', '/api-docs');
      expect(response.body).toHaveProperty('health', '/health');
    });
  });
});
