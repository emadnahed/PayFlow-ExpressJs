import mongoose from 'mongoose';

const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test';

export const connectTestDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(TEST_MONGODB_URI);
};

export const disconnectTestDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
};

export const clearTestDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const collections = mongoose.connection.collections;

  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

export const getTestDatabaseStatus = (): { connected: boolean; readyState: number } => {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
};
