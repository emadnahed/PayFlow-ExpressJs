import mongoose from 'mongoose';

export const connectTestDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI as string);
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
