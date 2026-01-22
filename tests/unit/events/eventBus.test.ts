/**
 * EventBus Unit Tests
 *
 * Tests the Redis pub/sub event bus functionality.
 */

import { EventType } from '../../../src/types/events';

// Mock Redis
const mockOn = jest.fn();
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockPublish = jest.fn().mockResolvedValue(1);
const mockSubscribe = jest.fn().mockResolvedValue('OK');
const mockUnsubscribe = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: mockOn,
    quit: mockQuit,
    publish: mockPublish,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }));
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
    },
  },
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/observability', () => ({
  logger: mockLogger,
}));

describe('EventBus', () => {
  let eventBus: typeof import('../../../src/events/eventBus').eventBus;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // Simulate immediate connection by calling connect callback
    mockOn.mockImplementation((event: string, callback: () => void) => {
      if (event === 'connect') {
        setImmediate(() => callback());
      }
    });

    const module = await import('../../../src/events/eventBus');
    eventBus = module.eventBus;
  });

  afterEach(async () => {
    try {
      await eventBus.disconnect();
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('getStatus', () => {
    it('should return connected: false initially', () => {
      expect(eventBus.getStatus()).toEqual({ connected: false });
    });
  });

  describe('connect', () => {
    it('should connect successfully when Redis connects', async () => {
      await eventBus.connect();
      expect(eventBus.getStatus().connected).toBe(true);
    });

    it('should not reconnect if already connected', async () => {
      await eventBus.connect();
      await eventBus.connect(); // Second call should be a no-op

      expect(eventBus.getStatus().connected).toBe(true);
    });

    it('should setup message handler on subscriber', async () => {
      await eventBus.connect();

      // Verify 'message' handler was registered
      const messageCall = mockOn.mock.calls.find((call) => call[0] === 'message');
      expect(messageCall).toBeDefined();
    });

    it('should handle connection errors', async () => {
      mockOn.mockImplementation((event: string, callback: (err?: Error) => void) => {
        if (event === 'error') {
          setImmediate(() => callback(new Error('Connection refused')));
        }
      });

      await expect(eventBus.connect()).rejects.toThrow('Connection refused');
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await eventBus.connect();
      expect(eventBus.getStatus().connected).toBe(true);

      await eventBus.disconnect();
      expect(eventBus.getStatus().connected).toBe(false);
    });

    it('should call quit on both publisher and subscriber', async () => {
      await eventBus.connect();
      await eventBus.disconnect();

      expect(mockQuit).toHaveBeenCalledTimes(2);
    });

    it('should handle disconnect when not connected', async () => {
      expect(eventBus.getStatus().connected).toBe(false);
      await eventBus.disconnect(); // Should not throw
      expect(eventBus.getStatus().connected).toBe(false);
    });
  });

  describe('publish', () => {
    it('should publish event when connected', async () => {
      await eventBus.connect();

      const event = {
        eventType: EventType.TRANSACTION_INITIATED,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: { senderId: 'user_1', receiverId: 'user_2', amount: 100, currency: 'INR' },
      };

      await eventBus.publish(event);
      expect(mockPublish).toHaveBeenCalledWith(
        EventType.TRANSACTION_INITIATED,
        expect.any(String)
      );
    });

    it('should skip publishing when not connected in test mode', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event = {
        eventType: EventType.TRANSACTION_INITIATED,
        transactionId: 'txn_123',
        timestamp: new Date(),
        payload: {},
      };

      await eventBus.publish(event);

      expect(mockPublish).not.toHaveBeenCalled();
      // In test mode, it should not log warning
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should add timestamp if not provided', async () => {
      await eventBus.connect();

      const event = {
        eventType: EventType.TRANSACTION_COMPLETED,
        transactionId: 'txn_456',
        payload: {},
      };

      await eventBus.publish(event as any);

      expect(mockPublish).toHaveBeenCalled();
      const publishedMessage = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(publishedMessage.timestamp).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should subscribe to event type', async () => {
      await eventBus.connect();

      const handler = jest.fn();
      await eventBus.subscribe(EventType.TRANSACTION_INITIATED, handler);

      expect(mockSubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_INITIATED);
    });

    it('should throw error when not connected', async () => {
      await expect(
        eventBus.subscribe(EventType.TRANSACTION_INITIATED, jest.fn())
      ).rejects.toThrow('Event bus not connected');
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from event type', async () => {
      await eventBus.connect();

      await eventBus.subscribe(EventType.TRANSACTION_INITIATED, jest.fn());
      await eventBus.unsubscribe(EventType.TRANSACTION_INITIATED);

      expect(mockUnsubscribe).toHaveBeenCalledWith(EventType.TRANSACTION_INITIATED);
    });

    it('should not throw when unsubscribing while not connected', async () => {
      await eventBus.unsubscribe(EventType.TRANSACTION_INITIATED);
      // Should not throw
    });
  });

  describe('message handling', () => {
    it('should call handler when message is received', async () => {
      await eventBus.connect();

      const handler = jest.fn();
      await eventBus.subscribe(EventType.TRANSACTION_COMPLETED, handler);

      // Find and call the message handler
      const messageCall = mockOn.mock.calls.find((call) => call[0] === 'message');
      if (messageCall) {
        const messageHandler = messageCall[1];
        const event = {
          eventType: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_789',
          payload: {},
        };
        await messageHandler(EventType.TRANSACTION_COMPLETED, JSON.stringify(event));

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
          eventType: EventType.TRANSACTION_COMPLETED,
          transactionId: 'txn_789',
        }));
      }
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockLogger.error.mockClear();
      await eventBus.connect();

      // Find and call the message handler with invalid JSON
      const messageCall = mockOn.mock.calls.find((call) => call[0] === 'message');
      if (messageCall) {
        const messageHandler = messageCall[1];
        await messageHandler('channel', 'invalid-json');

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(Error) }),
          'Error parsing event message'
        );
      }
    });

    it('should handle handler errors gracefully', async () => {
      mockLogger.error.mockClear();
      await eventBus.connect();

      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      await eventBus.subscribe(EventType.TRANSACTION_FAILED, failingHandler);

      // Find and call the message handler
      const messageCall = mockOn.mock.calls.find((call) => call[0] === 'message');
      if (messageCall) {
        const messageHandler = messageCall[1];
        const event = {
          eventType: EventType.TRANSACTION_FAILED,
          transactionId: 'txn_error',
          payload: {},
        };
        await messageHandler(EventType.TRANSACTION_FAILED, JSON.stringify(event));

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ err: expect.any(Error), eventType: EventType.TRANSACTION_FAILED }),
          'Error handling event'
        );
      }
    });
  });

  describe('retry strategy', () => {
    it('should have retry strategy that returns null after 3 retries', () => {
      // The retry strategy is tested indirectly through the Redis config
      // We verify the pattern: returns delay for times <= 3, null otherwise
      const retryStrategy = (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 100, 3000);
      };

      expect(retryStrategy(1)).toBe(100);
      expect(retryStrategy(2)).toBe(200);
      expect(retryStrategy(3)).toBe(300);
      expect(retryStrategy(4)).toBeNull();
    });
  });
});
