import request from 'supertest';
import { Application } from 'express';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';

export interface TestUserResult {
  user: {
    userId: string;
    name: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface TestUser {
  userId: string;
  name: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export const createTestUser = async (
  app: Application,
  overrides: Partial<{ name: string; email: string; password: string }> = {}
): Promise<TestUserResult> => {
  const defaultUser = {
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    password: 'Password123',
    ...overrides,
  };

  const response = await request(app).post('/auth/register').send(defaultUser);

  if (response.status !== 201) {
    throw new Error(`Failed to create test user: ${JSON.stringify(response.body)}`);
  }

  return {
    user: {
      userId: response.body.data.user.userId,
      name: response.body.data.user.name,
      email: response.body.data.user.email,
    },
    accessToken: response.body.data.tokens.accessToken,
    refreshToken: response.body.data.tokens.refreshToken,
  };
};

export const getAuthToken = async (
  app: Application,
  email: string,
  password: string
): Promise<string> => {
  const response = await request(app).post('/auth/login').send({ email, password });

  if (response.status !== 200) {
    throw new Error(`Failed to login: ${JSON.stringify(response.body)}`);
  }

  return response.body.data.tokens.accessToken;
};

export const cleanupTestUsers = async (): Promise<void> => {
  await User.deleteMany({});
  await Wallet.deleteMany({});
};

export const authenticatedRequest = (app: Application, token: string) => {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
};
