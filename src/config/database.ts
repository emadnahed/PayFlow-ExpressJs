import mongoose from 'mongoose';

import { config } from './index';

let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  if (isConnected) {
    console.log('Database already connected');
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
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error);
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
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('MongoDB disconnection error:', error);
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
  console.error('MongoDB connection error:', err);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  isConnected = false;
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});
