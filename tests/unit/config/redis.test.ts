/**
 * Redis Configuration Unit Tests
 *
 * Tests Redis client management.
 */

// Mock Redis
const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue('OK');
const mockRedisOn = jest.fn();

let mockRedisStatus = 'wait';

const mockRedisClientInstance = {
  connect: mockRedisConnect,
  quit: mockRedisQuit,
  on: mockRedisOn,
  get status() {
    return mockRedisStatus;
  },
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClientInstance);
});

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
    },
  },
}));

// Mock logger
const mockRedisLogger = {
  info: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/observability', () => ({
  logger: mockRedisLogger,
}));

describe('Redis Configuration', () => {
  let getRedisClient: typeof import('../../../src/config/redis').getRedisClient;
  let connectRedis: typeof import('../../../src/config/redis').connectRedis;
  let disconnectRedis: typeof import('../../../src/config/redis').disconnectRedis;
  let isRedisConnected: typeof import('../../../src/config/redis').isRedisConnected;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    mockRedisStatus = 'wait';

    const module = await import('../../../src/config/redis');
    getRedisClient = module.getRedisClient;
    connectRedis = module.connectRedis;
    disconnectRedis = module.disconnectRedis;
    isRedisConnected = module.isRedisConnected;
  });

  describe('getRedisClient', () => {
    it('should create a new Redis client', () => {
      const client = getRedisClient();

      expect(client).toBeDefined();
    });

    it('should return same client on subsequent calls', () => {
      const client1 = getRedisClient();
      const client2 = getRedisClient();

      expect(client1).toBe(client2);
    });

    it('should register error and connect event handlers', () => {
      getRedisClient();

      expect(mockRedisOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('connectRedis', () => {
    it('should connect Redis client', async () => {
      await connectRedis();

      expect(mockRedisConnect).toHaveBeenCalled();
    });

    it('should not reconnect if already ready', async () => {
      mockRedisStatus = 'ready';
      jest.resetModules();

      const module = await import('../../../src/config/redis');

      await module.connectRedis();

      expect(mockRedisConnect).not.toHaveBeenCalled();
    });
  });

  describe('disconnectRedis', () => {
    it('should disconnect Redis client', async () => {
      getRedisClient(); // Initialize client
      await disconnectRedis();

      expect(mockRedisQuit).toHaveBeenCalled();
    });

    it('should do nothing if client not initialized', async () => {
      jest.resetModules();

      const module = await import('../../../src/config/redis');
      await module.disconnectRedis();

      expect(mockRedisQuit).not.toHaveBeenCalled();
    });
  });

  describe('isRedisConnected', () => {
    it('should return false when not connected', () => {
      mockRedisStatus = 'wait';

      const connected = isRedisConnected();

      expect(connected).toBe(false);
    });

    it('should return true when connected', async () => {
      getRedisClient();
      mockRedisStatus = 'ready';

      const connected = isRedisConnected();

      expect(connected).toBe(true);
    });

    it('should return false when client not initialized', async () => {
      jest.resetModules();
      const module = await import('../../../src/config/redis');

      const connected = module.isRedisConnected();

      expect(connected).toBe(false);
    });
  });

  describe('event handlers', () => {
    it('should log error on Redis error event', () => {
      getRedisClient();

      // Find and call the error handler
      const errorHandler = mockRedisOn.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      const testError = new Error('Redis connection error');
      errorHandler(testError);

      expect(mockRedisLogger.error).toHaveBeenCalledWith({ err: testError }, 'Redis client error');
    });

    it('should log info on Redis connect event', () => {
      getRedisClient();

      // Find and call the connect handler
      const connectHandler = mockRedisOn.mock.calls.find((call) => call[0] === 'connect')?.[1];
      expect(connectHandler).toBeDefined();

      connectHandler();

      expect(mockRedisLogger.info).toHaveBeenCalledWith('Redis client connected');
    });
  });
});
