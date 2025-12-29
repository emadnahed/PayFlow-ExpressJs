import {
  connectTestDatabase,
  disconnectTestDatabase,
  getTestDatabaseStatus,
  connectTestRedis,
  disconnectTestRedis,
  getTestRedisStatus,
} from '../helpers';

describe('Service Connectivity', () => {
  describe('MongoDB Connectivity', () => {
    afterAll(async () => {
      await disconnectTestDatabase();
    });

    it('should connect to test MongoDB', async () => {
      await connectTestDatabase();

      const status = getTestDatabaseStatus();
      expect(status.connected).toBe(true);
      expect(status.readyState).toBe(1);
    });

    it('should maintain connection across multiple status checks', async () => {
      const status1 = getTestDatabaseStatus();
      const status2 = getTestDatabaseStatus();

      expect(status1.connected).toBe(status2.connected);
      expect(status1.readyState).toBe(status2.readyState);
    });
  });

  describe('Redis Connectivity', () => {
    afterAll(async () => {
      await disconnectTestRedis();
    });

    it('should connect to test Redis', async () => {
      const redis = await connectTestRedis();

      expect(redis).toBeDefined();
      expect(['ready', 'connect']).toContain(redis.status);
    });

    it('should be able to set and get values', async () => {
      const redis = await connectTestRedis();

      await redis.set('test-key', 'test-value');
      const value = await redis.get('test-key');

      expect(value).toBe('test-value');

      // Cleanup
      await redis.del('test-key');
    });

    it('should report connected status', async () => {
      await connectTestRedis();
      const status = getTestRedisStatus();

      expect(status.connected).toBe(true);
    });
  });
});
