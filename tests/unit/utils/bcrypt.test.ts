/**
 * Bcrypt Worker Pool Unit Tests
 *
 * Tests bcrypt hashing/comparison with worker pool functionality.
 */

// Mock worker_threads Worker
const mockWorkerInstance = {
  on: jest.fn(),
  off: jest.fn(),
  postMessage: jest.fn(),
  terminate: jest.fn().mockResolvedValue(0),
};

const mockWorkerConstructor = jest.fn().mockImplementation(() => {
  // Return a new mock instance for each worker
  return {
    on: jest.fn(),
    off: jest.fn(),
    postMessage: jest.fn(),
    terminate: jest.fn().mockResolvedValue(0),
  };
});

jest.mock('worker_threads', () => ({
  Worker: mockWorkerConstructor,
}));

// Mock fs to control isProduction check
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true), // Simulate production mode
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    bcrypt: {
      rounds: 10,
    },
  },
}));

// Mock bcryptjs for development fallback tests
const mockBcrypt = {
  genSalt: jest.fn().mockResolvedValue('$2a$10$mocksalt'),
  hash: jest.fn().mockResolvedValue('$2a$10$mockedhash'),
  compare: jest.fn().mockResolvedValue(true),
};

jest.mock('bcryptjs', () => mockBcrypt);

