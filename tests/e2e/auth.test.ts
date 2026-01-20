import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { getTestApp } from '../helpers';
import { User } from '../../src/models/User';
import { Wallet } from '../../src/models/Wallet';
import { config } from '../../src/config';

const app = getTestApp();

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow_test');
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
  });

  describe('POST /auth/register', () => {
    const validUser = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123',
    };

    it('should register a new user successfully', async () => {
      const response = await request(app).post('/auth/register').send(validUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('userId');
      expect(response.body.data.user.email).toBe(validUser.email);
      expect(response.body.data.user.name).toBe(validUser.name);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should create a wallet for new user', async () => {
      const response = await request(app).post('/auth/register').send(validUser);

      expect(response.status).toBe(201);

      const wallet = await Wallet.findOne({ userId: response.body.data.user.userId });
      expect(wallet).not.toBeNull();
      expect(wallet?.balance).toBe(0);
      expect(wallet?.currency).toBe('INR');
    });

    it('should reject duplicate email', async () => {
      await request(app).post('/auth/register').send(validUser);

      const response = await request(app).post('/auth/register').send(validUser);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('already registered');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUser,
          password: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUser,
          email: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app).post('/auth/register').send({
        name: 'John',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept optional phone number', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...validUser,
          phone: '+91-9876543210',
        });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /auth/login', () => {
    const testUser = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password123',
    };

    beforeEach(async () => {
      await request(app).post('/auth/register').send(testUser);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should reject invalid password', async () => {
      const response = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: 'WrongPassword123',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid');
    });

    it('should reject non-existent email', async () => {
      const response = await request(app).post('/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password123',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should update lastLoginAt on successful login', async () => {
      await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      const user = await User.findOne({ email: testUser.email });
      expect(user?.lastLoginAt).toBeDefined();
    });

    it('should be case-insensitive for email', async () => {
      const response = await request(app).post('/auth/login').send({
        email: testUser.email.toUpperCase(),
        password: testUser.password,
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app).post('/auth/register').send({
        name: 'Refresh User',
        email: 'refresh@example.com',
        password: 'Password123',
      });

      refreshToken = registerResponse.body.data.tokens.refreshToken;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(app).post('/auth/refresh').send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app).post('/auth/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;
    const testUser = {
      name: 'Me User',
      email: 'me@example.com',
      password: 'Password123',
    };

    beforeEach(async () => {
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      accessToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.name).toBe(testUser.name);
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Protected Route Access', () => {
    it('should allow access to health endpoint without auth', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
    });

    it('should require auth for protected endpoints', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.status).toBe(401);
    });
  });

  describe('Token Expiration', () => {
    it('should reject expired access token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 'test-user', email: 'test@example.com' },
        config.jwt.secret,
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('expired');
    });

    it('should reject token signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { userId: 'test-user', email: 'test@example.com' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Deactivated User Handling', () => {
    const testUser = {
      name: 'Deactivated User',
      email: 'deactivated@example.com',
      password: 'Password123',
    };

    it('should reject login for deactivated user', async () => {
      // Register user
      await request(app).post('/auth/register').send(testUser);

      // Deactivate user
      await User.updateOne({ email: testUser.email }, { isActive: false });

      // Try to login
      const response = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('deactivated');
    });

    it('should reject protected route access for deactivated user', async () => {
      // Register user and get token
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      const accessToken = registerResponse.body.data.tokens.accessToken;

      // Deactivate user
      await User.updateOne({ email: testUser.email }, { isActive: false });

      // Try to access protected route
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should reject token refresh for deactivated user', async () => {
      // Register user and get refresh token
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      const refreshToken = registerResponse.body.data.tokens.refreshToken;

      // Deactivate user
      await User.updateOne({ email: testUser.email }, { isActive: false });

      // Try to refresh token
      const response = await request(app).post('/auth/refresh').send({ refreshToken });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Security: Password Handling', () => {
    const testUser = {
      name: 'Security Test',
      email: 'security@example.com',
      password: 'Password123',
    };

    it('should never return password in registration response', async () => {
      const response = await request(app).post('/auth/register').send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.data.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('Password123');
    });

    it('should never return password in login response', async () => {
      await request(app).post('/auth/register').send(testUser);

      const response = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('Password123');
    });

    it('should never return password in /auth/me response', async () => {
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${registerResponse.body.data.tokens.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('Password123');
    });
  });

  describe('Token Payload Verification', () => {
    it('should include correct payload in access token', async () => {
      const testUser = {
        name: 'Payload Test',
        email: 'payload@example.com',
        password: 'Password123',
      };

      const response = await request(app).post('/auth/register').send(testUser);

      const accessToken = response.body.data.tokens.accessToken;
      const payload = jwt.decode(accessToken) as any;

      expect(payload).toHaveProperty('userId');
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('iat');
      expect(payload).toHaveProperty('exp');
      expect(payload.email).toBe(testUser.email);
      expect(payload.userId).toBe(response.body.data.user.userId);
    });

    it('should have correct token expiry times', async () => {
      const testUser = {
        name: 'Expiry Test',
        email: 'expiry@example.com',
        password: 'Password123',
      };

      const response = await request(app).post('/auth/register').send(testUser);

      const accessToken = response.body.data.tokens.accessToken;
      const refreshToken = response.body.data.tokens.refreshToken;

      const accessPayload = jwt.decode(accessToken) as any;
      const refreshPayload = jwt.decode(refreshToken) as any;

      // Access token: 15 minutes
      const accessExpiry = accessPayload.exp - accessPayload.iat;
      expect(accessExpiry).toBe(15 * 60);

      // Refresh token: 7 days
      const refreshExpiry = refreshPayload.exp - refreshPayload.iat;
      expect(refreshExpiry).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('Complete Authentication Flow', () => {
    const testUser = {
      name: 'Flow Test User',
      email: 'flow@example.com',
      password: 'Password123',
    };

    it('should complete full auth lifecycle: register -> login -> access -> refresh -> access', async () => {
      // Step 1: Register
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      expect(registerResponse.status).toBe(201);
      const { userId } = registerResponse.body.data.user;
      let { accessToken, refreshToken } = registerResponse.body.data.tokens;

      // Step 2: Access protected resource with registration token
      const firstAccess = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(firstAccess.status).toBe(200);
      expect(firstAccess.body.data.user.userId).toBe(userId);

      // Step 3: Login with same credentials
      const loginResponse = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      expect(loginResponse.status).toBe(200);
      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;

      // Step 4: Access with login token
      const secondAccess = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(secondAccess.status).toBe(200);

      // Step 5: Refresh tokens
      const refreshResponse = await request(app).post('/auth/refresh').send({ refreshToken });

      expect(refreshResponse.status).toBe(200);
      const newAccessToken = refreshResponse.body.data.tokens.accessToken;
      const newRefreshToken = refreshResponse.body.data.tokens.refreshToken;

      // Verify new tokens are valid JWTs
      expect(newAccessToken).toBeDefined();
      expect(newRefreshToken).toBeDefined();
      expect(newAccessToken.split('.').length).toBe(3); // Valid JWT format

      // Step 6: Access with refreshed token
      const thirdAccess = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`);

      expect(thirdAccess.status).toBe(200);
      expect(thirdAccess.body.data.user.userId).toBe(userId);
    });

    it('should maintain user data consistency across all endpoints', async () => {
      // Register
      const registerResponse = await request(app).post('/auth/register').send(testUser);

      const registeredUser = registerResponse.body.data.user;

      // Login
      const loginResponse = await request(app).post('/auth/login').send({
        email: testUser.email,
        password: testUser.password,
      });

      const loggedInUser = loginResponse.body.data.user;

      // Get me
      const meResponse = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.data.tokens.accessToken}`);

      const meUser = meResponse.body.data.user;

      // Verify consistency
      expect(registeredUser.userId).toBe(loggedInUser.userId);
      expect(loggedInUser.userId).toBe(meUser.userId);
      expect(registeredUser.email).toBe(loggedInUser.email);
      expect(loggedInUser.email).toBe(meUser.email);
    });
  });
});
