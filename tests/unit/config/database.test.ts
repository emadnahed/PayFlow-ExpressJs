/**
 * Database Configuration Unit Tests
 *
 * Tests MongoDB connection management.
 */

// Mock mongoose
const mockMongooseConnect = jest.fn().mockResolvedValue({ connection: { host: 'localhost' } });
const mockMongooseDisconnect = jest.fn().mockResolvedValue(undefined);
const mockMongooseOn = jest.fn();

const mockMongooseConnection = {
  readyState: 1,
  on: mockMongooseOn,
};

jest.mock('mongoose', () => ({
  connect: mockMongooseConnect,
  disconnect: mockMongooseDisconnect,
  connection: mockMongooseConnection,
}));

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    mongodb: {
      uri: 'mongodb://localhost:27017/test',
    },
  },
}));

describe('Database Configuration', () => {
  let connectDatabase: typeof import('../../../src/config/database').connectDatabase;
  let disconnectDatabase: typeof import('../../../src/config/database').disconnectDatabase;
  let getDatabaseStatus: typeof import('../../../src/config/database').getDatabaseStatus;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/config/database');
    connectDatabase = module.connectDatabase;
    disconnectDatabase = module.disconnectDatabase;
    getDatabaseStatus = module.getDatabaseStatus;
  });

  describe('connectDatabase', () => {
    it('should connect to MongoDB successfully', async () => {
      await connectDatabase();

      expect(mockMongooseConnect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test',
        expect.objectContaining({
          maxPoolSize: 10,
          minPoolSize: 2,
          maxIdleTimeMS: 30000,
          serverSelectionTimeoutMS: 5000,
        })
      );
    });

    it('should not reconnect if already connected', async () => {
      await connectDatabase();
      jest.clearAllMocks();

      await connectDatabase();

      expect(mockMongooseConnect).not.toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      jest.resetModules();
      mockMongooseConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const module = await import('../../../src/config/database');

      await expect(module.connectDatabase()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnectDatabase', () => {
    it('should disconnect from MongoDB', async () => {
      await connectDatabase();
      jest.clearAllMocks();

      await disconnectDatabase();

      expect(mockMongooseDisconnect).toHaveBeenCalled();
    });

    it('should do nothing if not connected', async () => {
      jest.resetModules();
      const module = await import('../../../src/config/database');

      await module.disconnectDatabase();

      expect(mockMongooseDisconnect).not.toHaveBeenCalled();
    });

    it('should throw error on disconnection failure', async () => {
      await connectDatabase();
      mockMongooseDisconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      await expect(disconnectDatabase()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('getDatabaseStatus', () => {
    it('should return connected status after connecting', async () => {
      await connectDatabase();

      const status = getDatabaseStatus();

      expect(status.connected).toBe(true);
      expect(status.readyState).toBe(1);
    });

    it('should return disconnected status before connecting', async () => {
      jest.resetModules();
      const module = await import('../../../src/config/database');

      const status = module.getDatabaseStatus();

      expect(status.connected).toBe(false);
    });
  });
});
