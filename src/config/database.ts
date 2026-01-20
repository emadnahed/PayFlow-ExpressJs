import mongoose from 'mongoose';

import { logger } from '../observability';

import { config } from './index';

let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  if (isConnected) {
    logger.debug('Database already connected');
    return;
  }

  try {
    // Optimized connection options for I/O-bound workloads
    const conn = await mongoose.connect(config.mongodb.uri, {
      maxPoolSize: 10, // Max connections in pool (default: 100, reduced for memory)
      minPoolSize: 2, // Keep minimum connections warm
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Fail fast on connection issues
    });
    isConnected = true;
    logger.info({ host: conn.connection.host }, 'MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection error');
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB disconnection error');
    throw error;
  }
};

export const getDatabaseStatus = (): { connected: boolean; readyState: number } => {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
  };
};

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'MongoDB connection error');
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  logger.info('MongoDB disconnected');
  isConnected = false;
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});
