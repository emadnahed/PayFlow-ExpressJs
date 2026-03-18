import Redis from 'ioredis';

let testRedis: Redis | null = null;

export const connectTestRedis = async (): Promise<Redis> => {
  if (testRedis) {
    return testRedis;
  }

  testRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: 3,
  });

  await new Promise<void>((resolve, reject) => {
    testRedis!.on('connect', () => resolve());
    testRedis!.on('error', (err) => reject(err));
  });

  return testRedis;
};

export const disconnectTestRedis = async (): Promise<void> => {
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
  }
};

export const flushTestRedis = async (): Promise<void> => {
  if (testRedis) {
    await testRedis.flushall();
  }
};

export const getTestRedisStatus = (): { connected: boolean } => {
  return {
    connected: testRedis?.status === 'ready',
  };
};
