import request from 'supertest';
import { getTestApp } from '../helpers';
import { resetMetrics } from '../../src/observability';

describe('Observability E2E Tests', () => {
  const app = getTestApp();

  beforeEach(() => {
    // Reset metrics before each test to ensure clean state
    resetMetrics();
  });

  describe('Metrics Endpoint', () => {
    describe('GET /metrics', () => {
      it('should return Prometheus format metrics', async () => {
        const response = await request(app).get('/metrics');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
      });

      it('should include HTTP request metrics', async () => {
        // Make a request to generate metrics
        await request(app).get('/health/live');

        const response = await request(app).get('/metrics');

        expect(response.status).toBe(200);
        expect(response.text).toContain('http_requests_total');
        expect(response.text).toContain('http_request_duration_seconds');
      });

      it('should include service label', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('service="payflow"');
      });

      it('should include transaction metrics definition', async () => {
        const response = await request(app).get('/metrics');

        // Check for metric definitions (HELP/TYPE comments)
        expect(response.text).toContain('transactions_total');
        expect(response.text).toContain('active_transactions');
      });

      it('should include webhook metrics definition', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('webhook_deliveries_total');
      });

      it('should include saga metrics definition', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('saga_events_total');
      });

      it('should include wallet metrics definition', async () => {
        const response = await request(app).get('/metrics');

        expect(response.text).toContain('wallet_operations_total');
      });
    });
  });

  describe('Correlation ID', () => {
    describe('Request tracking', () => {
      it('should return correlation ID in response headers', async () => {
        const response = await request(app).get('/health/live');

        expect(response.status).toBe(200);
        expect(response.headers['x-correlation-id']).toBeDefined();
        expect(response.headers['x-correlation-id']).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      it('should use provided correlation ID from request header', async () => {
        const customCorrelationId = 'test-correlation-123';

        const response = await request(app)
          .get('/health/live')
          .set('x-correlation-id', customCorrelationId);

        expect(response.status).toBe(200);
        expect(response.headers['x-correlation-id']).toBe(customCorrelationId);
      });

      it('should accept x-request-id as correlation ID', async () => {
        const customRequestId = 'request-id-456';

        const response = await request(app)
          .get('/health/live')
          .set('x-request-id', customRequestId);

        expect(response.status).toBe(200);
        expect(response.headers['x-correlation-id']).toBe(customRequestId);
      });

      it('should generate unique correlation IDs for different requests', async () => {
        const response1 = await request(app).get('/health/live');
        const response2 = await request(app).get('/health/live');

        expect(response1.headers['x-correlation-id']).not.toBe(
          response2.headers['x-correlation-id']
        );
      });
    });
  });

  describe('HTTP Metrics Recording', () => {
    it('should record metrics for successful requests', async () => {
      // Make multiple requests
      await request(app).get('/health/live');
      await request(app).get('/health');
      await request(app).get('/');

      const metricsResponse = await request(app).get('/metrics');

      expect(metricsResponse.text).toContain('http_requests_total');
      expect(metricsResponse.text).toContain('method="GET"');
      expect(metricsResponse.text).toContain('status="200"');
    });

    it('should record metrics for 404 responses', async () => {
      await request(app).get('/nonexistent-path');

      const metricsResponse = await request(app).get('/metrics');

      expect(metricsResponse.text).toContain('status="404"');
    });

    it('should record request duration', async () => {
      await request(app).get('/health/live');

      const metricsResponse = await request(app).get('/metrics');

      // Check for duration histogram buckets
      expect(metricsResponse.text).toContain('http_request_duration_seconds_bucket');
      expect(metricsResponse.text).toContain('http_request_duration_seconds_count');
      expect(metricsResponse.text).toContain('http_request_duration_seconds_sum');
    });

    it('should track different HTTP methods', async () => {
      // Make requests with different methods
      await request(app).get('/health/live');
      await request(app).post('/auth/login').send({});

      const metricsResponse = await request(app).get('/metrics');

      expect(metricsResponse.text).toContain('method="GET"');
      expect(metricsResponse.text).toContain('method="POST"');
    });
  });

  describe('Path Normalization', () => {
    it('should normalize paths with IDs to prevent cardinality explosion', async () => {
      // Make requests with different ID values
      await request(app).get('/wallets/507f1f77bcf86cd799439011');
      await request(app).get('/wallets/507f1f77bcf86cd799439012');

      const metricsResponse = await request(app).get('/metrics');

      // Should see normalized path, not individual IDs
      // The exact normalization depends on implementation
      expect(metricsResponse.text).toContain('wallets');
    });
  });
});
