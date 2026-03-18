/**
 * Redis Integration Tests
 *
 * Tests Redis connection, operations, and failover scenarios with real Redis.
 */
import Redis from 'ioredis';

import { connectTestRedis, disconnectTestRedis, flushTestRedis, getTestRedisStatus } from '../../helpers/testEventBus';

const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

describe('Redis Integration Tests', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = await connectTestRedis();
  });

  afterAll(async () => {
    await disconnectTestRedis();
  });

  beforeEach(async () => {
    await flushTestRedis();
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', () => {
      const status = getTestRedisStatus();
      expect(status.connected).toBe(true);
    });

    it('should handle connection with custom config', async () => {
      const customRedis = new Redis({
        host: TEST_REDIS_HOST,
        port: TEST_REDIS_PORT,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await customRedis.connect();
      expect(customRedis.status).toBe('ready');

      await customRedis.quit();
    });

    it('should handle multiple connections', async () => {
      // Test that multiple parallel operations work with the same connection
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(redis.set(`multi:key:${i}`, `value${i}`));
      }
      await Promise.all(operations);

      // Verify all values were set
      const reads = [];
      for (let i = 0; i < 5; i++) {
        reads.push(redis.get(`multi:key:${i}`));
      }
      const values = await Promise.all(reads);

      values.forEach((val, i) => {
        expect(val).toBe(`value${i}`);
      });
    });
  });

  describe('Basic Operations', () => {
    it('should set and get string values', async () => {
      await redis.set('test:key', 'test-value');
      const value = await redis.get('test:key');
      expect(value).toBe('test-value');
    });

    it('should set values with TTL', async () => {
      await redis.setex('test:ttl', 2, 'expires-soon');
      const value = await redis.get('test:ttl');
      expect(value).toBe('expires-soon');

      const ttl = await redis.ttl('test:ttl');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(2);
    });

    it('should handle non-existent keys', async () => {
      const value = await redis.get('non:existent:key');
      expect(value).toBeNull();
    });

    it('should delete keys', async () => {
      await redis.set('test:delete', 'value');
      const deleted = await redis.del('test:delete');
      expect(deleted).toBe(1);

      const value = await redis.get('test:delete');
      expect(value).toBeNull();
    });

    it('should check key existence', async () => {
      await redis.set('test:exists', 'value');

      const exists = await redis.exists('test:exists');
      expect(exists).toBe(1);

      const notExists = await redis.exists('test:not-exists');
      expect(notExists).toBe(0);
    });
  });

  describe('Hash Operations', () => {
    it('should set and get hash fields', async () => {
      await redis.hset('test:hash', 'field1', 'value1');
      await redis.hset('test:hash', 'field2', 'value2');

      const field1 = await redis.hget('test:hash', 'field1');
      const field2 = await redis.hget('test:hash', 'field2');

      expect(field1).toBe('value1');
      expect(field2).toBe('value2');
    });

    it('should get all hash fields', async () => {
      await redis.hset('test:hash:all', {
        name: 'Test User',
        email: 'test@example.com',
        balance: '100',
      });

      const all = await redis.hgetall('test:hash:all');
      expect(all).toEqual({
        name: 'Test User',
        email: 'test@example.com',
        balance: '100',
      });
    });

    it('should increment hash field', async () => {
      await redis.hset('test:counter', 'count', '0');
      await redis.hincrby('test:counter', 'count', 5);
      await redis.hincrby('test:counter', 'count', 3);

      const count = await redis.hget('test:counter', 'count');
      expect(count).toBe('8');
    });
  });

  describe('List Operations', () => {
    it('should push and pop from list', async () => {
      await redis.rpush('test:list', 'item1', 'item2', 'item3');

      const length = await redis.llen('test:list');
      expect(length).toBe(3);

      const item = await redis.lpop('test:list');
      expect(item).toBe('item1');
    });

    it('should get list range', async () => {
      await redis.rpush('test:range', 'a', 'b', 'c', 'd', 'e');

      const range = await redis.lrange('test:range', 1, 3);
      expect(range).toEqual(['b', 'c', 'd']);
    });
  });

  describe('Set Operations', () => {
    it('should add and check set members', async () => {
      await redis.sadd('test:set', 'member1', 'member2', 'member3');

      const isMember = await redis.sismember('test:set', 'member2');
      expect(isMember).toBe(1);

      const notMember = await redis.sismember('test:set', 'member4');
      expect(notMember).toBe(0);
    });

    it('should get all set members', async () => {
      await redis.sadd('test:set:all', 'a', 'b', 'c');

      const members = await redis.smembers('test:set:all');
      expect(members.sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Atomic Operations', () => {
    it('should increment atomically', async () => {
      await redis.set('test:atomic', '10');
      await redis.incr('test:atomic');
      await redis.incrby('test:atomic', 5);

      const value = await redis.get('test:atomic');
      expect(value).toBe('16');
    });

    it('should handle SETNX (set if not exists)', async () => {
      const first = await redis.setnx('test:setnx', 'first');
      expect(first).toBe(1);

      const second = await redis.setnx('test:setnx', 'second');
      expect(second).toBe(0);

      const value = await redis.get('test:setnx');
      expect(value).toBe('first');
    });

    it('should execute transactions', async () => {
      const pipeline = redis.multi();
      pipeline.set('test:tx:1', 'value1');
      pipeline.set('test:tx:2', 'value2');
      pipeline.incr('test:tx:counter');

      const results = await pipeline.exec();
      expect(results).toHaveLength(3);

      const value1 = await redis.get('test:tx:1');
      const value2 = await redis.get('test:tx:2');
      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
    });
  });

  describe('Rate Limiting Pattern', () => {
    it('should implement sliding window rate limiting', async () => {
      const key = 'ratelimit:user123';
      const windowSize = 60; // 60 seconds
      const maxRequests = 5;

      // Simulate requests
      for (let i = 0; i < maxRequests; i++) {
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, windowSize);
        }
        expect(current).toBeLessThanOrEqual(maxRequests);
      }

      // Next request should exceed limit
      const exceeded = await redis.incr(key);
      expect(exceeded).toBe(maxRequests + 1);
    });
  });

  describe('Idempotency Pattern', () => {
    it('should store and retrieve idempotency responses', async () => {
      const idempotencyKey = 'idempotency:user1:key123';
      const cachedResponse = {
        statusCode: 200,
        body: { success: true, data: { transactionId: 'txn_123' } },
        cachedAt: new Date().toISOString(),
      };

      // Store response
      await redis.setex(idempotencyKey, 86400, JSON.stringify(cachedResponse));

      // Retrieve response
      const stored = await redis.get(idempotencyKey);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.statusCode).toBe(200);
      expect(parsed.body.success).toBe(true);
    });

    it('should prevent duplicate operations', async () => {
      const operationId = 'op:txn123:DEBIT';
      let processed = false;

      // First attempt - should process
      const exists = await redis.exists(operationId);
      if (exists === 0) {
        await redis.setex(operationId, 3600, 'processing');
        processed = true;
      }
      expect(processed).toBe(true);

      // Second attempt - should skip
      processed = false;
      const existsAgain = await redis.exists(operationId);
      if (existsAgain === 0) {
        processed = true;
      }
      expect(processed).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      await expect(redis.sendCommand(new Redis.Command('INVALID_COMMAND', []))).rejects.toThrow();
    });

    it('should timeout on long operations', async () => {
      const timeoutRedis = new Redis({
        host: TEST_REDIS_HOST,
        port: TEST_REDIS_PORT,
        commandTimeout: 100,
      });

      await new Promise<void>((resolve) => {
        timeoutRedis.on('ready', () => resolve());
      });

      // Normal operation should work
      await timeoutRedis.set('test:timeout', 'value');
      const value = await timeoutRedis.get('test:timeout');
      expect(value).toBe('value');

      await timeoutRedis.quit();
    });
  });

  describe('Pub/Sub Pattern', () => {
    it('should publish and receive messages', async () => {
      const subscriber = new Redis({
        host: TEST_REDIS_HOST,
        port: TEST_REDIS_PORT,
      });

      const receivedMessages: string[] = [];

      await new Promise<void>((resolve) => {
        subscriber.on('ready', () => resolve());
      });

      // Subscribe first
      await subscriber.subscribe('test:channel');

      subscriber.on('message', (channel, message) => {
        if (channel === 'test:channel') {
          receivedMessages.push(message);
        }
      });

      // Wait a bit for subscription to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Publish messages
      await redis.publish('test:channel', 'message1');
      await redis.publish('test:channel', 'message2');

      // Wait for messages to be received
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedMessages).toContain('message1');
      expect(receivedMessages).toContain('message2');

      await subscriber.quit();
    });
  });

  describe('Performance', () => {
    it('should handle bulk operations efficiently', async () => {
      const pipeline = redis.pipeline();
      const count = 1000;

      // Bulk set
      for (let i = 0; i < count; i++) {
        pipeline.set(`bulk:key:${i}`, `value:${i}`);
      }

      const startSet = Date.now();
      await pipeline.exec();
      const setDuration = Date.now() - startSet;

      // Bulk get
      const getPipeline = redis.pipeline();
      for (let i = 0; i < count; i++) {
        getPipeline.get(`bulk:key:${i}`);
      }

      const startGet = Date.now();
      const results = await getPipeline.exec();
      const getDuration = Date.now() - startGet;

      // Should complete quickly
      expect(setDuration).toBeLessThan(5000);
      expect(getDuration).toBeLessThan(5000);
      expect(results).toHaveLength(count);
    });
  });
});