describe('Bcrypt Worker Pool', () => {
  let hashPassword: typeof import('../../../src/utils/bcrypt').hashPassword;
  let comparePassword: typeof import('../../../src/utils/bcrypt').comparePassword;
  let shutdownBcryptPool: typeof import('../../../src/utils/bcrypt').shutdownBcryptPool;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWorkerConstructor.mockClear();

    // Reset module cache to get fresh instance
    jest.resetModules();

    // Re-import after reset
    const module = await import('../../../src/utils/bcrypt');
    hashPassword = module.hashPassword;
    comparePassword = module.comparePassword;
    shutdownBcryptPool = module.shutdownBcryptPool;
  });

  afterEach(async () => {
    // Clean up worker pool after each test
    try {
      await shutdownBcryptPool();
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('worker pool initialization', () => {
    it('should create workers lazily on first hash operation', async () => {
      // Initially no workers created
      expect(mockWorkerConstructor).not.toHaveBeenCalled();

      // Trigger hash operation (will create pool)
      const hashPromise = hashPassword('testpassword');

      // Workers should be created (default pool size is 4)
      expect(mockWorkerConstructor).toHaveBeenCalled();

      // Simulate worker response to resolve the promise
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      if (messageHandler) {
        messageHandler({ success: true, result: '$2a$10$hashedpassword' });
      }

      const result = await hashPromise;
      expect(result).toBe('$2a$10$hashedpassword');
    });

    it('should respect BCRYPT_POOL_SIZE environment variable', async () => {
      // Reset modules and set env
      jest.resetModules();
      process.env.BCRYPT_POOL_SIZE = '2';

      const module = await import('../../../src/utils/bcrypt');
      const localHashPassword = module.hashPassword;

      // Trigger pool initialization
      const hashPromise = localHashPassword('test');

      // Get number of workers created
      const workerCount = mockWorkerConstructor.mock.calls.length;
      expect(workerCount).toBe(2);

      // Clean up
      delete process.env.BCRYPT_POOL_SIZE;

      // Simulate response
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      if (messageHandler) {
        messageHandler({ success: true, result: '$2a$10$hash' });
      }
      await hashPromise;
    });

    it('should default to pool size of 4 when env not set', async () => {
      delete process.env.BCRYPT_POOL_SIZE;

      const hashPromise = hashPassword('test');

      // Workers should be created
      expect(mockWorkerConstructor.mock.calls.length).toBe(4);

      // Simulate response
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      if (messageHandler) {
        messageHandler({ success: true, result: '$2a$10$hash' });
      }
      await hashPromise;
    });
  });

  describe('hashPassword', () => {
    it('should hash password using worker pool in production', async () => {
      const password = 'securePassword123';

      const hashPromise = hashPassword(password);

      // Get the first available worker
      const workerCall = mockWorkerConstructor.mock.results[0].value;

      // Verify postMessage was called with correct data
      expect(workerCall.postMessage).toHaveBeenCalledWith({
        type: 'hash',
        password: password,
        saltOrHash: 10, // config.bcrypt.rounds
      });

      // Simulate worker response
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$hashedpassword123' });

      const result = await hashPromise;
      expect(result).toBe('$2a$10$hashedpassword123');
    });

    it('should handle hash errors from worker', async () => {
      const password = 'testpassword';

      const hashPromise = hashPassword(password);

      // Get the worker
      const workerCall = mockWorkerConstructor.mock.results[0].value;

      // Simulate error response
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: false, error: 'Hashing failed' });

      await expect(hashPromise).rejects.toThrow('Hashing failed');
    });

    it('should queue tasks when all workers are busy', async () => {
      // Start multiple hash operations simultaneously
      const promises = [
        hashPassword('password1'),
        hashPassword('password2'),
        hashPassword('password3'),
        hashPassword('password4'),
        hashPassword('password5'), // This should be queued (pool size = 4)
      ];

      // All 4 workers should have postMessage called
      const workers = mockWorkerConstructor.mock.results as { value: { postMessage: jest.Mock; on: jest.Mock } }[];
      expect(workers.length).toBe(4); // Pool size is 4

      // Complete first 4 tasks - this will free workers for the queued task
      for (let i = 0; i < 4; i++) {
        const messageHandler = workers[i].value.on.mock.calls.find(
          (call: unknown[]) => call[0] === 'message'
        )?.[1];
        if (messageHandler) {
          messageHandler({ success: true, result: `$2a$10$hash${i}` });
        }
      }

      // The 5th task should now be processed - find the handler added for it
      // After first task completes, worker 0 becomes available and processes the queued task
      const worker0Handlers = workers[0].value.on.mock.calls.filter(
        (call: unknown[]) => call[0] === 'message'
      );
      // Get the second message handler (for the queued task)
      if (worker0Handlers.length > 1) {
        const queuedTaskHandler = worker0Handlers[1][1];
        queuedTaskHandler({ success: true, result: '$2a$10$hash4' });
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(5);
    });
  });

  describe('comparePassword', () => {
    it('should compare password using worker pool in production', async () => {
      const password = 'testpassword';
      const hash = '$2a$10$existinghash';

      const comparePromise = comparePassword(password, hash);

      // Get the first available worker
      const workerCall = mockWorkerConstructor.mock.results[0].value;

      // Verify postMessage was called with correct data
      expect(workerCall.postMessage).toHaveBeenCalledWith({
        type: 'compare',
        password: password,
        saltOrHash: hash,
      });

      // Simulate worker response
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: true });

      const result = await comparePromise;
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'wrongpassword';
      const hash = '$2a$10$existinghash';

      const comparePromise = comparePassword(password, hash);

      // Get the worker
      const workerCall = mockWorkerConstructor.mock.results[0].value;

      // Simulate worker response
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: false });

      const result = await comparePromise;
      expect(result).toBe(false);
    });

    it('should handle compare errors from worker', async () => {
      const password = 'testpassword';
      const hash = 'invalidhash';

      const comparePromise = comparePassword(password, hash);

      // Get the worker
      const workerCall = mockWorkerConstructor.mock.results[0].value;

      // Simulate error response
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: false, error: 'Invalid hash format' });

      await expect(comparePromise).rejects.toThrow('Invalid hash format');
    });
  });

  describe('worker error handling', () => {
    it('should setup error handler on worker', async () => {
      // Trigger pool initialization
      const hashPromise = hashPassword('test');

      // Check that error handler is registered
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const errorHandlerCall = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'error'
      );
      expect(errorHandlerCall).toBeDefined();

      // Complete the task
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$hash' });
      await hashPromise;
    });

    it('should setup exit handler on worker', async () => {
      // Trigger pool initialization
      const hashPromise = hashPassword('test');

      // Check that exit handler is registered
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const exitHandlerCall = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'exit'
      );
      expect(exitHandlerCall).toBeDefined();

      // Complete the task
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$hash' });
      await hashPromise;
    });
  });

  describe('shutdownBcryptPool', () => {
    it('should terminate all workers in the pool', async () => {
      // Initialize pool
      const hashPromise = hashPassword('test');

      // Complete the task first
      const workerCall = mockWorkerConstructor.mock.results[0].value;
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$hash' });
      await hashPromise;

      // Shutdown pool
      await shutdownBcryptPool();

      // All workers should have terminate called
      const workers = mockWorkerConstructor.mock.results as { value: { terminate: jest.Mock } }[];
      workers.forEach((result) => {
        expect(result.value.terminate).toHaveBeenCalled();
      });
    });

    it('should allow re-initialization after shutdown', async () => {
      // Initialize pool
      let hashPromise = hashPassword('test');

      // Complete the task
      let workerCall = mockWorkerConstructor.mock.results[0].value;
      let messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$hash' });
      await hashPromise;

      const initialWorkerCount = mockWorkerConstructor.mock.calls.length;

      // Shutdown
      await shutdownBcryptPool();

      // Clear mock calls
      mockWorkerConstructor.mockClear();

      // Re-initialize by calling hash again
      hashPromise = hashPassword('newtest');

      // New workers should be created
      expect(mockWorkerConstructor).toHaveBeenCalled();

      // Complete the new task
      workerCall = mockWorkerConstructor.mock.results[0].value;
      messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      messageHandler({ success: true, result: '$2a$10$newhash' });
      await hashPromise;
    });

    it('should handle shutdown when pool not initialized', async () => {
      // Shutdown without initializing - should not throw
      await expect(shutdownBcryptPool()).resolves.not.toThrow();
    });
  });

  describe('development mode fallback', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      jest.resetModules();

      // Mock fs to return false (development mode)
      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(false),
      }));

      const module = await import('../../../src/utils/bcrypt');
      hashPassword = module.hashPassword;
      comparePassword = module.comparePassword;
      shutdownBcryptPool = module.shutdownBcryptPool;
    });

    it('should use bcryptjs directly in development mode for hashing', async () => {
      const password = 'devPassword';

      const result = await hashPassword(password);

      expect(mockBcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, '$2a$10$mocksalt');
      expect(result).toBe('$2a$10$mockedhash');
    });

    it('should use bcryptjs directly in development mode for comparison', async () => {
      const password = 'devPassword';
      const hash = '$2a$10$existinghash';

      const result = await comparePassword(password, hash);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should not create workers in development mode', async () => {
      await hashPassword('test');

      // No workers should be created in dev mode
      expect(mockWorkerConstructor).not.toHaveBeenCalled();
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      // Re-initialize for production mode tests after dev mode tests
      jest.clearAllMocks();
      jest.resetModules();

      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
      }));

      const module = await import('../../../src/utils/bcrypt');
      hashPassword = module.hashPassword;
      comparePassword = module.comparePassword;
      shutdownBcryptPool = module.shutdownBcryptPool;
    });

    it('should handle multiple concurrent hash operations', async () => {
      const passwords = ['pass1', 'pass2', 'pass3'];

      const promises = passwords.map((p) => hashPassword(p));

      // Resolve all worker responses
      const workers = mockWorkerConstructor.mock.results as { value: { on: jest.Mock } }[];
      workers.forEach((result, index: number) => {
        const messageHandler = result.value.on.mock.calls.find(
          (call: unknown[]) => call[0] === 'message'
        )?.[1];
        if (messageHandler) {
          messageHandler({ success: true, result: `$2a$10$hash${index}` });
        }
      });

      const results = await Promise.all(promises);
      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result).toMatch(/^\$2a\$10\$/);
      });
    });

    it('should handle mixed hash and compare operations', async () => {
      const hashPromise = hashPassword('password');
      const comparePromise = comparePassword('password', '$2a$10$existinghash');

      // Resolve worker responses
      const workers = mockWorkerConstructor.mock.results as { value: { on: jest.Mock } }[];

      // First worker handles hash
      const hashMessageHandler = workers[0].value.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      hashMessageHandler({ success: true, result: '$2a$10$newhash' });

      // Second worker handles compare
      const compareMessageHandler = workers[1].value.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];
      compareMessageHandler({ success: true, result: true });

      const [hashResult, compareResult] = await Promise.all([hashPromise, comparePromise]);

      expect(hashResult).toBe('$2a$10$newhash');
      expect(compareResult).toBe(true);
    });
  });

  describe('worker message cleanup', () => {
    beforeEach(async () => {
      // Re-initialize for production mode tests
      jest.clearAllMocks();
      jest.resetModules();

      jest.doMock('fs', () => ({
        existsSync: jest.fn().mockReturnValue(true),
      }));

      const module = await import('../../../src/utils/bcrypt');
      hashPassword = module.hashPassword;
      comparePassword = module.comparePassword;
      shutdownBcryptPool = module.shutdownBcryptPool;
    });

    it('should remove message listener after task completes', async () => {
      const hashPromise = hashPassword('test');

      const workerCall = (mockWorkerConstructor.mock.results as { value: { on: jest.Mock; off: jest.Mock } }[])[0].value;

      // Get the message handler
      const messageHandler = workerCall.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1];

      // Complete the task
      messageHandler({ success: true, result: '$2a$10$hash' });
      await hashPromise;

      // off should be called to remove the listener
      expect(workerCall.off).toHaveBeenCalledWith('message', messageHandler);
    });
  });
});
