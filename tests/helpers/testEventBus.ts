import Redis from 'ioredis';

const TEST_REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const TEST_REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

let testRedis: Redis | null = null;

export const connectTestRedis = async (): Promise<Redis> => {
  if (testRedis) {
    return testRedis;
  }

  testRedis = new Redis({
    host: TEST_REDIS_HOST,
    port: TEST_REDIS_PORT,
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
