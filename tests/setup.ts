import mongoose from 'mongoose';
import { eventBus } from '../src/events/eventBus';

// =============================================================================
// TEST ENVIRONMENT CONFIGURATION
// =============================================================================
//
// Test infrastructure ports (used by docker-compose.test.yml):
//   - MongoDB: localhost:27018 (host) -> 27017 (container)
//   - Redis:   localhost:6380  (host) -> 6379  (container)
//
// These can be overridden via environment variables for different test scenarios:
//   - TEST_MONGODB_URI: Override MongoDB connection string
//   - TEST_REDIS_HOST:  Override Redis host
//   - TEST_REDIS_PORT:  Override Redis port
//
// The standard .env variables (MONGODB_URI, REDIS_PORT) are intentionally
// ignored to prevent production/development configs from leaking into tests.
// =============================================================================

process.env.NODE_ENV = 'test';

// MongoDB: Use TEST_MONGODB_URI if set, otherwise default to test port 27018
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

// Redis: Use TEST_REDIS_* if set, otherwise default to test port 6380
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6380';

// Increase test timeout
jest.setTimeout(30000);

// Global teardown
afterAll(async () => {
  try {
    await eventBus.disconnect();
  } catch (error) {
    // Ignore disconnect errors in cleanup
  }

  try {
    await mongoose.disconnect();
  } catch (error) {
    // Ignore disconnect errors in cleanup
  }
});
