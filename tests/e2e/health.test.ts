import request from 'supertest';
import { getTestApp } from '../helpers';

describe('Health Endpoints', () => {
  const app = getTestApp();

  describe('GET /', () => {
    it('should return API info', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'PayFlow API');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('description');
    });
  });

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health', () => {
    it('should return health status with service details', async () => {
      const response = await request(app).get('/health');

      // May be unhealthy if services not connected, but structure should be correct
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('eventBus');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app).get('/health/ready');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(['ready', 'not ready']).toContain(response.body.status);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
