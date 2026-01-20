import mongoose from 'mongoose';
import { eventBus } from '../src/events/eventBus';

// Set test environment - use env vars if already set (for CI), otherwise use local test ports
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6380';

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
